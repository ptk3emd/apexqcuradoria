-- Light question list for the first load, fetched in parallel ranges.
-- The table only needs metadata and a preview of the statement; the full
-- content of a question is fetched when it is opened (curation_full), and
-- full-text search runs here (curation_search) instead of in the browser.
begin;

-- Same shape as curation_private.snapshot, without the long text fields.
-- `parcial` tells the client the row still needs curation_full before editing.
create function curation_private.list_snapshot(q public.curation_questions) returns jsonb language sql stable set search_path='' as $$
  select (q.content - array['a','b','c','d','e','comentario','justificativa_a','justificativa_b','justificativa_c','justificativa_d','justificativa_e','referencias','descritores','imagem_legenda','enunciado'])
    || jsonb_build_object(
    'enunciado',left(coalesce(q.content->>'enunciado',''),240),'parcial',true,
    'id',q.question_id::text,'status',q.status,'sync_version',q.version,
    'responsavel_id',q.responsible_id,'responsavel_nome',case q.responsible_id when 'patrick' then 'Patrick' when 'lucas' then 'Lucas' when 'thierry' then 'Thierry' else q.responsible_id end,
    'modificado',q.modified,'notas_revisao',q.review_notes,'revisado_por',q.reviewer_name,'revisado_em',q.reviewed_at,'shared_comments',q.comments);
$$;
revoke all on function curation_private.list_snapshot(public.curation_questions) from public,anon,authenticated;

-- Event cursor plus the first id of every block of p_block questions, so the
-- client can request all blocks at once instead of one page after another.
create function public.curation_list_plan(p_block integer default 1000) returns jsonb
language plpgsql security definer set search_path='' as $$
declare block integer:=least(greatest(coalesce(p_block,1000),100),2000); starts jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  select coalesce(jsonb_agg(question_id order by question_id),'[]'::jsonb) into starts
  from (select question_id,row_number() over(order by question_id) n from public.curation_questions) r where (n-1)%block=0;
  return jsonb_build_object('cursor',(select coalesce(max(id),0) from curation_private.events),'starts',starts,'block',block);
end $$;

-- Questions with p_from <= id < p_to (p_to null: to the end), at most 2000.
create function public.curation_list(p_from bigint, p_to bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  select coalesce(jsonb_agg(curation_private.list_snapshot(q) order by question_id),'[]'::jsonb) into result
  from (select * from public.curation_questions where question_id>=p_from and (p_to is null or question_id<p_to) order by question_id limit 2000) q;
  return result;
end $$;

-- Full content of up to 200 questions.
create function public.curation_full(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  if cardinality(p_ids)>200 then raise exception 'Escolha até 200 questões'; end if;
  select coalesce(jsonb_agg(curation_private.snapshot(q) order by question_id),'[]'::jsonb) into result
  from public.curation_questions q where q.question_id=any(p_ids);
  return result;
end $$;

-- Ids of the questions whose text contains every term, ignoring case like the
-- browser search did.
create function public.curation_search(p_terms text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  if cardinality(p_terms) not between 1 and 10 then raise exception 'Busca inválida'; end if;
  select coalesce(jsonb_agg(question_id::text),'[]'::jsonb) into result from (
    select question_id from public.curation_questions q
    where (select bool_and(concat_ws(' ',q.question_id::text,q.content->>'enunciado',q.content->>'a',q.content->>'b',q.content->>'c',q.content->>'d',q.content->>'e',
            q.content->>'comentario',q.content->>'tema_especifico',q.content->>'especialidade',q.content->>'categoria',q.content->>'origem',q.content->>'ano')
            ilike '%'||replace(replace(replace(t,'\','\\'),'%','\%'),'_','\_')||'%')
           from unnest(p_terms) t where btrim(t)<>'')
    order by question_id limit 5000) m;
  return result;
end $$;

revoke all on function public.curation_list_plan(integer),public.curation_list(bigint,bigint),public.curation_full(bigint[]),public.curation_search(text[]) from public,anon;
grant execute on function public.curation_list_plan(integer),public.curation_list(bigint,bigint),public.curation_full(bigint[]),public.curation_search(text[]) to authenticated;
commit;
