# Curadoria no Supabase

Projeto: `jcbinmjiimqomjdyfdia`. O usuário fará a importação das questões diretamente em `public.questions`. Não executar importações do Google Sheets.

## Banco

As migrations criam:

- `public.questions`: campos do esquema fornecido, PK bigint identity, limites de dificuldade/descritores, índices e colunas calculadas.
- `public.question_competencies`: vínculo de cada questão às competências normalizadas.
- `public.curation_questions`: versão, responsável, lease de edição, comentários e estado compartilhado.
- `public.curation_members`: três perfis de curadoria, sem contas ou e-mails associados.
- `curation_private.events` e `requests`: histórico e idempotência, inacessíveis ao navegador.

As funções originais não existiam no projeto. Foram implementadas `normalize_competencies` (lista JSON ou delimitada por vírgula, ponto e vírgula ou pipe; remove duplicatas/espaços e usa minúsculas), `reassign_conflicting_question_id` (resolve colisões em INSERT, sem renumerar UPDATE) e `sync_question_competencies` (mantém os vínculos). Essas implementações não foram copiadas do banco original, cujas definições não foram fornecidas.

O trigger `trg_curation_source` torna as questões importadas disponíveis automaticamente na curadoria. Salvar no site atualiza `questions` dentro da mesma transação que verifica responsável, sessão e versão. ID e `created_at` são editáveis; `ano_int` e `competencias_normalized` são calculados pelo PostgreSQL. Uma alteração de ID conflitante é recusada. Metadados e vínculos acompanham a troca de ID.

O SQL de Estatísticas continua acumulando as correções de todos os curadores, mas no modo Supabase os dados já foram salvos em `questions`. O SQL pode replicar as correções em outra base com os mesmos IDs.

## Contas e ativação

1. As migrations `master_password_sessions` e `enforce_questions_rls` foram aplicadas após a autorização. RLS está ativo em `questions`.
2. O hash bcrypt da senha mestra foi configurado somente no servidor em `curation_private.master_access`. Não salvar a senha no frontend, nas variáveis `VITE_*` ou no Git. O usuário escolhe Patrick, Lucas ou Thierry e informa essa senha; nenhum e-mail, convite ou conta Supabase Auth é necessário.
3. O usuário importa os registros em `questions`. Não importar valores nas duas colunas `GENERATED ALWAYS`. Os campos `difficulty_bucket` aceitam NULL ou `easy`/`medium`/`hard`; não usar o texto literal `null` como dificuldade.
4. Integrar este PR e fazer novo deploy. URL e chave pública já estão configuradas para este projeto. Opcionalmente, substituir no ambiente de hospedagem por `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY`.
5. Testar o acesso dos três perfis e a disputa pela mesma questão. O código não lê nem grava mais no Google Sheets.

O Supabase é o único backend. URL e chave pública do projeto têm valores padrão no código; variáveis de ambiente permitem substituir esses valores. Não colocar service_role, senha de banco ou outros segredos em variáveis `VITE_*`.

## Sincronização e interface

A primeira página libera a auditoria e as demais carregam em segundo plano. A carga inicial registra o cursor antes de ler as páginas, evitando reprocessar o histórico inteiro da importação. Realtime avisa sobre mudanças; a RPC incremental recupera as versões confirmadas, inclusive após reconexão, com verificação adicional a cada 30 segundos. Reservas de edição duram 90 segundos e são renovadas a cada 25 segundos. A responsabilidade continua reservada até sua liberação explícita. Marcar um lote para revisão usa uma transação: um conflito desfaz o lote todo.

Estatísticas, SQL global e reservas sobre toda a base aguardam o carregamento completo para evitar resultados parciais. A pesquisa usa atualização diferida para manter a digitação responsiva. Sincronizações sem mudanças não reprocessam o histórico de questões alteradas.

O editor organiza os campos em enunciado/alternativas, resolução e classificação, com gabarito selecionável, campos de texto multilinha e barra fixa para salvar. A navegação é bloqueada durante a edição para evitar descarte acidental. Falhas de gravação preservam o rascunho.

## Validação

`npm run lint`, `npm test`, `npm run build`.

Os testes PostgreSQL locais executam as migrations no PGlite e verificam autenticação, RLS, conflito de responsáveis/abas/versões, expiração de leases, rollback do lote, idempotência, comentários, importação administrativa, gravação em `questions`, colunas geradas e alteração de IDs. Os registros de teste existem apenas no banco local em memória.

Após a migration de senha mestra, as RPCs passam a validar um token aleatório de sessão no cabeçalho `x-apex-session`. O banco armazena somente seu hash e o prazo de 12 horas. Escolher outro nome no navegador não altera o perfil do token. Qualquer pessoa que conheça a senha mestra pode escolher um dos três perfis, conforme o fluxo solicitado.

As funções de dados têm EXECUTE para anon, mas recusam sessões ausentes, falsas, expiradas ou revogadas. RLS bloqueia SELECT sem sessão válida; UPDATE/INSERT/DELETE diretos continuam proibidos. O login limita tentativas inválidas e verifica a senha com bcrypt. As tabelas privadas não são acessíveis pelo navegador. O Realtime publica apenas um aviso genérico de atualização, sem IDs, conteúdo, comentários ou credenciais; os dados continuam sendo lidos por RPC protegida. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Validação no projeto: os três perfis acessam os dados com a senha correta; senha inválida e sessão ausente são recusadas; logout invalida o token. Nenhuma conta Auth foi criada. As questões importadas pelo usuário permanecem intactas. Ativação do frontend depende de integrar o PR e fazer novo deploy.

## Questão anulada e referências (`20261012120000_questions_anulada_referencias`)

`public.questions` ganha `anulada` (boolean, padrão `false`) e `referencias` (texto, 1–5000 caracteres), as mesmas colunas do banco do Apex Medicina. Questão anulada não tem gabarito oficial: um CHECK exige `correta` NULL enquanto `anulada` for verdadeiro, e `curation_mutate` apaga o gabarito ao salvar uma questão marcada como anulada. Escolher uma alternativa no painel da questão desfaz a anulação. Referências em branco viram NULL. O editor mostra "Questão anulada pela banca" acima das alternativas e o campo "Referências" na aba Resolução, com prévia dos links. O SQL exportado inclui `anulada` (com `correta = NULL` quando anulada) e `referencias`.

`curation_mutate` é recriada com as duas colunas na lista de campos editáveis (`anulada` precisa ser booleano JSON). Antes da migration, o site continua funcionando: o servidor ignora campos que não estão na lista.
