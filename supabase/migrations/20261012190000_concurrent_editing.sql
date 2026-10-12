begin;
-- Concurrent editing. Several curators (and tabs) may edit the same question
-- at once; nothing is reserved any more.
--
-- * Presence moves to curation_private.presence, one row per (question,
--   tab session), so curation_sync can list everyone on a question. The single
--   lease_* columns on curation_questions stay, unused.
-- * curation_mutate drops every exclusive check: "reservada por", "aberta em
--   outra sessão", "atualizada. Reabra antes de salvar" and "Abra a questão
--   para reservar". claim/heartbeat upsert the caller's presence (90 s) and no
--   longer take the responsibility; unlock deletes it. Saves apply only the
--   keys in the patch, and the client sends only the fields the curator
--   changed: different fields merge, the same field takes the last save.
--   version still increments so clients order the updates they receive.
-- * curation_sync returns leases as a list, several per question.
-- Bodies follow 20261012120000 with the identity from 20261010151200
-- (curation_private.actor()); OR REPLACE keeps the grants.

create table if not exists curation_private.presence (
  question_id bigint not null references public.curation_questions(question_id) on update cascade on delete cascade,
  session uuid not null,
  user_id uuid not null references public.curation_members(user_id) on delete cascade,
  curator_id text not null,
  until timestamptz not null,
  primary key(question_id,session)
);
create index if not exists presence_until on curation_private.presence(until);
alter table curation_private.presence enable row level security;
revoke all on curation_private.presence from public,anon,authenticated;

create or replace function public.curation_mutate(p_action text,p_session uuid,p_request uuid,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.curation_members; q public.curation_questions; item jsonb; ids bigint[]; content_patch jsonb; k text; target text; answer jsonb; text_value text; source_row public.questions; old_id bigint; rename_map jsonb:='{}'::jsonb;
  allowed constant text[]:=array['categoria','tema_especifico','ano','origem','enunciado','a','b','c','d','e','correta','comentario','justificativa_a','justificativa_b','justificativa_c','justificativa_d','justificativa_e','especialidade','competencias','difficulty_bucket','descritores','anulada','referencias'];
begin
  select * into member from public.curation_members where user_id=curation_private.actor() and active;
  if member.user_id is null then raise exception 'Curador não autorizado'; end if;
  if p_session is null or p_request is null then raise exception 'Sessão/operação inválida'; end if;
  if p_action is null or p_action not in ('claim','assign','save','comment','heartbeat','unlock','review','status') then raise exception 'Ação inválida'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Escolha de 1 a 100 questões'; end if;
  select array_agg((v->>'id')::bigint order by (v->>'id')::bigint) into ids from jsonb_array_elements(p_items) v;
  if array_position(ids,null) is not null or cardinality(ids)<>(select count(distinct n) from unnest(ids) n) then raise exception 'IDs inválidos ou duplicados'; end if;
  perform pg_advisory_xact_lock(hashtextextended(member.user_id::text||p_request::text,0));
  select response into answer from curation_private.requests where user_id=member.user_id and request_id=p_request;
  if answer is not null then return answer; end if;
  perform id from public.questions where id=any(ids) order by id for update;
  perform question_id from public.curation_questions where question_id=any(ids) order by question_id for update;
  if (select count(*) from public.curation_questions where question_id=any(ids))<>cardinality(ids) then raise exception 'Questão não encontrada'; end if;
  for item in select v from jsonb_array_elements(p_items) v order by (v->>'id')::bigint loop
    select * into q from public.curation_questions where question_id=(item->>'id')::bigint;
    -- Presence only: opening a question never reserves it, and any number of
    -- curators and tabs can be on the same question at once.
    if p_action in ('claim','heartbeat') then
      insert into curation_private.presence(question_id,session,user_id,curator_id,until)
      values(q.question_id,p_session,member.user_id,member.curator_id,now()+interval '90 seconds')
      on conflict(question_id,session) do update set user_id=excluded.user_id,curator_id=excluded.curator_id,until=excluded.until;
      continue;
    end if;
    if p_action='unlock' then
      delete from curation_private.presence where question_id=q.question_id and session=p_session and user_id=member.user_id;
      continue;
    end if;
    -- No ownership, session or version gate: a save carries only the fields
    -- its author changed, so concurrent edits to different fields both land
    -- and the last save wins on the same field.
    if p_action='assign' then
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
      if p_action='comment' then
        text_value=btrim(item->>'comment');
        if text_value is null or char_length(text_value) not between 1 and 10000 then raise exception 'Comentário inválido'; end if;
        q.comments=q.comments||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'questao_id',q.question_id::text,'curador_id',member.curator_id,'curador_nome',member.name,'curador_cor',case member.curator_id when 'patrick' then '#A43939' when 'lucas' then '#3b82f6' else '#10b981' end,'texto',text_value,'criado_em',now()));
      else
        content_patch='{}'::jsonb;
        foreach k in array allowed loop
          if coalesce(item->'patch','{}'::jsonb)?k then
            if k='anulada' then
              if jsonb_typeof(item->'patch'->k) is distinct from 'boolean' then raise exception 'Campo anulada deve ser verdadeiro ou falso'; end if;
            elsif jsonb_typeof(item->'patch'->k) not in ('string','null') then raise exception 'Campo % deve ser texto',k; end if;
            content_patch=content_patch||jsonb_build_object(k,item->'patch'->k);
          end if;
        end loop;
        -- An annulled question has no official answer key.
        if coalesce((q.content||content_patch)->>'anulada','false')='true' then content_patch=content_patch||'{"correta":null}'::jsonb; end if;
        if content_patch?'referencias' and btrim(coalesce(content_patch->>'referencias',''))='' then content_patch=content_patch||'{"referencias":null}'::jsonb; end if;
        q.modified=q.modified or (q.content||content_patch is distinct from q.content) or item->'patch'->>'status'='questao_corrigida';
        q.modified=coalesce(q.modified,false);
        q.content=q.content||content_patch;
        if item->'patch'?'status' then q.status=item->'patch'->>'status'; end if;
        if item->'patch'?'notas_revisao' then q.review_notes=item->'patch'->>'notas_revisao'; end if;
        q.reviewer_name=member.name;q.reviewed_at=now();
      end if;
    end if;
    if p_action='save' then
      old_id=q.question_id;
      select * into source_row from jsonb_populate_record(null::public.questions,
        q.content || jsonb_build_object('id',coalesce(item->'patch'->>'id',q.question_id::text),
          'created_at',case when item->'patch'?'created_at' then item->'patch'->'created_at' else q.content->'created_at' end));
      if source_row.difficulty_bucket='' then source_row.difficulty_bucket=null; end if;
      update public.questions set categoria=source_row.categoria, tema_especifico=source_row.tema_especifico, ano=source_row.ano, origem=source_row.origem, enunciado=source_row.enunciado, a=source_row.a, b=source_row.b, c=source_row.c, d=source_row.d, e=source_row.e, correta=source_row.correta, comentario=source_row.comentario, justificativa_a=source_row.justificativa_a, justificativa_b=source_row.justificativa_b, justificativa_c=source_row.justificativa_c, justificativa_d=source_row.justificativa_d, justificativa_e=source_row.justificativa_e, especialidade=source_row.especialidade, competencias=source_row.competencias, difficulty_bucket=source_row.difficulty_bucket, descritores=source_row.descritores, anulada=coalesce(source_row.anulada,false), referencias=source_row.referencias,created_at=source_row.created_at,id=source_row.id where id=old_id;
      if source_row.id<>old_id then
        rename_map=rename_map||jsonb_build_object(source_row.id::text,old_id::text);
        ids=array_replace(ids,old_id,source_row.id);
        q.question_id=source_row.id;
      end if;
      -- Include values generated by PostgreSQL and source-trigger version increments.
      select content,version into q.content,q.version from public.curation_questions where question_id=q.question_id;
    end if;
    update public.curation_questions set content=q.content,status=q.status,responsible_id=q.responsible_id,
      version=q.version+1,modified=q.modified,review_notes=q.review_notes,reviewer_name=q.reviewer_name,reviewed_at=q.reviewed_at,
      comments=q.comments,lease_session=q.lease_session,lease_user=q.lease_user,lease_until=q.lease_until,updated_at=now()
      where question_id=q.question_id;
  end loop;
  select jsonb_build_object('questions',jsonb_agg(curation_private.snapshot(t) || jsonb_build_object('sync_source_id',question_id::text,'previous_id',rename_map->>question_id::text) order by question_id)) into answer from public.curation_questions t where question_id=any(ids);
  insert into curation_private.requests values(member.user_id,p_request,answer);
  -- Serialize only the final event append so cursor order follows commit order.
  perform pg_advisory_xact_lock(741903204);
  insert into curation_private.events(actor,action,question_ids,changes) values(member.user_id,p_action,ids || coalesce((select array_agg(value::bigint) from jsonb_each_text(rename_map)),array[]::bigint[]),answer);
  return answer;
end;
$$;

create or replace function public.curation_sync(p_cursor bigint default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event_ids bigint[]; next_cursor bigint; ids bigint[]; records jsonb; leases jsonb; removed jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  if p_cursor<0 then raise exception 'Cursor inválido'; end if;
  select array_agg(id),coalesce(max(id),p_cursor) into event_ids,next_cursor from (select id from curation_private.events where id>p_cursor order by id limit 100) e;
  select array_agg(distinct question_id) into ids from curation_private.events e cross join lateral unnest(e.question_ids) question_id where e.id=any(event_ids);
  select coalesce(jsonb_agg(curation_private.snapshot(q)),'[]'::jsonb) into records from public.curation_questions q where q.question_id=any(ids);
  delete from curation_private.presence where until<=now();
  select coalesce(jsonb_agg(jsonb_build_object('question_id',p.question_id::text,'actor',p.curator_id,'name',m.name,'session',p.session,'until',extract(epoch from p.until)*1000) order by p.question_id,p.until),'[]'::jsonb)
    into leases from curation_private.presence p join public.curation_members m on m.user_id=p.user_id where p.until>now();
  select coalesce(jsonb_agg(n::text),'[]'::jsonb) into removed from unnest(ids) n where not exists(select 1 from public.curation_questions where question_id=n);
  return jsonb_build_object('removed_ids',removed,'questions',records,'cursor',next_cursor,'more',exists(select 1 from curation_private.events where id>next_cursor),'leases',leases);
end;
$$;

commit;
