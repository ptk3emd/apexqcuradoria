import React, { useEffect, useMemo, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { Question, Curator } from '../types/question';
import { useDialog } from '../lib/useDialog';
import { fetchQualityFlags } from '../lib/supabaseCuration';
import { ISSUE_GROUPS, IssueKey, describeIssues, matchesIssues } from '../lib/qualityFlags';

// curation_mutate takes at most 100 questions per call.
const MAX_BATCH = 100;
const sameText = (value?: string | null) => (value || '').trim();

interface BatchAssignModalProps {
  isOpen: boolean;
  busy: boolean;
  onClose: () => void;
  questions: Question[];
  curators: Curator[];
  activeCurator: Curator;
  onAssignBatch: (questionIds: string[], curatorId: string, curatorName: string) => Promise<boolean>;
  onReleaseAllMyAssignments: (curatorId: string) => Promise<boolean>;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const BatchAssignModal: React.FC<BatchAssignModalProps> = ({
  isOpen,
  busy,
  onClose,
  questions,
  curators,
  activeCurator,
  onAssignBatch,
  onReleaseAllMyAssignments,
  onShowToast,
}) => {

  const [quantity, setQuantity] = useState<number>(10);
  const [quantityText, setQuantityText] = useState('10');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('todas');
  const [originFilter, setOriginFilter] = useState<string>('todas');
  const [scope, setScope] = useState<'pendentes' | 'livres'>('pendentes');
  const [issues, setIssues] = useState<Set<IssueKey>>(new Set());
  const [flags, setFlags] = useState<Record<string, string[]> | null>(null);
  const [flagsState, setFlagsState] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle');
  const [flagsError, setFlagsError] = useState('');

  // The checks read the full text, which only the server has; run them each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setFlagsState('loading');
    fetchQualityFlags(controller.signal)
      .then(result => { setFlags(result); setFlagsState(result ? 'ready' : 'unavailable'); })
      .catch(error => { if ((error as Error).name !== 'AbortError') { setFlagsError((error as Error).message || ''); setFlagsState('error'); } });
    return () => controller.abort();
  }, [isOpen]);

  // Workload calculations
  const unassigned = questions.filter(q => !q.responsavel_id);
  const unassignedPending = unassigned.filter(q => q.status === 'pendente');

  const workloadByCurator = curators.map(c => {
    const assigned = questions.filter(q => q.responsavel_id === c.id);
    const completed = assigned.filter(q => q.status !== 'pendente');
    return {
      curator: c,
      totalAssigned: assigned.length,
      completed: completed.length,
      pending: assigned.length - completed.length,
    };
  });

  const scoped = scope === 'pendentes' ? unassignedPending : unassigned;
  const availableSpecialties = useMemo(() => Array.from(new Set(scoped.map(q => sameText(q.especialidade || q.categoria)).filter(Boolean))).sort(), [scoped]);
  const availableOrigins = useMemo(() => Array.from(new Set(scoped.map(q => sameText(q.origem)).filter(Boolean))).sort(), [scoped]);

  // Questions without the selected issues filter, so each issue shows how many it would add.
  const baseFiltered = useMemo(() => scoped.filter(q =>
    (specialtyFilter === 'todas' || sameText(q.especialidade || q.categoria) === specialtyFilter) &&
    (originFilter === 'todas' || sameText(q.origem) === originFilter)
  ), [scoped, specialtyFilter, originFilter]);
  const issueCounts = useMemo(() => Object.fromEntries(ISSUE_GROUPS.map(group => [group.key,
    baseFiltered.filter(q => flags?.[q.id]?.some(group.match)).length])) as Record<IssueKey, number>, [baseFiltered, flags]);
  const pool = useMemo(() => {
    const matched = baseFiltered.filter(q => matchesIssues(flags?.[q.id], issues));
    return matched.sort((a, b) => Number(a.id) - Number(b.id));
  }, [baseFiltered, flags, issues]);

  const maxQuantity = Math.max(1, Math.min(MAX_BATCH, pool.length));
  const effectiveQuantity = Math.min(quantity, maxQuantity);
  const setBoth = (value: number) => {
    const next = Math.max(1, Math.min(MAX_BATCH, Math.round(value) || 1));
    setQuantity(next);
    setQuantityText(String(next));
  };
  const toggleIssue = (key: IssueKey) => setIssues(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const handleClaim = async () => {
    if (pool.length === 0) {
      onShowToast('Nenhuma questão livre com esses filtros', 'Remova algum filtro e tente de novo.', 'error');
      return;
    }
    const ids = pool.slice(0, effectiveQuantity).map(q => q.id);
    if (!await onAssignBatch(ids, activeCurator.id, activeCurator.nome)) return;
    onShowToast(
      `${ids.length} questões reservadas!`,
      `Atribuídas para ${activeCurator.nome}. Outros curadores verão sua responsabilidade para evitar redundância.`,
      'success'
    );
    onClose();
  };

  const handleRelease = async () => {
    if (!await onReleaseAllMyAssignments(activeCurator.id)) return;
    onShowToast('Questões liberadas', 'Todas as suas questões atribuídas voltaram para o banco livre.', 'info');
    onClose();
  };

  const dialogRef = useDialog<HTMLDivElement>(() => { if (!busy) onClose(); }, isOpen);

  if (!isOpen) return null;

  return (
    <fieldset disabled={busy} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="batch-dialog-title" className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-shell-2 border border-white/[0.12] p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand/20 border border-brand/40 flex items-center justify-center">
              <Layers className="w-4 h-4 text-brand-muted" />
            </div>
            <div>
              <h3 id="batch-dialog-title" className="font-bold text-base text-apex-text">Divisão de Lotes de Questões</h3>
              <p className="text-xs text-shell-muted">
                Evite redundância atribuindo lotes de questões não auditadas para cada especialista
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="p-1 rounded-lg text-shell-muted hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Workload Breakdown (Patrick, Lucas, Thierry) */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase font-bold tracking-wider text-brand-muted">
            Responsáveis pela curadoria: Patrick, Lucas, Thierry
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {workloadByCurator.map(({ curator, totalAssigned, pending }) => {
              const isCurrent = curator.id === activeCurator.id;
              return (
                <div
                  key={curator.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-brand/15 border-brand/40 text-white'
                      : 'bg-white/[0.03] border-white/[0.07] text-apex-readable'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: curator.avatarCor }}
                    />
                    <p className="font-bold text-xs truncate">{curator.nome.split(' ')[0]}</p>
                    {isCurrent && <span className="text-[9px] text-brand-muted font-bold">(Você)</span>}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-shell-muted">Atribuídas:</span>
                    <span className="font-bold text-apex-text">{totalAssigned}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-shell-muted">Pendentes:</span>
                    <span className="font-bold text-amber-400">{pending}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] text-xs text-shell-muted">
            <span>Questões livres disponíveis para assumir:</span>
            <span className="font-bold text-emerald-400">{unassignedPending.length} pendentes</span>
          </div>
        </div>

        {/* Batch Selection Form */}
        <div className="space-y-5 pt-1 border-t border-white/[0.06]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="batch-scope" className="block text-xs font-bold text-apex-text mb-1.5">Situação</label>
              <select id="batch-scope" value={scope} onChange={e => setScope(e.target.value as 'pendentes' | 'livres')} className="w-full min-h-10 bg-shell-3 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-apex-text outline-none focus:border-brand">
                <option value="pendentes">Livres e pendentes ({unassignedPending.length})</option>
                <option value="livres">Todas as livres ({unassigned.length})</option>
              </select>
            </div>
            <div>
              <label htmlFor="batch-specialty-filter" className="block text-xs font-bold text-apex-text mb-1.5">Especialidade</label>
              <select id="batch-specialty-filter" value={specialtyFilter} onChange={e => setSpecialtyFilter(e.target.value)} className="w-full min-h-10 bg-shell-3 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-apex-text outline-none focus:border-brand">
                <option value="todas">Todas</option>
                {availableSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="batch-origin-filter" className="block text-xs font-bold text-apex-text mb-1.5">Origem</label>
              <select id="batch-origin-filter" value={originFilter} onChange={e => setOriginFilter(e.target.value)} className="w-full min-h-10 bg-shell-3 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-apex-text outline-none focus:border-brand">
                <option value="todas">Todas</option>
                {availableOrigins.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-apex-text">Possíveis erros</legend>
            <p className="text-xs text-apex-readable">
              {flagsState === 'loading' ? 'Verificando o texto completo das questões…'
                : flagsState === 'unavailable' ? 'A verificação ainda não está instalada no banco (migração 20261028170000).'
                : flagsState === 'error' ? `Não foi possível verificar as questões agora${flagsError ? ` (${flagsError})` : ''}. Os outros filtros continuam valendo.`
                : 'Marque um ou mais para reservar só as questões com esses sinais. Os sinais vêm de regras automáticas: confira cada questão.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {ISSUE_GROUPS.map(group => {
                const active = issues.has(group.key);
                const count = issueCounts[group.key] ?? 0;
                return (
                  <button
                    key={group.key}
                    type="button"
                    aria-pressed={active}
                    title={group.hint}
                    disabled={flagsState !== 'ready' || (!count && !active)}
                    onClick={() => toggleIssue(group.key)}
                    className={`flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'border-amber-400/60 bg-amber-500/15 text-amber-200' : 'border-white/[0.1] bg-shell-3 text-apex-readable hover:border-white/[0.25] hover:text-apex-text'}`}
                  >
                    {group.label}
                    <span className="tabular-nums font-normal">{flagsState === 'ready' ? count : '–'}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <div className="flex items-end justify-between gap-3 mb-2">
              <label htmlFor="batch-quantity-range" className="text-xs font-bold text-apex-text">Quantas questões reservar</label>
              <label className="flex items-center gap-2 text-xs text-apex-readable">
                <span className="sr-only">Número de questões</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxQuantity}
                  value={quantityText}
                  onChange={e => { const n = Number(e.target.value); if (e.target.value === '' || !(n >= 1)) setQuantityText(e.target.value); else setBoth(Math.min(n, maxQuantity)); }}
                  onBlur={() => setBoth(effectiveQuantity)}
                  className="w-20 min-h-10 rounded-xl border border-white/[0.1] bg-shell-3 px-3 text-right text-sm font-bold tabular-nums text-apex-text outline-none focus:border-brand"
                />
                de <span className="tabular-nums">{pool.length}</span>
              </label>
            </div>
            <input
              id="batch-quantity-range"
              type="range"
              min={1}
              max={maxQuantity}
              value={effectiveQuantity}
              disabled={!pool.length}
              onChange={e => setBoth(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
            />
            <p className="mt-1 text-xs text-shell-muted">Até {MAX_BATCH} por vez. As de menor ID entram primeiro.</p>
          </div>

          {pool.length > 0 && issues.size > 0 && (
            <div>
              <p className="text-xs font-bold text-apex-text mb-1.5">Primeiras do lote</p>
              <ul className="max-h-40 overflow-y-auto rounded-xl border border-white/[0.08] divide-y divide-white/[0.06]">
                {pool.slice(0, Math.min(effectiveQuantity, 8)).map(q => (
                  <li key={q.id} className="px-3 py-2 text-xs">
                    <span className="font-bold tabular-nums text-apex-text">#{q.id}</span>
                    <span className="text-apex-readable"> · {q.especialidade || 'Sem especialidade'}</span>
                    <span className="block text-amber-200/90">{describeIssues(flags?.[q.id])}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse gap-3 pt-3 border-t border-white/[0.08] sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={handleRelease}
            className="self-center min-h-11 text-xs text-shell-muted hover:text-rose-400 underline sm:self-auto sm:min-h-0"
          >
            Liberar minhas atribuições pendentes
          </button>

          <div className="flex gap-2 sm:gap-2">
            <button
              onClick={onClose}
              className="min-h-11 px-4 py-2 rounded-full text-xs font-bold text-shell-muted hover:text-white sm:min-h-0"
            >
              Cancelar
            </button>
            <button
              onClick={handleClaim}
              disabled={pool.length === 0}
              className="flex-1 min-h-11 px-6 py-2 rounded-full text-xs font-bold text-center bg-brand hover:bg-brand-hover disabled:opacity-40 text-white shadow-lg transition-all cursor-pointer sm:flex-none sm:min-h-0"
            >
              {pool.length ? `Reservar ${effectiveQuantity} questões` : 'Nenhuma questão com esses filtros'}
            </button>
          </div>
        </div>
      </div>
    </fieldset>
  );
};
