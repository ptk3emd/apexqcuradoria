import test from 'node:test';
import assert from 'node:assert/strict';
import {matchPastedIds, parsePastedIds} from '../src/lib/pastedIds';
import type {Question} from '../src/types/question';

test('pasted ids accept any separator, drop repeats and report the unknown ones', () => {
  assert.deepEqual(parsePastedIds('#1201, 1202;1203\n 1204\t1202 001205'), ['1201', '1202', '1203', '1204', '1205']);
  assert.deepEqual(parsePastedIds('nenhum'), []);
  const qs = [{id: '1201'}, {id: '1203'}] as Question[];
  const {found, missing} = matchPastedIds(['1203', '9', '1201'], qs);
  assert.deepEqual(found.map(q => q.id), ['1203', '1201']);
  assert.deepEqual(missing, ['9']);
});
