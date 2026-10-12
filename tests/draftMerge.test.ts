import test from 'node:test';
import assert from 'node:assert/strict';
import {changedFields, mergeRemote} from '../src/lib/draftMerge';
import type {Question} from '../src/types/question';

const base = {id:'1', sync_version:1, enunciado:'Original', comentario:'C0', a:'A0', correta:'A', status:'pendente'} as Question;

test('changedFields lists only the content fields the curator changed', () => {
  assert.deepEqual(changedFields(base, {...base, enunciado:'Novo', status:'aprovadas'} as Question), ['enunciado']);
  assert.deepEqual(changedFields(base, {...base}), []);
  // Blank, null and missing are the same value; anulada defaults to false.
  assert.deepEqual(changedFields({...base, referencias:null} as Question, {...base, referencias:''} as Question), []);
  assert.deepEqual(changedFields(base, {...base, anulada:false} as Question), []);
  assert.deepEqual(changedFields(base, {...base, anulada:true, correta:''} as Question), ['anulada','correta']);
});

test('a remote save fills untouched fields and keeps the curator text where both changed', () => {
  const draft = {...base, enunciado:'Meu texto'} as Question;
  const remote = {...base, sync_version:2, enunciado:'Texto remoto', comentario:'C1', status:'questao_corrigida'} as Question;
  const merged = mergeRemote(base, draft, remote);
  assert.equal(merged.draft.enunciado, 'Meu texto');
  assert.equal(merged.draft.comentario, 'C1');
  assert.equal(merged.draft.status, 'questao_corrigida');
  assert.equal(merged.draft.sync_version, 2);
  assert.deepEqual(merged.conflicts, ['enunciado']);
  assert.equal(merged.base.enunciado, 'Texto remoto');
  // After the merge only the curator's own change is still pending.
  assert.deepEqual(changedFields(merged.base, merged.draft), ['enunciado']);
});

test('no conflict when the remote value equals the draft or the field was not touched remotely', () => {
  const draft = {...base, enunciado:'Igual', a:'Minha A'} as Question;
  const remote = {...base, sync_version:2, enunciado:'Igual'} as Question;
  const merged = mergeRemote(base, draft, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.draft.a, 'Minha A');
});
