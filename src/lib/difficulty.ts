export type DifficultyBucket = 'easy' | 'medium' | 'hard';

// Accept legacy labels, but serialize only values permitted by questions.
export function normalizeDifficulty(value: string | null | undefined): DifficultyBucket | null | undefined {
  if (value === undefined || value === null) return value;
  const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return null;
  if (normalized === 'easy' || normalized === 'facil') return 'easy';
  if (normalized === 'medium' || normalized === 'medio' || normalized === 'media') return 'medium';
  if (normalized === 'hard' || normalized === 'dificil') return 'hard';
  throw new Error('Selecione uma dificuldade válida: easy, medium ou hard.');
}
