begin;
create extension if not exists pgcrypto with schema extensions;
alter table public.curation_members drop constraint curation_members_user_id_fkey;

create table curation_private.master_access (
 singleton boolean primary key default true check(singleton),
 password_hash text not null
);
create table curation_private.sessions (
 token_hash text primary key,
 user_id uuid not null references public.curation_members(user_id),
 expires_at timestamptz not null
);
create table curation_private.login_attempts (
 bucket text primary key,
 started_at timestamptz not null default now(),
 attempts integer not null default 0
);
alter table curation_private.master_access enable row level security;
alter table curation_private.sessions enable row level security;
alter table curation_private.login_attempts enable row level security;
revoke all on curation_private.master_access,curation_private.sessions,curation_private.login_attempts from public,anon,authenticated;

-- These UUIDs identify curator profiles; they are not Supabase Auth accounts.
insert into public.curation_members(user_id,curator_id,name)
select gen_random_uuid(),id,name from (values ('patrick','Patrick'),('lucas','Lucas'),('thierry','Thierry')) v(id,name)
on conflict(curator_id) do nothing;

create function curation_private.actor() returns uuid language sql stable security definer set search_path='' as $$
 select s.user_id from curation_private.sessions s
 join public.curation_members m on m.user_id=s.user_id and m.active
 where s.token_hash=encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-apex-session',''),'UTF8')),'hex')
 and s.expires_at>now();
$$;
revoke all on function curation_private.actor() from public,anon,authenticated;

create function public.curation_login(p_curator text,p_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.curation_members; stored_hash text; token text; bucket_key text; attempts_row curation_private.login_attempts;
begin
 if p_curator is null or p_curator not in ('patrick','lucas','thierry') or p_password is null or char_length(p_password) not between 1 and 128 then
   return jsonb_build_object('ok',false,'message','Selecione um curador e informe a senha mestra.');
 end if;
 -- Failed attempts commit because refusal is returned as data rather than raised.
 bucket_key=p_curator || ':' || coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-real-ip','shared');
 perform pg_advisory_xact_lock(hashtextextended(bucket_key,42));
 insert into curation_private.login_attempts(bucket) values(bucket_key) on conflict do nothing;
 select * into attempts_row from curation_private.login_attempts where bucket=bucket_key for update;
 if attempts_row.started_at < now()-interval '10 minutes' then
   update curation_private.login_attempts set started_at=now(),attempts=0 where bucket=bucket_key;
   attempts_row.attempts=0;
 end if;
 if attempts_row.attempts>=20 then return jsonb_build_object('ok',false,'message','Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'); end if;
 select password_hash into stored_hash from curation_private.master_access where singleton;
 if stored_hash is null then return jsonb_build_object('ok',false,'message','A senha mestra ainda não foi configurada no servidor.'); end if;
 if extensions.crypt(p_password,stored_hash) is distinct from stored_hash then
   update curation_private.login_attempts set attempts=attempts+1 where bucket=bucket_key;
   return jsonb_build_object('ok',false,'message','Senha mestra inválida.');
 end if;
 select * into member from public.curation_members where curator_id=p_curator and active;
 if member.user_id is null then return jsonb_build_object('ok',false,'message','Perfil indisponível.'); end if;
 delete from curation_private.sessions where expires_at<=now();
 token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into curation_private.sessions values(encode(sha256(convert_to(token,'UTF8')),'hex'),member.user_id,now()+interval '12 hours');
 update curation_private.login_attempts set attempts=0 where bucket=bucket_key;
 return jsonb_build_object('ok',true,'token',token,'curator_id',member.curator_id);
end $$;

create function public.curation_session() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member public.curation_members;
begin
 select * into member from public.curation_members where user_id=curation_private.actor() and active;
 if member.user_id is null then raise exception 'Sessão expirada. Entre novamente com a senha mestra.'; end if;
 return jsonb_build_object('curator_id',member.curator_id);
end $$;
create function public.curation_logout() returns void language sql security definer set search_path='' as $$
 delete from curation_private.sessions where token_hash=encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-apex-session',''),'UTF8')),'hex');
$$;
revoke all on function public.curation_login(text,text),public.curation_session(),public.curation_logout() from public;
grant execute on function public.curation_login(text,text),public.curation_session(),public.curation_logout() to anon,authenticated;

-- Keep ownership/version/lease checks; replace only the identity source.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('curation_is_member','curation_base','curation_sync','curation_mutate','curation_initial_cursor'))
 or (n.nspname='curation_private' and p.proname='sync_source') loop
  definition=replace(pg_get_functiondef(f.oid),'auth.uid()','curation_private.actor()');
  execute definition;
 end loop;
end $$;
grant execute on function public.curation_is_member(),public.curation_base(text,integer),public.curation_sync(bigint),public.curation_mutate(text,uuid,uuid,jsonb),public.curation_initial_cursor() to anon;
grant select on public.questions,public.curation_questions,public.question_competencies to anon;
drop policy curator_read on public.curation_questions;
create policy curator_read on public.curation_questions for select to anon,authenticated using((select public.curation_is_member()));
drop policy curator_questions_read on public.questions;
create policy curator_questions_read on public.questions for select to anon,authenticated using((select public.curation_is_member()));
drop policy curator_competencies_read on public.question_competencies;
create policy curator_competencies_read on public.question_competencies for select to anon,authenticated using((select public.curation_is_member()));

-- Broadcast only a refresh hint, never IDs, question content, comments or credentials.
-- Every data read still requires the validated private session token.
create function curation_private.notify_clients() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send('{"refresh":true}'::jsonb,'refresh','apex-curation',false);
 return null;
end $$;
revoke all on function curation_private.notify_clients() from public,anon,authenticated;
create trigger curation_refresh after insert on curation_private.events for each statement execute function curation_private.notify_clients();
commit;
