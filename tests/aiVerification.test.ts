import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVerification, formatIaList, readVerification, toggleVerification} from '../src/lib/aiVerification';

test('one AI adds a single sentence after a blank line', () => {
  assert.equal(
    applyVerification('Texto do comentário.', ['chatgpt']),
    'Texto do comentário.\n\nQuestão verificada por IA: ChatGPT.',
  );
});

test('several AIs follow catalogue order with "e" before the last one', () => {
  assert.equal(applyVerification('', ['gemini', 'chatgpt', 'claude']), 'Questão verificada por IA: ChatGPT, Claude e Gemini.');
  assert.equal(formatIaList(['A']), 'A');
  assert.equal(formatIaList(['A', 'B']), 'A e B');
  assert.equal(formatIaList(['A', 'B', 'C']), 'A, B e C');
});

test('changing the selection replaces the sentence instead of adding another', () => {
  let text = applyVerification('Comentário.', ['chatgpt']);
  text = applyVerification(text, ['chatgpt', 'claude']);
  assert.equal(text, 'Comentário.\n\nQuestão verificada por IA: ChatGPT e Claude.');
  assert.equal(text.match(/verificada por IA/g)?.length, 1);
});

test('unmarking every AI removes the sentence and keeps the rest of the comment', () => {
  const text = applyVerification('Comentário.', ['claude']);
  assert.equal(applyVerification(text, []), 'Comentário.');
});

test('with nothing marked, a comment without the sentence is returned untouched', () => {
  assert.equal(applyVerification('  Texto livre.  \n', []), '  Texto livre.  \n');
  assert.equal(applyVerification(null, []), '');
});

test('an empty comment gets only the sentence', () => {
  assert.equal(applyVerification(null, ['glm']), 'Questão verificada por IA: GLM.');
});

test('clicking the same AI twice toggles it on and then off', () => {
  const on = toggleVerification('Comentário.', 'qwen');
  assert.deepEqual(readVerification(on), ['qwen']);
  assert.equal(toggleVerification(on, 'qwen'), 'Comentário.');
});

test('readVerification returns the marked AIs in catalogue order', () => {
  const text = applyVerification('', ['grok', 'chatgpt']);
  assert.deepEqual(readVerification(text), ['chatgpt', 'grok']);
  assert.deepEqual(readVerification('Questão verificada por IA: GLM.'), ['glm']);
});

test('a sentence that is not the last paragraph is not read as a verification', () => {
  assert.deepEqual(readVerification('Questão verificada por IA: Claude.\n\nOutro parágrafo.'), []);
  assert.deepEqual(readVerification('Comentário sem frase.'), []);
});
