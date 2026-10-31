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
  /** Things the curator should know that do not block, e.g. an id left empty in the script. */
  notes: string[];
  errors: string[];
}

function lower(t?: Token) { return t?.kind === 'word' ? t.text.toLowerCase() : ''; }
function isWord(t: Token | undefined, w: string) { return lower(t) === w; }

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
      // A DO block body ($$ or $name$) is SQL itself: read inside it rather than as a string.
      if (isWord(tokens.at(-1), 'do')) tokens.push(...tokenize(body));
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

function isBlankText(value: Value) {
  return value === null || (typeof value === 'string' && ['', 'null'].includes(value.trim().toLowerCase()));
}

function currentValue(question: Question, column: string): Value {
  if (column === 'anulada') return Boolean(question.anulada);
  const v = (question as unknown as Record<string, unknown>)[column];
  return v === undefined || v === null ? null : typeof v === 'boolean' ? v : String(v);
}

/** Drops parentheses that wrap the whole condition: (a OR b) -> a OR b. */
function unwrap(cond: Token[]): Token[] {
  let tokens = cond;
  while (tokens.length > 2 && tokens[0].text === '(' && tokens.at(-1)!.text === ')') {
    let depth = 0;
    let wraps = true;
    for (let k = 0; k < tokens.length - 1; k++) {
      if (tokens[k].text === '(') depth++;
      if (tokens[k].text === ')') depth--;
      if (depth === 0) { wraps = false; break; }
    }
    if (!wraps) break;
    tokens = tokens.slice(1, -1);
  }
  return tokens;
}

const hasTopLevelOr = (cond: Token[]) => splitTop(unwrap(cond), t => isWord(t, 'or')).length > 1;

function evaluate(condition: Token[], vars: Map<string, Value>, question: Question): boolean | null {
  const cond = unwrap(condition);
  // a OR b: true if any part is, false only when every part is false.
  const alternatives = splitTop(cond, t => isWord(t, 'or'));
  if (alternatives.length > 1) {
    const results = alternatives.map(part => evaluate(part, vars, question));
    return results.includes(true) ? true : results.every(r => r === false) ? false : null;
  }
  const conjuncts = splitTop(cond, t => isWord(t, 'and'));
  if (conjuncts.length > 1) {
    const results = conjuncts.map(part => evaluate(part, vars, question));
    return results.includes(false) ? false : results.every(r => r === true) ? true : null;
  }
  // col [NOT] IN ('a', 'b')
  const inAt = cond.findIndex(t => isWord(t, 'in'));
  if (inAt > 0) {
    const negate = isWord(cond[inAt - 1], 'not');
    const col = columnExpr(cond.slice(0, negate ? inAt - 1 : inAt));
    const list = cond.slice(inAt + 1);
    if (!col || list[0]?.text !== '(' || list.at(-1)?.text !== ')') return null;
    const options = splitTop(list.slice(1, -1), t => t.text === ',').map(item => literal(item, vars));
    if (!options.length || options.some(o => !o.ok)) return null;
    const current = currentValue(question, col.column);
    if (current === null) return false; // SQL: NULL IN (...) is never true
    const text = col.apply(String(current));
    const found = options.some(o => o.ok && o.value !== null && String(o.value) === text);
    return negate ? !found : found;
  }
  // col IS [NOT] NULL
  const isAt = cond.findIndex(t => isWord(t, 'is'));
  if (isAt > 0) {
    const col = columnExpr(cond.slice(0, isAt));
    const rest = cond.slice(isAt + 1).map(lower);
    if (!col) return null;
    const value = currentValue(question, col.column);
    // Imports left absent text as '' or the word "null": both count as NULL here.
    const empty = isBlankText(value);
    if (rest.join(' ') === 'null') return empty;
    if (rest.join(' ') === 'not null') return !empty;
    if (rest.join(' ') === 'true' || rest.join(' ') === 'false') return value === (rest[0] === 'true');
    return null;
  }
  const likeAt = cond.findIndex(t => ['like', 'ilike'].includes(lower(t)));
  if (likeAt > 0) {
    const col = columnExpr(cond.slice(0, likeAt));
    const negate = isWord(cond[likeAt - 1], 'not');
    const pattern = literal(cond.slice(likeAt + 1), vars);
    if (!col || !pattern.ok || typeof pattern.value !== 'string') return null;
    const current = currentValue(question, col.column);
    if (current === null || typeof current === 'boolean') return false;
    const flags = lower(cond[likeAt]) === 'ilike' ? 'iu' : 'u';
    const regex = new RegExp(`^${pattern.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '[\\s\\S]*').replace(/_/g, '[\\s\\S]')}$`, flags);
    const match = regex.test(col.apply(String(current)));
    return negate ? !match : match;
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

/** A SET value: a literal, a column of the question, or REPLACE / REGEXP_REPLACE over one. */
function textExpr(tokens: Token[], vars: Map<string, Value>, question: Question, notes: string[], target: string): {ok: true; value: Value} | {ok: false} {
  const lit = literal(tokens, vars);
  if (lit.ok) return lit;
  const col = columnExpr(tokens);
  if (col) {
    const v = currentValue(question, col.column);
    return {ok: true, value: v === null || typeof v === 'boolean' ? v : col.apply(String(v))};
  }
  if (isWord(tokens[0], 'replace') && tokens[1]?.text === '(' && tokens.at(-1)?.text === ')') {
    const args = splitTop(tokens.slice(2, -1), t => t.text === ',');
    if (args.length !== 3) return {ok: false};
    const base = textExpr(args[0], vars, question, notes, target);
    const from = literal(args[1], vars);
    const to = literal(args[2], vars);
    if (!base.ok || !from.ok || !to.ok || typeof from.value !== 'string' || typeof to.value !== 'string') return {ok: false};
    if (base.value === null) return {ok: true, value: null};
    const text = String(base.value);
    if (!from.value || !text.includes(from.value)) notes.push(`${target}: o trecho "${from.value}" não foi encontrado; o texto fica como está.`);
    return {ok: true, value: from.value ? text.split(from.value).join(to.value) : text};
  }
  if (isWord(tokens[0], 'regexp_replace') && tokens[1]?.text === '(' && tokens.at(-1)?.text === ')') {
    const args = splitTop(tokens.slice(2, -1), t => t.text === ',');
    if (args.length !== 3 && args.length !== 4) return {ok: false};
    const base = textExpr(args[0], vars, question, notes, target);
    const pattern = literal(args[1], vars);
    const replacement = literal(args[2], vars);
    const flags = args[3] ? literal(args[3], vars) : {ok: true as const, value: ''};
    if (!base.ok || !pattern.ok || !replacement.ok || !flags.ok) return {ok: false};
    if (typeof pattern.value !== 'string' || typeof replacement.value !== 'string' || typeof flags.value !== 'string') return {ok: false};
    if (base.value === null) return {ok: true, value: null};
    const done = regexpReplace(String(base.value), pattern.value, replacement.value, flags.value);
    if (!done.ok) return {ok: false};
    if (!done.matched) notes.push(`${target}: o padrão "${pattern.value}" não casou; o texto fica como está.`);
    return {ok: true, value: done.value};
  }
  return {ok: false};
}

/** PostgreSQL regular expression -> JavaScript: the POSIX classes the scripts use. */
function posixPattern(pattern: string): string {
  return pattern
    .replace(/\[:space:\]/g, '\\s').replace(/\[:digit:\]/g, '\\d').replace(/\[:alpha:\]/g, '\\p{L}')
    .replace(/\[:alnum:\]/g, '\\p{L}\\p{Nd}').replace(/\[:upper:\]/g, '\\p{Lu}').replace(/\[:lower:\]/g, '\\p{Ll}')
    .replace(/\[:punct:\]/g, '\\p{P}').replace(/\\y/g, '\\b');
}

/** REGEXP_REPLACE(text, pattern, replacement [, flags]); like PostgreSQL, only the first match unless flags has g. */
function regexpReplace(text: string, pattern: string, replacement: string, flags: string): {ok: true; value: string; matched: boolean} | {ok: false} {
  if (/[^igc]/.test(flags)) return {ok: false};
  let regex: RegExp;
  try { regex = new RegExp(posixPattern(pattern), `u${flags.includes('i') ? 'i' : ''}${flags.includes('g') ? 'g' : ''}`); } catch { return {ok: false}; }
  const matched = text.search(regex) >= 0;
  const value = text.replace(regex, (match: string, ...rest: unknown[]) => {
    const captures = rest.slice(0, rest.findIndex(x => typeof x === 'number')) as (string | undefined)[];
    return replacement.replace(/\\(\d|&|\\)/g, (_, c: string) => c === '&' ? match : c === '\\' ? '\\' : captures[Number(c) - 1] ?? '');
  });
  return {ok: true, value, matched};
}

export function parseCorrectionSql(sql: string, question: Question): ParsedCorrection {
  const result: ParsedCorrection = {changes: {}, guards: [], blocks: [], targetId: null, notes: [], errors: []};
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

  // UPDATE [public.]questions SET ... WHERE ... ;
  // FOR UPDATE (a row lock in a check) is not an UPDATE statement.
  const updates = tokens.reduce<number[]>((acc, t, i) => (isWord(t, 'update') && !isWord(tokens[i - 1], 'for') ? [...acc, i] : acc), []);
  if (!updates.length) { result.errors.push('Nenhum UPDATE public.questions encontrado.'); return result; }
  if (updates.length > 1) { result.errors.push('O script tem mais de um UPDATE: cole uma correção por vez.'); return result; }
  let i = updates[0] + 1;
  if (isWord(tokens[i], 'public') && tokens[i + 1]?.text === '.') i += 2;
  if (!isWord(tokens[i], 'questions')) { result.errors.push('O UPDATE precisa ser em public.questions.'); return result; }
  i++;
  if (!isWord(tokens[i], 'set')) { result.errors.push('Faltou SET depois de UPDATE public.questions.'); return result; }
  const end = tokens.findIndex((t, k) => k > i && t.text === ';');
  // RETURNING lists what the UPDATE gives back to the editor: it is not part of the WHERE.
  const statementAll = tokens.slice(i + 1, end < 0 ? undefined : end);
  const returningAt = statementAll.findIndex(t => isWord(t, 'returning'));
  const statement = returningAt < 0 ? statementAll : statementAll.slice(0, returningAt);
  const whereAt = statement.findIndex(t => isWord(t, 'where'));
  const setPart = whereAt < 0 ? statement : statement.slice(0, whereAt);
  const wherePart = whereAt < 0 ? [] : statement.slice(whereAt + 1);

  for (const assignment of splitTop(setPart, t => t.text === ',')) {
    const column = lower(assignment[0]);
    if (assignment[1]?.text !== '=') { result.errors.push(`Não entendi a atribuição: ${render(assignment)}`); continue; }
    if (!(CORRECTABLE_FIELDS as readonly string[]).includes(column)) { result.errors.push(`A coluna ${assignment[0].text} não pode ser alterada pela curadoria.`); continue; }
    const value = textExpr(assignment.slice(2), vars, question, result.notes, column);
    if (!value.ok) { result.errors.push(`O valor de ${column} precisa ser um texto, número, true/false, NULL, outra coluna, REPLACE(coluna, 'de', 'para') ou REGEXP_REPLACE(coluna, 'padrão', 'novo').`); continue; }
    if (column === 'anulada') {
      if (typeof value.value !== 'boolean') { result.errors.push('anulada precisa ser true ou false.'); continue; }
      result.changes.anulada = value.value;
    } else {
      const text = value.value === null ? null : String(value.value);
      // The answer key is stored as one upper-case letter, whatever case the script used.
      result.changes[column as keyof ParsedCorrection['changes']] = column === 'correta' && text !== null ? text.trim().toUpperCase() : text;
    }
  }
  if (!Object.keys(result.changes).length && !result.errors.length) result.errors.push('O UPDATE não altera nenhuma coluna.');

  // An id variable left NULL ("put the real id here") means the open question.
  const idCond = splitTop(wherePart, t => isWord(t, 'and')).find(c => lower(c[0]) === 'id' && c[1]?.text === '=' && c.length === 3 && c[2].kind === 'word');
  const idVar = idCond ? lower(idCond[2]) : '';
  if (idVar && !COLUMNS.has(idVar) && (!vars.has(idVar) || vars.get(idVar) === null)) {
    const leftEmpty = vars.has(idVar);
    vars.set(idVar, question.id);
    result.notes.push(leftEmpty
      ? `O SQL deixou ${idCond![2].text} vazio: foi usada a questão aberta, #${question.id}.`
      : `O SQL localiza a questão por busca (${idCond![2].text}): foi usada a questão aberta, #${question.id}. As condições da busca são conferidas abaixo.`);
  }

  // PERFORM 1 / SELECT ... INTO ... FROM public.questions WHERE ... [FOR UPDATE]: conditions that identify the question.
  for (let k = 0; k < tokens.length; k++) {
    if (!isWord(tokens[k], 'perform') && !isWord(tokens[k], 'select')) continue;
    // Checks run before the UPDATE; a SELECT after it (often after COMMIT) only shows the result.
    if (k > updates[0]) continue;
    const stop = tokens.findIndex((t, m) => m > k && t.text === ';');
    let check = tokens.slice(k + 1, stop < 0 ? undefined : stop);
    const w = check.findIndex(t => isWord(t, 'where'));
    if (w < 0 || !check.slice(0, w).some(t => isWord(t, 'questions'))) continue;
    // A plain SELECT without INTO only lists rows; it does not guard anything.
    if (isWord(tokens[k], 'select') && !check.slice(0, w).some(t => isWord(t, 'into'))) continue;
    check = check.slice(w + 1);
    const forAt = check.findIndex((t, m) => isWord(t, 'for') && isWord(check[m + 1], 'update'));
    if (forAt >= 0) check = check.slice(0, forAt);
    for (const cond of splitTop(check, t => isWord(t, 'and'))) {
      result.guards.push({text: render(cond), passes: evaluate(cond, vars, question)});
    }
  }

  if (!wherePart.length) result.errors.push('O UPDATE não tem WHERE: sem ele, todas as questões seriam alteradas.');
  for (const cond of splitTop(wherePart, t => isWord(t, 'and'))) {
    if (hasTopLevelOr(cond)) { result.guards.push({text: render(cond), passes: evaluate(cond, vars, question)}); continue; }
    if (lower(cond[0]) === 'id' && cond[1]?.text === '=') {
      const id = literal(cond.slice(2), vars);
      if (id.ok && id.value !== null) result.targetId = String(id.value).replace(/^0+(?=\d)/, '');
    }
    result.guards.push({text: render(cond), passes: evaluate(cond, vars, question)});
  }
  if (wherePart.length && !result.targetId) result.errors.push('O WHERE precisa fixar o ID da questão (id = …).');
  else if (result.targetId && result.targetId !== question.id) result.errors.push(`O script é para a questão #${result.targetId}, mas a questão aberta é a #${question.id}.`);
  // Say so when IS NULL passed only because the field holds blank text.
  for (const column of new Set(result.guards.map(g => /^(\w+) IS NULL$/i.exec(g.text)?.[1]?.toLowerCase()).filter(Boolean))) {
    const v = currentValue(question, column!);
    if (v !== null && isBlankText(v)) result.notes.push(`${column}: no banco está como texto vazio${String(v).trim() ? ' ("null")' : ''}, não NULL; foi tratado como ausente.`);
  }

  // PERFORM checks and the WHERE often repeat a condition: list each once.
  const seen = new Set<string>();
  result.guards = result.guards.filter(g => !seen.has(g.text) && seen.add(g.text));

  // IF [NOT] flag THEN RAISE EXCEPTION 'message' / IF v IS NULL THEN RAISE ...: guards the author left for a person.
  for (let i = 0; i < tokens.length; i++) {
    if (!isWord(tokens[i], 'if')) continue;
    const thenAt = tokens.findIndex((t, k) => k > i && isWord(t, 'then'));
    if (thenAt < 0 || !isWord(tokens[thenAt + 1], 'raise') || !isWord(tokens[thenAt + 2], 'exception')) continue;
    const cond = tokens.slice(i + 1, thenAt);
    const msg = tokens[thenAt + 3];
    const message = msg?.kind === 'string' ? String(msg.value) : 'O script bloqueia a atualização.';
    const names = cond.map(lower);
    let fires: boolean | null = null;
    let variable = '';
    if (names.length === 2 && names[0] === 'not' && vars.has(names[1])) { variable = cond[1].text; const v = vars.get(names[1]); fires = typeof v === 'boolean' ? !v : null; }
    else if (names.length === 1 && vars.has(names[0])) { variable = cond[0].text; const v = vars.get(names[0]); fires = typeof v === 'boolean' ? v : null; }
    else if (names.length === 3 && vars.has(names[0]) && names[1] === 'is' && names[2] === 'null') { variable = cond[0].text; fires = vars.get(names[0]) === null; }
    else if (names.length === 2 && names[0] === 'not' && names[1] === 'found') continue; // covered by the PERFORM checks
    if (fires) result.blocks.push({variable, message});
  }

  return result;
}

