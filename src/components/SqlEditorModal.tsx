import React, { useState, useMemo } from 'react';
import { 
  Code2, 
  Copy, 
  Download, 
  Search, 
  X, 
  Check, 
  Layers, 
  Trash2, 
  RefreshCw, 
  Database,
  Terminal,
  FileCode2
} from 'lucide-react';
import { Question, AuditLogItem } from '../types/question';
import { generateProgressiveSqlScript, getSupabaseInitialSchemaSql } from '../lib/sqlGenerator';
import { copyTextToClipboard } from '../lib/clipboardHelper';

interface SqlEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditLogs: AuditLogItem[];
  allQuestions: Question[];
  onClearLogs: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const SqlEditorModal: React.FC<SqlEditorModalProps> = ({
  isOpen,
  onClose,
  auditLogs,
  allQuestions,
  onClearLogs,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const [regexPattern, setRegexPattern] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'progressive' | 'ddl'>('progressive');
  const [copied, setCopied] = useState(false);

  // Generate the progressive SQL code with live regex filter
  const progressiveSql = useMemo(() => {
    return generateProgressiveSqlScript(auditLogs, allQuestions, regexPattern);
  }, [auditLogs, allQuestions, regexPattern]);

  const ddlSql = useMemo(() => {
    return getSupabaseInitialSchemaSql();
  }, []);

  const activeSqlContent = activeTab === 'progressive' ? progressiveSql : ddlSql;

  // Stats calculation
  const stats = useMemo(() => {
    const deleteMatches = (progressiveSql.match(/DELETE FROM/gi) || []).length;
    const updateMatches = (progressiveSql.match(/UPDATE questoes/gi) || []).length;
    const lines = progressiveSql.split('\n').length;
    return {
      deletes: deleteMatches,
      updates: updateMatches,
      totalStatements: deleteMatches + updateMatches,
      lines,
    };
  }, [progressiveSql]);

  const handleCopy = async () => {
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
    const filename =
      activeTab === 'progressive'
        ? `curadoria_apexmed_${new Date().toISOString().split('T')[0]}.sql`
        : 'supabase_schema_apexmed.sql';

    const blob = new Blob([activeSqlContent], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Arquivo baixado!', `Salvo como ${filename}.`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-4xl rounded-2xl bg-[#1e1d1b] border border-white/[0.12] p-6 space-y-4 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Code2 className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#f8fafc]">
                Supabase SQL Editor — Geração Progressiva
              </h3>
              <p className="text-xs text-[#7a7468]">
                Comandos SQL (DELETE/UPDATE) gerados progressivamente pelas auditorias dos curadores
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

        {/* Tab switch + Regex filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex bg-[#272522] p-1 rounded-full border border-white/[0.08] text-xs font-bold">
            <button
              onClick={() => setActiveTab('progressive')}
              className={`px-3.5 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'progressive'
                  ? 'bg-[#A43939] text-white shadow-sm'
                  : 'text-[#bdbdbd] hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>SQL Progressivo ({stats.totalStatements} comandos)</span>
            </button>

            <button
              onClick={() => setActiveTab('ddl')}
              className={`px-3.5 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'ddl'
                  ? 'bg-[#A43939] text-white shadow-sm'
                  : 'text-[#bdbdbd] hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>DDL Schema Inicial</span>
            </button>
          </div>

          {/* Regex input (only when on progressive tab) */}
          {activeTab === 'progressive' && (
            <div className="flex items-center gap-2 flex-1 max-w-sm min-w-[200px]">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-[#7a7468] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={regexPattern}
                  onChange={(e) => setRegexPattern(e.target.value)}
                  placeholder="Filtrar SQL via Regex (ex: DELETE, correta, ID 12)..."
                  className="w-full bg-[#272522] border border-white/[0.1] rounded-full pl-8 pr-8 py-1.5 text-xs text-[#f8fafc] placeholder-[#7a7468] outline-none focus:border-amber-400 font-mono"
                />
                {regexPattern && (
                  <button
                    onClick={() => setRegexPattern('')}
                    className="absolute right-2.5 top-2 text-xs text-[#7a7468] hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stats Pill row */}
        {activeTab === 'progressive' && (
          <div className="flex flex-wrap items-center gap-3 text-xs bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#7a7468]">
              Resumo da Auditoria:
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
              {stats.deletes} DELETEs (Eliminar)
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
              {stats.updates} UPDATEs (Aprovar / Corrigir)
            </span>
            <span className="px-2 py-0.5 rounded bg-white/[0.05] text-[#bdbdbd]">
              {stats.lines} linhas geradas
            </span>
            <span className="text-[11px] text-[#7a7468] ml-auto">
              Compatível com Supabase SQL Editor
            </span>
          </div>
        )}

        {/* Code Editor Preview Box */}
        <div className="flex-1 min-h-[300px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#121110] relative flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1d1b] border-b border-white/[0.06] text-[11px] text-[#7a7468] font-mono">
            <span>
              {activeTab === 'progressive' ? 'curadoria_progressiva.sql' : 'supabase_ddl_schema.sql'}
            </span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              ● Transação Atômica Ativa
            </span>
          </div>

          <div className="flex-1 p-3 overflow-auto">
            <pre className="text-xs font-mono text-[#f8fafc] leading-relaxed whitespace-pre font-normal select-text">
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
                className="text-xs text-[#7a7468] hover:text-rose-400 flex items-center gap-1 transition-colors"
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-[#f8fafc] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar .sql</span>
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-6 py-2 rounded-full text-xs font-bold text-white bg-[#A43939] hover:bg-[#913232] shadow-[0_0_20px_rgba(164,57,57,0.35)] transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado para Área de Transferência!' : 'Copiar Código SQL'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
