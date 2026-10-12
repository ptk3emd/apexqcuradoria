import type {Question} from '../types/question';
import {QUESTION_UPDATE_COLUMNS} from './correctedQuestionsSql';

// Concurrent editing: several curators may edit the same question. A save
// sends only the fields its author changed (the server applies only the keys
// in the patch), and a remote save is folded into an open editor field by
// field: untouched fields take the new value, fields the curator is editing
// keep the draft and are flagged when the remote value differs.

export const CONTENT_FIELDS = ['id', 'created_at', 'anulada', ...QUESTION_UPDATE_COLUMNS] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

// Blank, null and missing are the same value; anulada is a boolean that may
// arrive as a string from older snapshots.
function normalize(field: ContentField, value: unknown): string {
  if (field === 'anulada') return value === true || String(value).toLowerCase() === 'true' ? 'true' : 'false';
  return value === undefined || value === null ? '' : String(value);
}

function same(field: ContentField, a: Partial<Question>, b: Partial<Question>): boolean {
  return normalize(field, a[field as keyof Question]) === normalize(field, b[field as keyof Question]);
}

/** Content fields the curator changed since `base`. */
export function changedFields(base: Partial<Question>, draft: Partial<Question>): ContentField[] {
  return CONTENT_FIELDS.filter(field => !same(field, base, draft));
}

/**
 * Folds a newer `remote` version into an open draft. Fields the curator did
 * not touch take the remote value. Fields the curator changed keep the draft;
 * they are reported in `conflicts` when the remote value also changed and
 * differs from the draft. The returned `base` is the remote version.
 */
export function mergeRemote(base: Question, draft: Question, remote: Question): {draft: Question; base: Question; conflicts: ContentField[]} {
  const next: Question = {...draft, sync_version: remote.sync_version};
  const conflicts: ContentField[] = [];
  for (const field of CONTENT_FIELDS) {
    if (field === 'id') continue;
    const key = field as keyof Question;
    const touched = !same(field, base, draft);
    if (!touched) (next as any)[key] = remote[key];
    else if (!same(field, base, remote) && !same(field, draft, remote)) conflicts.push(field);
  }
  // Curation metadata always follows the server.
  for (const key of ['status', 'responsavel_id', 'responsavel_nome', 'revisado_por', 'revisado_em', 'notas_revisao', 'modificado', 'shared_comments', 'ano_int', 'competencias_normalized'] as const) {
    (next as any)[key] = remote[key];
  }
  return {draft: next, base: {...remote}, conflicts};
}
