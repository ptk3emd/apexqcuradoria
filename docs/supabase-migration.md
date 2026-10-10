# Curadoria no Supabase

Projeto: `jcbinmjiimqomjdyfdia`. O usuário fará a importação das questões diretamente em `public.questions`. Não executar importações do Google Sheets.

## Banco

As migrations criam:

- `public.questions`: campos do esquema fornecido, PK bigint identity, limites de dificuldade/descritores, índices e colunas calculadas.
- `public.question_competencies`: vínculo de cada questão às competências normalizadas.
- `public.curation_questions`: versão, responsável, lease de edição, comentários e estado compartilhado.
- `public.curation_members`: vínculo administrativo entre Supabase Auth e os três perfis.
- `curation_private.events` e `requests`: histórico e idempotência, inacessíveis ao navegador.

As funções originais não existiam no projeto. Foram implementadas `normalize_competencies` (lista JSON ou delimitada por vírgula, ponto e vírgula ou pipe; remove duplicatas/espaços e usa minúsculas), `reassign_conflicting_question_id` (resolve colisões em INSERT, sem renumerar UPDATE) e `sync_question_competencies` (mantém os vínculos). Essas implementações não foram copiadas do banco original, cujas definições não foram fornecidas.

O trigger `trg_curation_source` torna as questões importadas disponíveis automaticamente na curadoria. Salvar no site atualiza `questions` dentro da mesma transação que verifica responsável, sessão e versão. ID e `created_at` são editáveis; `ano_int` e `competencias_normalized` são calculados pelo PostgreSQL. Uma alteração de ID conflitante é recusada. Metadados e vínculos acompanham a troca de ID.

O SQL de Estatísticas continua acumulando as correções de todos os curadores, mas no modo Supabase os dados já foram salvos em `questions`. O SQL pode replicar as correções em outra base com os mesmos IDs.

## Contas e ativação

1. Criar três contas individuais em Supabase Auth (e-mails reais ainda precisam ser informados; os endereços de exemplo em `defaultCurators.ts` não são cadastro).
2. Vincular seus UUIDs em `curation_members` aos perfis `patrick`, `lucas` e `thierry`. Somente o administrador pode criar esses vínculos. O login identifica o perfil pelo banco, sem troca livre de identidade no navegador.
3. O usuário importa os registros em `questions`. Não importar valores nas duas colunas `GENERATED ALWAYS`. Os campos `difficulty_bucket` aceitam NULL ou `easy`/`medium`/`hard`; não usar o texto literal `null` como dificuldade.
4. Configurar no ambiente de hospedagem: `VITE_CURATOR_BACKEND=supabase`, `VITE_SUPABASE_URL` e uma chave pública em `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY`. Fazer novo deploy, pois Vite lê essas variáveis no build.
5. Testar o acesso das três contas e a disputa pela mesma questão. Desativar as escritas no backend Sheets antes de retomar o trabalho para não haver duas bases independentes em uso.

O padrão do código continua `sheets` até configurar o ambiente. Não colocar service_role, senha de banco ou a chave do Apps Script em variáveis `VITE_*`.

## Sincronização e interface

A carga inicial registra o cursor antes de ler as páginas, evitando reprocessar o histórico inteiro da importação. Realtime avisa sobre mudanças; a RPC incremental recupera as versões confirmadas, inclusive após reconexão, com verificação adicional a cada 30 segundos. Reservas de edição duram 90 segundos e são renovadas a cada 25 segundos. A responsabilidade continua reservada até sua liberação explícita. Marcar um lote para revisão usa uma transação: um conflito desfaz o lote todo.

O editor organiza os campos em enunciado/alternativas, resolução e classificação, com gabarito selecionável, campos de texto multilinha e barra fixa para salvar. A navegação é bloqueada durante a edição para evitar descarte acidental. Falhas de gravação preservam o rascunho.

## Validação

`npm run lint`, `npm test`, `npm run build`.

Os testes PostgreSQL locais executam as migrations no PGlite e verificam autenticação, RLS, conflito de responsáveis/abas/versões, expiração de leases, rollback do lote, idempotência, comentários, importação administrativa, gravação em `questions`, colunas geradas e alteração de IDs. Os registros de teste existem apenas no banco local em memória.

As RPCs SECURITY DEFINER têm EXECUTE revogado de PUBLIC/anon e validam `auth.uid()` contra membros ativos. O advisor informa que usuários autenticados podem executá-las; é o acesso intencional, necessário para proibir UPDATE direto e centralizar as verificações. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
