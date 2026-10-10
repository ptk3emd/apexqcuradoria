-- Curation drafts only. This migration never writes public.questions.
begin;
create schema if not exists curation_private;
revoke all on schema curation_private from public, anon, authenticated;

create table public.curation_members (
  user_id uuid primary key references auth.users(id),
  curator_id text not null unique check(curator_id in ('patrick','lucas','thierry')),
  name text not null,
  active boolean not null default true
);
create table public.curation_questions (
  question_id bigint primary key,
  content jsonb not null default '{}'::jsonb check(jsonb_typeof(content)='object'),
  status text not null default 'pendente' check(status in ('pendente','aprovadas','eliminar_questao','revisar_questao','questao_corrigida')),
  responsible_id text,
  version bigint not null default 0 check(version>=0),
  modified boolean not null default false,
  review_notes text,
  reviewer_name text,
  reviewed_at timestamptz,
  comments jsonb not null default '[]'::jsonb check(jsonb_typeof(comments)='array'),
  lease_session uuid,
  lease_user uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  check(content->>'difficulty_bucket' is null or content->>'difficulty_bucket' in ('','easy','medium','hard')),
  check(content->>'descritores' is null or char_length(content->>'descritores')<=500)
);
create index curation_active_leases on public.curation_questions(lease_until) where lease_session is not null;
create table curation_private.requests (
  user_id uuid not null,
  request_id uuid not null,
  response jsonb not null,
  primary key(user_id,request_id)
);
create table curation_private.events (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  question_ids bigint[] not null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);

create function public.curation_is_member() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.curation_members where user_id=auth.uid() and active);
$$;
revoke all on function public.curation_is_member() from public,anon;
grant execute on function public.curation_is_member() to authenticated;
alter table public.curation_members enable row level security;
alter table public.curation_questions enable row level security;
revoke all on public.curation_members,public.curation_questions from public,anon,authenticated;
grant select on public.curation_members,public.curation_questions to authenticated;
create policy own_membership on public.curation_members for select to authenticated using(user_id=auth.uid());
create policy curator_read on public.curation_questions for select to authenticated using((select public.curation_is_member()));

create function curation_private.snapshot(q public.curation_questions) returns jsonb language sql stable set search_path='' as $$
  select q.content || jsonb_build_object(
    'id',q.question_id::text,'status',q.status,'sync_version',q.version,
    'responsavel_id',q.responsible_id,'responsavel_nome',case q.responsible_id when 'patrick' then 'Patrick' when 'lucas' then 'Lucas' when 'thierry' then 'Thierry' else q.responsible_id end,
    'modificado',q.modified,'notas_revisao',q.review_notes,'revisado_por',q.reviewer_name,'revisado_em',q.reviewed_at,'shared_comments',q.comments);
$$;
revoke all on function curation_private.snapshot(public.curation_questions) from public,anon,authenticated;

create function public.curation_base(p_after text default null, p_limit integer default 500) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  select coalesce(jsonb_agg(curation_private.snapshot(q) order by question_id),'[]'::jsonb) into result
  from (select * from public.curation_questions where p_after is null or question_id>p_after::bigint order by question_id limit least(greatest(p_limit,1),500)) q;
  return result;
end;
$$;

create function public.curation_sync(p_cursor bigint default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event_ids bigint[]; next_cursor bigint; ids bigint[]; records jsonb; leases jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  if p_cursor<0 then raise exception 'Cursor inválido'; end if;
  select array_agg(id),coalesce(max(id),p_cursor) into event_ids,next_cursor from (select id from curation_private.events where id>p_cursor order by id limit 100) e;
  select array_agg(distinct question_id) into ids from curation_private.events e cross join lateral unnest(e.question_ids) question_id where e.id=any(event_ids);
  select coalesce(jsonb_agg(curation_private.snapshot(q)),'[]'::jsonb) into records from public.curation_questions q where q.question_id=any(ids);
  select coalesce(jsonb_object_agg(question_id::text,jsonb_build_object('actor',responsible_id,'name',case responsible_id when 'patrick' then 'Patrick' when 'lucas' then 'Lucas' when 'thierry' then 'Thierry' else responsible_id end,'session',lease_session,'until',extract(epoch from lease_until)*1000)),'{}'::jsonb)
    into leases from public.curation_questions where lease_until>now() and lease_session is not null;
  return jsonb_build_object('questions',records,'cursor',next_cursor,'more',exists(select 1 from curation_private.events where id>next_cursor),'leases',leases);
end;
$$;

create function public.curation_mutate(p_action text,p_session uuid,p_request uuid,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.curation_members; q public.curation_questions; item jsonb; ids bigint[]; content_patch jsonb; k text; target text; answer jsonb; text_value text;
  allowed constant text[]:=array['categoria','tema_especifico','ano','origem','enunciado','a','b','c','d','e','correta','comentario','justificativa_a','justificativa_b','justificativa_c','justificativa_d','justificativa_e','especialidade','competencias','difficulty_bucket','descritores'];
begin
  select * into member from public.curation_members where user_id=auth.uid() and active;
  if member.user_id is null then raise exception 'Curador não autorizado'; end if;
  if p_session is null or p_request is null then raise exception 'Sessão/operação inválida'; end if;
  if p_action is null or p_action not in ('claim','assign','save','comment','heartbeat','unlock','review','status') then raise exception 'Ação inválida'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Escolha de 1 a 100 questões'; end if;
  select array_agg((v->>'id')::bigint order by (v->>'id')::bigint) into ids from jsonb_array_elements(p_items) v;
  if array_position(ids,null) is not null or cardinality(ids)<>(select count(distinct n) from unnest(ids) n) then raise exception 'IDs inválidos ou duplicados'; end if;
  perform pg_advisory_xact_lock(hashtextextended(member.user_id::text||p_request::text,0));
  select response into answer from curation_private.requests where user_id=member.user_id and request_id=p_request;
  if answer is not null then return answer; end if;
  perform question_id from public.curation_questions where question_id=any(ids) order by question_id for update;
  if (select count(*) from public.curation_questions where question_id=any(ids))<>cardinality(ids) then raise exception 'Questão não encontrada'; end if;
  for item in select v from jsonb_array_elements(p_items) v order by (v->>'id')::bigint loop
    select * into q from public.curation_questions where question_id=(item->>'id')::bigint;
    if p_action='unlock' then
      if q.lease_session=p_session and q.lease_user=member.user_id then
        update public.curation_questions set lease_session=null,lease_user=null,lease_until=null where question_id=q.question_id;
      end if;
      continue;
    end if;
    if p_action='heartbeat' then
      if q.lease_session is distinct from p_session or q.lease_user is distinct from member.user_id or q.lease_until is null or q.lease_until<=now() then raise exception 'Reserva expirada. Reabra a questão'; end if;
      update public.curation_questions set lease_until=now()+interval '90 seconds' where question_id=q.question_id;
      continue;
    end if;
    if q.responsible_id is not null and q.responsible_id<>member.curator_id then raise exception 'Questão % reservada por %',q.question_id,q.responsible_id; end if;
    if q.lease_until>now() and (q.lease_session is distinct from p_session or q.lease_user is distinct from member.user_id) then raise exception 'Questão % aberta em outra sessão',q.question_id; end if;
    if (item->>'version')::bigint is distinct from q.version then raise exception 'Questão % atualizada. Reabra antes de salvar',q.question_id; end if;
    if p_action='claim' then
      q.responsible_id=member.curator_id; q.lease_session=p_session; q.lease_user=member.user_id; q.lease_until=now()+interval '90 seconds';
    elsif p_action='assign' then
      target=item->>'target';
      if target is not null and not exists(select 1 from public.curation_members where curator_id=target and active) then raise exception 'Responsável inválido'; end if;
      q.responsible_id=target;q.lease_session=null;q.lease_user=null;q.lease_until=null;
    elsif p_action in ('review','status') then
      q.responsible_id=member.curator_id;
      q.status=case when p_action='review' then 'revisar_questao' else item->'patch'->>'status' end;
      if item->'patch'?'notas_revisao' then q.review_notes=item->'patch'->>'notas_revisao'; end if;
      q.modified=q.modified or q.status='questao_corrigida';
      q.reviewer_name=member.name;q.reviewed_at=now();
    else
      if q.lease_session is distinct from p_session or q.lease_user is distinct from member.user_id or q.lease_until is null or q.lease_until<=now() then raise exception 'Abra a questão para reservar antes de editar'; end if;
      if p_action='comment' then
        text_value=btrim(item->>'comment');
        if text_value is null or char_length(text_value) not between 1 and 10000 then raise exception 'Comentário inválido'; end if;
        q.comments=q.comments||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'questao_id',q.question_id::text,'curador_id',member.curator_id,'curador_nome',member.name,'curador_cor',case member.curator_id when 'patrick' then '#A43939' when 'lucas' then '#3b82f6' else '#10b981' end,'texto',text_value,'criado_em',now()));
      else
        content_patch='{}'::jsonb;
        foreach k in array allowed loop
          if coalesce(item->'patch','{}'::jsonb)?k then
            if jsonb_typeof(item->'patch'->k) not in ('string','null') then raise exception 'Campo % deve ser texto',k; end if;
            content_patch=content_patch||jsonb_build_object(k,item->'patch'->k);
          end if;
        end loop;
        q.modified=q.modified or (q.content||content_patch is distinct from q.content) or item->'patch'->>'status'='questao_corrigida';
        q.modified=coalesce(q.modified,false);
        q.content=q.content||content_patch;
        if item->'patch'?'status' then q.status=item->'patch'->>'status'; end if;
        if item->'patch'?'notas_revisao' then q.review_notes=item->'patch'->>'notas_revisao'; end if;
        q.reviewer_name=member.name;q.reviewed_at=now();
      end if;
    end if;
    update public.curation_questions set content=q.content,status=q.status,responsible_id=q.responsible_id,
      version=q.version+1,modified=q.modified,review_notes=q.review_notes,reviewer_name=q.reviewer_name,reviewed_at=q.reviewed_at,
      comments=q.comments,lease_session=q.lease_session,lease_user=q.lease_user,lease_until=q.lease_until,updated_at=now()
      where question_id=q.question_id;
  end loop;
  select jsonb_build_object('questions',jsonb_agg(curation_private.snapshot(t) order by question_id)) into answer from public.curation_questions t where question_id=any(ids);
  insert into curation_private.requests values(member.user_id,p_request,answer);
  -- Serialize only the final event append so cursor order follows commit order.
  perform pg_advisory_xact_lock(741903204);
  insert into curation_private.events(actor,action,question_ids,changes) values(member.user_id,p_action,ids,answer);
  return answer;
end;
$$;
revoke all on function public.curation_base(text,integer),public.curation_sync(bigint),public.curation_mutate(text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.curation_base(text,integer),public.curation_sync(bigint),public.curation_mutate(text,uuid,uuid,jsonb) to authenticated;
-- Realtime publication exists on Supabase; local SQL tests may not have it.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.curation_questions;
  end if;
end $$;
commit;
