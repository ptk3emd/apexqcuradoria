-- Imports wrote the text "null" (any case, with or without spaces) into empty
-- fields. The quality checks now read it as absent, like SQL NULL and blanks.
begin;

-- The trimmed text, or '' when it is NULL, blank or the word "null".
create function curation_private.present(value text) returns text language sql immutable set search_path='' as $$
  select case when value is null or lower(btrim(value)) in ('','null') then '' else btrim(value) end;
$$;
revoke all on function curation_private.present(text) from public,anon,authenticated;

create or replace function curation_private.quality_flags(c jsonb) returns text[] language plpgsql immutable set search_path='' as $$
declare
  flags text[]:='{}';
  field text;
  letter text;
  key text:=upper(curation_private.present(c->>'correta'));
  annulled boolean:=coalesce((c->>'anulada')::boolean,false);
  just text;
  -- "é a correta", "Correta.", "alternativa correta", "gabarito"; not "incorreta", "não é a correta".
  says_correct constant text:='(^|[^[:alpha:]])(correta|certa|verdadeira|gabarito)([^[:alpha:]]|$)';
  says_not_correct constant text:='(n[ãa]o|nem)\s+(é|e|est[áa]|seria)?\s*(a\s+)?(alternativa\s+|resposta\s+)?(correta|certa|verdadeira)';
  says_wrong constant text:='(^|[^[:alpha:]])(incorreta|errada|falsa)([^[:alpha:]]|$)';
  named text;
begin
  foreach field in array array['enunciado','a','b','c','d','e','comentario','justificativa_a','justificativa_b','justificativa_c','justificativa_d','justificativa_e','especialidade','tema_especifico','origem','ano'] loop
    if curation_private.present(c->>field)='' then flags:=flags||('falta_'||field); end if;
  end loop;
  if not annulled then
    if key='' then flags:=flags||'falta_correta'::text;
    elsif key !~ '^[A-E]$' then flags:=flags||'gabarito_invalido'::text;
    end if;
  end if;

  if key ~ '^[A-E]$' and not annulled then
    foreach letter in array array['a','b','c','d','e'] loop
      just:=curation_private.present(c->>('justificativa_'||letter));
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

  if (select count(*)<>count(distinct lower(curation_private.present(v))) from unnest(array[c->>'a',c->>'b',c->>'c',c->>'d',c->>'e']) v where curation_private.present(v)<>'') then
    flags:=flags||'alternativas_repetidas'::text;
  end if;
  return flags;
end $$;
commit;
