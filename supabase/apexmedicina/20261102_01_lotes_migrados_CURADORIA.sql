-- PASSO 1 de 2 — rodar no SQL Editor do projeto de CURADORIA (jcbinmjiimqomjdyfdia).
-- Só leitura: não altera nada. Mostra o que já foi migrado ao banco principal
-- (lotes marcados como migrados no site) e confronta com a lista P0–P3.
-- O último resultado é a lista de IDs auditados que o passo 2 precisa.
--
-- Para mudar o último lote considerado, troque o 12 em "max_lote" (aparece 4 vezes).

-- 1) Lotes marcados como migrados.
select coalesce(substring(batch from '^Lote (\d+)')::int, -1) as lote,
       min(batch) as rotulo,
       count(distinct question_id) as questoes,
       min(exported_at)::date as primeiro_registro,
       max(exported_at)::date as ultimo_registro,
       string_agg(distinct exported_by, ', ') as marcado_por
from curation_private.sql_exports
group by 1
order by 1;

-- 2) Lotes 1 a 12 por prioridade: quantas migradas de cada lista.
with params(max_lote) as (values (12)),
migradas as (
  select distinct e.question_id
  from curation_private.sql_exports e, params
  where substring(e.batch from '^Lote (\d+)')::int between 1 and params.max_lote
),
totais as (
  select priority, count(*) as total_na_lista
  from public.curation_priorities
  group by priority
),
por_prioridade as (
  select coalesce(p.priority, 'fora da lista') as prioridade, count(*) as migradas
  from migradas m
  left join public.curation_priorities p using (question_id)
  group by 1
)
select pp.prioridade, pp.migradas, coalesce(t.total_na_lista, 0) as total_na_lista
from por_prioridade pp
left join totais t on t.priority = pp.prioridade
order by pp.prioridade;

-- 3) P0 e P1 que ainda NÃO foram migradas nos lotes 1 a 12 (ficarão em quarentena).
with params(max_lote) as (values (12)),
migradas as (
  select distinct e.question_id
  from curation_private.sql_exports e, params
  where substring(e.batch from '^Lote (\d+)')::int between 1 and params.max_lote
)
select p.priority, p.planned_curator, count(*) as pendentes,
       string_agg(p.question_id::text, ', ' order by p.rank) as ids
from public.curation_priorities p
where p.priority in ('P0', 'P1')
  and not exists (select 1 from migradas m where m.question_id = p.question_id)
group by 1, 2
order by 1, 2;

-- 4) LISTA PARA O PASSO 2: copie o valor de "colar_no_passo_2" (inclui as chaves { }).
with params(max_lote) as (values (12)),
migradas as (
  select distinct e.question_id
  from curation_private.sql_exports e, params
  where substring(e.batch from '^Lote (\d+)')::int between 1 and params.max_lote
)
select count(*) as auditadas,
       '{' || string_agg(question_id::text, ',' order by question_id) || '}' as colar_no_passo_2
from migradas;
