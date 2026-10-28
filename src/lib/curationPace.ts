import type {Curator, Question} from '../types/question';

// Shape returned by public.curation_activity (migration 20261028200000).
export interface CurationActivity {
  today: string; // YYYY-MM-DD, São Paulo
  daily: {day: string; curator: string; audited: number}[];
  totals: Record<string, number>;
  goals: {daily: Record<string, number>; deadline: string | null; updated_by?: string | null; updated_at?: string | null};
}

export type PaceStatus = 'em_dia' | 'atrasado' | 'sem_meta';

export interface CuratorPace {
  curator: Curator;
  series: {day: string; audited: number}[]; // oldest first, one entry per calendar day
  today: number;
  last7: number;
  avg7: number;
  avg14: number;
  total: number;
  goal: number;
  status: PaceStatus;
  /** Questions short of the goal over the last 7 days (0 when on track). */
  deficit7: number;
  assignedPending: Question[];
}

export interface TeamPace {
  pending: number;
  audited: number;
  total: number;
  avg14: number;
  goalPerDay: number;
  /** Day the base is done at the 14-day pace; null without pace. */
  eta: string | null;
  deadline: string | null;
  daysToDeadline: number | null;
  /** Questions per day needed to finish by the deadline. */
  requiredPerDay: number | null;
  onTrack: boolean | null;
  /** Pending questions at the end of each day, rebuilt from the audits after it. */
  burndown: {day: string; pending: number}[];
}

const DAY = 86_400_000;
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function computePace(activity: CurationActivity, curators: Curator[], questions: Question[], windowDays = 30) {
  const days = Array.from({length: windowDays}, (_, i) => addDays(activity.today, i - windowDays + 1));
  const byKey = new Map(activity.daily.map(d => [`${d.curator}|${d.day}`, d.audited]));
  const sumLast = (series: {audited: number}[], n: number) => series.slice(-n).reduce((s, d) => s + d.audited, 0);

  const curatorPace: CuratorPace[] = curators.map(curator => {
    const series = days.map(day => ({day, audited: byKey.get(`${curator.id}|${day}`) ?? 0}));
    const goal = Math.max(0, Math.round(Number(activity.goals.daily?.[curator.id]) || 0));
    const last7 = sumLast(series, 7);
    const avg7 = last7 / 7;
    const deficit7 = goal ? Math.max(0, goal * 7 - last7) : 0;
    return {
      curator, series, goal, last7, avg7, deficit7,
      today: series.at(-1)?.audited ?? 0,
      avg14: sumLast(series, 14) / 14,
      total: activity.totals[curator.id] ?? 0,
      status: !goal ? 'sem_meta' : avg7 >= goal ? 'em_dia' : 'atrasado',
      assignedPending: questions
        .filter(q => q.responsavel_id === curator.id && q.status === 'pendente')
        .sort((a, b) => Number(a.id) - Number(b.id)),
    };
  });

  const pending = questions.filter(q => q.status === 'pendente').length;
  const teamDaily = days.map(day => curatorPace.reduce((s, c) => s + (c.series.find(d => d.day === day)?.audited ?? 0), 0));
  const avg14 = teamDaily.slice(-14).reduce((s, n) => s + n, 0) / 14;
  const goalPerDay = curatorPace.reduce((s, c) => s + c.goal, 0);
  const deadline = activity.goals.deadline || null;
  const daysToDeadline = deadline ? Math.max(0, daysBetween(activity.today, deadline)) : null;
  const requiredPerDay = daysToDeadline === null ? null : pending === 0 ? 0 : daysToDeadline === 0 ? pending : Math.ceil(pending / daysToDeadline);
  const eta = pending === 0 ? activity.today : avg14 > 0 ? addDays(activity.today, Math.ceil(pending / avg14)) : null;

  // Walking back from today: the base had what is pending now plus what was audited since.
  let later = 0;
  const burndown = days.map((day, i) => ({day, i})).reverse().map(({day, i}) => {
    const point = {day, pending: pending + later};
    later += teamDaily[i];
    return point;
  }).reverse();

  const team: TeamPace = {
    pending, total: questions.length, audited: questions.length - pending, avg14, goalPerDay, eta, deadline, daysToDeadline, requiredPerDay,
    onTrack: requiredPerDay === null ? null : avg14 >= requiredPerDay,
    burndown,
  };
  return {curators: curatorPace, team, days};
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "12 dez 2026" (year only when it differs from `today`). */
export function formatDay(day: string, today?: string) {
  const [y, m, d] = day.split('-').map(Number);
  const showYear = !today || today.slice(0, 4) !== day.slice(0, 4);
  return `${d} ${MONTHS[m - 1]}${showYear ? ` ${y}` : ''}`;
}
