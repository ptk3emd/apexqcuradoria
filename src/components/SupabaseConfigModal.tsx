import React, { useState } from 'react';
import { 
  Database, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Copy, 
  ExternalLink, 
  UploadCloud, 
  DownloadCloud,
  ShieldCheck,
  Radio
} from 'lucide-react';
import { 
  getStoredSupabaseConfig, 
  saveSupabaseConfig, 
  clearSupabaseConfig, 
  testSupabaseConnection,
  getSupabaseClient 
} from '../lib/supabaseClient';
import { Question } from '../types/question';
import { copyTextToClipboard } from '../lib/clipboardHelper';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  onQuestionsLoadedFromSupabase: (questions: Question[]) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  questions,
  onQuestionsLoadedFromSupabase,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const currentConfig = getStoredSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.url || '');
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey || '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleTestConnection = async () => {
    if (!url.trim() || !anonKey.trim()) {
      setTestResult({
        success: false,
        message: 'Por favor preencha a URL do projeto e a Anon Key.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const res = await testSupabaseConnection(url, anonKey);
    setTestResult(res);
    setIsTesting(false);

    if (res.success) {
      saveSupabaseConfig(url, anonKey);
      onShowToast('Supabase Conectado!', 'Credenciais salvas e canal realtime ativado.', 'success');
    }
  };

  const handleDisconnect = () => {
    clearSupabaseConfig();
    setUrl('');
    setAnonKey('');
    setTestResult(null);
    onShowToast('Supabase Desconectado', 'Utilizando sincronização local em tempo real.', 'info');
  };

  // Push local questions to Supabase table
  const handlePushToSupabase = async () => {
    const client = getSupabaseClient();
    if (!client) {
      onShowToast('Conexão necessária', 'Configure e teste suas credenciais do Supabase primeiro.', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      // Map questions to supabase table schema
      const rows = questions.map(q => ({
        id: q.id,
        categoria: q.categoria,
        tema_especifico: q.tema_especifico,
        ano: q.ano,
        origem: q.origem,
        enunciado: q.enunciado,
        a: q.a,
        b: q.b,
        c: q.c,
        d: q.d,
        e: q.e,
        correta: q.correta,
        comentario: q.comentario,
        justificativa_a: q.justificativa_a,
        justificativa_b: q.justificativa_b,
        justificativa_c: q.justificativa_c,
        justificativa_d: q.justificativa_d,
        justificativa_e: q.justificativa_e,
        especialidade: q.especialidade,
        status: q.status,
        responsavel_id: q.responsavel_id || null,
        responsavel_nome: q.responsavel_nome || null,
        revisado_por: q.revisado_por || null,
        revisado_em: q.revisado_em || null,
        notas_revisao: q.notas_revisao || null,
      }));

      const { error } = await client.from('questoes').upsert(rows, { onConflict: 'id' });
      if (error) throw error;

      onShowToast(
        'Sincronizado com Supabase!',
        `${rows.length} questões enviadas para a tabela "questoes".`,
        'success'
      );
    } catch (err: any) {
      onShowToast('Erro ao sincronizar', err.message || 'Verifique se a tabela "questoes" existe no Supabase.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Pull questions from Supabase table
  const handlePullFromSupabase = async () => {
    const client = getSupabaseClient();
    if (!client) {
      onShowToast('Conexão necessária', 'Configure e teste suas credenciais primeiro.', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      const { data, error } = await client.from('questoes').select('*').order('id', { ascending: true });
      if (error) throw error;

      if (!data || data.length === 0) {
        onShowToast('Tabela vazia', 'Nenhuma questão cadastrada no banco Supabase.', 'info');
        return;
      }

      onQuestionsLoadedFromSupabase(data as Question[]);
      onShowToast(
        'Dados Carregados!',
        `${data.length} questões recuperadas diretamente do Supabase.`,
        'success'
      );
      onClose();
    } catch (err: any) {
      onShowToast('Erro ao carregar', err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-[#1e1d1b] border border-white/[0.12] p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#f8fafc]">Conexão Supabase & Realtime</h3>
              <p className="text-xs text-[#7a7468]">
                Gerenciamento de banco de dados PostgreSQL e sincronização entre os 3 curadores
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#7a7468] hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Inputs */}
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-[#f8fafc] mb-1">
              Project URL do Supabase:
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              className="w-full bg-[#272522] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-[#f8fafc] placeholder-[#7a7468] outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#f8fafc] mb-1">
              Anon Public Key:
            </label>
            <input
              type="password"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full bg-[#272522] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-[#f8fafc] placeholder-[#7a7468] outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Test feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <span className="leading-relaxed">{testResult.message}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !url || !anonKey}
              className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span>{isTesting ? 'Testando Conexão...' : 'Testar & Salvar Conexão'}</span>
            </button>

            {currentConfig.isConnected && (
              <button
                onClick={handleDisconnect}
                className="px-4 py-2.5 rounded-full text-xs font-bold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 transition-all"
              >
                Desconectar
              </button>
            )}
          </div>
        </div>

        {/* Database Sync Actions */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
          <p className="text-[10px] uppercase font-bold tracking-wider text-[#DF9696]">
            Sincronização com o Banco de Dados
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={handlePushToSupabase}
              disabled={isSyncing || !url}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-[#f8fafc] border border-white/[0.08] disabled:opacity-40 transition-all"
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
              <span>Enviar ({questions.length}) p/ Supabase</span>
            </button>

            <button
              onClick={handlePullFromSupabase}
              disabled={isSyncing || !url}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-[#f8fafc] border border-white/[0.08] disabled:opacity-40 transition-all"
            >
              <DownloadCloud className="w-3.5 h-3.5 text-blue-400" />
              <span>Puxar do Supabase</span>
            </button>
          </div>
        </div>

        {/* Real-time sync note */}
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#272522] border border-white/[0.06] text-xs text-[#bdbdbd]">
          <Radio className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
          <p>
            <b>Sincronização em tempo real ativa:</b> Mesmo em abas diferentes ou no ambiente local, eventos de presença, status e comentários sincronizam instantaneamente entre os 3 curadores.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full text-xs font-bold bg-white/[0.06] hover:bg-white/[0.12] text-white transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
