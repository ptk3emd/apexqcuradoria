import type {Question} from '../types/question';
import {isCorrectedQuestion} from './correctedQuestionsSql';
import type {SqlState} from './supabaseCuration';

export type ExportRecord = SqlState['exported'][number];

/** A correction is done when its current version was exported; a newer version is pending again. */
export function splitCorrections(questions: Question[], exported: ExportRecord[]) {
  const done = new Set(exported.map(e => `${e.id}|${e.version}`));
  const corrected = questions.filter(isCorrectedQuestion);
  const pending = corrected.filter(q => !done.has(`${q.id}|${q.sync_version ?? 0}`));
  return {corrected, pending, exportedCount: corrected.length - pending.length};
}

export interface ExportGroup { key: string; batch: string; by: string; at: string; items: ExportRecord[] }

/** History: one entry per batch marked, newest first. */
export function exportHistory(exported: ExportRecord[]): ExportGroup[] {
  const groups = new Map<string, ExportGroup>();
  for (const e of exported) {
    const key = `${e.batch ?? ''}|${e.by}|${e.at.slice(0, 16)}`;
    const g = groups.get(key) ?? {key, batch: e.batch ?? 'Sem nome', by: e.by, at: e.at, items: []};
    g.items.push(e);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Numbers of the batches marked as migrated ("Lote 3 · 29/10/2026" → 3). */
export function usedBatchNumbers(exported: ExportRecord[]): number[] {
  return [...new Set(exported.map(e => Number(/^Lote (\d+)/.exec(e.batch ?? '')?.[1])).filter(n => n > 0))];
}
