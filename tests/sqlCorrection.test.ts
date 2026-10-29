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
