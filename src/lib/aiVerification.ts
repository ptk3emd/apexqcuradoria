// Records which AIs validated a question by writing one managed sentence at
// the end of the comentário geral, e.g. "Questão verificada por IA: ChatGPT e
// Claude." The sentence is the only state: the buttons read it back, so
// nothing is stored beside the comment.
//
// A hand-edited sentence no longer matches and is not recognised; the next
// click then adds a fresh one. That is deliberate: only the text the buttons
// wrote is ever removed.

export const AI_VERIFIERS = [
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'grok', label: 'Grok' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'glm', label: 'GLM' },
] as const;

export type AiVerifierId = (typeof AI_VERIFIERS)[number]['id'];

export const VERIFICATION_PREFIX = 'Questão verificada por IA: ';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches the managed sentence only as the last paragraph of the comment.
const SENTENCE_AT_END = new RegExp(`(^|\\n\\n)${escapeRegExp(VERIFICATION_PREFIX)}([^\\n]*)\\.$`);

export function formatIaList(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function sentenceFor(ids: readonly string[]): string | null {
  const labels = AI_VERIFIERS.filter(v => ids.includes(v.id)).map(v => v.label);
  return labels.length ? `${VERIFICATION_PREFIX}${formatIaList(labels)}.` : null;
}

/** Returns the comment with the managed sentence set to exactly `ids` (catalogue order). */
export function applyVerification(comentario: string | null | undefined, ids: readonly string[]): string {
  const current = comentario ?? '';
  const sentence = sentenceFor(ids);
  const trimmed = current.replace(/\s+$/, '');
  const hadSentence = SENTENCE_AT_END.test(trimmed);
  if (!hadSentence && !sentence) return current;

  const body = (hadSentence ? trimmed.replace(SENTENCE_AT_END, '') : trimmed).replace(/\s+$/, '');
  if (!sentence) return body;
  return body ? `${body}\n\n${sentence}` : sentence;
}

/** Reads back which AIs the comment's managed sentence names. */
export function readVerification(comentario: string | null | undefined): AiVerifierId[] {
  const match = (comentario ?? '').replace(/\s+$/, '').match(SENTENCE_AT_END);
  if (!match) return [];
  const names = match[2].split(/, | e /);
  return AI_VERIFIERS.filter(v => names.includes(v.label)).map(v => v.id);
}

/** Flips one AI on or off and returns the updated comment. */
export function toggleVerification(comentario: string | null | undefined, id: AiVerifierId): string {
  const marked = readVerification(comentario);
  const next = marked.includes(id) ? marked.filter(x => x !== id) : [...marked, id];
  return applyVerification(comentario, next);
}
