import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCorrectionSql} from '../src/lib/sqlCorrection';
import type {Question} from '../src/types/question';

const example = readFileSync(new URL('./fixtures/correction-example.sql', import.meta.url), 'utf8');
const question = {id: '123456', correta: ' A ', a: 'Drenagem torácica esquerda.', b: 'Broncodilatador endovenoso.', c: 'Antibiótico para pneumonia.', d: 'Fisioterapia respiratória.', e: null, anulada: false} as unknown as Question;

test('the pasted DO block becomes field changes, its guards are checked and its confirmation flag blocks', () => {
  const r = parseCorrectionSql(example, question);
  assert.deepEqual(r.errors, []);
  assert.equal(r.targetId, '123456');
  assert.equal(r.changes.especialidade, 'Pediatria');
  assert.equal(r.changes.categoria, 'Cirurgia torácica, pneumotórax e doenças traqueais');
  assert.equal(r.changes.difficulty_bucket, 'medium');
  assert.equal(r.changes.comentario, 'O lactente apresenta quadro clínico compatível com bronquiolite viral aguda.');
  assert.equal(r.changes.justificativa_d, 'Incorreta. A fisioterapia respiratória não é recomendada.');
  assert.equal(Object.keys(r.changes).length, 11);
  assert.equal(r.guards.length, 8);
  assert.ok(r.guards.every(g => g.passes === true), JSON.stringify(r.guards));
  assert.deepEqual(r.blocks, [{variable: 'v_rx_confirmado', message: 'Atualização bloqueada: confirmar pneumotórax esquerdo na radiografia.'}]);
});

test('guards that do not hold, another question, risky scripts and odd literals are reported', () => {
  const changed = parseCorrectionSql(example, {...question, a: 'Outra alternativa.'} as Question);
  assert.equal(changed.guards.find(g => g.text.startsWith('a ='))!.passes, false);
  assert.match(parseCorrectionSql(example, {...question, id: '9'} as Question).errors.join(), /#123456.*#9/);
  assert.match(parseCorrectionSql("UPDATE public.questions SET a = 'x';", question).errors.join(), /sem ele, todas/);
  assert.match(parseCorrectionSql("UPDATE public.questions SET id = 5 WHERE id = 123456;", question).errors.join(), /coluna id/);
  assert.match(parseCorrectionSql("DELETE FROM public.questions WHERE id = 1;", question).errors.join(), /Nenhum UPDATE/);
  assert.match(parseCorrectionSql("UPDATE public.questions SET a = b || 'x' WHERE id = 123456;", question).errors.join(), /valor de a/);
  const ok = parseCorrectionSql("update questions set a = E'linha\\nnova', b = 'It''s', anulada = true, e = NULL where id = 123456 and anulada = false;", question);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.changes, {a: 'linha\nnova', b: "It's", anulada: true, e: null});
  assert.equal(ok.blocks.length, 0);
});

test('a named DO block with PERFORM checks, ILIKE and an id left NULL reads against the open question', () => {
  const asthma = readFileSync(new URL('./fixtures/correction-asthma.sql', import.meta.url), 'utf8');
  const open = {id: '777', correta: 'C', enunciado: 'Sobre o Diagnóstico de asma em crianças pequenas, assinale', c: 'Sibilância recorrente e dispneia intermitente, com avaliação', anulada: false} as unknown as Question;
  const r = parseCorrectionSql(asthma, open);
  assert.deepEqual(r.errors, []);
  assert.equal(r.targetId, '777');
  assert.match(r.notes.join(), /vazio.*#777/);
  assert.equal(r.blocks.length, 0);
  assert.equal(Object.keys(r.changes).length, 10);
  assert.match(String(r.changes.referencias), /^1\. GLOBAL INITIATIVE[\s\S]*WMS\.pdf$/);
  assert.equal(new Set(r.guards.map(g => g.text)).size, r.guards.length);
  assert.ok(r.guards.every(g => g.passes === true), JSON.stringify(r.guards));
  const other = parseCorrectionSql(asthma, {...open, enunciado: 'Outro tema'} as Question);
  assert.equal(other.guards.find(g => g.text.startsWith('enunciado ILIKE'))!.passes, false);
  // A $$ string outside a DO block stays a string.
  assert.equal(parseCorrectionSql("update questions set a = $$x; UPDATE$$ where id = 777;", open).changes.a, 'x; UPDATE');
});

test('a question found by SELECT ... INTO and a REPLACE on the statement apply to the open question', () => {
  const vsr = readFileSync(new URL('./fixtures/correction-vsr.sql', import.meta.url), 'utf8');
  const open = {id: '4242', correta: 'B', anulada: false, b: 'Indicar palivizumabe mensalmente.',
    enunciado: 'Lactente com 3 meses de idade cronológica e 45 dias de idade corrigida, displasia broncopulmonar e pragmatismo de canal arterial.'} as unknown as Question;
  const r = parseCorrectionSql(vsr, open);
  assert.deepEqual(r.errors, []);
  assert.equal(r.targetId, '4242');
  assert.match(r.notes.join(), /busca \(v_id\).*#4242/);
  assert.equal(r.changes.enunciado, 'Lactente com 3 meses de idade cronológica e 45 dias de idade corrigida, displasia broncopulmonar e persistência do canal arterial.');
  assert.equal(r.changes.justificativa_e, null);
  assert.equal(r.changes.origem, 'SCM-BH');
  assert.ok(r.guards.length >= 6);
  assert.ok(r.guards.every(g => g.passes === true), JSON.stringify(r.guards));
  assert.equal(r.blocks.length, 0);
  const already = parseCorrectionSql(vsr, {...open, enunciado: open.enunciado.replace('pragmatismo de', 'persistência do')} as Question);
  assert.match(already.notes.join(), /enunciado: o trecho "pragmatismo de canal arterial" não foi encontrado/);
  const wrong = parseCorrectionSql(vsr, {...open, b: 'Outra conduta.'} as Question);
  assert.equal(wrong.guards.find(g => g.text.startsWith('b ILIKE'))!.passes, false);
});

test('a result-listing SELECT after COMMIT is not a guard, and the answer key is upper-cased', () => {
  const sql = readFileSync(new URL('./fixtures/correction-carvedilol.sql', import.meta.url), 'utf8');
  const open = {id: '5150', correta: 'B', anulada: false, origem: 'ENAMED', b: 'Carvedilol.', d: 'Espironolactona.',
    enunciado: 'Mulher de 58 anos com IC, fração de ejeção de 38% e BNP elevado.'} as unknown as Question;
  const r = parseCorrectionSql(sql, open);
  assert.deepEqual(r.errors, []);
  assert.ok(r.guards.every(g => g.passes === true), JSON.stringify(r.guards));
  assert.ok(!r.guards.some(g => g.text.startsWith('origem')));
  assert.equal(r.changes.correta, 'B');
  assert.equal(r.changes.anulada, false);
  assert.equal(r.targetId, '5150');
});

test('IS NULL accepts a field left blank or as the word "null" by imports, with a note', () => {
  const q = {id: '9', correta: 'D', anulada: false, e: ''} as unknown as Question;
  const sql = "update questions set comentario = 'x' where id = 9 and e is null and lower(btrim(correta)) = 'd';";
  const blank = parseCorrectionSql(sql, q);
  assert.ok(blank.guards.every(g => g.passes === true), JSON.stringify(blank.guards));
  assert.match(blank.notes.join(), /^e: no banco está como texto vazio, não NULL/);
  const word = parseCorrectionSql(sql, {...q, e: 'null'} as Question);
  assert.ok(word.guards.every(g => g.passes === true));
  assert.match(word.notes.join(), /"null"/);
  assert.equal(parseCorrectionSql(sql, {...q, e: 'Alternativa E.'} as Question).guards.find(g => /is null/i.test(g.text))!.passes, false);
  assert.equal(parseCorrectionSql(sql, {...q, e: null} as unknown as Question).notes.length, 0);
});

test('REGEXP_REPLACE, IN lists and OR groups in the checks are read against the open question', () => {
  const q = {
    id: '3502', correta: 'D', anulada: false, e: null,
    enunciado: 'Paciente de 58 anos, joelho esquerdo inflamado. A conduta mais adequada solicitar  ',
  } as unknown as Question;
  const sql = `DO $apexmed$
DECLARE v_id bigint; v_total integer;
BEGIN
  SELECT COUNT(*), MAX(id) INTO v_total, v_id FROM public.questions
  WHERE enunciado ILIKE '%joelho esquerdo%'
    AND (e IS NULL OR LOWER(BTRIM(e)) IN ('', 'null', '-'))
    AND LOWER(BTRIM(correta)) IN ('a', 'd')
    AND anulada = FALSE;
  UPDATE public.questions SET
    enunciado = REGEXP_REPLACE(enunciado, 'A conduta mais adequada solicitar[[:space:]]*$', 'A conduta mais adequada é solicitar', 'i'),
    correta = 'a'
  WHERE id = v_id AND LOWER(BTRIM(correta)) IN ('a', 'd');
END;
$apexmed$;`;
  const parsed = parseCorrectionSql(sql, q);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.changes.enunciado, 'Paciente de 58 anos, joelho esquerdo inflamado. A conduta mais adequada é solicitar');
  assert.equal(parsed.changes.correta, 'A');
  assert.ok(parsed.guards.length > 0 && parsed.guards.every(g => g.passes === true), JSON.stringify(parsed.guards));

  const other = parseCorrectionSql(sql, {...q, correta: 'B', e: 'Texto'} as unknown as Question);
  assert.ok(other.guards.some(g => g.passes === false));
});

test('REGEXP_REPLACE replaces only the first match without g, and says when nothing matched', () => {
  const q = {id: '5', enunciado: 'aa bb aa'} as unknown as Question;
  const first = parseCorrectionSql(`UPDATE public.questions SET enunciado = regexp_replace(enunciado, 'aa', 'x') WHERE id = 5;`, q);
  assert.equal(first.changes.enunciado, 'x bb aa');
  const all = parseCorrectionSql(`UPDATE public.questions SET enunciado = regexp_replace(enunciado, 'aa', 'x', 'g') WHERE id = 5;`, q);
  assert.equal(all.changes.enunciado, 'x bb x');
  const none = parseCorrectionSql(`UPDATE public.questions SET enunciado = regexp_replace(enunciado, 'zz', 'x') WHERE id = 5;`, q);
  assert.equal(none.changes.enunciado, 'aa bb aa');
  assert.ok(none.notes.some(n => /não casou/.test(n)));
});

test('a RETURNING list after the WHERE is not part of the last condition: every guard is checked', () => {
  const q = {
    id: '6635', origem: 'Desconhecido', ano: '2019', especialidade: 'Otorrinolaringologia', categoria: 'CC', correta: 'D', anulada: false,
    enunciado: 'Assinale a alternativa INCORRETA com relação às traqueotomias:',
    a: 'Texto a.', b: 'Texto b.', c: 'Texto c.', d: 'O fechamento por segunda intenção geralmente ocorre em 21 dias.', e: null,
  } as unknown as Question;
  const sql = `UPDATE public.questions
SET
    origem = 'Hospital de Olhos Grottone',
    ano = '2018',
    e = NULL,
    comentario = $comentario$
Gabarito: D.
$comentario$
WHERE id = 6635
  AND origem = 'Desconhecido'
  AND ano = '2019'
  AND correta = 'D'
  AND anulada = false
  AND enunciado = 'Assinale a alternativa INCORRETA com relação às traqueotomias:'
  AND d = 'O fechamento por segunda intenção geralmente ocorre em 21 dias.'
RETURNING
    id, origem, ano, d, e, comentario;`;
  const parsed = parseCorrectionSql(sql, q);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.targetId, '6635');
  assert.ok(parsed.guards.length >= 6, JSON.stringify(parsed.guards));
  assert.ok(parsed.guards.every(g => g.passes === true), JSON.stringify(parsed.guards.filter(g => g.passes !== true)));
  assert.equal(parsed.changes.origem, 'Hospital de Olhos Grottone');
});
