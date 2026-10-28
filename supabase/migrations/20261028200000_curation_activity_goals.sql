-- Curation pace for the statistics tab: how many questions each curator
-- audited per day (from the event log, so re-reviews keep their own day),
-- plus shared goals (daily target per curator and a deadline for the base).
begin;

create table curation_private.goals (
  id boolean primary key default true check (id),
  daily jsonb not null default '{}'::jsonb,
  deadline date,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into curation_private.goals(id) values(true);
revoke all on curation_private.goals from public,anon,authenticated;

-- Days in São Paulo time; an audit is a status, review or save on a question.
create function public.curation_activity(p_days integer default 90) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare days integer:=least(greatest(coalesce(p_days,90),7),365); result jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  with audits as (
    select m.curator_id, (e.created_at at time zone 'America/Sao_Paulo')::date as day, q as question_id
    from curation_private.events e
    join public.curation_members m on m.user_id=e.actor
    cross join lateral unnest(e.question_ids) q
    where e.action in ('status','review','save')
  ), daily as (
    select day, curator_id, count(distinct question_id) audited from audits
    where day > (now() at time zone 'America/Sao_Paulo')::date - days
    group by day, curator_id
  ), totals as (
    select curator_id, count(distinct question_id) audited from audits group by curator_id
  )
  select jsonb_build_object(
    'today',(now() at time zone 'America/Sao_Paulo')::date,
    'daily',coalesce((select jsonb_agg(jsonb_build_object('day',day,'curator',curator_id,'audited',audited) order by day) from daily),'[]'::jsonb),
    'totals',coalesce((select jsonb_object_agg(curator_id,audited) from totals),'{}'::jsonb),
    'goals',(select jsonb_build_object('daily',daily,'deadline',deadline,'updated_by',updated_by,'updated_at',updated_at) from curation_private.goals)
  ) into result;
  return result;
end $$;

-- Daily targets of 0 to 1000 per curator and an optional deadline.
create function public.curation_set_goals(p_daily jsonb, p_deadline date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.curation_members; k text; v jsonb;
begin
  select * into member from public.curation_members where user_id=curation_private.actor() and active;
  if member.user_id is null then raise exception 'Curador não autorizado'; end if;
  if jsonb_typeof(p_daily) is distinct from 'object' then raise exception 'Metas inválidas'; end if;
  for k,v in select * from jsonb_each(p_daily) loop
    if not exists(select 1 from public.curation_members where curator_id=k) then raise exception 'Curador desconhecido: %',k; end if;
    if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>1000 or (v::text)::numeric<>trunc((v::text)::numeric) then raise exception 'Meta diária deve ser um número inteiro de 0 a 1000'; end if;
  end loop;
  update curation_private.goals set daily=p_daily,deadline=p_deadline,updated_by=member.name,updated_at=now() where id;
  return (select jsonb_build_object('daily',daily,'deadline',deadline,'updated_by',updated_by,'updated_at',updated_at) from curation_private.goals);
end $$;

revoke all on function public.curation_activity(integer),public.curation_set_goals(jsonb,date) from public;
-- The app calls with the anon key and proves membership with x-apex-session.
grant execute on function public.curation_activity(integer),public.curation_set_goals(jsonb,date) to anon,authenticated;
commit;
