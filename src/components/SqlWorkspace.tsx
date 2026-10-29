import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Code2, Copy, Database, Download, History, Search, Terminal, Undo2, X } from 'lucide-react';
import { Question, AuditLogItem } from '../types/question';
import { generateProgressiveSqlBatches, getSupabaseInitialSchemaSql, type ProgressiveSqlBatch } from '../lib/sqlGenerator';
import { copyTextToClipboard } from '../lib/clipboardHelper';
import { exportHistory, splitCorrections, usedBatchNumbers } from '../lib/sqlExports';
import { useSqlState } from '../lib/useSqlState';
import { MigrationsPanel } from './MigrationsPanel';

interface SqlWorkspaceProps {
  auditLogs: AuditLogItem[];
  allQuestions: Question[];
  curatorName?: string;
  onClearLogs: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

type Tab = 'progressive' | 'migrations' | 'ddl';
const fmt = (n: number) => n.toLocaleString('pt-BR');
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/sql;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** The SQL tab: corrections in batches (pending vs. already migrated), the migrations to apply and the schema reference. */
export const SqlWorkspace: React.FC<SqlWorkspaceProps> = ({ allQuestions, curatorName = 'Curador', onShowToast }) => {
  const [tab, setTab] = useState<Tab>('progressive');
  const [regexPattern, setRegexPattern] = useState('');
  const [openSql, setOpenSql] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { state, shared, setExported, setMigration } = useSqlState(curatorName);

  // Only corrections whose current version was not migrated go into batches.
  const { corrected, pending, exportedCount } = useMemo(() => splitCorrections(allQuestions, state.exported), [allQuestions, state.exported]);
  const { batches, errors } = useMemo(() => generateProgressiveSqlBatches(pending, regexPattern, usedBatchNumbers(state.exported)), [pending, regexPattern, state.exported]);
  const history = useMemo(() => exportHistory(state.exported), [state.exported]);
  const versionOf = useMemo(() => new Map(allQuestions.map(q => [q.id, q.sync_version ?? 0])), [allQuestions]);
  const pendingTotal = batches.reduce((n, b) => n + b.questionIds.length, 0);
  const migratedPct = corrected.length ? (exportedCount / corrected.length) * 100 : 0;
  const date = new Date().toISOString().slice(0, 10);

  const copy = async (key: string, text: string, what: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) { setCopied(key); setTimeout(() => setCopied(c => (c === key ? null : c)), 2500); }
    onShowToast(ok ? `${what} copiado` : 'Não foi possível copiar', ok ? 'Cole no SQL Editor do Supabase e execute.' : 'Abra o SQL e copie manualmente.', ok ? 'success' : 'error');
  };
  const markBatch = async (batch: ProgressiveSqlBatch) => {
    setBusy(batch.key);
    try {
      await setExported(batch.questionIds.map(id => ({ id, version: versionOf.get(id) ?? 0 })), `Lote ${batch.number} · ${date}`, true);
      onShowToast(`Lote ${batch.number} marcado como migrado`, `${batch.questionIds.length} questões saem da lista de pendentes.`, 'success');
      setOpenSql(null);
    } catch (e) { onShowToast('Não foi possível marcar', (e as Error).message, 'error'); }
    finally { setBusy(null); }
  };
  const undo = async (key: string, items: { id: string; version: number }[], batch: string) => {
    setBusy(key);
    try { await setExported(items, null, false); onShowToast('Marcação desfeita', `${batch} voltou para pendentes.`, 'info'); }
    catch (e) { onShowToast('Não foi possível desfazer', (e as Error).message, 'error'); }
    finally { setBusy(null); }
  };

  const tabs: { key: Tab; label: string; Icon: typeof Terminal; count?: number }[] = [
    { key: 'progressive', label: 'Correções em lotes', Icon: Terminal, count: batches.length },
    { key: 'migrations', label: 'Migrações', Icon: Code2 },
    { key: 'ddl', label: 'Referência do esquema', Icon: Database },
  ];

  return (
    <section aria-labelledby="sql-title" className="mx-auto w-full max-w-5xl space-y-6 pb-16">
      <header className="space-y-1">
        <h1 id="sql-title" className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.02em] text-apex-text">SQL e migrações</h1>
        <p className="text-sm text-apex-readable">Leve as correções para o banco principal em lotes e acompanhe o que já foi migrado.</p>
      </header>

      <div role="tablist" aria-label="Seções de SQL" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {tabs.map(({ key, label, Icon, count }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors ${tab === key ? 'bg-brand text-white' : 'text-apex-readable hover:bg-white/[0.06] hover:text-apex-text'}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
            {count !== undefined && count > 0 && <span className={`rounded-full px-2 text-xs tabular-nums ${tab === key ? 'bg-white/20' : 'bg-white/[0.08]'}`}>{count}</span>}
          </button>
        ))}
      </div>

      {shared === false && (
        <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          As marcações de “migrado” estão ficando só neste navegador. Aplique a migração <span className="font-mono">20261029150000_sql_export_tracking</span> para os três curadores verem as mesmas.
        </p>
      )}

      {tab === 'progressive' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-lg text-apex-text">
                <span className="text-3xl font-bold tabular-nums">{fmt(pendingTotal)}</span> {pendingTotal === 1 ? 'correção pendente' : 'correções pendentes'}
                {batches.length > 0 && <span className="text-apex-readable"> em {batches.length} {batches.length === 1 ? 'lote' : 'lotes'}</span>}
              </p>
              <p className="text-sm text-apex-readable"><span className="font-bold tabular-nums text-emerald-300">{fmt(exportedCount)}</span> de {fmt(corrected.length)} corrigidas já migradas</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${fmt(exportedCount)} de ${fmt(corrected.length)} correções migradas`}>
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${migratedPct}%` }} />
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-shell-muted" aria-hidden="true" />
            <input aria-label="Filtrar correções por expressão regular" value={regexPattern} onChange={e => setRegexPattern(e.target.value)}
              placeholder="Filtrar por ID ou texto (regex)…"
              className="min-h-11 w-full rounded-full border border-white/[0.1] bg-shell-3 pl-10 pr-10 font-mono text-sm text-apex-text outline-none placeholder:text-shell-muted focus:border-brand" />
            {regexPattern && (
              <button type="button" aria-label="Limpar filtro" onClick={() => setRegexPattern('')} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-shell-muted hover:text-white">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {errors.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200">
              {errors.map(e => <li key={e}>{e}</li>)}
            </ul>
          )}

          {!errors.length && batches.length === 0 && (
            <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5 text-sm text-emerald-100">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              {regexPattern ? 'Nenhuma correção pendente com esse filtro.' : 'Tudo migrado. Novas correções aparecem aqui em novos lotes.'}
            </p>
          )}

          <ol className="space-y-3">
            {batches.map(batch => {
              const isOpen = openSql === batch.key;
              const file = `apexmed_correcoes_lote_${batch.number}_${date}.sql`;
              return (
                <li key={batch.key} className="rounded-2xl border border-white/[0.08] bg-shell-2">
                  <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-apex-text">Lote {batch.number}</h2>
                      <p className="text-sm text-apex-readable">
                        <span className="tabular-nums">{batch.questionIds.length}</span> questões · IDs <span className="tabular-nums">{batch.questionIds[0]}</span> a <span className="tabular-nums">{batch.questionIds.at(-1)}</span>
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                      <button type="button" onClick={() => void copy(batch.key, batch.sql, `Lote ${batch.number}`)}
                        className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-bold text-white hover:bg-brand-hover sm:col-span-1">
                        {copied === batch.key ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
                        {copied === batch.key ? 'Copiado' : 'Copiar SQL'}
                      </button>
                      <button type="button" onClick={() => download(file, batch.sql)}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/[0.15] px-5 text-sm font-bold text-apex-text hover:bg-white/[0.06]">
                        <Download className="h-5 w-5" aria-hidden="true" />Baixar .sql
                      </button>
                      <button type="button" disabled={busy === batch.key} onClick={() => void markBatch(batch)}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-emerald-500/40 px-5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50">
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />{busy === batch.key ? 'Marcando…' : 'Marcar migrado'}
                      </button>
                    </div>
                  </div>
                  {copied === batch.key && (
                    <p className="px-4 pb-3 text-xs text-apex-readable sm:px-5">Depois de executar no Supabase, clique em <span className="font-bold text-emerald-200">Marcar migrado</span>.</p>
                  )}
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpenSql(isOpen ? null : batch.key)}
                    className="flex min-h-11 w-full items-center gap-2 border-t border-white/[0.06] px-4 text-xs font-bold text-apex-readable hover:text-apex-text sm:px-5">
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    {isOpen ? 'Ocultar SQL' : 'Ver SQL'} <span className="font-normal text-shell-muted">· {batch.sql.split('\n').length} linhas</span>
                  </button>
                  {isOpen && (
                    <pre className="max-h-[28rem] overflow-auto border-t border-white/[0.06] bg-shell-3 p-4 font-mono text-xs leading-relaxed text-apex-text">{batch.sql}</pre>
                  )}
                </li>
              );
            })}
          </ol>

          {history.length > 0 && (
            <details className="group rounded-2xl border border-white/[0.08] bg-shell-2">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-bold text-apex-text sm:px-5">
                <History className="h-4 w-4 text-emerald-300" aria-hidden="true" />Já migrados
                <span className="font-normal text-apex-readable">· {history.length} {history.length === 1 ? 'lote' : 'lotes'}</span>
                <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                {history.map(g => (
                  <li key={g.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 text-sm">
                      <p className="font-bold text-apex-text">{g.batch}</p>
                      <p className="text-xs text-apex-readable"><span className="tabular-nums">{g.items.length}</span> questões · marcado por {g.by} em {when(g.at)}</p>
                    </div>
                    <button type="button" disabled={busy === g.key} onClick={() => void undo(g.key, g.items.map(i => ({ id: i.id, version: i.version })), g.batch)}
                      className="flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-bold text-apex-readable hover:bg-white/[0.06] hover:text-white disabled:opacity-50">
                      <Undo2 className="h-4 w-4" aria-hidden="true" />Desfazer
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {tab === 'migrations' && (
        <MigrationsPanel onShowToast={onShowToast} applied={state.migrations} onMark={setMigration} />
      )}

      {tab === 'ddl' && <SchemaReference onCopy={text => void copy('ddl', text, 'Esquema')} copied={copied === 'ddl'} />}
    </section>
  );
};

function SchemaReference({ onCopy, copied }: { onCopy: (text: string) => void; copied: boolean }) {
  const sql = useMemo(() => getSupabaseInitialSchemaSql(), []);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-apex-readable">Estrutura de referência de <span className="font-mono">public.questions</span>.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => onCopy(sql)} className="flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-bold text-white hover:bg-brand-hover">
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'Copiado' : 'Copiar'}
          </button>
          <button type="button" onClick={() => download('supabase_schema_apexmed.sql', sql)} className="flex min-h-11 items-center gap-2 rounded-full border border-white/[0.15] px-5 text-sm font-bold text-apex-text hover:bg-white/[0.06]">
            <Download className="h-4 w-4" aria-hidden="true" />Baixar .sql
          </button>
        </div>
      </div>
      <pre className="max-h-[32rem] overflow-auto rounded-2xl border border-white/[0.08] bg-shell-3 p-4 font-mono text-xs leading-relaxed text-apex-text">{sql}</pre>
    </div>
  );
}
