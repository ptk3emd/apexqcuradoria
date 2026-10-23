-- =============================================================================
-- Question images in the curation (project jcbinmjiimqomjdyfdia)
-- =============================================================================
-- The Apex student app draws questions.imagem and needs questions.imagem_legenda
-- (its alt text and caption). The curation did not know either column: this adds
-- them here, with the same rules as the Apex database, lets curation_mutate save
-- them, and adds the upload gate used by the `upload-question-image` Edge Function.
--
--   * imagem may only be a .webp file of the Apex project's public
--     `question-images` bucket; the Edge Function is the only writer of that bucket.
--   * A figure needs its description; a description without a figure is dropped.
--   * curation_register_image_upload(): checks the curator's session (the same
--     x-apex-session header as every other RPC) and allows at most 30 uploads per
--     curator in 10 minutes. The Edge Function calls it before it writes a file.
--
-- Idempotent. Run it in the SQL editor of this project; no data is rewritten.
-- Because trg_curation_source stores to_jsonb(new), the snapshot of a question
-- gets the two keys the next time its row is touched; until then a missing key
-- reads as NULL, which is what the new columns hold.
-- =============================================================================
begin;

alter table public.questions add column if not exists imagem text;
alter table public.questions add column if not exists imagem_legenda text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.questions'::regclass and conname='questions_imagem_length_check') then
    alter table public.questions add constraint questions_imagem_length_check check (imagem is null or char_length(imagem) between 1 and 2048);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.questions'::regclass and conname='questions_imagem_legenda_length_check') then
    alter table public.questions add constraint questions_imagem_legenda_length_check check (imagem_legenda is null or char_length(btrim(imagem_legenda)) between 1 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.questions'::regclass and conname='questions_imagem_requires_legenda_check') then
    alter table public.questions add constraint questions_imagem_requires_legenda_check check (imagem is null or imagem_legenda is not null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.questions'::regclass and conname='questions_imagem_storage_check') then
    alter table public.questions add constraint questions_imagem_storage_check check (imagem is null or imagem ~ '^https://beedxpjaufgujusyuziq\.supabase\.co/storage/v1/object/public/question-images/[A-Za-z0-9._/-]+\.webp$');
  end if;
end $$;

-- Upload gate ------------------------------------------------------------------
create table if not exists curation_private.image_uploads (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.curation_members(user_id),
 question_id bigint,
 created_at timestamptz not null default now()
);
create index if not exists image_uploads_user_time on curation_private.image_uploads(user_id,created_at desc);
alter table curation_private.image_uploads enable row level security;
revoke all on curation_private.image_uploads from public,anon,authenticated;

create or replace function public.curation_register_image_upload(p_question_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.curation_members; recent integer;
begin
 select * into member from public.curation_members where user_id=curation_private.actor() and active;
 if member.user_id is null then raise exception 'Sessão expirada. Entre novamente com a senha mestra.'; end if;
 if p_question_id is null or not exists(select 1 from public.questions where id=p_question_id) then raise exception 'Questão não encontrada.'; end if;
 select count(*) into recent from curation_private.image_uploads where user_id=member.user_id and created_at>now()-interval '10 minutes';
 if recent>=30 then raise exception 'Muitos envios de imagem em pouco tempo. Aguarde alguns minutos.'; end if;
 insert into curation_private.image_uploads(user_id,question_id) values(member.user_id,p_question_id);
 delete from curation_private.image_uploads where created_at<now()-interval '1 day';
 return jsonb_build_object('curator_id',member.curator_id);
end $$;
revoke all on function public.curation_register_image_upload(bigint) from public;
grant execute on function public.curation_register_image_upload(bigint) to anon,authenticated;

-- curation_mutate: the previous definition (20261012190000) plus imagem/imagem_legenda ----
create or replace function public.curation_mutate(p_action text,p_session uuid,p_request uuid,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.curation_members; q public.curation_questions; item jsonb; ids bigint[]; content_patch jsonb; k text; target text; answer jsonb; text_value text; source_row public.questions; old_id bigint; rename_map jsonb:='{}'::jsonb;
  allowed constant text[]:=array['categoria','tema_especifico','ano','origem','enunciado','a','b','c','d','e','correta','comentario','justificativa_a','justificativa_b','justificativa_c','justificativa_d','justificativa_e','especialidade','competencias','difficulty_bucket','descritores','anulada','referencias','imagem','imagem_legenda'];
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
        -- A figure: blank means none, the address must be a file of the Apex bucket
        -- (the Edge Function is the only one that writes there) and it needs its caption.
        if content_patch?'imagem' and btrim(coalesce(content_patch->>'imagem',''))='' then content_patch=content_patch||'{"imagem":null}'::jsonb; end if;
        if content_patch?'imagem_legenda' and btrim(coalesce(content_patch->>'imagem_legenda',''))='' then content_patch=content_patch||'{"imagem_legenda":null}'::jsonb; end if;
        if content_patch?'imagem_legenda' and content_patch->>'imagem_legenda' is not null then content_patch=content_patch||jsonb_build_object('imagem_legenda',btrim(content_patch->>'imagem_legenda')); end if;
        if (q.content||content_patch)->>'imagem' is not null then
          if (q.content||content_patch)->>'imagem' !~ '^https://beedxpjaufgujusyuziq\.supabase\.co/storage/v1/object/public/question-images/[A-Za-z0-9._/-]+\.webp$' then
            raise exception 'A imagem precisa ser enviada pelo botão de imagem do editor.';
          end if;
          if (q.content||content_patch)->>'imagem_legenda' is null then
            raise exception 'Descreva a imagem antes de salvar: a descrição é o texto alternativo para quem não enxerga a figura.';
          end if;
          if char_length((q.content||content_patch)->>'imagem_legenda')>500 then
            raise exception 'A descrição da imagem deve ter até 500 caracteres.';
          end if;
        end if;
        -- Without an image the caption has no meaning.
        if (q.content||content_patch)->>'imagem' is null and (q.content||content_patch)->>'imagem_legenda' is not null then
          content_patch=content_patch||'{"imagem_legenda":null}'::jsonb;
        end if;
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
      update public.questions set categoria=source_row.categoria, tema_especifico=source_row.tema_especifico, ano=source_row.ano, origem=source_row.origem, enunciado=source_row.enunciado, a=source_row.a, b=source_row.b, c=source_row.c, d=source_row.d, e=source_row.e, correta=source_row.correta, comentario=source_row.comentario, justificativa_a=source_row.justificativa_a, justificativa_b=source_row.justificativa_b, justificativa_c=source_row.justificativa_c, justificativa_d=source_row.justificativa_d, justificativa_e=source_row.justificativa_e, especialidade=source_row.especialidade, competencias=source_row.competencias, difficulty_bucket=source_row.difficulty_bucket, descritores=source_row.descritores, anulada=coalesce(source_row.anulada,false), referencias=source_row.referencias, imagem=source_row.imagem, imagem_legenda=source_row.imagem_legenda,created_at=source_row.created_at,id=source_row.id where id=old_id;
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

commit;
