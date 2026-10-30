-- Master password: set only on the server, plus the locks that keep out anyone without it.
--   * curation_private.set_master_password(text)  change the password (SQL Editor only; ends every session)
--   * curation_private.lock_access(boolean)       emergency lock: no login, every session refused
--   * curation_login                              also limits failures per curator across all callers
-- Nothing here is callable by anon/authenticated except curation_login/session/logout, as before.
begin;

create table if not exists curation_private.access_state (
 singleton boolean primary key default true check(singleton),
 locked boolean not null default false,
 locked_at timestamptz,
 password_changed_at timestamptz
);
insert into curation_private.access_state(singleton) values(true) on conflict do nothing;
alter table curation_private.access_state enable row level security;
revoke all on curation_private.access_state from public,anon,authenticated;

-- A locked system recognises nobody, whatever token a browser still holds.
create or replace function curation_private.actor() returns uuid language sql stable security definer set search_path='' as $$
 select s.user_id from curation_private.sessions s
 join public.curation_members m on m.user_id=s.user_id and m.active
 where s.token_hash=encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-apex-session',''),'UTF8')),'hex')
 and s.expires_at>now()
 and not coalesce((select a.locked from curation_private.access_state a where a.singleton),false);
$$;
revoke all on function curation_private.actor() from public,anon,authenticated;

-- Run from the Supabase SQL Editor (postgres role): select curation_private.set_master_password('a nova senha');
create or replace function curation_private.set_master_password(p_password text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_password is null or char_length(p_password) not between 12 and 128 then
   raise exception 'A senha mestra deve ter entre 12 e 128 caracteres.';
 end if;
 if (select count(distinct c) from regexp_split_to_table(p_password,'') c) < 6 then
   raise exception 'A senha mestra é repetitiva demais: use ao menos 6 caracteres diferentes.';
 end if;
 insert into curation_private.master_access(singleton,password_hash)
 values(true,extensions.crypt(p_password,extensions.gen_salt('bf',12)))
 on conflict(singleton) do update set password_hash=excluded.password_hash;
 -- A new password ends every session opened with the old one and clears the failure counters.
 delete from curation_private.sessions;
 delete from curation_private.login_attempts;
 update curation_private.access_state set password_changed_at=now() where singleton;
end $$;
revoke all on function curation_private.set_master_password(text) from public,anon,authenticated;

-- select curation_private.lock_access(true);   blocks every login and ends every session
-- select curation_private.lock_access(false);  lets curators log in again
create or replace function curation_private.lock_access(p_locked boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 update curation_private.access_state set locked=coalesce(p_locked,true),locked_at=case when coalesce(p_locked,true) then now() end where singleton;
 if coalesce(p_locked,true) then delete from curation_private.sessions; end if;
end $$;
revoke all on function curation_private.lock_access(boolean) from public,anon,authenticated;

-- Same login as before, plus: the lock, and a ceiling on failures per curator that does not depend on
-- the caller's address (a client can send any x-real-ip, so the per-address limit alone is not enough).
create or replace function public.curation_login(p_curator text,p_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.curation_members; stored_hash text; token text; ip_key text; global_key text; ip_row curation_private.login_attempts; global_row curation_private.login_attempts;
begin
 if p_curator is null or p_curator not in ('patrick','lucas','thierry') or p_password is null or char_length(p_password) not between 1 and 128 then
   return jsonb_build_object('ok',false,'message','Selecione um curador e informe a senha mestra.');
 end if;
 if coalesce((select a.locked from curation_private.access_state a where a.singleton),false) then
   return jsonb_build_object('ok',false,'message','O acesso está bloqueado pelo administrador.');
 end if;
 -- Failed attempts commit because refusal is returned as data rather than raised.
 ip_key=p_curator || ':' || left(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-real-ip','shared'),64);
 global_key='all:' || p_curator;
 perform pg_advisory_xact_lock(hashtextextended(global_key,42));
 perform pg_advisory_xact_lock(hashtextextended(ip_key,42));
 delete from curation_private.login_attempts where started_at < now()-interval '1 day';
 insert into curation_private.login_attempts(bucket) values(ip_key),(global_key) on conflict do nothing;
 update curation_private.login_attempts set started_at=now(),attempts=0 where bucket in (ip_key,global_key) and started_at < now()-interval '10 minutes';
 select * into ip_row from curation_private.login_attempts where bucket=ip_key;
 select * into global_row from curation_private.login_attempts where bucket=global_key;
 if ip_row.attempts>=20 or global_row.attempts>=60 then return jsonb_build_object('ok',false,'message','Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'); end if;
 select password_hash into stored_hash from curation_private.master_access where singleton;
 if stored_hash is null then return jsonb_build_object('ok',false,'message','A senha mestra ainda não foi configurada no servidor.'); end if;
 if extensions.crypt(p_password,stored_hash) is distinct from stored_hash then
   update curation_private.login_attempts set attempts=attempts+1 where bucket in (ip_key,global_key);
   return jsonb_build_object('ok',false,'message','Senha mestra inválida.');
 end if;
 select * into member from public.curation_members where curator_id=p_curator and active;
 if member.user_id is null then return jsonb_build_object('ok',false,'message','Perfil indisponível.'); end if;
 delete from curation_private.sessions where expires_at<=now();
 token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into curation_private.sessions values(encode(sha256(convert_to(token,'UTF8')),'hex'),member.user_id,now()+interval '12 hours');
 update curation_private.login_attempts set attempts=0 where bucket=ip_key;
 return jsonb_build_object('ok',true,'token',token,'curator_id',member.curator_id);
end $$;
revoke all on function public.curation_login(text,text) from public;
grant execute on function public.curation_login(text,text) to anon,authenticated;

commit;
