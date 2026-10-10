import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  Download, 
  Zap, 
  Link2,
  Clock,
  ShieldCheck,
  Code2
} from 'lucide-react';
import { Question } from '../types/question';
import { 
  DEFAULT_OFFICIAL_SHEET_URL, 
  getStoredSheetsSyncConfig, 
  saveSheetsSyncConfig, 
  fetchQuestionsFromGoogleSheets, 
  getGoogleAppsScriptTemplate,
  exportToGoogleSheetsCsv 
} from '../lib/googleSheetsSync';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  onQuestionsUpdated: (questions: Question[]) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onSyncStatusChange?: (status: 'idle' | 'pending' | 'success' | 'error', message?: string) => void;
}

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({
  isOpen,
  onClose,
  questions,
  onQuestionsUpdated,
  onShowToast,
  onSyncStatusChange,
}) => {

  const [config, setConfig] = useState(getStoredSheetsSyncConfig());
  const [activeTab, setActiveTab] = useState<'sync' | 'webhook' | 'export'>('sync');
  const [sheetUrlInput, setSheetUrlInput] = useState(config.sheetUrl);
  const [webhookUrlInput, setWebhookUrlInput] = useState(config.webhookUrl);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedCsv, setCopiedCsv] = useState(false);

  useEffect(() => {
    const c = getStoredSheetsSyncConfig();
    setConfig(c);
    setSheetUrlInput(c.sheetUrl);
    setWebhookUrlInput(c.webhookUrl);
  }, [isOpen]);

  const handleSaveConfig = () => {
    saveSheetsSyncConfig({
      sheetUrl: sheetUrlInput.trim(),
      webhookUrl: webhookUrlInput.trim(),
    });
    setConfig(getStoredSheetsSyncConfig());
    onShowToast('Configurações Salvas', 'Configurações de sincronização do Google Sheets atualizadas.', 'success');
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setErrorMsg('');
    if (onSyncStatusChange) {
      onSyncStatusChange('pending', 'Lendo questões da planilha oficial...');
    }
    try {
      const result = await fetchQuestionsFromGoogleSheets(sheetUrlInput.trim());
      
      onQuestionsUpdated(result.questions);
      const now = new Date().toISOString();
      saveSheetsSyncConfig({ 
        lastSyncTime: now,
        lastSendStatus: 'success',
        lastSendMessage: `Planilha sincronizada: ${result.totalRows.toLocaleString()} questões carregadas.`,
      });
      setConfig(prev => ({ ...prev, lastSyncTime: now }));

      if (onSyncStatusChange) {
        onSyncStatusChange('success', `Planilha sincronizada: ${result.totalRows.toLocaleString()} questões carregadas.`);
      }

      onShowToast(
        'Sincronização Concluída!',
        `${result.totalRows.toLocaleString()} questões lidas diretamente da Planilha Google.`,
        'success'
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao sincronizar com o Google Sheets.');
      if (onSyncStatusChange) {
        onSyncStatusChange('error', err.message || 'Falha ao sincronizar com o Google Sheets.');
      }
      onShowToast('Falha na Sincronização', err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyScript = () => {
    const script = getGoogleAppsScriptTemplate();
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
    onShowToast('Script Copiado!', 'Cole no Google Apps Script da sua planilha.', 'success');
  };

  const handleDownloadCsv = () => {
    const csv = exportToGoogleSheetsCsv(questions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curadoria_apexmed_questoes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Download Iniciado', 'Arquivo CSV gerado com status e notas de auditoria.', 'success');
  };

  const handleCopyCsv = () => {
    const csv = exportToGoogleSheetsCsv(questions);
    navigator.clipboard.writeText(csv);
    setCopiedCsv(true);
    setTimeout(() => setCopiedCsv(false), 2500);
    onShowToast('CSV Copiado!', 'Você pode colar diretamente no Google Sheets.', 'success');
  };

  const modifiedCount = questions.filter(q => q.status !== 'pendente').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="w-full max-w-3xl rounded-3xl bg-[#272522] border border-white/[0.12] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/[0.08] flex items-center justify-between bg-[#1e1d1b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-[#f8fafc]">
                  Sincronização com Google Sheets
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-600/40 text-emerald-300">
                  Planilha Ativa
                </span>
              </div>
              <p className="text-xs text-[#7a7468]">
                Gerenciamento de dados centralizado via Planilha Google em tempo real
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-[#bdbdbd] hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/[0.08] bg-[#1e1d1b]/60 px-6 gap-2">
          <button
            onClick={() => setActiveTab('sync')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'sync'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-[#bdbdbd] hover:text-white'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sincronização & Leitura</span>
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'webhook'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-[#bdbdbd] hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Gravação em Tempo Real (Webhook)</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'export'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-[#bdbdbd] hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar para Google Sheets</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: Sincronização & Leitura */}
          {activeTab === 'sync' && (
            <div className="space-y-6">
              {/* Status Card */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7a7468]">
                    Base Carregada
                  </span>
                  <p className="text-xl font-bold text-[#f8fafc] mt-0.5">
                    {questions.length.toLocaleString()} questões
                  </p>
                  <p className="text-[11px] text-[#7a7468]">
                    {modifiedCount} com curadoria realizada
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7a7468]">
                    Última Sincronização
                  </span>
                  <p className="text-sm font-semibold text-[#f8fafc] mt-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    {config.lastSyncTime
                      ? new Date(config.lastSyncTime).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : 'Carregado no Início'}
                  </p>
                  <p className="text-[11px] text-[#7a7468]">
                    {config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleDateString('pt-BR') : 'Base integrada'}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7a7468]">
                    Modo de Operação
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-300">Google Sheets Ativo</span>
                  </div>
                  <p className="text-[11px] text-[#7a7468]">Sem dependência de Supabase</p>
                </div>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#bdbdbd]">
                  Link da Planilha do Google Sheets
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 text-[#7a7468] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="url"
                      value={sheetUrlInput}
                      onChange={(e) => setSheetUrlInput(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
                      className="w-full bg-[#1e1d1b] border border-white/[0.1] focus:border-emerald-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#f8fafc] font-mono outline-none"
                    />
                  </div>
                  <a
                    href={sheetUrlInput || DEFAULT_OFFICIAL_SHEET_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-bold text-[#f8fafc] flex items-center gap-1.5 transition-all"
                    title="Abrir planilha no Google Sheets"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Abrir</span>
                  </a>
                </div>
                <p className="text-[11px] text-[#7a7468]">
                  Planilha padrão configurada exclusivamente para a base oficial de 13.945 questões do ENARE.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={handleSaveConfig}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white/[0.06] hover:bg-white/[0.1] text-[#f8fafc] border border-white/[0.1] transition-all cursor-pointer"
                >
                  Salvar Preferências
                </button>

                <button
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar com Planilha Agora'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Gravação em Tempo Real via Webhook */}
          {activeTab === 'webhook' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>Sincronização Automática Bidirecional com a Planilha</span>
                </div>
                <p className="text-emerald-200/90 leading-relaxed">
                  Para que as ações de <strong>Patrick, Lucas e Thierry</strong> (Aprovar, Eliminar, Revisar, notas e responsáveis) sejam gravadas na aba de controle da mesma planilha e recebidas pelos demais a cada 5 segundos, basta publicar o script abaixo na planilha:
                </p>
              </div>

              {/* 3 Steps Guide */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#bdbdbd]">
                  Ativar a versão colaborativa:
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-xs text-[#d1d5db]">
                  <li className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    Abra a planilha no Google Sheets e vá no menu superior em <strong>Extensões → Apps Script</strong>.
                  </li>
                  <li className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    Substitua o código abaixo. Configure as propriedades <strong>APEX_BASE_SHEET</strong> (nome da aba de questões) e <strong>APEX_ACCESS_KEY</strong> (senha de acesso). Atualize em <strong>Implantar → Gerenciar implantações → Editar → Nova versão</strong>.
                  </li>
                  <li className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    Mantenha a <strong>URL do App da Web</strong> existente. Recarregue o aplicativo e entre novamente.
                  </li>
                </ol>
              </div>

              {/* Webhook URL Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#bdbdbd]">
                  URL do Webhook do Google Apps Script
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={webhookUrlInput}
                    onChange={(e) => setWebhookUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 bg-[#1e1d1b] border border-white/[0.1] focus:border-emerald-500 rounded-xl px-4 py-2 text-xs text-[#f8fafc] font-mono outline-none"
                  />
                  <button
                    onClick={handleSaveConfig}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all cursor-pointer"
                  >
                    Salvar Webhook
                  </button>
                </div>
                {config.webhookUrl ? (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Webhook ativo! Cada curadoria envia a atualização imediatamente para a planilha.
                  </p>
                ) : (
                  <p className="text-[11px] text-[#7a7468]">
                    Opcional: se não configurar webhook, as alterações são mantidas salvas no navegador e sincronizadas entre abas.
                  </p>
                )}
              </div>

              {/* Script Code Viewer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#bdbdbd] flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-amber-400" />
                    Código para Colar no Google Apps Script
                  </label>
                  <button
                    onClick={handleCopyScript}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-xs font-bold text-[#f8fafc] transition-all cursor-pointer"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Código</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-3.5 rounded-xl bg-[#1e1d1b] border border-white/[0.08] text-[11px] font-mono text-emerald-300 max-h-48 overflow-y-auto whitespace-pre leading-relaxed">
                  {getGoogleAppsScriptTemplate()}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: Exportar para Google Sheets */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <h4 className="font-bold text-sm text-[#f8fafc] flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-400" />
                  Exportação Completa com Metadados de Auditoria
                </h4>
                <p className="text-xs text-[#bdbdbd] leading-relaxed">
                  Você pode baixar o arquivo CSV ou copiar os dados formatados com todas as 25 colunas, incluindo os status atualizados pelos 3 curadores (<em>aprovadas</em>, <em>eliminar_questao</em>, <em>revisar_questao</em>, <em>questao_corrigida</em>), notas de revisão e curadores responsáveis.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-[#1e1d1b] border border-white/[0.08] space-y-3 flex flex-col justify-between">
                  <div>
                    <h5 className="font-bold text-xs text-[#f8fafc]">Baixar Arquivo CSV</h5>
                    <p className="text-[11px] text-[#7a7468] mt-1">
                      Gera um arquivo .csv pronto para importar no Google Drive / Google Sheets (Arquivo → Importar).
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadCsv}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar CSV Atualizado</span>
                  </button>
                </div>

                <div className="p-5 rounded-2xl bg-[#1e1d1b] border border-white/[0.08] space-y-3 flex flex-col justify-between">
                  <div>
                    <h5 className="font-bold text-xs text-[#f8fafc]">Copiar para Área de Transferência</h5>
                    <p className="text-[11px] text-[#7a7468] mt-1">
                      Copia o texto CSV formatado para colar diretamente em uma nova aba da planilha.
                    </p>
                  </div>
                  <button
                    onClick={handleCopyCsv}
                    className="w-full py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-[#f8fafc] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {copiedCsv ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">CSV Copiado com Sucesso!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar CSV</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#1e1d1b] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[#7a7468]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sincronização 100% Google Sheets (Sem Supabase)</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-white/[0.08] hover:bg-white/[0.12] text-[#f8fafc] transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
