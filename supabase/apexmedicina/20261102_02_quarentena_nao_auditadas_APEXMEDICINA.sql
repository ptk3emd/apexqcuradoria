-- PASSO 2 de 2 — rodar no SQL Editor do projeto APEX MEDICINA (beedxpjaufgujusyuziq).
--
-- Coloca em quarentena todas as questões que NÃO estão na lista de auditadas
-- (lotes 1 a 12, vinda do passo 1) e as esconde do banco de questões dos alunos.
--
-- Como a quarentena funciona:
--   * Usa a tabela que já existe, public.question_lifecycle, com state = 'under_review'.
--     O gatilho log_lifecycle_change registra cada mudança em question_lifecycle_audit.
--   * Uma política RESTRITIVA de leitura em public.questions esconde essas questões de
--     todos os usuários, exceto admin, curador e master (is_curator_user()).
--     Vale para leituras diretas e para get_filtered_questions (que respeita RLS).
--   * get_user_mistakes() e get_question_facets(), que ignoram RLS (SECURITY DEFINER),
--     passam a pular as questões em quarentena.
--   * Nada é apagado: questões, respostas, histórico e estatísticas continuam intactos.
--     Para desfazer, use o arquivo 20261102_03_liberar_quarentena_APEXMEDICINA.sql.
--
-- ANTES DE RODAR: na linha marcada com  <-- COLE AQUI  (logo abaixo do begin), troque o marcador
-- entre aspas pela coluna "colar_no_passo_2" do passo 1. Ela começa com { e termina com }.
-- Sem a lista, com a lista vazia ou com IDs inexistentes, o script para sem alterar nada.

begin;

create temp table auditadas (id bigint primary key) on commit drop;
insert into auditadas
select distinct unnest('COLE_AQUI_A_LISTA'::bigint[]);  -- <-- COLE AQUI

-- Travas: lista vazia, grande demais para 12 lotes, ou com IDs que não existem → nada é alterado.
do $$
declare n integer; inexistentes integer;
begin
  select count(*) into n from auditadas;
  if n = 0 then
    raise exception 'Lista de auditadas vazia. Cole o resultado do passo 1 na linha marcada com COLE AQUI.';
  end if;
  if n > 12 * 50 then
    raise exception 'A lista tem % IDs, mais do que 12 lotes de 50 comportam. Confira o passo 1.', n;
  end if;
  select count(*) into inexistentes from auditadas a where not exists (select 1 from public.questions q where q.id = a.id);
  if inexistentes > 0 then
    raise exception '% IDs da lista não existem em public.questions. Confira se o passo 1 rodou no projeto de curadoria.', inexistentes;
  end if;
  raise notice 'Auditadas (ficam visíveis): %. Em quarentena: %.', n, (select count(*) from public.questions) - n;
end $$;

-- 1. Quarentena das não auditadas. Questões já em outro estado (obsolete, archived…) não são tocadas.
insert into public.question_lifecycle (question_id, state, notes)
select q.id, 'under_review', 'Quarentena 2026-11-02: questão ainda não auditada pela curadoria (fora dos lotes 1–12).'
from public.questions q
where not exists (select 1 from auditadas a where a.id = q.id)
on conflict (question_id) do update
  set state = 'under_review', state_changed_at = now(), notes = excluded.notes
  where public.question_lifecycle.state = 'active';

-- As auditadas ficam ativas, mesmo que já tivessem sido postas em quarentena antes.
update public.question_lifecycle
set state = 'active', state_changed_at = now(), notes = 'Liberada 2026-11-02: auditada pela curadoria (lotes 1–12).'
where state = 'under_review' and question_id in (select id from auditadas);

-- 2. Esconder dos alunos. Restritiva: soma-se às políticas existentes, não as substitui.
drop policy if exists questions_hide_quarantined on public.questions;
create policy questions_hide_quarantined on public.questions
  as restrictive for select to anon, authenticated
  using (
    not exists (select 1 from public.question_lifecycle l where l.question_id = questions.id and l.state = 'under_review')
    or (select public.is_curator_user())
  );

-- 3. Funções que ignoram RLS: mesma definição de antes, mais o filtro da quarentena.
create or replace function public.get_user_mistakes()
 returns setof questions
 language sql
 security definer
 set search_path to 'public'
as $function$
  select distinct on (q.id) q.*
  from questions q
  inner join user_history uh on q.id = uh.question_id
  where uh.user_id = auth.uid()
    and uh.is_correct = false
    and not exists (select 1 from question_lifecycle l where l.question_id = q.id and l.state = 'under_review')
  order by q.id, uh.created_at desc;
$function$;

create or replace function public.get_question_facets(p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  result jsonb;
begin
  with visiveis as (
    select q.* from questions q
    where not exists (select 1 from question_lifecycle l where l.question_id = q.id and l.state = 'under_review')
  )
  select jsonb_build_object(
    'categorias', (select jsonb_agg(jsonb_build_object('value', categoria, 'count', cnt))
                   from (select categoria, count(*) as cnt from visiveis where categoria is not null group by categoria) t),
    'especialidades', (select jsonb_agg(jsonb_build_object('value', especialidade, 'count', cnt))
                   from (select especialidade, count(*) as cnt from visiveis where especialidade is not null group by especialidade) t),
    'anos', (select jsonb_agg(jsonb_build_object('value', ano, 'count', cnt))
                   from (select ano, count(*) as cnt from visiveis where ano is not null group by ano) t),
    'origens', (select jsonb_agg(jsonb_build_object('value', origem, 'count', cnt))
                   from (select origem, count(*) as cnt from visiveis where origem is not null group by origem) t),
    'temas_especificos', (select jsonb_agg(jsonb_build_object('value', tema_especifico, 'count', cnt))
                   from (select tema_especifico, count(*) as cnt from visiveis where tema_especifico is not null group by tema_especifico) t),
    'competencias', (select jsonb_agg(jsonb_build_object('value', competencias, 'count', cnt))
                   from (select competencias, count(*) as cnt from visiveis where competencias is not null group by competencias) t)
  ) into result;
  return result;
end;
$function$;

-- 4. Conferência (antes do COMMIT): quantas ficaram visíveis e quantas em quarentena.
select coalesce(l.state, 'active (sem registro)') as estado, count(*) as questoes
from public.questions q
left join public.question_lifecycle l on l.question_id = q.id
group by 1
order by 1;

commit;
