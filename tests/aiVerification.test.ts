import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_VERIFIERS, addTypedVerification, applyVerification, formatIaList, normalizeIaName, readVerification, toggleVerification} from '../src/lib/aiVerification';

test('the catalogue lists DeepSeek with the other AIs', () => {
  assert.ok(AI_VERIFIERS.some(v => v.label === 'DeepSeek'));
});

test('one AI adds a single sentence after a blank line', () => {
  assert.equal(
    applyVerification('Texto do comentário.', ['ChatGPT']),
    'Texto do comentário.\n\nQuestão verificada por IA: ChatGPT.',
  );
});

test('several AIs follow catalogue order with "e" before the last one', () => {
  assert.equal(applyVerification('', ['Gemini', 'ChatGPT', 'Claude']), 'Questão verificada por IA: ChatGPT, Claude e Gemini.');
  assert.equal(formatIaList(['A']), 'A');
  assert.equal(formatIaList(['A', 'B']), 'A e B');
  assert.equal(formatIaList(['A', 'B', 'C']), 'A, B e C');
});

test('typed names come after the catalogue, in the order they were added', () => {
  assert.equal(
    applyVerification('', ['Perplexity', 'DeepSeek', 'Minha IA', 'Claude']),
    'Questão verificada por IA: Claude, DeepSeek, Perplexity e Minha IA.',
  );
});

test('changing the selection replaces the sentence instead of adding another', () => {
  let text = applyVerification('Comentário.', ['ChatGPT']);
  text = applyVerification(text, ['ChatGPT', 'Claude']);
  assert.equal(text, 'Comentário.\n\nQuestão verificada por IA: ChatGPT e Claude.');
  assert.equal(text.match(/verificada por IA/g)?.length, 1);
});

test('unmarking every AI removes the sentence and keeps the rest of the comment', () => {
  const text = applyVerification('Comentário.', ['Claude']);
  assert.equal(applyVerification(text, []), 'Comentário.');
});

test('with nothing marked, a comment without the sentence is returned untouched', () => {
  assert.equal(applyVerification('  Texto livre.  \n', []), '  Texto livre.  \n');
  assert.equal(applyVerification(null, []), '');
});

test('an empty comment gets only the sentence', () => {
  assert.equal(applyVerification(null, ['GLM']), 'Questão verificada por IA: GLM.');
});

test('clicking the same AI twice toggles it on and then off', () => {
  const on = toggleVerification('Comentário.', 'Qwen');
  assert.deepEqual(readVerification(on), ['Qwen']);
  assert.equal(toggleVerification(on, 'Qwen'), 'Comentário.');
});

test('readVerification returns the marked AIs in sentence order', () => {
  const text = applyVerification('', ['Grok', 'ChatGPT']);
  assert.deepEqual(readVerification(text), ['ChatGPT', 'Grok']);
  assert.deepEqual(readVerification('Questão verificada por IA: GLM.'), ['GLM']);
});

test('a sentence that is not the last paragraph is not read as a verification', () => {
  assert.deepEqual(readVerification('Questão verificada por IA: Claude.\n\nOutro parágrafo.'), []);
  assert.deepEqual(readVerification('Comentário sem frase.'), []);
});

test('a catalogue name typed in any case is the catalogue label', () => {
  assert.deepEqual(normalizeIaName('  deepseek  '), {ok: true, label: 'DeepSeek'});
  assert.deepEqual(normalizeIaName('chatgpt'), {ok: true, label: 'ChatGPT'});
  assert.deepEqual(normalizeIaName('Perplexity   Pro'), {ok: true, label: 'Perplexity Pro'});
});

test('typed names that would break the sentence are refused with a reason', () => {
  assert.equal((normalizeIaName('   ') as {ok: false; reason: string}).ok, false);
  assert.equal((normalizeIaName('Ana, Bia') as {ok: false; reason: string}).ok, false);
  assert.equal((normalizeIaName('Modelo.') as {ok: false; reason: string}).ok, false);
  assert.equal((normalizeIaName('IA; outra') as {ok: false; reason: string}).ok, false);
  assert.equal((normalizeIaName('Claude e GPT') as {ok: false; reason: string}).ok, false);
  assert.equal((normalizeIaName('e') as {ok: false; reason: string}).ok, false);
  assert.equal((normalizeIaName('x'.repeat(31)) as {ok: false; reason: string}).ok, false);
});

test('addTypedVerification marks a new name once and ignores a repeat', () => {
  const first = addTypedVerification('Comentário.', 'Perplexity');
  assert.deepEqual(first, {comentario: 'Comentário.\n\nQuestão verificada por IA: Perplexity.'});
  const again = addTypedVerification((first as {comentario: string}).comentario, 'perplexity');
  assert.deepEqual(again, first);
});

test('addTypedVerification returns the reason for a refused name and leaves the comment alone', () => {
  const result = addTypedVerification('Comentário.', 'Ana, Bia');
  assert.ok('error' in result);
});

test('a typed name can be toggled off like a catalogue AI', () => {
  const on = addTypedVerification('', 'Minha IA');
  const text = (on as {comentario: string}).comentario;
  assert.equal(toggleVerification(text, 'Minha IA'), '');
});
