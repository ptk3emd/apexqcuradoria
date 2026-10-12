// Records which AIs validated a question by writing one managed sentence at
// the end of the comentário geral, e.g. "Questão verificada por IA: ChatGPT e
// DeepSeek." The sentence is the only state: the buttons read it back, so
// nothing is stored beside the comment.
//
// Curators may also type an AI that is not in the catalogue. Such a name is
// written into the same sentence, so it must not contain the characters or
// the word the sentence uses as separators (see normalizeIaName).
//
// A hand-edited sentence no longer matches and is not recognised; the next
// click then adds a fresh one. That is deliberate: only the text the buttons
// wrote is ever removed.

export const AI_VERIFIERS = [
  { label: 'ChatGPT' },
  { label: 'Claude' },
  { label: 'Gemini' },
  { label: 'Grok' },
  { label: 'DeepSeek' },
  { label: 'Qwen' },
  { label: 'GLM' },
] as const;

export const VERIFICATION_PREFIX = 'Questão verificada por IA: ';
export const MAX_IA_NAME_LENGTH = 30;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches the managed sentence only as the last paragraph of the comment.
const SENTENCE_AT_END = new RegExp(`(^|\\n\\n)${escapeRegExp(VERIFICATION_PREFIX)}([^\\n]*)\\.$`);

export function formatIaList(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

/** Catalogue AIs first, in catalogue order; typed names keep the order they were added. */
function inOrder(labels: readonly string[]): string[] {
  const unique = [...new Set(labels)];
  const catalogue = AI_VERIFIERS.map(v => v.label).filter(label => unique.includes(label));
  const typed = unique.filter(label => !AI_VERIFIERS.some(v => v.label === label));
  return [...catalogue, ...typed];
}

function sentenceFor(labels: readonly string[]): string | null {
  const ordered = inOrder(labels);
  return ordered.length ? `${VERIFICATION_PREFIX}${formatIaList(ordered)}.` : null;
}

/**
 * Checks a name typed by the curator. A name from the catalogue (in any case)
 * returns the catalogue label. Anything else must be a short name that cannot
 * break the sentence: no comma, period, semicolon, colon or line break, and no
 * standalone "e".
 */
export function normalizeIaName(raw: string): {ok: true; label: string} | {ok: false; reason: string} {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return {ok: false, reason: 'Digite o nome da IA.'};
  if (name.length > MAX_IA_NAME_LENGTH) return {ok: false, reason: `Use até ${MAX_IA_NAME_LENGTH} caracteres.`};
  if (/[,;.:\n]/.test(name)) return {ok: false, reason: 'Não use vírgula, ponto, dois-pontos ou ponto e vírgula no nome.'};
  if (/(^|\s)e(\s|$)/i.test(name)) return {ok: false, reason: 'A palavra "e" não pode aparecer no nome.'};
  const known = AI_VERIFIERS.find(v => v.label.toLowerCase() === name.toLowerCase());
  return {ok: true, label: known ? known.label : name};
}

/** Returns the comment with the managed sentence set to exactly `labels`. */
export function applyVerification(comentario: string | null | undefined, labels: readonly string[]): string {
  const current = comentario ?? '';
  const sentence = sentenceFor(labels);
  const trimmed = current.replace(/\s+$/, '');
  const hadSentence = SENTENCE_AT_END.test(trimmed);
  if (!hadSentence && !sentence) return current;

  const body = (hadSentence ? trimmed.replace(SENTENCE_AT_END, '') : trimmed).replace(/\s+$/, '');
  if (!sentence) return body;
  return body ? `${body}\n\n${sentence}` : sentence;
}

/** Reads back the AI names the comment's managed sentence lists, in sentence order. */
export function readVerification(comentario: string | null | undefined): string[] {
  const match = (comentario ?? '').replace(/\s+$/, '').match(SENTENCE_AT_END);
  if (!match) return [];
  return match[2].split(/, | e /).filter(Boolean);
}

/** Flips one AI on or off and returns the updated comment. */
export function toggleVerification(comentario: string | null | undefined, label: string): string {
  const marked = readVerification(comentario);
  const next = marked.includes(label) ? marked.filter(x => x !== label) : [...marked, label];
  return applyVerification(comentario, next);
}

/** Marks an AI typed by the curator. Returns the new comment, or the reason it was refused. */
export function addTypedVerification(comentario: string | null | undefined, raw: string): {comentario: string} | {error: string} {
  const checked = normalizeIaName(raw);
  if (!checked.ok) return {error: checked.reason};
  const marked = readVerification(comentario);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (marked.some(label => same(label, checked.label))) return {comentario: comentario ?? ''};
  return {comentario: applyVerification(comentario, [...marked, checked.label])};
}
