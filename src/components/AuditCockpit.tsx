import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Target, Wand2 } from 'lucide-react';
import { Question, Curator } from '../types/question';
import { fetchCurationActivity, saveCurationGoals } from '../lib/supabaseCuration';
import { CurationActivity, CuratorPace, computePace, formatDay, daysBetween } from '../lib/curationPace';
import { describeError } from '../lib/errorMessage';
import { BurndownChart, DailyBars } from './stats/PaceCharts';
import type { CurationPriorities } from '../lib/priorities';
import type { Phase } from '../lib/curationPace';

interface AuditCockpitProps {
  questions: Question[];
  curators: Curator[];
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onOpenQuestionById: (id: string) => void;
  priorities?: CurationPriorities | null;
}

const STATUS_SEGMENTS = [
  { status: 'aprovadas', label: 'Aprovadas', className: 'bg-emerald-500' },
  { status: 'questao_corrigida', label: 'Corrigidas', className: 'bg-blue-500' },
  { status: 'revisar_questao', label: 'Revisar', className: 'bg-amber-500' },
  { status: 'eliminar_questao', label: 'Eliminar', className: 'bg-rose-500' },
  { status: 'pendente', label: 'Pendentes', className: 'bg-white/20' },
] as const;

const PACE_STATUS = {
  em_dia: { label: 'Em dia', Icon: CheckCircle2, className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  atrasado: { label: 'Atrasado', Icon: AlertTriangle, className: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  sem_meta: { label: 'Sem meta', Icon: CircleDashed, className: 'text-apex-readable bg-white/[0.04] border-white/[0.1]' },
} as const;

const fmt = (n: number, digits = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const AuditCockpit: React.FC<AuditCockpitProps> = ({ questions, curators, onOpenQuestionById, onShowToast, priorities }) => {
  const [activity, setActivity] = useState<CurationActivity | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [error, setError] = useState('');

  const audited = questions.filter(q => q.status !== 'pendente').length;
  const load = useCallback((signal?: AbortSignal) => {
    fetchCurationActivity(signal)
      .then(result => { setActivity(result); setState(result ? 'ready' : 'unavailable'); })
      .catch(err => { if ((err as Error).name !== 'AbortError') { setError(describeError(err)); setState('error'); } });
  }, []);
  // Reload when an audit lands, so today's numbers follow the team.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, audited]);

  const pace = useMemo(() => activity ? computePace(activity, curators, questions, priorities) : null, [activity, curators, questions, priorities]);
  const total = questions.length;
  const pct = total ? (audited / total) * 100 : 0;

  const statusCounts = useMemo(() => STATUS_SEGMENTS.map(seg => ({ ...seg, value: questions.filter(q => q.status === seg.status).length })), [questions]);
  const specialties = useMemo(() => {
    const map = new Map<string, { total: number; audited: number }>();
    for (const q of questions) {
      const name = q.especialidade || q.categoria || 'Sem especialidade';
      const entry = map.get(name) ?? { total: 0, audited: 0 };
      entry.total++;
      if (q.status !== 'pendente') entry.audited++;
      map.set(name, entry);
    }
    return [...map].map(([name, v]) => ({ name, ...v, pct: v.total ? (v.audited / v.total) * 100 : 0 })).sort((a, b) => b.total - a.total);
  }, [questions]);

  return (
    <div className="w-full space-y-10 pb-10">
      <ForecastHero
        total={total} audited={audited} pct={pct} pace={pace} state={state} error={error}
        onRetry={() => { setState('loading'); load(); }}
      />

      {pace && activity && (
        <>
          <AuditorLanes pace={pace.curators} today={activity.today} onOpenQuestionById={onOpenQuestionById} />
          <BehindList pace={pace.curators} onOpenQuestionById={onOpenQuestionById} />
          <GoalsEditor
            activity={activity} curators={curators} requiredPerDay={Math.max(pace.team.requiredPerDay ?? 0, pace.team.phases?.urgent.requiredPerDay ?? 0, pace.team.phases?.rest.requiredPerDay ?? 0) || null}
            onSaved={goals => setActivity(prev => prev ? { ...prev, goals } : prev)}
            onShowToast={onShowToast}
          />
        </>
      )}

      <section aria-labelledby="base-title" className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <h2 id="base-title" className="text-lg font-bold text-apex-text">Situação do banco</h2>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.06]" role="img"
            aria-label={statusCounts.map(s => `${s.label}: ${s.value}`).join(', ')}>
            {total > 0 && statusCounts.map(s => <div key={s.status} className={`${s.className} h-full border-r-2 border-shell last:border-r-0`} style={{ width: `${(s.value / total) * 100}%` }} />)}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {statusCounts.map(s => (
              <div key={s.status}>
                <dt className="flex items-center gap-2 text-xs text-apex-readable"><span className={`h-2 w-2 rounded-full ${s.className}`} aria-hidden="true" />{s.label}</dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums text-apex-text">{fmt(s.value)} <span className="text-xs font-normal text-shell-muted">{total ? fmt((s.value / total) * 100) : 0}%</span></dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-apex-text">Progresso por especialidade</h2>
          <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
            {specialties.map(s => (
              <li key={s.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-xs">
                <span className="truncate font-bold text-apex-text">{s.name}</span>
                <span className="tabular-nums text-apex-readable">{fmt(s.audited)} / {fmt(s.total)} · <span className="font-bold text-apex-text">{fmt(s.pct)}%</span></span>
                <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-brand-soft" style={{ width: `${s.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};

function ForecastHero({ total, audited, pct, pace, state, error, onRetry }: {
  total: number; audited: number; pct: number; pace: ReturnType<typeof computePace> | null;
  state: 'loading' | 'ready' | 'unavailable' | 'error'; error: string; onRetry: () => void;
}) {
  const team = pace?.team;
  const today = pace?.days.at(-1) ?? '';
  const late = team?.eta && team.deadline ? daysBetween(team.deadline, team.eta) : null;
  return (
    <section aria-labelledby="forecast-title" className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div className="space-y-3">
          <h1 id="forecast-title" className="text-[clamp(2rem,5vw,3.75rem)] font-bold leading-[1.02] tracking-[-0.03em] text-apex-text text-balance">
            {!team ? <>Curadoria: <span className="tabular-nums text-brand-soft">{fmt(pct)}%</span> do banco auditado</>
              : team.pending === 0 ? <>Banco <span className="text-emerald-300">completo</span>.</>
              : team.eta ? <>Banco completo em <span className="text-brand-soft">{formatDay(team.eta, today)}</span></>
              : <>Sem ritmo para prever o fim do banco</>}
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-apex-readable">
            <span className="font-bold tabular-nums text-apex-text">{fmt(audited)}</span> de {fmt(total)} questões auditadas ({fmt(pct, 1)}%).
            {team && team.pending > 0 && <> Faltam <span className="font-bold tabular-nums text-apex-text">{fmt(team.pending)}</span>{team.avg14 > 0 ? <>, no ritmo da equipe nos últimos 14 dias: <span className="font-bold tabular-nums text-apex-text">{fmt(team.avg14, 1)}</span> por dia.</> : '. Nenhuma auditoria nos últimos 14 dias.'}</>}
          </p>
        </div>
        {team && team.deadline && team.pending > 0 && (
          <div className={`rounded-2xl border p-5 ${team.onTrack ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]'}`}>
            <p className={`flex items-center gap-2 text-sm font-bold ${team.onTrack ? 'text-emerald-300' : 'text-amber-300'}`}>
              {team.onTrack ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              {team.onTrack ? 'No prazo' : late !== null && late > 0 ? `${fmt(late)} dias depois do prazo` : 'Abaixo do ritmo do prazo'}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-4">
              <div><dt className="text-xs text-apex-readable">Prazo</dt><dd className="mt-0.5 text-lg font-bold text-apex-text">{formatDay(team.deadline, today)}</dd></div>
              <div><dt className="text-xs text-apex-readable">Precisa por dia</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-apex-text">{fmt(team.requiredPerDay ?? 0)}</dd></div>
              <div><dt className="text-xs text-apex-readable">Ritmo atual</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-apex-text">{fmt(team.avg14, 1)}</dd></div>
            </dl>
          </div>
        )}
      </div>

      {team?.phases && <PhasePlan phases={team.phases} today={today} avg={team.avg14} />}

      {pace && team ? (
        <div className="rounded-2xl border border-white/[0.08] bg-shell-2 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-apex-readable">
            <span className="flex items-center gap-2"><span className="h-0.5 w-5 rounded bg-brand-soft" aria-hidden="true" />Pendentes (reconstruído pelas auditorias)</span>
            {team.eta && team.pending > 0 && <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dotted border-brand-soft" aria-hidden="true" />Projeção no ritmo atual</span>}
            {team.deadline && <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-amber-400" aria-hidden="true" />Ritmo do prazo</span>}
          </div>
          <BurndownChart points={team.burndown} today={today} eta={team.eta} deadline={team.deadline} />
        </div>
      ) : (
        <p role="status" className="rounded-2xl border border-white/[0.08] bg-shell-2 p-5 text-sm text-apex-readable">
          {state === 'loading' ? 'Carregando o histórico de auditorias…'
            : state === 'unavailable' ? 'O histórico de ritmo e as metas precisam da migração 20261028200000 no Supabase. A situação do banco abaixo já está atualizada.'
            : <>Não foi possível carregar o histórico ({error}). <button type="button" onClick={onRetry} className="font-bold text-apex-text underline underline-offset-4">Tentar de novo</button></>}
        </p>
      )}
    </section>
  );
}

function AuditorLanes({ pace, today, onOpenQuestionById }: { pace: CuratorPace[]; today: string; onOpenQuestionById: (id: string) => void }) {
  // One scale for every lane, so a taller bar always means more questions.
  const yMax = Math.max(5, ...pace.flatMap(c => [c.goal, ...c.series.map(d => d.audited)]));
  return (
    <section aria-labelledby="lanes-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="lanes-title" className="text-lg font-bold text-apex-text">Ritmo por auditor</h2>
        <p className="text-xs text-apex-readable">Questões auditadas por dia, últimos 30 dias. Barras mais claras ficaram abaixo da meta.</p>
      </div>
      <ol className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-shell-2">
        {pace.map(c => {
          const status = PACE_STATUS[c.status];
          return (
            <li key={c.curator.id} className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-center lg:gap-8">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.curator.avatarCor }} aria-hidden="true" />
                  <h3 className="text-base font-bold text-apex-text">{c.curator.nome}</h3>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${status.className}`}>
                    <status.Icon className="h-3.5 w-3.5" aria-hidden="true" />{status.label}
                  </span>
                </div>
                <dl className="grid grid-cols-4 gap-3">
                  <div><dt className="text-[11px] text-apex-readable">Hoje</dt><dd className="text-lg font-bold tabular-nums text-apex-text">{fmt(c.today)}{c.goal > 0 && <span className="text-xs font-normal text-shell-muted">/{c.goal}</span>}</dd></div>
                  <div><dt className="text-[11px] text-apex-readable">Média 7d</dt><dd className="text-lg font-bold tabular-nums text-apex-text">{fmt(c.avg7, 1)}</dd></div>
                  <div><dt className="text-[11px] text-apex-readable">Auditadas</dt><dd className="text-lg font-bold tabular-nums text-apex-text">{fmt(c.total)}</dd></div>
                  <div><dt className="text-[11px] text-apex-readable">Na fila</dt><dd className="text-lg font-bold tabular-nums text-apex-text">
                    {c.assignedPending.length ? <button type="button" onClick={() => onOpenQuestionById(c.assignedPending[0].id)} className="underline decoration-white/20 underline-offset-4 hover:decoration-white" title="Abrir a primeira questão da fila">{fmt(c.assignedPending.length)}</button> : 0}
                  </dd></div>
                </dl>
              </div>
              {(c.urgentPending > 0 || c.plannedPending > 0) && (
                <p className="text-xs text-apex-readable lg:col-start-1">
                  <span className="font-bold text-apex-text">P0/P1:</span> <span className="tabular-nums font-bold text-apex-text">{fmt(c.urgentPending)}</span> pendentes{c.urgentPending > 0 && (c.urgentEta ? <> · terminam em {formatDay(c.urgentEta, today)} no ritmo de 7 dias</> : ' · sem ritmo para prever')}
                  <span className="mx-2 text-shell-subtle" aria-hidden="true">•</span>
                  <span className="font-bold text-apex-text">P2/P3 previstas:</span> <span className="tabular-nums">{fmt(c.plannedPending)}</span>
                </p>
              )}
              <DailyBars series={c.series} goal={c.goal} color={c.curator.avatarCor} yMax={yMax} today={today} label={c.curator.nome} />
            </li>
          );
        })}
      </ol>
      <details className="text-xs text-apex-readable">
        <summary className="cursor-pointer select-none font-bold text-apex-text">Ver em tabela</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead><tr className="text-apex-readable"><th className="py-1 pr-4 font-bold">Dia</th>{pace.map(c => <th key={c.curator.id} className="py-1 pr-4 font-bold">{c.curator.nome}</th>)}</tr></thead>
            <tbody>
              {pace[0]?.series.map((d, i) => (
                <tr key={d.day} className="border-t border-white/[0.05]"><td className="py-1 pr-4">{formatDay(d.day, today)}</td>{pace.map(c => <td key={c.curator.id} className="py-1 pr-4 text-apex-text">{c.series[i].audited}</td>)}</tr>
              )).reverse()}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function BehindList({ pace, onOpenQuestionById }: { pace: CuratorPace[]; onOpenQuestionById: (id: string) => void }) {
  const behind = pace.filter(c => c.status === 'atrasado').sort((a, b) => b.deficit7 - a.deficit7);
  const withGoal = pace.filter(c => c.status !== 'sem_meta');
  return (
    <section aria-labelledby="behind-title" className="space-y-4">
      <h2 id="behind-title" className="text-lg font-bold text-apex-text">Atraso da semana</h2>
      {!withGoal.length ? (
        <p className="text-sm text-apex-readable">Defina metas diárias abaixo para acompanhar quem está em dia.</p>
      ) : !behind.length ? (
        <p className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Todos com meta estão em dia nos últimos 7 dias.</p>
      ) : (
        <ul className="space-y-3">
          {behind.map(c => (
            <li key={c.curator.id} className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-apex-text"><span className="font-bold">{c.curator.nome}</span> fez <span className="font-bold tabular-nums">{fmt(c.last7)}</span> de <span className="tabular-nums">{fmt(c.goal * 7)}</span> na semana: faltam <span className="font-bold tabular-nums text-amber-300">{fmt(c.deficit7)}</span>.</p>
                <p className="mt-0.5 text-xs text-apex-readable">Para recuperar em 7 dias: <span className="font-bold tabular-nums text-apex-text">{fmt(Math.ceil(c.goal + c.deficit7 / 7))}</span> por dia.</p>
              </div>
              {c.assignedPending.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label={`Próximas questões de ${c.curator.nome}`}>
                  {c.assignedPending.slice(0, 5).map(q => (
                    <button key={q.id} type="button" onClick={() => onOpenQuestionById(q.id)} className="min-h-9 rounded-full border border-white/[0.12] px-3 text-xs font-bold tabular-nums text-apex-text hover:border-white/[0.3]">#{q.id}</button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GoalsEditor({ activity, curators, requiredPerDay, onSaved, onShowToast }: {
  activity: CurationActivity; curators: Curator[]; requiredPerDay: number | null;
  onSaved: (goals: CurationActivity['goals']) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [daily, setDaily] = useState<Record<string, string>>(() => Object.fromEntries(curators.map(c => [c.id, String(activity.goals.daily?.[c.id] ?? '')])));
  const [deadline, setDeadline] = useState(activity.goals.deadline ?? '');
  const [deadlinePriority, setDeadlinePriority] = useState(activity.goals.deadline_priority ?? '');
  const datesInvalid = Boolean(deadlinePriority && deadline && deadlinePriority > deadline);
  const [saving, setSaving] = useState(false);
  const invalid = curators.some(c => daily[c.id] !== '' && !/^\d{1,4}$/.test(daily[c.id]) || Number(daily[c.id]) > 1000);

  const suggest = () => {
    if (!requiredPerDay) return;
    const each = Math.ceil(requiredPerDay / Math.max(1, curators.length));
    setDaily(Object.fromEntries(curators.map(c => [c.id, String(each)])));
  };
  const save = async () => {
    setSaving(true);
    try {
      const goals = await saveCurationGoals(Object.fromEntries(curators.map(c => [c.id, Number(daily[c.id] || 0)])), deadline || null, deadlinePriority || null);
      onSaved(goals);
      onShowToast('Metas salvas', 'Todos os curadores veem as mesmas metas.', 'success');
    } catch (err) {
      onShowToast('Metas não salvas', describeError(err), 'error');
    } finally { setSaving(false); }
  };

  return (
    <section aria-labelledby="goals-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="goals-title" className="flex items-center gap-2 text-lg font-bold text-apex-text"><Target className="h-5 w-5 text-brand-soft" aria-hidden="true" />Metas da equipe</h2>
        {activity.goals.updated_by && activity.goals.updated_at && (
          <p className="text-xs text-apex-readable">Atualizadas por {activity.goals.updated_by} em {new Date(activity.goals.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
        )}
      </div>
      <fieldset disabled={saving} className="grid grid-cols-2 gap-4 rounded-2xl border border-white/[0.08] bg-shell-2 p-4 sm:grid-cols-4 sm:p-5 lg:grid-cols-[repeat(3,minmax(0,9rem))_repeat(2,minmax(0,11rem))_1fr] lg:items-end">
        {curators.map(c => (
          <label key={c.id} className="space-y-1.5">
            <span className="flex items-center gap-2 text-xs font-bold text-apex-text"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.avatarCor }} aria-hidden="true" />{c.nome} · por dia</span>
            <input type="number" inputMode="numeric" min={0} max={1000} value={daily[c.id]} placeholder="0"
              onChange={e => setDaily(prev => ({ ...prev, [c.id]: e.target.value }))}
              className="w-full min-h-11 rounded-xl border border-white/[0.1] bg-shell-3 px-3 text-sm font-bold tabular-nums text-apex-text outline-none focus:border-brand" />
          </label>
        ))}
        <label className="space-y-1.5">
          <span className="text-xs font-bold text-apex-text">Prazo P0/P1</span>
          <input type="date" value={deadlinePriority} onChange={e => setDeadlinePriority(e.target.value)}
            className="w-full min-h-11 rounded-xl border border-white/[0.1] bg-shell-3 px-3 text-sm text-apex-text outline-none focus:border-brand [color-scheme:dark]" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-bold text-apex-text">Prazo do banco</span>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="w-full min-h-11 rounded-xl border border-white/[0.1] bg-shell-3 px-3 text-sm text-apex-text outline-none focus:border-brand [color-scheme:dark]" />
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-4 lg:col-span-1 lg:justify-end">
          {requiredPerDay ? (
            <button type="button" onClick={suggest} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.12] px-4 text-xs font-bold text-apex-text hover:border-white/[0.3]" title={`Divide as ${requiredPerDay} questões por dia que o prazo pede entre ${curators.length} curadores`}>
              <Wand2 className="h-4 w-4" aria-hidden="true" />Dividir o que o prazo pede
            </button>
          ) : null}
          <button type="button" onClick={() => void save()} disabled={invalid || datesInvalid} className="min-h-11 rounded-full bg-brand px-5 text-xs font-bold text-white hover:bg-brand-hover disabled:opacity-40">
            {saving ? 'Salvando…' : 'Salvar metas'}
          </button>
        </div>
      </fieldset>
      {invalid && <p role="alert" className="text-xs text-amber-300">Use números inteiros de 0 a 1000.</p>}
      {datesInvalid && <p role="alert" className="text-xs text-amber-300">O prazo de P0/P1 precisa vir antes do prazo do banco.</p>}
    </section>
  );
}

/** P0/P1 first, then P2/P3 and the rest: forecast and deadline of each stage. */
function PhasePlan({ phases, today, avg }: { phases: { urgent: Phase; rest: Phase }; today: string; avg: number }) {
  const card = (title: string, hint: string, phase: Phase) => {
    const done = phase.total ? ((phase.total - phase.pending) / phase.total) * 100 : 100;
    return (
      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-shell-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold text-apex-text">{title}</h3>
          {phase.onTrack !== null && phase.pending > 0 && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${phase.onTrack ? 'text-emerald-300' : 'text-amber-300'}`}>
              {phase.onTrack ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              {phase.onTrack ? 'No prazo' : 'Abaixo do ritmo do prazo'}
            </span>
          )}
        </div>
        <p className="text-xs text-apex-readable">{hint}</p>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-brand-soft" style={{ width: `${done}%` }} /></div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><dt className="text-[11px] text-apex-readable">Faltam</dt><dd className="text-lg font-bold tabular-nums text-apex-text">{fmt(phase.pending)}<span className="text-xs font-normal text-shell-muted"> / {fmt(phase.total)}</span></dd></div>
          <div><dt className="text-[11px] text-apex-readable">Previsão</dt><dd className="text-lg font-bold text-apex-text">{phase.pending === 0 ? 'Concluída' : phase.eta ? formatDay(phase.eta, today) : '—'}</dd></div>
          <div><dt className="text-[11px] text-apex-readable">Prazo</dt><dd className="text-lg font-bold text-apex-text">{phase.deadline ? formatDay(phase.deadline, today) : '—'}</dd></div>
          <div><dt className="text-[11px] text-apex-readable">Precisa por dia</dt><dd className="text-lg font-bold tabular-nums text-apex-text">{phase.requiredPerDay !== null ? fmt(phase.requiredPerDay) : '—'}</dd></div>
        </dl>
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-apex-readable">Plano em duas fases: a equipe termina as P0/P1 (já divididas) antes de seguir para as P2/P3, sorteadas entre os três. Ritmo atual da equipe: <span className="font-bold tabular-nums text-apex-text">{fmt(avg, 1)}</span> por dia.</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {card('Fase 1 · P0 e P1', 'Alta prioridade: atribuídas a Patrick, Thierry e Lucas.', phases.urgent)}
        {card('Fase 2 · P2, P3 e demais', 'Depois da fase 1. P2/P3 já têm responsável previsto por sorteio.', phases.rest)}
      </div>
    </div>
  );
}
