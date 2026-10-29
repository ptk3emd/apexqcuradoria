import React, {useMemo, useState} from 'react';
import {AlertTriangle, CheckCircle2, CircleHelp, Wand2, X} from 'lucide-react';
import type {Question} from '../types/question';
import {parseCorrectionSql} from '../lib/sqlCorrection';

const FIELD_LABELS: Record<string, string> = {
  enunciado: 'Enunciado', correta: 'Gabarito', comentario: 'Comentário', especialidade: 'Especialidade', categoria: 'Categoria',
  tema_especifico: 'Tema específico', competencias: 'Competências', descritores: 'Descritores', difficulty_bucket: 'Dificuldade',
  origem: 'Origem', ano: 'Ano', anulada: 'Anulada', referencias: 'Referências', imagem: 'Imagem', imagem_legenda: 'Legenda da imagem',
};
const label = (field: string) => FIELD_LABELS[field]
  ?? (field.startsWith('justificativa_') ? `Justificativa ${field.slice(-1).toUpperCase()}` : `Alternativa ${field.toUpperCase()}`);
const show = (v: unknown) => v === null || v === undefined || v === '' ? '(vazio)' : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v);

/**
 * "Correção automática": the curator pastes the SQL written for the Supabase
 * editor; it is read here (never run), checked against the open question and
 * applied to the draft, which is then reviewed and saved like any edit.
 */
export function SqlCorrectionPanel({question, onApply, onClose}: {question: Question; onApply: (patch: Partial<Question>) => void; onClose: () => void}) {
  const [sql, setSql] = useState('');
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const parsed = useMemo(() => sql.trim() ? parseCorrectionSql(sql, question) : null, [sql, question]);

  const failing = parsed?.guards.filter(g => g.passes === false) ?? [];
  const unknown = parsed?.guards.filter(g => g.passes === null) ?? [];
  const unconfirmed = parsed?.blocks.filter(b => !confirmed.has(b.variable)) ?? [];
  const changes = Object.entries(parsed?.changes ?? {});
  const ready = parsed && !parsed.errors.length && !failing.length && !unconfirmed.length && changes.length > 0;

  const apply = () => {
    if (!ready) return;
    onApply(parsed.changes as Partial<Question>);
    setSql('');
    setConfirmed(new Set());
    onClose();
  };

  return (
    <section aria-labelledby="sql-correction-title" className="space-y-4 rounded-2xl border border-brand/30 bg-brand/[0.05] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="sql-correction-title" className="flex items-center gap-2 text-lg font-bold text-apex-text"><Wand2 className="h-5 w-5 text-brand-soft" aria-hidden="true" />Correção automática</h2>
          <p className="mt-1 text-sm text-apex-readable">Cole o SQL da correção. Ele não é executado: o app lê o UPDATE, confere as condições com esta questão e preenche o editor. Depois revise e salve.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar correção automática" className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-apex-readable hover:bg-white/[0.06] hover:text-white">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <label className="block">
        <span className="sr-only">SQL da correção</span>
        <textarea
          value={sql}
          onChange={e => { setSql(e.target.value); setConfirmed(new Set()); }}
          rows={10}
          spellCheck={false}
          placeholder={"BEGIN;\nUPDATE public.questions\nSET comentario = $c$ ... $c$\nWHERE id = 123456 AND lower(btrim(correta)) = 'a';\nCOMMIT;"}
          className="w-full rounded-xl border border-white/15 bg-shell-3 p-3 font-mono text-xs leading-relaxed text-apex-text outline-none focus:border-brand-muted sm:text-sm"
        />
      </label>

      {parsed && (
        <div className="space-y-4" aria-live="polite">
          {parsed.errors.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">
              {parsed.errors.map(e => <li key={e} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{e}</li>)}
            </ul>
          )}

          {parsed.guards.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-apex-text">Condições do WHERE</h3>
              <ul className="mt-2 space-y-1.5">
                {parsed.guards.map((g, i) => (
                  <li key={i} className={`flex items-start gap-2 text-xs ${g.passes === true ? 'text-emerald-300' : g.passes === false ? 'text-rose-300' : 'text-amber-300'}`}>
                    {g.passes === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : g.passes === false ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                    <span><code className="break-all font-mono">{g.text}</code>{g.passes === false && ' · não confere com a questão'}{g.passes === null && ' · não verificada automaticamente'}</span>
                  </li>
                ))}
              </ul>
              {failing.length > 0 && <p className="mt-2 text-xs text-rose-200">A questão mudou desde que o SQL foi escrito, ou o SQL é de outra versão. Revise antes de aplicar.</p>}
              {unknown.length > 0 && !failing.length && <p className="mt-2 text-xs text-amber-200">Confira as condições em amarelo manualmente.</p>}
            </div>
          )}

          {parsed.blocks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-apex-text">Confirmação pedida pelo SQL</h3>
              {parsed.blocks.map(b => (
                <label key={b.variable} className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <input type="checkbox" checked={confirmed.has(b.variable)} className="mt-0.5 h-5 w-5 accent-amber-500"
                    onChange={e => setConfirmed(prev => { const next = new Set(prev); if (e.target.checked) next.add(b.variable); else next.delete(b.variable); return next; })} />
                  <span><span className="block">{b.message}</span><span className="block text-xs text-amber-200/80">Marque para confirmar que você verificou ({b.variable}).</span></span>
                </label>
              ))}
            </div>
          )}

          {changes.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-apex-text">{changes.length} campos serão alterados no editor</h3>
              <ul className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
                {changes.map(([field, value]) => {
                  const before = (question as unknown as Record<string, unknown>)[field];
                  const same = show(before) === show(value);
                  return (
                    <li key={field} className="grid gap-1 p-3 text-xs sm:grid-cols-[10rem_1fr]">
                      <span className="font-bold text-apex-text">{label(field)}{same && <span className="ml-1 font-normal text-shell-muted">(igual)</span>}</span>
                      <span className="min-w-0 space-y-1">
                        {!same && <span className="block line-clamp-2 text-rose-200/70 line-through">{show(before)}</span>}
                        <span className="block line-clamp-3 whitespace-pre-line text-emerald-200">{show(value)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm text-apex-readable hover:text-white">Cancelar</button>
            <button type="button" onClick={apply} disabled={!ready} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-bold text-white hover:bg-brand-hover disabled:opacity-40">
              <Wand2 className="h-4 w-4" aria-hidden="true" />Aplicar no editor
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
