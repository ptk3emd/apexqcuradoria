import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewSelection } from '../src/lib/bulkActions';
import type { Curator, Question } from '../src/types/question';
const actor = {id:'patrick', nome:'Patrick'} as Curator;
const questions = [{id:'1', sync_version:2, enunciado:'x'.repeat(40000)}, {id:'2', sync_version:4}] as Question[];

test('review claims all rows and saves only status using confirmed versions', async () => {
  const calls: {action:string; rows:Question[]}[] = [];
  const confirmations: Question[][] = [];
  const result = await reviewSelection(questions, actor, async (rows, action) => {
    calls.push({action, rows});
    return rows.map(q => ({...q, sync_version:q.sync_version!+1}));
  }, rows => confirmations.push(rows));
  assert.deepEqual(calls.map(c => c.action), ['claim','save','unlock']);
  assert.deepEqual(calls[1].rows, [{id:'1',sync_version:3,status:'revisar_questao'}, {id:'2',sync_version:5,status:'revisar_questao'}]);
  assert.equal(confirmations.length, 2);
  assert.equal(result[0].sync_version, 4);
});

test('claim conflict prevents the entire save', async () => {
  const actions: string[] = [];
  await assert.rejects(reviewSelection(questions, actor, async (_rows, action) => {
    actions.push(action);
    throw new Error('reserved');
  }, () => assert.fail('no confirmation')), /reserved/);
  assert.deepEqual(actions, ['claim']);
});

test('save failure releases editing leases and preserves the failure', async () => {
  const actions: string[] = [];
  await assert.rejects(reviewSelection(questions, actor, async (rows, action) => {
    actions.push(action);
    if (action === 'save') throw new Error('stale version');
    return rows;
  }, () => {}), /stale version/);
  assert.deepEqual(actions, ['claim','save','unlock']);
});
