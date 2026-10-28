import React, { useState, useMemo } from 'react';
import { 
  Code2, 
  Copy, 
  Download, 
  Search, 
  X, 
  Check, 
  Trash2, 
  Database,
  Terminal,
} from 'lucide-react';
import { Question, AuditLogItem } from '../types/question';
import { generateProgressiveSqlBatches, getSupabaseInitialSchemaSql } from '../lib/sqlGenerator';
import { copyTextToClipboard } from '../lib/clipboardHelper';
import { MigrationsPanel } from './MigrationsPanel';

interface SqlWorkspaceProps {
  auditLogs: AuditLogItem[];
  allQuestions: Question[];
  onClearLogs: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

const EXECUTED_BATCHES_KEY = 'apexqcuradoria:progressive-sql:executed:v1';
function readExecutedBatches():string[] {
  try {
    const saved:unknown = JSON.parse(localStorage.getItem(EXECUTED_BATCHES_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((key):key is string => typeof key === 'string') : [];
  } catch {return [];}
}

/** The SQL tab: progressive correction batches, the migrations to apply and the schema reference. */
export const SqlWorkspace: React.FC<SqlWorkspaceProps> = ({
  auditLogs,
  allQuestions,
  onClearLogs,
  onShowToast,
}) => {

  const [regexPattern, setRegexPattern] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'progressive' | 'migrations' | 'ddl'>('progressive');
  const [copied, setCopied] = useState(false);
  const [selectedBatchIndex, setSelectedBatchIndex] = useState(0);
  const [executedBatches, setExecutedBatches] = useState<string[]>(readExecutedBatches);

  // Generate the progressive SQL code with live regex filter
  const {batches, errors} = useMemo(() => generateProgressiveSqlBatches(allQuestions, regexPattern), [allQuestions, regexPattern]);
  const selectedBatch = batches[Math.min(selectedBatchIndex, batches.length - 1)];
  const progressiveSql = selectedBatch?.sql ?? (errors.length
    ? errors.map(error => '-- SQL não gerado: ' + error.replace(/[\r\n\u0000]/g, ' ')).join('\n')
    : '-- Nenhuma questão corrigida para exportar com o filtro atual.');
  const executedCount = batches.filter(batch => executedBatches.includes(batch.key)).length;
  const exportDisabled = activeTab === 'progressive' && !selectedBatch;

  const toggleExecuted = (key:string, checked:boolean) => {
    const next = checked ? [...new Set([...executedBatches, key])] : executedBatches.filter(item => item !== key);
    setExecutedBatches(next);
    try {localStorage.setItem(EXECUTED_BATCHES_KEY, JSON.stringify(next));}
    catch {onShowToast('Marcação temporária', 'Não foi possível salvar neste navegador. A marcação vale apenas enquanto a tela permanecer aberta.', 'info');}
  };

  const ddlSql = useMemo(() => {
    return getSupabaseInitialSchemaSql();
  }, []);

  const activeSqlContent = activeTab === 'progressive' ? progressiveSql : ddlSql;

  const stats = {
    updates: selectedBatch?.questionIds.length ?? 0,
    lines: progressiveSql.split('\n').length,
  };

  const handleCopy = async () => {
    if (exportDisabled) return;
    const success = await copyTextToClipboard(activeSqlContent);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShowToast(
        'Código SQL copiado!',
        'Abra o painel SQL Editor do Supabase e cole para executar as alterações.',
        'success'
      );
    } else {
      onShowToast('Erro ao copiar', 'Tente selecionar e copiar manualmente.', 'error');
    }
  };

  const handleDownload = () => {
    if (exportDisabled) return;
    const filename =
      activeTab === 'progressive'
        ? `curadoria_apexmed_lote_${selectedBatch.number}_${new Date().toISOString().split('T')[0]}.sql`
        : 'supabase_schema_apexmed.sql';

    const blob = new Blob([activeSqlContent], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast('Arquivo baixado!', `Salvo como ${filename}.`, 'success');
  };

  return (
    <section aria-labelledby="sql-dialog-title" className="w-full">
      <div className="w-full space-y-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Code2 className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 id="sql-dialog-title" className="font-bold text-2xl tracking-[-0.02em] text-apex-text">
                SQL e migrações
              </h1>
              <p className="text-xs text-apex-readable">
                Correções em lotes para public.questions, migrações do Supabase e referência do esquema
              </p>
            </div>
          </div>

        </div>

        {/* Tab switch + Regex filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap bg-shell-3 p-1 rounded-full border border-white/[0.08] text-xs font-bold">
            <button
              onClick={() => setActiveTab('progressive')}
              className={`px-3.5 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'progressive'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-apex-readable hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>SQL Progressivo ({batches.length} lotes)</span>
            </button>

            <button
              onClick={() => setActiveTab('migrations')}
              className={`px-3.5 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'migrations'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-apex-readable hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Migrações</span>
            </button>

            <button
              onClick={() => setActiveTab('ddl')}
              className={`px-3.5 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'ddl'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-apex-readable hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Referência do esquema</span>
            </button>
          </div>

          {/* Regex input (only when on progressive tab) */}
          {activeTab === 'progressive' && (
            <div className="flex items-center gap-2 flex-1 max-w-sm min-w-[200px]">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-shell-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  aria-label="Filtrar SQL por expressão regular"
                  type="text"
                  value={regexPattern}
                  onChange={(e) => {setRegexPattern(e.target.value); setSelectedBatchIndex(0); setCopied(false);}}
                  placeholder="Filtrar SQL via Regex (ex: correta, WHERE id = 12)..."
                  className="w-full bg-shell-3 border border-white/[0.1] rounded-full pl-8 pr-10 py-1.5 text-xs text-apex-text placeholder-shell-muted outline-none focus:border-amber-400 font-mono"
                />
                {regexPattern && (
                  <button
                    type="button"
                    onClick={() => {setRegexPattern(''); setSelectedBatchIndex(0); setCopied(false);}}
                    aria-label="Limpar busca"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full text-xs text-shell-muted hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {activeTab === 'progressive' && batches.length > 0 && (
          <section aria-label="Lotes de SQL" className="space-y-2">
            <p className="text-xs text-apex-readable" aria-live="polite">
              Lotes de até 50 questões · {executedCount} de {batches.length} executados
            </p>
            <p className="text-xs text-shell-muted">
              Copie ou baixe cada lote e execute no Supabase. Depois, marque Executado manualmente.
              As marcações ficam neste navegador; alterações no SQL tornam o lote pendente novamente.
            </p>
            <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
              {batches.map((batch, index) => (
                <div key={batch.key} className={`flex items-center gap-3 rounded-lg border p-2 ${selectedBatch?.key === batch.key ? 'border-amber-400 bg-amber-500/10' : 'border-white/[0.1] bg-shell-3'}`}>
                  <button type="button" aria-pressed={selectedBatch?.key === batch.key}
                    aria-label={`Selecionar lote ${batch.number}`}
                    onClick={() => {setSelectedBatchIndex(index); setCopied(false);}}
                    className="flex-1 text-left text-xs text-apex-text">
                    <span className="font-bold">Lote {batch.number} · {batch.questionIds.length} questões</span>
                    <span className="block text-shell-muted">IDs {batch.questionIds[0]} a {batch.questionIds.at(-1)}</span>
                  </button>
                  <label className="flex items-center gap-2 text-xs text-apex-readable cursor-pointer">
                    <input type="checkbox" aria-label={`Lote ${batch.number} executado`}
                      checked={executedBatches.includes(batch.key)}
                      onChange={event => toggleExecuted(batch.key, event.target.checked)}
                      className="accent-emerald-500" />
                    {executedBatches.includes(batch.key) ? 'Executado' : 'Pendente'}
                  </label>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Stats Pill row */}
        {activeTab === 'progressive' && (
          <div className="flex flex-wrap items-center gap-3 text-xs bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-shell-muted">
              Lote selecionado:
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
              {stats.updates} UPDATEs (Correções de conteúdo)
            </span>
            <span className="px-2 py-0.5 rounded bg-white/[0.05] text-apex-readable">
              {stats.lines} linhas geradas
            </span>
            <span className="text-[11px] text-shell-muted ml-auto">
              Compatível com Supabase SQL Editor
            </span>
          </div>
        )}

        {activeTab === 'migrations' ? <MigrationsPanel onShowToast={onShowToast} /> : <>
        {/* Code Editor Preview Box */}
        <div className="flex-1 min-h-[300px] overflow-hidden rounded-xl border border-white/[0.08] bg-shell-2 relative flex flex-col">
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-shell-2 border-b border-white/[0.06] text-[11px] text-shell-muted font-mono">
            <span className="min-w-0 truncate">
              {activeTab === 'progressive' ? (selectedBatch ? `curadoria_progressiva_lote_${selectedBatch.number}.sql` : 'curadoria_progressiva.sql') : 'supabase_ddl_schema.sql'}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[10px] text-emerald-400 flex items-center gap-1">
              {activeTab === 'progressive' && selectedBatch ? '● Transação independente por lote' : 'Prévia SQL'}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-auto">
            <pre className="text-xs font-mono text-apex-text leading-relaxed whitespace-pre font-normal select-text">
              {activeSqlContent}
            </pre>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-white/[0.08] gap-3">
          <div className="flex items-center gap-3">
            {auditLogs.length > 0 && activeTab === 'progressive' && (
              <button
                onClick={onClearLogs}
                className="text-xs text-shell-muted hover:text-rose-400 flex items-center gap-1 transition-colors"
                title="Limpar histórico acumulado de logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar Histórico de Logs</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={exportDisabled}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-apex-text bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition-all disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{activeTab === 'progressive' ? 'Baixar lote .sql' : 'Baixar .sql'}</span>
            </button>

            <button
              onClick={handleCopy}
              disabled={exportDisabled}
              className="flex items-center gap-1.5 px-6 py-2 rounded-full text-xs font-bold text-white bg-brand hover:bg-brand-hover shadow-[0_0_20px_rgba(164,57,57,0.35)] transition-all cursor-pointer disabled:opacity-40"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado para Área de Transferência!' : activeTab === 'progressive' ? 'Copiar SQL do lote' : 'Copiar Código SQL'}</span>
            </button>
          </div>
        </div>
        </>}
      </div>
    </section>
  );
};