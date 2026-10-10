import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {create, act} from 'react-test-renderer';
import {BatchAssignModal} from '../src/components/BatchAssignModal';
import {SqlEditorModal} from '../src/components/SqlEditorModal';
import {QuestionsTable} from '../src/components/QuestionsTable';
import {DEFAULT_CURATORS} from '../src/data/defaultCurators';
import type {Question} from '../src/types/question';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const actor = DEFAULT_CURATORS[0];
const rows = ['1','2','3'].map(id=>({id,status:'pendente',enunciado:'Question '+id,correta:'A'})) as Question[];
const common = {questions:rows,activeCurator:actor,curators:DEFAULT_CURATORS,onClose:()=>{},onShowToast:()=>{},busy:false};

for (const [name, Component, props] of [
  ['batch', BatchAssignModal, {onAssignBatch:async()=>true,onReleaseAllMyAssignments:async()=>true}],
  ['sql', SqlEditorModal, {auditLogs:[],allQuestions:rows,onClearLogs:()=>{}}],
] as const) {
  test(`${name} modal can open, close, and reopen without changing hook order`, async () => {
    let renderer: any;
    const C = Component as any;
    await act(async()=> {renderer=create(<C {...common} {...props} isOpen={false}/>);});
    assert.equal(renderer.toJSON(),null);
    for (const open of [true,false,true]) {
      await act(async()=> {renderer.update(<C {...common} {...props} isOpen={open}/>);});
      assert.equal(renderer.toJSON()!==null,open);
    }
    await act(async()=>renderer.unmount());
  });
}

test('table sends the exact selected IDs and clears selection only after success', async () => {
  let renderer:any;
  const calls:unknown[]=[];
  let succeed=false;
  await act(async()=> {renderer=create(<QuestionsTable {...common} presences={{}} comments={{}}
    onSelectQuestion={()=>{}} onUpdateStatus={async()=>true} onAssignQuestion={()=>{}}
    onSelectedQuestions={async(ids,action)=>{calls.push({ids,action});return succeed;}}/>);});
  const checkbox=(id:string)=>renderer.root.findByProps({'aria-label':`Selecionar questão ${id}`});
  await act(async()=>checkbox('1').props.onChange());
  await act(async()=>checkbox('3').props.onChange());
  const action=()=>renderer.root.findAllByType('button').find((b:any)=>b.children.includes('Assumir selecionadas'));
  await act(async()=>action().props.onClick());
  assert.deepEqual(calls[0],{ids:['1','3'],action:'assign'});
  assert.equal(checkbox('1').props.checked,true);
  succeed=true;
  await act(async()=>action().props.onClick());
  assert.equal(checkbox('1').props.checked,false);
  await act(async()=>renderer.unmount());
});

test('open button stops row propagation, causing one open request', async () => {
  let renderer:any;
  let opens=0, stopped=false;
  await act(async()=> {renderer=create(<QuestionsTable {...common} presences={{}} comments={{}}
    onSelectQuestion={()=>{opens++;}} onUpdateStatus={async()=>true} onAssignQuestion={()=>{}}
    onSelectedQuestions={async()=>true}/>);});
  const button=renderer.root.findAllByProps({title:'Abrir em tela cheia'})[0];
  button.props.onClick({stopPropagation:()=>{stopped=true;}});
  assert.equal(stopped,true);
  assert.equal(opens,1);
  await act(async()=>renderer.unmount());
});

test('statistics SQL panel updates when shared corrections arrive from another curator', async () => {
  const {CorrectedQuestionsSql}=await import('../src/components/CorrectedQuestionsSql');
  let renderer:any;
  await act(async()=>{renderer=create(<CorrectedQuestionsSql questions={[]} onShowToast={()=>{}}/>);});
  const sql=()=>renderer.root.findByProps({'aria-label':'SQL acumulado de correções'}).props.value;
  assert.match(sql(),/Nenhuma questão/);
  await act(async()=>{renderer.update(<CorrectedQuestionsSql questions={[
    {...rows[0],status:'questao_corrigida',revisado_por:'Lucas'},
    {...rows[1],status:'aprovadas',modificado:true,revisado_por:'Thierry'},
  ]} onShowToast={()=>{}}/>);});
  assert.match(sql(),/WHERE id = 1;/);assert.match(sql(),/WHERE id = 2;/);
  assert.equal((sql().match(/UPDATE public.questions/g)||[]).length,2);
  await act(async()=>renderer.unmount());
});

test('overlapping polling and recovery share one incremental sync request', async () => {
  const {fetchShared}=await import('../src/lib/collaboration');
  const originalFetch=globalThis.fetch;
  const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  let calls=0;
  let finish:(value:any)=>void;
  const response=new Promise(resolve=>{finish=resolve;});
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>key.includes('supabase_session')?'test-token':null}});
  globalThis.fetch=(async()=>{calls++;return (await response as Response).clone();}) as typeof fetch;
  try {
    const first=fetchShared();const second=fetchShared();
    assert.equal(first,second);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1);
    finish!(new Response(JSON.stringify({questions:[],removed_ids:[],cursor:0,more:false,leases:{}}),{status:200,headers:{'Content-Type':'application/json'}}));
    await first;
    await fetchShared();assert.equal(calls,2);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalStorage) Object.defineProperty(globalThis,'sessionStorage',originalStorage);
    else delete (globalThis as any).sessionStorage;
  }
});

import {QuestionEditor} from '../src/components/QuestionEditor';
test('question editor exposes every writable field and preserves edits across sections',async()=>{
 let renderer:any;let latest:Question={...rows[0],sync_source_id:'1'};let saves=0;
 const render=()=> <QuestionEditor question={latest} busy={false} onChange={q=>{latest=q;renderer.update(render());}} onSave={async()=>{saves++;}} onCancel={()=>{}}/>;
 await act(async()=>{renderer=create(render());});
 await act(async()=>renderer.root.findByProps({'aria-label':'Alternativa A'}).props.onChange({target:{value:'Updated alternative'}}));
 await act(async()=>renderer.root.findAllByProps({role:'tab'})[1].props.onClick());
 assert.equal(renderer.root.findAllByType('textarea').length,6);
 await act(async()=>renderer.root.findByProps({'aria-label':'Comentário geral'}).props.onChange({target:{value:'Explanation'}}));
 await act(async()=>renderer.root.findAllByProps({role:'tab'})[2].props.onClick());
 for(const label of ['ID da questão','Categoria','Especialidade','Tema específico','Ano','Origem','Data de criação','Dificuldade','Competências','Descritores']) assert.ok(renderer.root.findByProps({'aria-label':label}));
 await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(latest.a,'Updated alternative');assert.equal(latest.comentario,'Explanation');assert.equal(saves,1);
 await act(async()=>renderer.unmount());
});


test('Supabase first page is delivered before remaining pages and idle sync does not replay changes', async () => {
  const {loadSupabaseBase, fetchSupabaseShared}=await import('../src/lib/supabaseCuration');
  const originalFetch=globalThis.fetch;
  const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=> 'test-token'}});
  let baseCalls=0, syncCalls=0;
  let release:()=>void;
  const remaining=new Promise<void>(resolve=>{release=resolve;});
  const page=Array.from({length:500},(_,index)=>({...rows[0],id:String(index+1),sync_version:0}));
  const delivered:Question[][]=[];
  globalThis.fetch=(async(input:any)=> {
    const url=String(input);
    assert.ok(url.startsWith('https://jcbinmjiimqomjdyfdia.supabase.co/rest/v1/rpc/'));
    let result:any;
    if(url.endsWith('curation_initial_cursor')) result=10;
    else if(url.endsWith('curation_base')) {
      if(++baseCalls===1) result=page;
      else {await remaining;result=[];}
    } else {
      result={questions:++syncCalls===1?[{...rows[0],sync_version:1}]:[],removed_ids:[],cursor:11,more:false,leases:{}};
    }
    return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try {
    const loading=loadSupabaseBase(part=>delivered.push(part));
    for(let i=0;i<20 && !delivered.length;i++) await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(delivered[0].length,500);
    release!();assert.equal((await loading).length,500);
    assert.equal((await fetchSupabaseShared()).rows.length,1);
    assert.equal((await fetchSupabaseShared()).rows.length,0);
  } finally {
    release!();globalThis.fetch=originalFetch;
    if(originalStorage) Object.defineProperty(globalThis,'sessionStorage',originalStorage);
    else delete (globalThis as any).sessionStorage;
  }
});
