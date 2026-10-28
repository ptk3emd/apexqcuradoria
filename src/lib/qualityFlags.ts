// Groups of the problem codes curation_quality_flags returns, as the batch
// dialog offers them. A question matches a group when any of its codes does.
export const ISSUE_GROUPS = [
  {key: 'campos', label: 'Partes faltando', hint: 'Enunciado, alternativa, gabarito ou comentário vazio', match: (code: string) => /^falta_(enunciado|[a-e]|correta|comentario)$/.test(code)},
  {key: 'justificativas', label: 'Sem justificativa', hint: 'Alguma alternativa sem justificativa', match: (code: string) => code.startsWith('falta_justificativa_')},
  {key: 'metadados', label: 'Sem classificação', hint: 'Especialidade, tema, origem ou ano vazio', match: (code: string) => /^falta_(especialidade|tema_especifico|origem|ano)$/.test(code)},
  {key: 'justificativa_contradiz', label: 'Gabarito × justificativa', hint: 'Justificativa de outra letra diz ser a correta, ou a do gabarito diz ser incorreta', match: (code: string) => code === 'justificativa_contradiz'},
  {key: 'comentario_contradiz', label: 'Gabarito × comentário', hint: 'O comentário aponta outra letra como resposta', match: (code: string) => code === 'comentario_contradiz'},
  {key: 'gabarito_invalido', label: 'Gabarito inválido', hint: 'Gabarito fora de A–E em questão não anulada', match: (code: string) => code === 'gabarito_invalido'},
  {key: 'alternativas_repetidas', label: 'Alternativas repetidas', hint: 'Duas alternativas com o mesmo texto', match: (code: string) => code === 'alternativas_repetidas'},
] as const;

export type IssueKey = typeof ISSUE_GROUPS[number]['key'];

const MISSING_GROUPS = new Set<IssueKey>(['campos', 'justificativas', 'metadados']);

const FIELD_LABELS: Record<string, string> = {
  enunciado: 'enunciado', correta: 'gabarito', comentario: 'comentário', especialidade: 'especialidade',
  tema_especifico: 'tema', origem: 'origem', ano: 'ano',
};

/** True when the codes hit any selected group; with no group selected, every question matches. */
export function matchesIssues(codes: readonly string[] | undefined, selected: ReadonlySet<IssueKey>): boolean {
  if (!selected.size) return true;
  return Boolean(codes?.some(code => ISSUE_GROUPS.some(group => selected.has(group.key) && group.match(code))));
}

/** Short reason list for one question, e.g. "Gabarito × comentário · falta: b, justificativa C". */
export function describeIssues(codes: readonly string[] | undefined): string {
  if (!codes?.length) return '';
  const missing = codes.filter(code => code.startsWith('falta_')).map(code => {
    const field = code.slice('falta_'.length);
    if (field.startsWith('justificativa_')) return `justificativa ${field.slice(-1).toUpperCase()}`;
    return FIELD_LABELS[field] ?? `alternativa ${field.toUpperCase()}`;
  });
  const other = ISSUE_GROUPS.filter(group => !MISSING_GROUPS.has(group.key) && codes.some(group.match)).map(group => group.label);
  return [...other, ...(missing.length ? [`falta: ${missing.join(', ')}`] : [])].join(' · ');
}
