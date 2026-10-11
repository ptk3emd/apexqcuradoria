import type { Question } from '../types/question';
import {normalizeDifficulty} from './difficulty';

// Writable content columns in public.questions. Generated columns and curation
// metadata live outside this table and must never appear in its SET clause.
export const QUESTION_UPDATE_COLUMNS = [
  'categoria', 'tema_especifico', 'ano', 'origem', 'enunciado',
  'a', 'b', 'c', 'd', 'e', 'correta', 'comentario',
  'justificativa_a', 'justificativa_b', 'justificativa_c', 'justificativa_d', 'justificativa_e',
  'especialidade', 'competencias', 'difficulty_bucket', 'descritores', 'imagem',
] as const;

export function sqlText(value: string | null): string {
  return value === null ? 'NULL' : `E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

export function isCorrectedQuestion(q: Question): boolean {
  // Legacy imports can represent booleans as strings. A string "false" is
  // truthy in JavaScript but must not include an untouched question.
  return q.status === 'questao_corrigida' || q.modificado === true ||
    String(q.modificado).toLowerCase() === 'true';
}

export function generateCorrectedQuestionsSql(questions: Question[]) {
  const byId = new Map<string, Question>();
  for (const q of questions) {
    const key = /^-?\d+$/.test(q.id) ? BigInt(q.id).toString() : q.id;
    const previous = byId.get(key);
    if (!previous || (q.sync_version ?? 0) >= (previous.sync_version ?? 0)) byId.set(key, q);
  }
  const corrected = [...byId.values()].filter(isCorrectedQuestion);
  const errors: string[] = [];
  const statements: {id: bigint; sql: string}[] = [];
  for (const q of corrected) {
    if (!/^-?\d+$/.test(q.id) || BigInt(q.id) < -9223372036854775808n || BigInt(q.id) > 9223372036854775807n) {
      errors.push(`Questão ${q.id}: ID incompatível com bigint.`);
      continue;
    }
    const id = BigInt(q.id);
    const sets: string[] = [];
    for (const column of QUESTION_UPDATE_COLUMNS) {
      let value = q[column] as string | null | undefined;
      // Missing optional values are omitted, preserving database content.
      if (value === undefined) continue;
      if (value !== null) value = String(value);
      if (column === 'difficulty_bucket') {
        try {value = normalizeDifficulty(value) ?? null;} catch {errors.push(`Questão ${q.id}: dificuldade deve ser easy, medium ou hard.`);}
      }
      if (column === 'descritores' && value !== null && Array.from(value).length > 500) {
        errors.push(`Questão ${q.id}: descritores excedem 500 caracteres.`);
      }
      if (column === 'imagem' && value !== null && (Array.from(value).length < 1 || Array.from(value).length > 2048)) {
        errors.push(`Questão ${q.id}: imagem deve conter entre 1 e 2048 caracteres ou NULL.`);
      }
      if (value?.includes('\u0000')) errors.push(`Questão ${q.id}: ${column} contém caractere nulo inválido para PostgreSQL.`);
      sets.push(`  ${column} = ${sqlText(value)}`);
    }
    if (!sets.length) { errors.push(`Questão ${q.id}: nenhum conteúdo disponível para atualizar.`); continue; }
    const body = `DECLARE affected integer;\nBEGIN\n  UPDATE public.questions\nSET\n${sets.join(',\n')}\nWHERE id = ${id};\n  GET DIAGNOSTICS affected = ROW_COUNT;\n  IF affected <> 1 THEN\n    RAISE EXCEPTION 'Questão ${id}: esperado exatamente um registro, encontrado %', affected;\n  END IF;\nEND;`;
    let suffix = 0;
    while (body.includes(`$apex_update_${suffix}$`)) suffix++;
    const delimiter = `$apex_update_${suffix}$`;
    statements.push({id, sql:`DO ${delimiter}\n${body}\n${delimiter};`});
  }
  statements.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // Never offer a partial script while a corrected question cannot be exported.
  const sql = errors.length ? '' : [
    '-- ApexMed — correções de todos os curadores',
    `-- ${statements.length} questões; última versão confirmada de cada ID.`,
    '-- As colunas geradas são recalculadas pelo banco; IDs e datas de criação são preservados.',
    '-- Confira a base de destino: este arquivo contém as últimas correções exportadas, sem controle de versão do destino.',
    'BEGIN;', '', ...statements.map(s => s.sql + '\n'), 'COMMIT;',
  ].join('\n');
  return {sql, count:corrected.length, errors};
}
