# Ativação — Google Sheets, sem Supabase

O aplicativo usa a planilha `1_hpPUVWGMNnjLNXzoXpPTLW7kdKHbtsBjRF4KC86yfs` e a URL de implantação já configurada. O ID do projeto sozinho não concede acesso para editar ou publicar o Apps Script.

## Atualizar o Apps Script existente

1. Abra o projeto `1AgFyQFFGnkLBesXpqvpY9QY5QTAppu3xiObeLbbZFwwBCTqcaKLr8zRe` na conta proprietária. Faça uma cópia do código atual.
2. Substitua os handlers antigos (`doGet` e `doPost`) pelo conteúdo completo de `Code.gs`. Não mantenha dois handlers com o mesmo nome.
3. Em **Configurações do projeto → Propriedades do script**, defina:
   - `APEX_BASE_SHEET`: nome exato da aba que contém as questões, com cabeçalho `id`.
   - `APEX_ACCESS_KEY`: a senha mestra já utilizada no login do aplicativo. Não coloque essa senha no repositório nem em URLs.
4. Em **Implantar → Gerenciar implantações → Editar**, selecione **Nova versão** na implantação existente. Mantenha a URL `/exec` já informada. O app da Web precisa executar como o proprietário e aceitar as chamadas dos três navegadores. A senha é validada pelo script em cada POST.
5. Publique o frontend desta branch no serviço que já hospeda o aplicativo. Os três curadores devem recarregar e entrar novamente.
6. Verifique a faixa “Google Sheets conectado”. Se aparecer “Atualize a implantação”, o endpoint ainda executa o código antigo. Erros de rede/CORS/autorização bloqueiam gravações e não geram sucesso fictício.

## Comportamento

- Abrir uma questão exige confirmação do servidor e atribui a questão ao curador. A reserva permanece até liberação explícita.
- A sessão aberta renova uma trava a cada 25 segundos, com validade de 90 segundos. Duas abas do mesmo perfil também não podem editar a mesma questão simultaneamente. Após expirar, reabra a questão antes de salvar.
- Alterações, comentários, gabarito, status e reservas são gravados na aba `_apex_collaboration_v2`, criada na **mesma planilha**. Essa aba de histórico é a fonte oficial das alterações; as células da aba base permanecem intactas. A exportação pelo aplicativo combina base e histórico.
- Cada operação valida dono, sessão e versão. Lotes de até 100 questões são validados por inteiro antes de um único registro de confirmação. Um conflito cancela o lote inteiro.
- As outras sessões consultam alterações a cada 5 segundos (mais latência do Google); não é WebSocket. O indicador de presença representa sessões com questão aberta, não todos os usuários conectados.
- Rascunhos em edição não são substituídos pelas consultas. Falhas de salvamento preservam o rascunho na tela. Fechar/recarregar a página ainda descarta rascunhos não salvos.
- A leitura completa opcional usa páginas de 50 linhas via Apps Script. Não usa exportação CSV do Google nem proxy público, evitando `exportSizeLimitExceeded`.
- O banco original local continua permitindo visualização; todas as escritas exigem o servidor.

## Limites e migração

Feche as sessões antigas antes de ativar: a versão antiga do webhook não tem controle de conflitos. Alterações antigas existentes somente no IndexedDB de um navegador **não são importadas automaticamente**; exporte-as para revisão antes de recarregar. Ajuste a aba base antes da ativação se houver alterações locais a preservar.

Não edite/exclua/reordene o histórico, nem edite diretamente a aba base durante auditorias. Edições manuais no Sheets não passam pela trava do aplicativo. Todos devem usar o mesmo projeto e implantação. A senha compartilhada protege contra chamadas externas sem a senha, mas os nomes dos três curadores continuam sendo perfis escolhidos no login, não identidades individuais verificadas pelo Google.

Para esta equipe pequena, o histórico evita exportar o banco inteiro a cada atualização. O Apps Script ainda tem cotas e latência; o histórico é relido nas escritas e deve ser monitorado ao crescer. Não apagar o histórico para “limpar”: ele contém as edições e versões.

## Validação

`node --test tests/collaboration.test.mjs` cobre disputa entre curadores, duas abas, versão desatualizada, lote sem alteração parcial, reenvio idempotente, leitura após reconexão, expiração, liberação e autorização.

`npm run lint` e `npm run build` verificam o frontend. A instalação npm deste repositório pode exigir `--legacy-peer-deps` devido ao conflito preexistente de versões de Vite/esbuild.

Teste final na implantação: dois navegadores entram como curadores diferentes; A abre uma questão; B vê a reserva e não consegue assumir; A salva um texto; B observa a atualização; A libera; B assume. Repita com duas abas do mesmo curador, desconexão e lote disputado. Essa etapa depende da implantação atualizada e não é substituída pelos testes locais.
