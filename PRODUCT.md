# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Três curadores especialistas (Patrick, Lucas e Thierry) que auditam questões médicas em colaboração. Nenhum outro perfil acessa a aplicação. Acesso por senha mestra, sem contas individuais.

Os curadores trabalham tanto em desktop quanto em celular.

## Product Purpose

Plataforma colaborativa em tempo real para auditoria e validação de questões médicas. Os curadores revisam enunciado, alternativas, gabarito, resolução e classificação, comentam, reservam questões para edição e acompanham o estado de cada uma. As correções geram SQL para a base de questões.

Sucesso: as três pessoas conseguem revisar a mesma base sem sobrescrever o trabalho umas das outras, e o SQL gerado reflete exatamente as correções feitas.

## Positioning

Curadoria compartilhada sobre o Supabase, com reservas de edição, controle de versão e sincronização ao vivo entre os três curadores. A geração progressiva de SQL a partir das correções é parte do fluxo, não um exportador separado.

## Operating Context

- Os dados das questões são importados diretamente em `public.questions` no Supabase. A aplicação não lê nem grava no Google Sheets.
- A auditoria é feita em sessões de revisão de muitas questões, com tabela, filtros e editor.
- Lote de questões pode ser atribuído a um curador de uma vez.
- Estatísticas e SQL global acumulam as correções de todos os curadores.

## Capabilities and Constraints

- Tabela de questões com filtros avançados e pesquisa.
- Editor de questão em abas de enunciado/alternativas, resolução e classificação, com gabarito selecionável e barra fixa para salvar.
- Reservas de edição de 90 segundos, renovadas a cada 25 segundos, com liberação explícita.
- Revisão em lote usa transação: um conflito desfaz o lote inteiro.
- Navegação bloqueada durante a edição para evitar descarte acidental. Falhas de gravação preservam o rascunho.
- Supabase é o único backend. Escrita de dados passa por funções protegidas por sessão. Acesso direto às tabelas é bloqueado por RLS.
- Chave service_role e senhas nunca vão para o frontend.
- Terminologia: "questão", "curador", "reserva", "lote", "gabarito", "resolução", "competências", "descritores".
- Decisão em aberto: nenhuma registrada.

## Evidence on Hand

- Base de questões: tabela `public.questions` no Supabase. O repositório não guarda cópia dos dados.
- Migrations e documentação de banco: `supabase/migrations/` e `docs/supabase-migration.md`.
- Testes: `tests/` (lógica de lote, estado compartilhado, SQL gerado e componentes).

Não há depoimentos, métricas de uso ou estudos de caso. Não inventar esses dados.

## Product Principles

- Trabalho de um curador nunca é sobrescrito silenciosamente por outro. Conflitos são visíveis e recusados com clareza.
- Conteúdo médico vem antes de estilo: enunciado, alternativas e gabarito precisam ser legíveis e conferíveis.
- O SQL gerado deve ser rastreável até a correção que o originou.
- Auditoria rápida importa: filtros, pesquisa e navegação entre questões não podem travar a revisão.
