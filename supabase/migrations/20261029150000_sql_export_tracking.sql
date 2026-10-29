-- What already went to the main database, shared by every curator: each
-- corrected question is recorded with the version that was exported, so a
-- newer correction of the same question becomes pending again; and which
-- repository migrations were applied to this project.
begin;

create table curation_private.sql_exports (
  question_id bigint not null,
  version integer not null,
  batch text,
  exported_by text not null,
  exported_at timestamptz not null default now(),
  primary key (question_id, version)
);
create table curation_private.applied_migrations (
  file text primary key,
  applied_by text not null,
  applied_at timestamptz not null default now()
);
revoke all on curation_private.sql_exports, curation_private.applied_migrations from public, anon, authenticated;

-- This file is applied by running it, so it records itself.
insert into curation_private.applied_migrations(file, applied_by) values ('20261029150000_sql_export_tracking.sql', 'SQL Editor');

create function public.curation_sql_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  return jsonb_build_object(
    'exported', coalesce((select jsonb_agg(jsonb_build_object('id', question_id::text, 'version', version, 'batch', batch, 'by', exported_by, 'at', exported_at) order by exported_at, question_id) from curation_private.sql_exports), '[]'::jsonb),
    'migrations', coalesce((select jsonb_object_agg(file, jsonb_build_object('by', applied_by, 'at', applied_at)) from curation_private.applied_migrations), '{}'::jsonb));
end $$;

-- p_items: [{"id": "123", "version": 4}, ...] (up to 500). p_done=false undoes the mark.
create function public.curation_mark_exported(p_items jsonb, p_batch text, p_done boolean default true) returns integer
language plpgsql security definer set search_path='' as $$
declare member public.curation_members; n integer;
begin
  select * into member from public.curation_members where user_id = curation_private.actor() and active;
  if member.user_id is null then raise exception 'Curador não autorizado'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Escolha de 1 a 500 questões'; end if;
  if p_done then
    insert into curation_private.sql_exports(question_id, version, batch, exported_by)
    select (v->>'id')::bigint, (v->>'version')::integer, left(p_batch, 120), member.name from jsonb_array_elements(p_items) v
    on conflict (question_id, version) do nothing;
  else
    delete from curation_private.sql_exports e using jsonb_array_elements(p_items) v
    where e.question_id = (v->>'id')::bigint and e.version = (v->>'version')::integer;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.curation_mark_migration(p_file text, p_done boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.curation_members;
begin
  select * into member from public.curation_members where user_id = curation_private.actor() and active;
  if member.user_id is null then raise exception 'Curador não autorizado'; end if;
  if p_file !~ '^\d{14}_[a-z0-9_]+\.sql$' then raise exception 'Nome de migração inválido'; end if;
  if p_done then
    insert into curation_private.applied_migrations(file, applied_by) values (p_file, member.name)
    on conflict (file) do update set applied_by = excluded.applied_by, applied_at = now();
  else
    delete from curation_private.applied_migrations where file = p_file;
  end if;
  return coalesce((select jsonb_object_agg(file, jsonb_build_object('by', applied_by, 'at', applied_at)) from curation_private.applied_migrations), '{}'::jsonb);
end $$;

revoke all on function public.curation_sql_state(), public.curation_mark_exported(jsonb, text, boolean), public.curation_mark_migration(text, boolean) from public;
-- The app calls with the anon key and proves membership with x-apex-session.
grant execute on function public.curation_sql_state(), public.curation_mark_exported(jsonb, text, boolean), public.curation_mark_migration(text, boolean) to anon, authenticated;
commit;
