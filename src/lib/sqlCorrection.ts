import type {Question} from '../types/question';

// Reads a correction script written for the Supabase SQL Editor (an
// `UPDATE public.questions SET ... WHERE ...`, optionally inside a DO block
// with DECLARE variables and IF ... RAISE EXCEPTION guards) and turns it into
// field changes for the open question. Nothing is executed: the script is
// checked against the question and the editor is filled for the curator to
// review and save through the normal, audited save.

/** Columns a save may change (the allowed list of curation_mutate). */
export const CORRECTABLE_FIELDS = ['categoria', 'tema_especifico', 'ano', 'origem', 'enunciado', 'a', 'b', 'c', 'd', 'e', 'correta', 'comentario',
  'justificativa_a', 'justificativa_b', 'justificativa_c', 'justificativa_d', 'justificativa_e', 'especialidade', 'competencias',
  'difficulty_bucket', 'descritores', 'anulada', 'referencias', 'imagem', 'imagem_legenda'] as const;
const COLUMNS = new Set<string>([...CORRECTABLE_FIELDS, 'id']);

type Value = string | number | boolean | null;
type Token = {kind: 'word' | 'string' | 'number' | 'symbol'; text: string; value?: Value};

export interface Guard {
  /** As written, e.g. "lower(btrim(correta)) = 'a'". */
  text: string;
  /** null when the condition has a form this reader does not evaluate. */
  passes: boolean | null;
}
export interface Block { variable: string; message: string }
export interface ParsedCorrection {
  changes: Partial<Record<(typeof CORRECTABLE_FIELDS)[number], string | boolean | null>>;
  guards: Guard[];
  /** IF NOT <flag> THEN RAISE ... with the flag false: the author asked for a manual confirmation. */
  blocks: Block[];
  targetId: string | null;
  errors: string[];
}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (sql.startsWith('--', i)) { const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end; continue; }
    if (sql.startsWith('/*', i)) { const end = sql.indexOf('*/', i + 2); i = end < 0 ? sql.length : end + 2; continue; }
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end < 0) throw new Error(`Texto entre ${tag} sem fechamento.`);
      const body = sql.slice(i + tag.length, end);
      // The DO block body is SQL itself: read inside it rather than as a string.
      if (tag === '$$') tokens.push(...tokenize(body));
      else tokens.push({kind: 'string', text: tag, value: body.replace(/^\r?\n/, '').replace(/\r?\n$/, '')});
      i = end + tag.length;
      continue;
    }
    if (c === "'" || ((c === 'E' || c === 'e') && sql[i + 1] === "'")) {
      const escaped = c !== "'";
      let j = i + (escaped ? 2 : 1);
      let out = '';
      for (;;) {
        if (j >= sql.length) throw new Error('Texto entre aspas sem fechamento.');
        const ch = sql[j];
        if (ch === "'" && sql[j + 1] === "'") { out += "'"; j += 2; continue; }
        if (ch === "'") { j++; break; }
        if (escaped && ch === '\\' && j + 1 < sql.length) {
          const next = sql[j + 1];
          out += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
          j += 2; continue;
        }
        out += ch; j++;
      }
      tokens.push({kind: 'string', text: sql.slice(i, j), value: out});
      i = j;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(sql.slice(i));
    if (num && !/[A-Za-z_]/.test(sql[i - 1] ?? '')) { tokens.push({kind: 'number', text: num[0], value: Number(num[0])}); i += num[0].length; continue; }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i));
    if (word) { tokens.push({kind: 'word', text: word[0]}); i += word[0].length; continue; }
    const sym = /^(:=|<>|!=|<=|>=|::)/.exec(sql.slice(i));
    tokens.push({kind: 'symbol', text: sym ? sym[0] : c});
    i += sym ? sym[0].length : 1;
  }
  return tokens;
}

const lower = (t?: Token) => (t?.kind === 'word' ? t.text.toLowerCase() : '');
const isWord = (t: Token | undefined, w: string) => lower(t) === w;
const render = (tokens: Token[]) => tokens.map(t => t.kind === 'string' ? (t.text.startsWith('$') ? `${t.text}…${t.text}` : t.text) : t.text)
  .join(' ').replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/\s*,\s*/g, ', ').replace(/\s*\.\s*/g, '.');

/** Splits tokens on a top-level word or symbol (outside parentheses). */
function splitTop(tokens: Token[], at: (t: Token) => boolean): Token[][] {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.text === '(') depth++;
    if (t.text === ')') depth--;
    if (depth === 0 && at(t)) { parts.push([]); continue; }
    parts.at(-1)!.push(t);
  }
  return parts.filter(p => p.length);
}

function literal(tokens: Token[], vars: Map<string, Value>): {ok: true; value: Value} | {ok: false} {
  // A trailing cast (::text) changes nothing for these columns.
  const cut = tokens.findIndex(t => t.text === '::');
  const body = cut >= 0 ? tokens.slice(0, cut) : tokens;
  if (body.length !== 1) return {ok: false};
  const [t] = body;
  if (t.kind === 'string' || t.kind === 'number') return {ok: true, value: t.value!};
  if (isWord(t, 'null')) return {ok: true, value: null};
  if (isWord(t, 'true')) return {ok: true, value: true};
  if (isWord(t, 'false')) return {ok: true, value: false};
  if (t.kind === 'word' && vars.has(t.text.toLowerCase())) return {ok: true, value: vars.get(t.text.toLowerCase())!};
  return {ok: false};
}

/** Column reference wrapped in lower/upper/btrim/trim, evaluated against the question. */
function columnExpr(tokens: Token[]): {column: string; apply: (v: string) => string} | null {
  if (tokens.length === 1 && tokens[0].kind === 'word' && COLUMNS.has(lower(tokens[0]))) return {column: lower(tokens[0]), apply: v => v};
  const fn = lower(tokens[0]);
  if (['lower', 'upper', 'btrim', 'trim'].includes(fn) && tokens[1]?.text === '(' && tokens.at(-1)?.text === ')') {
    const inner = columnExpr(tokens.slice(2, -1));
    if (!inner) return null;
    const f = fn === 'lower' ? (v: string) => v.toLowerCase() : fn === 'upper' ? (v: string) => v.toUpperCase() : (v: string) => v.trim();
    return {column: inner.column, apply: v => f(inner.apply(v))};
  }
  return null;
}

function currentValue(question: Question, column: string): Value {
  if (column === 'anulada') return Boolean(question.anulada);
  const v = (question as unknown as Record<string, unknown>)[column];
  return v === undefined || v === null ? null : typeof v === 'boolean' ? v : String(v);
}

function evaluate(cond: Token[], vars: Map<string, Value>, question: Question): boolean | null {
  // col IS [NOT] NULL
  const isAt = cond.findIndex(t => isWord(t, 'is'));
  if (isAt > 0) {
    const col = columnExpr(cond.slice(0, isAt));
    const rest = cond.slice(isAt + 1).map(lower);
    if (!col) return null;
    const value = currentValue(question, col.column);
    const empty = value === null;
    if (rest.join(' ') === 'null') return empty;
    if (rest.join(' ') === 'not null') return !empty;
    if (rest.join(' ') === 'true' || rest.join(' ') === 'false') return value === (rest[0] === 'true');
    return null;
  }
  const opAt = cond.findIndex(t => ['=', '<>', '!='].includes(t.text));
  if (opAt <= 0) return null;
  const col = columnExpr(cond.slice(0, opAt));
  const right = literal(cond.slice(opAt + 1), vars);
  if (!col || !right.ok) return null;
  const current = currentValue(question, col.column);
  let equal: boolean;
  if (current === null || right.value === null) equal = false; // SQL: comparing with NULL is never true
  else if (typeof current === 'boolean' || typeof right.value === 'boolean') equal = current === right.value;
  else equal = col.apply(String(current)) === String(right.value);
  return cond[opAt].text === '=' ? equal : !equal && current !== null && right.value !== null;
}

export function parseCorrectionSql(sql: string, question: Question): ParsedCorrection {
  const result: ParsedCorrection = {changes: {}, guards: [], blocks: [], targetId: null, errors: []};
  let tokens: Token[];
  try { tokens = tokenize(sql); } catch (error) { result.errors.push((error as Error).message); return result; }

  // DECLARE name type := value;
  const vars = new Map<string, Value>();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].text !== ':=') continue;
    let name = i - 1;
    while (name > 0 && tokens[name - 1].kind === 'word' && tokens[name - 1].text !== ';' && !['declare', 'begin'].includes(lower(tokens[name - 1]))) name--;
    const end = tokens.findIndex((t, k) => k > i && t.text === ';');
    const value = literal(tokens.slice(i + 1, end < 0 ? undefined : end), vars);
    if (tokens[name]?.kind === 'word' && value.ok) vars.set(tokens[name].text.toLowerCase(), value.value);
  }

  // IF [NOT] flag THEN RAISE EXCEPTION 'message'
  for (let i = 0; i < tokens.length; i++) {
    if (!isWord(tokens[i], 'if')) continue;
    const negated = isWord(tokens[i + 1], 'not');
    const flag = tokens[i + (negated ? 2 : 1)];
    const then = tokens[i + (negated ? 3 : 2)];
    if (!isWord(then, 'then') || flag?.kind !== 'word' || !vars.has(flag.text.toLowerCase())) continue;
    const raiseAt = i + (negated ? 4 : 3);
    if (!isWord(tokens[raiseAt], 'raise') || !isWord(tokens[raiseAt + 1], 'exception')) continue;
    const value = vars.get(flag.text.toLowerCase());
    if (typeof value !== 'boolean') continue;
    if (negated ? !value : value) {
      const msg = tokens[raiseAt + 2];
      result.blocks.push({variable: flag.text, message: msg?.kind === 'string' ? String(msg.value) : 'O script bloqueia a atualização.'});
    }
  }

  // UPDATE [public.]questions SET ... WHERE ... ;
  const updates = tokens.reduce<number[]>((acc, t, i) => (isWord(t, 'update') ? [...acc, i] : acc), []);
  if (!updates.length) { result.errors.push('Nenhum UPDATE public.questions encontrado.'); return result; }
  if (updates.length > 1) { result.errors.push('O script tem mais de um UPDATE: cole uma correção por vez.'); return result; }
  let i = updates[0] + 1;
  if (isWord(tokens[i], 'public') && tokens[i + 1]?.text === '.') i += 2;
  if (!isWord(tokens[i], 'questions')) { result.errors.push('O UPDATE precisa ser em public.questions.'); return result; }
  i++;
  if (!isWord(tokens[i], 'set')) { result.errors.push('Faltou SET depois de UPDATE public.questions.'); return result; }
  const end = tokens.findIndex((t, k) => k > i && t.text === ';');
  const statement = tokens.slice(i + 1, end < 0 ? undefined : end);
  const whereAt = statement.findIndex(t => isWord(t, 'where'));
  const setPart = whereAt < 0 ? statement : statement.slice(0, whereAt);
  const wherePart = whereAt < 0 ? [] : statement.slice(whereAt + 1);

  for (const assignment of splitTop(setPart, t => t.text === ',')) {
    const column = lower(assignment[0]);
    if (assignment[1]?.text !== '=') { result.errors.push(`Não entendi a atribuição: ${render(assignment)}`); continue; }
    if (!(CORRECTABLE_FIELDS as readonly string[]).includes(column)) { result.errors.push(`A coluna ${assignment[0].text} não pode ser alterada pela curadoria.`); continue; }
    const value = literal(assignment.slice(2), vars);
    if (!value.ok) { result.errors.push(`O valor de ${column} precisa ser um texto, número, true/false ou NULL.`); continue; }
    if (column === 'anulada') {
      if (typeof value.value !== 'boolean') { result.errors.push('anulada precisa ser true ou false.'); continue; }
      result.changes.anulada = value.value;
    } else {
      result.changes[column as keyof ParsedCorrection['changes']] = value.value === null ? null : String(value.value);
    }
  }
  if (!Object.keys(result.changes).length && !result.errors.length) result.errors.push('O UPDATE não altera nenhuma coluna.');

  if (!wherePart.length) result.errors.push('O UPDATE não tem WHERE: sem ele, todas as questões seriam alteradas.');
  for (const cond of splitTop(wherePart, t => isWord(t, 'and'))) {
    if (cond.some(t => isWord(t, 'or'))) { result.guards.push({text: render(cond), passes: null}); continue; }
    if (lower(cond[0]) === 'id' && cond[1]?.text === '=') {
      const id = literal(cond.slice(2), vars);
      if (id.ok && id.value !== null) result.targetId = String(id.value).replace(/^0+(?=\d)/, '');
    }
    result.guards.push({text: render(cond), passes: evaluate(cond, vars, question)});
  }
  if (wherePart.length && !result.targetId) result.errors.push('O WHERE precisa fixar o ID da questão (id = …).');
  else if (result.targetId && result.targetId !== question.id) result.errors.push(`O script é para a questão #${result.targetId}, mas a questão aberta é a #${question.id}.`);
  return result;
}
