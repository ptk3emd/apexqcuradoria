import test from 'node:test';
import assert from 'node:assert/strict';
import {splitLinks} from '../src/lib/linkify';

test('references: http(s) addresses become links, punctuation and other schemes stay text',()=>{
  assert.deepEqual(splitLinks('Ver https://example.org/d.pdf. Fim'),[
    {type:'text',value:'Ver '},
    {type:'link',value:'https://example.org/d.pdf',href:'https://example.org/d.pdf'},
    {type:'text',value:'. Fim'},
  ]);
  assert.equal(splitLinks('www.example.org')[0].type==='link' && (splitLinks('www.example.org')[0] as any).href,'https://www.example.org/');
  assert.deepEqual(splitLinks('javascript:alert(1)'),[{type:'text',value:'javascript:alert(1)'}]);
  assert.deepEqual(splitLinks(''),[]);
});
