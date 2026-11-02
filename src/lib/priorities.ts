// Curation priorities from public.curation_priorities: P0 and P1 are urgent
// and already assigned; P2 and P3 come later, each with a planned owner.
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];
export const isUrgent = (p?: Priority) => p === 'P0' || p === 'P1';

export interface CurationPriorities {
  of: Map<string, Priority>;
  /** Open public-question quarantines in Apex Medicina, refreshed independently. */
  quarantined?: Set<string>;
  /** Planned owner (curator id) of each prioritized question. */
  plannedFor: Map<string, string>;
  /** Position inside its priority, for a stable order. */
  rank: Map<string, number>;
}

export function buildPriorities(priority: Record<string, string[]>, planned: Record<string, string[]>): CurationPriorities {
  const of = new Map<string, Priority>();
  const rank = new Map<string, number>();
  for (const p of PRIORITIES) (priority[p] ?? []).forEach((id, i) => { of.set(id, p); rank.set(id, i); });
  const plannedFor = new Map<string, string>();
  for (const [curator, ids] of Object.entries(planned)) for (const id of ids) plannedFor.set(id, curator);
  return {of, plannedFor, rank};
}

/** 0 for P0 … 3 for P3, 9 without priority. */
export function priorityIndex(priorities: CurationPriorities | null | undefined, id: string) {
  if (priorities?.quarantined?.has(id)) return -1;
  const p = priorities?.of.get(id);
  return p ? PRIORITIES.indexOf(p) : 9;
}

/** Sort key: quarantine first, then P0, then P1, P2, P3, then questions without priority; by rank, then id. */
export function priorityOrder(priorities: CurationPriorities | null | undefined) {
  return (a: {id: string}, b: {id: string}) => {
    const ia = priorityIndex(priorities, a.id), ib = priorityIndex(priorities, b.id);
    if (ia !== ib) return ia - ib;
    const ra = priorities?.rank.get(a.id) ?? 0, rb = priorities?.rank.get(b.id) ?? 0;
    return ra !== rb ? ra - rb : Number(a.id) - Number(b.id);
  };
}

/** Quarantine always precedes ownership; existing priorities break ties. */
export function reviewOrder<T extends {id: string; status: string; responsavel_id?: string | null}>(
  questions: T[], curatorId: string, priorities: CurationPriorities | null | undefined,
): T[] {
  const byPriority = priorityOrder(priorities);
  const mine = (q: T) => q.status === 'pendente' && q.responsavel_id === curatorId ? 0 : 1;
  return [...questions].sort((a, b) => quarantineOrder(priorities, a.id, b.id) || mine(a) - mine(b) || byPriority(a, b));
}
export function quarantineOrder(priorities: CurationPriorities | null | undefined, a: string, b: string) {
  return Number(Boolean(priorities?.quarantined?.has(b))) - Number(Boolean(priorities?.quarantined?.has(a)));
}
