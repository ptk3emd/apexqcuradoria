import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeShared} from '../src/lib/sharedState';
import type {Question} from '../src/types/question';

test('idle polls preserve the whole dataset and question references',()=>{
  const rows=[{id:'1',enunciado:'saved',sync_version:4},{id:'2',enunciado:'original'}] as Question[];
  assert.equal(mergeShared(rows,[]),rows);
  assert.equal(mergeShared(rows,[{id:'1',version:4,patch:{enunciado:'saved'}}]),rows);
  assert.equal(mergeShared(rows,[{id:'1',version:3,patch:{enunciado:'old'}}]),rows);
});
test('only newer confirmed versions replace objects; untouched questions stay stable',()=>{
  const rows=[{id:'1',enunciado:'old',sync_version:4},{id:'2',enunciado:'original'}] as Question[];
  const next=mergeShared(rows,[{id:'1',version:5,patch:{enunciado:'new'}}]);
  assert.notEqual(next,rows);assert.equal(next[1],rows[1]);assert.equal(next[0].enunciado,'new');
  assert.equal(mergeShared(next,[{id:'1',version:5,patch:{enunciado:'new'}}]),next);
});

test('source imports append questions and renamed IDs remove the previous row',()=>{
 const before=[{id:'1',enunciado:'old',sync_version:2}] as Question[];
 const result=mergeShared(before,[{id:'1',patch:{},version:0,deleted:true},{id:'9',patch:{id:'9',enunciado:'new'},version:3}]);
 assert.deepEqual(result.map(q=>q.id),['9']);
 assert.equal(mergeShared(result,[{id:'1',patch:{},version:0,deleted:true},{id:'9',patch:{id:'9',enunciado:'new'},version:3}]),result);
});
