import React, {useState} from 'react';
import {Check, CheckCircle2, ChevronDown, Copy, Download, Undo2} from 'lucide-react';
import {copyTextToClipboard} from '../lib/clipboardHelper';

// Every migration in the repository, loaded only when opened.
// Vite expands the glob at build time; outside Vite (unit tests) the list is empty.
let SOURCES: Record<string, () => Promise<string>> = {};
try { SOURCES = import.meta.glob('../../supabase/migrations/*.sql', {query: '?raw', import: 'default'}) as Record<string, () => Promise<string>>; } catch { /* not built by Vite */ }
const MIGRATIONS = Object.keys(SOURCES).sort().map(path => {
  const file = path.split('/').pop()!;
  const stamp = file.slice(0, 14);
  const date = /^\d{14}$/.test(stamp) ? `${stamp.slice(6, 8)}/${stamp.slice(4, 6)}/${stamp.slice(0, 4)}` : '';
  return {path, file, date, name: file.replace(/^\d+_/, '').replace(/\.sql$/, '').replace(/_/g, ' ')};
});

interface Props {
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  /** Applied migrations by file name, shared by the curators. */
  applied: Record<string, {by: string; at: string}>;
  onMark: (file: string, done: boolean) => Promise<void>;
}

/**
 * The repository migrations: the ones still to apply first, oldest first (the
 * order to run them), then the applied ones. SQL stays hidden until asked for.
 */
export function MigrationsPanel({onShowToast, applied, onMark}: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const read = async (path: string) => texts[path] ?? SOURCES[path]().then(text => { setTexts(prev => ({...prev, [path]: text})); return text; });
  const toggle = (path: string) => { setOpen(prev => prev === path ? null : path); void read(path); };
  const copy = async (path: string) => {
    const ok = await copyTextToClipboard(await read(path));
    if (ok) { setCopied(path); setTimeout(() => setCopied(c => c === path ? null : c), 2500); }
    onShowToast(ok ? 'Migração copiada' : 'Não foi possível copiar', ok ? 'Cole no SQL Editor do Supabase, execute e marque como aplicada.' : 'Abra o SQL e copie manualmente.', ok ? 'success' : 'error');
  };
  const download = async (path: string, file: string) => {
    const url = URL.createObjectURL(new Blob([await read(path)], {type: 'text/sql;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url; a.download = file; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const mark = async (file: string, done: boolean) => {
    setBusy(file);
    try { await onMark(file, done); }
    catch (e) { onShowToast('Não foi possível marcar', (e as Error).message, 'error'); }
    finally { setBusy(null); }
  };

  const toApply = MIGRATIONS.filter(m => !applied[m.file]);
  // First use: migrations run before this list existed can be marked in one go.
  const markAll = async () => {
    if (!window.confirm(`Marcar ${toApply.length} migrações como aplicadas? Use só se elas já rodaram no Supabase.`)) return;
    setBusy('*');
    try { for (const m of toApply) await onMark(m.file, true); onShowToast('Migrações marcadas', `${toApply.length} marcadas como aplicadas.`, 'success'); }
    catch (e) { onShowToast('Não foi possível marcar todas', (e as Error).message, 'error'); }
    finally { setBusy(null); }
  };
  const done = MIGRATIONS.filter(m => applied[m.file]).reverse();

  const row = (m: typeof MIGRATIONS[number], isApplied: boolean, step?: number) => (
    <li key={m.path}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-apex-text first-letter:uppercase">{step !== undefined && <span className="mr-2 tabular-nums text-brand-soft">{step}.</span>}{m.name}</p>
          <p className="truncate text-xs text-apex-readable">
            <span className="font-mono">{m.file}</span>
            {isApplied && <> · aplicada por {applied[m.file].by} em {new Date(applied[m.file].at).toLocaleDateString('pt-BR')}</>}
          </p>
        </div>
        {isApplied ? (
          <button type="button" disabled={busy === m.file} onClick={() => void mark(m.file, false)} className="flex min-h-10 items-center gap-2 self-start rounded-full px-3 text-xs font-bold text-apex-readable hover:bg-white/[0.06] hover:text-white disabled:opacity-50 sm:self-auto">
            <Undo2 className="h-4 w-4" aria-hidden="true" />Desmarcar
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="button" onClick={() => void copy(m.path)} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-bold text-white hover:bg-brand-hover sm:col-span-1">
              {copied === m.path ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}{copied === m.path ? 'Copiada' : 'Copiar SQL'}
            </button>
            <button type="button" onClick={() => void download(m.path, m.file)} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/[0.15] px-5 text-sm font-bold text-apex-text hover:bg-white/[0.06]">
              <Download className="h-5 w-5" aria-hidden="true" />Baixar
            </button>
            <button type="button" disabled={busy === m.file} onClick={() => void mark(m.file, true)} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-emerald-500/40 px-5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />Aplicada
            </button>
          </div>
        )}
      </div>
      <button type="button" aria-expanded={open === m.path} onClick={() => toggle(m.path)} className="flex min-h-11 w-full items-center gap-2 border-t border-white/[0.06] px-4 text-xs font-bold text-apex-readable hover:text-apex-text sm:px-5">
        <ChevronDown className={`h-4 w-4 transition-transform ${open === m.path ? 'rotate-180' : ''}`} aria-hidden="true" />{open === m.path ? 'Ocultar SQL' : 'Ver SQL'}
      </button>
      {open === m.path && (
        <pre className="max-h-96 overflow-auto border-t border-white/[0.06] bg-shell-3 p-4 font-mono text-xs leading-relaxed text-apex-text">{texts[m.path] ?? 'Carregando…'}</pre>
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-lg text-apex-text">
          {toApply.length ? <><span className="text-3xl font-bold tabular-nums">{toApply.length}</span> {toApply.length === 1 ? 'migração a aplicar' : 'migrações a aplicar'}</> : 'Todas as migrações marcadas como aplicadas.'}
        </p>
        {toApply.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-apex-readable">Rode no SQL Editor do Supabase nesta ordem, uma de cada vez, e marque cada uma como aplicada.</p>
            <button type="button" disabled={busy !== null} onClick={() => void markAll()} className="flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-bold text-apex-readable hover:bg-white/[0.06] hover:text-white disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Já apliquei todas estas
            </button>
          </div>
        )}
      </div>
      {toApply.length > 0 && <ol className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-shell-2">{toApply.map((m, i) => row(m, false, i + 1))}</ol>}
      {done.length > 0 && (
        <details className="group rounded-2xl border border-white/[0.08] bg-shell-2">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-bold text-apex-text sm:px-5">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />Aplicadas <span className="font-normal text-apex-readable">· {done.length}</span>
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">{done.map(m => row(m, true))}</ul>
        </details>
      )}
    </div>
  );
}
