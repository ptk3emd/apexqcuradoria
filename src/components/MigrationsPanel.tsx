import React, {useEffect, useState} from 'react';
import {Check, Copy, Download} from 'lucide-react';
import {copyTextToClipboard} from '../lib/clipboardHelper';

// Every migration in the repository, loaded only when opened.
// Vite expands the glob at build time; outside Vite (unit tests) the list is empty.
let SOURCES: Record<string, () => Promise<string>> = {};
try { SOURCES = import.meta.glob('../../supabase/migrations/*.sql', {query: '?raw', import: 'default'}) as Record<string, () => Promise<string>>; } catch { /* not built by Vite */ }
const MIGRATIONS = Object.keys(SOURCES).sort().reverse().map(path => {
  const file = path.split('/').pop()!;
  const stamp = file.slice(0, 14);
  const date = /^\d{14}$/.test(stamp) ? `${stamp.slice(6, 8)}/${stamp.slice(4, 6)}/${stamp.slice(0, 4)}` : '';
  return {path, file, date, name: file.replace(/^\d+_/, '').replace(/\.sql$/, '').replace(/_/g, ' ')};
});

interface Props {
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

/** Lists the Supabase migrations (newest first) so each can be copied into the SQL Editor in order. */
export function MigrationsPanel({onShowToast}: Props) {
  const [open, setOpen] = useState<string | null>(MIGRATIONS[0]?.path ?? null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const read = async (path: string) => texts[path] ?? SOURCES[path]().then(text => { setTexts(prev => ({...prev, [path]: text})); return text; });
  const toggle = (path: string) => { setOpen(prev => prev === path ? null : path); void read(path); };
  // The newest one opens with its text.
  useEffect(() => { if (MIGRATIONS[0]) void SOURCES[MIGRATIONS[0].path]().then(text => setTexts(prev => ({...prev, [MIGRATIONS[0].path]: text}))); }, []);

  const copy = async (path: string) => {
    const ok = await copyTextToClipboard(await read(path));
    if (ok) { setCopied(path); setTimeout(() => setCopied(null), 2000); }
    onShowToast(ok ? 'Migração copiada' : 'Não foi possível copiar', ok ? 'Cole no SQL Editor do Supabase e execute.' : 'Selecione o código e copie manualmente.', ok ? 'success' : 'error');
  };
  const download = async (path: string, file: string) => {
    const url = URL.createObjectURL(new Blob([await read(path)], {type: 'text/sql;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url; a.download = file; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-apex-readable">
        Aplique no SQL Editor do Supabase as que ainda não rodaram, da mais antiga para a mais nova. Cada arquivo roda uma vez; rodar de novo uma já aplicada falha sem alterar nada.
      </p>
      <ol className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-shell-2">
        {MIGRATIONS.map(m => (
          <li key={m.path}>
            <div className="flex flex-wrap items-center gap-3 p-3">
              <button type="button" aria-expanded={open === m.path} onClick={() => toggle(m.path)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-bold text-apex-text first-letter:uppercase">{m.name}</span>
                <span className="block truncate font-mono text-[11px] text-apex-readable">{m.date} · {m.file}</span>
              </button>
              <button type="button" onClick={() => void download(m.path, m.file)} aria-label={`Baixar ${m.file}`} className="flex min-h-10 min-w-10 items-center justify-center rounded-full border border-white/[0.1] text-apex-readable hover:text-white">
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => void copy(m.path)} className="flex min-h-10 items-center gap-2 rounded-full bg-brand px-4 text-xs font-bold text-white hover:bg-brand-hover">
                {copied === m.path ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied === m.path ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            {open === m.path && (
              <pre className="max-h-96 overflow-auto border-t border-white/[0.06] bg-shell-3 p-3 font-mono text-xs leading-relaxed text-apex-text">{texts[m.path] ?? 'Carregando…'}</pre>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
