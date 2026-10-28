import test from 'node:test';
import assert from 'node:assert/strict';
import {describeIssues, matchesIssues} from '../src/lib/qualityFlags';

test('issue groups match by any code and describe the reasons', () => {
  const codes = ['falta_b', 'falta_justificativa_c', 'comentario_contradiz'];
  assert.equal(matchesIssues(codes, new Set()), true);
  assert.equal(matchesIssues(undefined, new Set(['campos'])), false);
  assert.equal(matchesIssues(codes, new Set(['campos'])), true);
  assert.equal(matchesIssues(codes, new Set(['justificativa_contradiz'])), false);
  assert.equal(matchesIssues(codes, new Set(['justificativa_contradiz', 'comentario_contradiz'])), true);
  assert.equal(matchesIssues(['falta_origem'], new Set(['campos'])), false);
  assert.equal(matchesIssues(['falta_origem'], new Set(['metadados'])), true);
  assert.equal(describeIssues(codes), 'Gabarito × comentário · falta: alternativa B, justificativa C');
  assert.equal(describeIssues(['falta_correta', 'falta_tema_especifico']), 'falta: gabarito, tema');
});
