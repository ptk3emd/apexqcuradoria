-- Rodar no SQL Editor do projeto APEX MEDICINA (beedxpjaufgujusyuziq). Use só a parte de que precisar.
--
-- Os lotes gerados pelo site a partir de agora já liberam da quarentena as questões
-- que migram. Este arquivo serve para liberar IDs manualmente, conferir o estado
-- ou desfazer a quarentena inteira.

-- A) Conferir: quantas questões estão em cada estado.
select coalesce(l.state, 'active (sem registro)') as estado, count(*) as questoes
from public.questions q
left join public.question_lifecycle l on l.question_id = q.id
group by 1
order by 1;

-- B) Liberar IDs específicos (troque a lista).
update public.question_lifecycle
set state = 'active', state_changed_at = now(), notes = 'Liberada manualmente da quarentena.'
where state = 'under_review'
  and question_id = any ('{1,2,3}'::bigint[]);

-- C) DESFAZER TUDO: libera todas as questões em quarentena e remove a política que as esconde.
--    As funções get_user_mistakes e get_question_facets podem ficar como estão:
--    sem nenhuma questão em 'under_review', o filtro delas não esconde nada.
-- begin;
-- update public.question_lifecycle
-- set state = 'active', state_changed_at = now(), notes = 'Quarentena desfeita.'
-- where state = 'under_review';
-- drop policy if exists questions_hide_quarantined on public.questions;
-- commit;
