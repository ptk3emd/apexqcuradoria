-- Flags questions that are probably wrong, so curators can reserve them in a batch.
-- Runs on the full content (the app's list only carries a preview) and returns
-- {"<id>": ["code", ...]} for the flagged questions only.
--
-- Codes:
--   falta_<campo>          a required field is empty (enunciado, a..e, correta,
--                          comentario, justificativa_a..e, especialidade,
--                          tema_especifico, origem, ano)
--   gabarito_invalido      correta is not A..E on a question that is not annulled
--   justificativa_contradiz the justification of another letter calls it correct,
--                          or the answer key's own justification calls it wrong
--   comentario_contradiz   the comment names another letter as the answer
--   alternativas_repetidas two alternatives have the same text
begin;

create function curation_private.quality_flags(c jsonb) returns text[] language plpgsql immutable set search_path='' as $$
declare
  flags text[]:='{}';
  field text;
  letter text;
  key text:=upper(btrim(coalesce(c->>'correta','')));
  annulled boolean:=coalesce((c->>'anulada')::boolean,false);
  just text;
  -- "é a correta", "Correta.", "alternativa correta", "gabarito"; not "incorreta", "não é a correta".
  says_correct constant text:='(^|[^[:alpha:]])(correta|certa|verdadeira|gabarito)([^[:alpha:]]|$)';
  says_not_correct constant text:='(n[ãa]o|nem)\s+(é|e|est[áa]|seria)?\s*(a\s+)?(alternativa\s+|resposta\s+)?(correta|certa|verdadeira)';
  says_wrong constant text:='(^|[^[:alpha:]])(incorreta|errada|falsa)([^[:alpha:]]|$)';
  named text;
begin
  foreach field in array array['enunciado','a','b','c','d','e','comentario','justificativa_a','justificativa_b','justificativa_c','justificativa_d','justificativa_e','especialidade','tema_especifico','origem','ano'] loop
    if btrim(coalesce(c->>field,''))='' then flags:=flags||('falta_'||field); end if;
  end loop;
  if not annulled then
    if key='' then flags:=flags||'falta_correta'::text;
    elsif key !~ '^[A-E]$' then flags:=flags||'gabarito_invalido'::text;
    end if;
  end if;

  if key ~ '^[A-E]$' and not annulled then
    foreach letter in array array['a','b','c','d','e'] loop
      just:=btrim(coalesce(c->>('justificativa_'||letter),''));
      continue when just='';
      if upper(letter)<>key and just ~* says_correct and just !~* says_not_correct and just !~* says_wrong then
        flags:=flags||'justificativa_contradiz'::text; exit;
      end if;
      if upper(letter)=key and just ~* says_wrong and just !~* says_correct then
        flags:=flags||'justificativa_contradiz'::text; exit;
      end if;
    end loop;
    -- Letters are only read after "letra"/"alternativa" or after "gabarito:" so the
    -- Portuguese words "a" and "e" are never taken for an answer.
    -- "a resposta correta é a letra C", "gabarito: C", "alternativa C é a correta".
    for named in
      select upper(m[1]) from regexp_matches(coalesce(c->>'comentario',''),
        '(?:gabarito|resposta|alternativa\s+correta|letra\s+correta)(?:\s+correta)?\s*(?:é|e|:|-|=)?\s*(?:a\s+)?(?:letra|alternativa)\s+\(?([a-e])\)?(?![[:alpha:]])','gi') m
      union all
      select upper(m[1]) from regexp_matches(coalesce(c->>'comentario',''),
        '(?:gabarito|resposta\s+correta)\s*(?::|-|=)\s*(?:letra\s+)?\(?([a-e])\)?(?![[:alpha:]])','gi') m
      union all
      select upper(m[1]) from regexp_matches(coalesce(c->>'comentario',''),
        '(?:letra|alternativa)\s+\(?([a-e])\)?\s+(?:é|e|est[áa])\s+(?:a\s+)?(?:correta|certa|verdadeira)(?![[:alpha:]])','gi') m
    loop
      if named<>key then flags:=flags||'comentario_contradiz'::text; exit; end if;
    end loop;
  end if;

  if (select count(*)<>count(distinct lower(btrim(v))) from unnest(array[c->>'a',c->>'b',c->>'c',c->>'d',c->>'e']) v where btrim(coalesce(v,''))<>'') then
    flags:=flags||'alternativas_repetidas'::text;
  end if;
  return flags;
end $$;
revoke all on function curation_private.quality_flags(jsonb) from public,anon,authenticated;

create function public.curation_quality_flags() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.curation_is_member() then raise exception 'Curador não autorizado'; end if;
  select coalesce(jsonb_object_agg(question_id::text,to_jsonb(flags)),'{}'::jsonb) into result
  from (select question_id,curation_private.quality_flags(content) flags from public.curation_questions) f
  where cardinality(flags)>0;
  return result;
end $$;
revoke all on function public.curation_quality_flags() from public;
-- The app calls with the anon key and proves membership with x-apex-session.
grant execute on function public.curation_quality_flags() to anon,authenticated;
commit;
