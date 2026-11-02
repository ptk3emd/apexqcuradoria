begin;
-- Server-only mirror. Curators read it through a password-session RPC.
create table curation_private.apex_question_states (
 question_id bigint primary key check(question_id>0),
 lifecycle_state text not null check(lifecycle_state in ('active','draft','under_review','obsolete','archived')),
 quarantined boolean not null default false,
 excluded boolean not null default false,
 reason text
);
create table curation_private.apex_sync_runs (
 id uuid primary key default gen_random_uuid(), token_hash text unique not null,
 status text not null default 'queued' check(status in ('queued','running','complete','failed')),
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 imported integer not null default 0, source_count integer, error text
);
create index apex_sync_runs_created_idx on curation_private.apex_sync_runs(created_at desc);
create index apex_sync_runs_complete_idx on curation_private.apex_sync_runs(finished_at desc) where status='complete';
alter table curation_private.apex_question_states enable row level security;
alter table curation_private.apex_sync_runs enable row level security;
revoke all on curation_private.apex_question_states,curation_private.apex_sync_runs from public,anon,authenticated;

-- A short-lived, single-use token lets pg_cron invoke the worker without putting
-- a service-role key into a cron command or exposing it to a browser.
create function public.curation_apex_begin(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare run_id uuid;
begin
 perform pg_advisory_xact_lock(741903208);
 if exists(select 1 from curation_private.apex_sync_runs where status='running' and started_at>now()-interval '5 minutes') then return null; end if;
 update curation_private.apex_sync_runs set status='running',started_at=now()
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and status='queued' and created_at>now()-interval '3 minutes'
 returning id into run_id;
 return run_id;
end $$;

create function public.curation_apex_missing(p_ids bigint[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(n::text),'[]'::jsonb) from unnest(p_ids) n where not exists(select 1 from public.questions q where q.id=n)
$$;

-- Import only missing source rows. Never upsert over an existing curation edit.
-- The same advisory lock as the legacy ID-reassignment trigger prevents an
-- import race from silently renumbering an Apex question.
create function public.curation_apex_import(p_run uuid,p_questions jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
 perform 1 from curation_private.apex_sync_runs where id=p_run and status='running' and started_at>now()-interval '5 minutes' for update;
 if not found then raise exception 'Sincronização inválida ou expirada'; end if;
 if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions)>200 then raise exception 'Lote de importação inválido'; end if;
 if exists(select 1 from jsonb_array_elements(p_questions) v where coalesce(v->>'id','') !~ '^[1-9][0-9]*$') then raise exception 'ID Apex inválido'; end if;
 perform pg_advisory_xact_lock(741903205);
 insert into public.questions(id,categoria,tema_especifico,ano,origem,enunciado,a,b,c,d,e,correta,comentario,
 justificativa_a,justificativa_b,justificativa_c,justificativa_d,justificativa_e,especialidade,competencias,
 difficulty_bucket,descritores,anulada,referencias,imagem,imagem_legenda)
 select q.id,q.categoria,q.tema_especifico,q.ano,q.origem,q.enunciado,q.a,q.b,q.c,q.d,q.e,q.correta,q.comentario,
 q.justificativa_a,q.justificativa_b,q.justificativa_c,q.justificativa_d,q.justificativa_e,q.especialidade,q.competencias,
 q.difficulty_bucket,q.descritores,coalesce(q.anulada,false),q.referencias,q.imagem,q.imagem_legenda
 from jsonb_populate_recordset(null::public.questions,p_questions) q
 where not exists(select 1 from public.questions existing where existing.id=q.id);
 get diagnostics inserted=row_count;
 update curation_private.apex_sync_runs set imported=imported+inserted where id=p_run;
 return inserted;
end $$;

-- Replace the status snapshot atomically only after every source page and
-- missing quarantine question has been successfully fetched and imported.
create function public.curation_apex_finish(p_run uuid,p_states jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(741903208);
 perform 1 from curation_private.apex_sync_runs where id=p_run and status='running' and started_at>now()-interval '5 minutes' for update;
 if not found then raise exception 'Sincronização inválida ou expirada'; end if;
 if jsonb_typeof(p_states) is distinct from 'array' or jsonb_array_length(p_states) not between 1 and 200000 then raise exception 'Catálogo Apex incompleto'; end if;
 insert into curation_private.apex_question_states as current_state
 select * from jsonb_to_recordset(p_states) as s(question_id bigint,lifecycle_state text,quarantined boolean,excluded boolean,reason text)
 on conflict(question_id) do update set lifecycle_state=excluded.lifecycle_state,quarantined=excluded.quarantined,excluded=excluded.excluded,reason=excluded.reason
 where (current_state.lifecycle_state,current_state.quarantined,current_state.excluded,current_state.reason)
 is distinct from (excluded.lifecycle_state,excluded.quarantined,excluded.excluded,excluded.reason);
 delete from curation_private.apex_question_states where question_id not in
 (select (v->>'question_id')::bigint from jsonb_array_elements(p_states) v);
 update curation_private.apex_sync_runs set status='complete',finished_at=now(),source_count=jsonb_array_length(p_states) where id=p_run;
 delete from curation_private.apex_sync_runs where created_at<now()-interval '7 days';
end $$;
create function public.curation_apex_fail(p_run uuid) returns void
language sql security definer set search_path='' as $$
 update curation_private.apex_sync_runs set status='failed',finished_at=now(),error='Falha ao consultar ou importar o catálogo Apex. A última leitura completa foi mantida.' where id=p_run and status='running'
$$;

create function public.curation_apex_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare checked timestamptz; last_run jsonb; states jsonb;
begin
 if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
 select max(finished_at) into checked from curation_private.apex_sync_runs where status='complete';
 select jsonb_build_object('status',case when status in ('running','queued') and created_at<now()-interval '5 minutes' then 'failed' else status end,
 'startedAt',created_at,'error',error,'imported',imported) into last_run from curation_private.apex_sync_runs order by created_at desc limit 1;
 if checked is not null then
 select coalesce(jsonb_agg(jsonb_build_object('id',q.question_id::text,'state',coalesce(s.lifecycle_state,'missing'),
 'quarantined',coalesce(s.quarantined,false),'excluded',coalesce(s.excluded,false),'reason',s.reason)),'[]'::jsonb)
 into states from public.curation_questions q left join curation_private.apex_question_states s using(question_id);
 end if;
 return jsonb_build_object('checkedAt',checked,'run',last_run,'states',coalesce(states,'[]'::jsonb));
end $$;
revoke all on function public.curation_apex_begin(text),public.curation_apex_missing(bigint[]),public.curation_apex_import(uuid,jsonb),public.curation_apex_finish(uuid,jsonb),public.curation_apex_fail(uuid),public.curation_apex_status() from public,anon,authenticated;
grant execute on function public.curation_apex_begin(text),public.curation_apex_missing(bigint[]),public.curation_apex_import(uuid,jsonb),public.curation_apex_finish(uuid,jsonb),public.curation_apex_fail(uuid) to service_role;
grant execute on function public.curation_apex_status() to anon,authenticated;
commit;
