import type {Question} from '../types/question';

/**
 * Reads question ids from pasted text: numbers separated by commas, spaces,
 * semicolons or lines, with or without "#" ("#1201, 1202\n1203"). Repeats are
 * dropped and the order kept; leading zeros do not make a different id.
 */
export function parsePastedIds(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(/\d+/g)) {
    const id = match[0].replace(/^0+(?=\d)/, '');
    seen.add(id);
  }
  return [...seen];
}

/** Splits pasted ids into the questions found (in pasted order) and the ids that do not exist. */
export function matchPastedIds(ids: string[], questions: Question[]) {
  const byId = new Map(questions.map(q => [q.id, q]));
  const found: Question[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (q) found.push(q); else missing.push(id);
  }
  return {found, missing};
}
