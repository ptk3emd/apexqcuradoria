# Migração da curadoria do Google Sheets para o Supabase

## Diagnóstico do código atual

- `apps-script/Code.gs`: todas as requisições usam uma trava global. Uma escrita relê o histórico completo; lotes também fazem consultas repetidas à aba base. O tempo cresce com o histórico e com o tamanho do lote.
- `src/App.tsx`: consulta a cada 5 segundos; três sessões fazem 36 consultas/minuto, sem contar ações e heartbeat. Uma atualização rápida de status fora do detalhe usa claim + save + unlock. Revisão de lote também usa três chamadas.
- A importação completa lê 50 questões por requisição: 13.945 registros exigem 279 chamadas sequenciais. Não use essa importação como botão rotineiro de atualização.
- `src/lib/supabaseClient.ts` é código legado, sem uso no fluxo atual. Broadcast não é persistência, e verificar a tabela `questoes` não atende ao esquema real `public.questions`. Configurar URL/chave sozinho não migra o app.

Esta PR evita recriar objetos em consultas sem mudanças, compartilha uma única leitura incremental entre polling/reconexão/conflitos, evita bloquear a inicialização regravando a base inteira em IndexedDB e reconstrói patches de um lote em uma única passagem pelo histórico. São melhorias intermediárias, não eliminam a latência do Apps Script. A parte do Apps Script exige republicar a implantação.

## Arquitetura de destino

Manter `public.questions` com o esquema existente. Não criar `public.questoes` nem alterar as colunas calculadas. Como o fluxo atual gera SQL para aplicar correções manualmente, a opção inicial mais conservadora é armazenar os rascunhos de curadoria em tabelas separadas no mesmo projeto Supabase e manter a aplicação em `public.questions` manual. Se a intenção for salvar diretamente no banco publicado, isso deve ser decidido antes do corte.

Tabelas propostas:

| Tabela | Conteúdo |
|---|---|
| `curation_members` | UID do Supabase Auth e perfil Patrick/Lucas/Thierry; cadastro apenas administrativo |
| `question_curation` | `question_id` bigint, conteúdo corrigido em JSONB, status, responsável, versão, modificado, sessão da trava, validade e data da revisão |
| `question_comments` | Questão, autor verificado, texto e data |
| `question_audit` | Histórico durável com autor, ação, versão e ID único da operação para idempotência |

O autor de toda alteração deve vir de `auth.uid()`, e não de um perfil escolhido pelo navegador. Usar Supabase Auth com três contas individuais; cadastrar os UIDs em `curation_members`.

Habilitar RLS, permitindo leitura somente aos membros. Escritas da curadoria devem ocorrer por RPC, sem permissão de UPDATE direto ao navegador. As funções devem validar associação, responsável, sessão e versão, com `search_path` fixo e EXECUTE restrito a usuários autenticados. A chave publishable/anon pode estar no frontend; service_role/secret nunca deve estar em `VITE_*`.

Uma RPC transacional deve receber ação, IDs, versões esperadas, patches, sessão e UUID da operação. Ela trava as linhas em ordem de ID (`FOR UPDATE`, para evitar deadlock entre lotes), valida todos os itens e grava o lote inteiro ou nada. Uma versão antiga ou uma reserva de outro usuário cancela a operação. Reservas de responsabilidade persistem; a trava de edição expira e é renovada por heartbeat. Ao abrir uma questão, claim e leitura do conteúdo podem voltar na mesma resposta.

Realtime informa alterações confirmadas das tabelas de curadoria e comentários. É um aviso de mudança, não o mecanismo de exclusão. O cliente mantém um único canal, atualiza apenas as questões afetadas e refaz uma leitura incremental ao reconectar. Polling contínuo de 5 segundos deixa de ser o fluxo principal.

## Ordem da migração

1. Identificar o projeto existente e a URL. Confirmar se `public.questions` é a base publicada e se as correções devem continuar como rascunhos/SQL manual.
2. Fazer backup da planilha original e de `_apex_collaboration_v2`. Exportar o estado composto (base + todos os patches em ordem), não apenas a aba base: ela não contém as correções recentes. Preservar IDs, versões, reservas, comentários e o histórico. Não apagar o journal.
3. Criar e testar as tabelas, Auth, RLS e RPCs em uma branch/projeto de teste. Cadastrar as três contas. Habilitar Realtime nas tabelas necessárias.
4. Criar um adaptador Supabase no frontend para substituir `fetchShared`/`mutateShared` e adaptar o login. Remover a seleção livre de identidade e os caminhos legados de broadcast como fonte de verdade. Manter a interface atual de seleção múltipla e o SQL global baseado nos dados compartilhados.
5. Importar o estado composto para as tabelas de curadoria. Se `public.questions` já contém os IDs, não reinserir as perguntas: o trigger `trg_reassign_question_id` pode remapear IDs de INSERTs conflitantes. Não escrever `ano_int` nem `competencias_normalized`; o banco calcula essas colunas.
6. Comparar IDs, contagens, versões, correções e comentários. Testar duas contas disputando a mesma questão, duas abas da mesma conta, lote com conflito, versão antiga, expiração, reconexão e exportação SQL.
7. Para o corte, pausar edições no Sheets, importar o delta final, confirmar que todos os usuários atualizaram o frontend e ativar exclusivamente o Supabase. Não manter dois backends aceitando escritas simultâneas. Retomar as edições após a conferência.
8. Preservar o backup e o backend antigo sem escrita. Um rollback depois de novas alterações no Supabase exige copiar essas alterações de volta antes de reativar Sheets; simplesmente trocar a URL perderia trabalho.

## Dados necessários para executar

- URL do projeto Supabase e chave **pública** publishable/anon.
- E-mails dos três curadores para configurar as identidades.
- Acesso administrativo ao projeto para aplicar tabelas/RLS/RPCs (não enviar service_role ou senha de banco na conversa).
- Confirmação: rascunhos com aplicação por SQL manual, ou atualização direta de `public.questions`.

A migração ainda não está ativada. Não basta preencher variáveis de ambiente: primeiro implementar e validar Auth/RPCs/adaptador e fazer o corte dos dados.

Referências oficiais:
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/realtime/postgres-changes
