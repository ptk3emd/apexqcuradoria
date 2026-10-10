import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function fixture() {
  class Sheet {
    constructor(rows=[]) { this.rows=rows; }
    appendRow(row) { this.rows.push(row); }
    getLastRow(){return this.rows.length;}
    getLastColumn(){return this.rows[0].length;}
    getRange(row,col,count=1,width=1){
      const sheet=this;
      return { getValues:()=>sheet.rows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),
        createTextFinder(id){return {matchEntireCell(){return this;},findNext(){const i=sheet.rows.findIndex((r,i)=>i>=row-1&&String(r[col-1])===id);return i<0?null:{getRow:()=>i+1};}};}
      };
    }
  }
  const sheets={Base:new Sheet([['id','enunciado','status'],['1','Original','pendente'],['2','Segunda','pendente']])};
  const props={APEX_ACCESS_KEY:'test-key',APEX_BASE_SHEET:'Base'};
  let held=false;
  const context=vm.createContext({SpreadsheetApp:{openById:()=>({getSheetByName:n=>sheets[n],insertSheet:n=>(sheets[n]=new Sheet())}),flush(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;},hasLock:()=>held,releaseLock(){held=false;}})},
    ContentService:{createTextOutput:t=>({setMimeType:()=>JSON.parse(t)}),MimeType:{JSON:'json'}},console});
  vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);
  let seq=0;
  const call=(action,items,extra={})=>context.doPost({postData:{contents:JSON.stringify({key:'test-key',actor:'patrick',session:'session-patrick-1234567890',request:`request-1234567890-${++seq}`,action,items,...extra})}});
  return {call,sheets,props};
}
test('one curator claims; another cannot claim, save or release',()=>{
 const {call}=fixture(); assert.equal(call('claim',[{id:'1',version:0}]).ok,true);
 for(const action of ['claim','save','assign']) assert.equal(call(action,[{id:'1',version:1}],{actor:'lucas',session:'session-lucas-12345678900'}).ok,false);
});
test('same curator in two tabs cannot overwrite and stale versions fail',()=>{
 const {call}=fixture();call('claim',[{id:'1',version:0}]);
 assert.equal(call('claim',[{id:'1',version:1}],{session:'another-tab-12345678900'}).ok,false);
 assert.equal(call('save',[{id:'1',version:0,patch:{enunciado:'stale'}}]).ok,false);
 assert.equal(call('save',[{id:'1',version:1,patch:{enunciado:'new'}}]).ok,true);
 assert.equal(call('save',[{id:'1',version:1,patch:{enunciado:'overwrite'}}]).ok,false);
});
test('batch conflicts do not partially commit',()=>{
 const {call,sheets}=fixture();call('claim',[{id:'2',version:0}],{actor:'lucas'});
 const before=sheets._apex_collaboration_v2.rows.length;
 assert.equal(call('assign',[{id:'1',version:0,target:'patrick'},{id:'2',version:1,target:'patrick'}]).ok,false);
 assert.equal(sheets._apex_collaboration_v2.rows.length,before);
 assert.equal(call('claim',[{id:'1',version:0}]).ok,true);
});
test('journal persists edits for reconnect, uses pages, and requests are idempotent',()=>{
 const {call,sheets}=fixture();const request='repeat-request-123456789';
 call('claim',[{id:'1',version:0}],{request});call('claim',[{id:'1',version:0}],{request});
 assert.equal(sheets._apex_collaboration_v2.rows.length,2);
 call('save',[{id:'1',version:1,patch:{enunciado:'edited',responsavel_id:'lucas'}}]);
 const sync=call('sync',undefined,{cursor:0});
 assert.equal(sync.entries.length,2);assert.equal(sync.entries[1].changes[0].patch.enunciado,'edited');
 assert.equal(sync.entries[1].changes[0].patch.responsavel_id,undefined);
 assert.equal(call('sync',undefined,{cursor:sync.cursor}).entries.length,0);
 assert.equal(call('base',undefined,{offset:0}).questions.length,2);
});
test('expired lease blocks save; ownership remains until explicitly released',()=>{
 const {call,props}=fixture();call('claim',[{id:'1',version:0}]);
 const leases=JSON.parse(props.APEX_LEASES);leases['1'].until=1;props.APEX_LEASES=JSON.stringify(leases);
 assert.equal(call('save',[{id:'1',version:1,patch:{enunciado:'lost'}}]).ok,false);
 assert.equal(call('claim',[{id:'1',version:1}],{actor:'lucas'}).ok,false);
 assert.equal(call('claim',[{id:'1',version:1}]).ok,true);
 assert.equal(call('assign',[{id:'1',version:2,target:null}]).ok,true);
 assert.equal(call('claim',[{id:'1',version:3}],{actor:'lucas',session:'session-lucas-12345678900'}).ok,true);
});
test('unauthenticated and oversized operations fail without writes',()=>{
 const {call,sheets}=fixture();assert.equal(call('sync',null,{key:'wrong'}).ok,false);
 call('claim',[{id:'1',version:0}]);
 assert.equal(call('save',[{id:'1',version:1,patch:{enunciado:'x'.repeat(46000)}}]).ok,false);
 assert.equal(sheets._apex_collaboration_v2.rows.length,2);
});
