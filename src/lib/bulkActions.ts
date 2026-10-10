import type { Curator, Question } from '../types/question';

type Mutate = (questions: Question[], action: string, actor: Curator, target?: Curator | null) => Promise<Question[]>;

// Claim the entire selection before saving. Send only the changed fields so
// avoid resending unchanged question text.
export async function reviewSelection(targets: Question[], actor: Curator, mutate: Mutate, confirm: (rows: Question[]) => void) {
  const claimed = await mutate(targets, 'claim', actor);
  confirm(claimed);
  try {
    const saved = await mutate(claimed.map(q => ({
      id: q.id, sync_version: q.sync_version, status: 'revisar_questao',
    } as Question)), 'save', actor);
    confirm(saved);
    return saved;
  } finally {
    await mutate(claimed, 'unlock', actor).catch(() => {});
  }
}

export function canSelectQuestion(q: Question, actor: Curator) {
  return !q.responsavel_id || q.responsavel_id === actor.id;
}
