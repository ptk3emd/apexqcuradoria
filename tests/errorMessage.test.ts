import test from 'node:test';
import assert from 'node:assert/strict';
import {describeError} from '../src/lib/errorMessage';

test('network failures become a connection sentence', () => {
  assert.match(describeError(new Error('TypeError: Failed to fetch')), /Sem conexão/);
});

test('expired or unauthorised sessions ask for the master password again', () => {
  assert.match(describeError(new Error('Sessão expirada. Entre novamente com a senha mestra.')), /senha mestra/);
  assert.match(describeError(new Error('Curador não autorizado')), /senha mestra/);
});

test('database noise is replaced, business messages pass through', () => {
  assert.match(describeError(new Error('duplicate key value violates unique constraint "questions_pkey"')), /recusou/);
  assert.equal(describeError(new Error('Questão 12 reservada por Lucas')), 'Questão 12 reservada por Lucas');
  assert.equal(describeError('Erro simples'), 'Erro simples');
  assert.equal(describeError(undefined), 'Algo deu errado. Tente de novo.');
});
