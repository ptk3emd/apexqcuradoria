import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {create, act} from 'react-test-renderer';
import {BatchAssignModal} from '../src/components/BatchAssignModal';
import {SqlWorkspace} from '../src/components/SqlWorkspace';
import {QuestionsTable} from '../src/components/QuestionsTable';
import {DEFAULT_CURATORS} from '../src/data/defaultCurators';
import type {Question} from '../src/types/question';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const actor = DEFAULT_CURATORS[0];
const rows = ['1','2','3'].map(id=>({id,status:'pendente',enunciado:'Question '+id,correta:'A'})) as Question[];
const common = {questions:rows,activeCurator:actor,curators:DEFAULT_CURATORS,onClose:()=>{},onShowToast:()=>{},busy:false};

test('SQL batches: copy and download stay visible, marked batches leave the pending list and come back when corrected again', async () => {
  const originals = new Map(['localStorage','navigator','window','fetch','sessionStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const saved = new Map<string,string>();
  let clipboard = '';
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{getItem:(key:string)=>saved.get(key) ?? null, setItem:(key:string,value:string)=>saved.set(key,value)}});
  Object.defineProperty(globalThis, 'sessionStorage', {configurable:true, value:{getItem:()=> 'token', removeItem:()=>{}}});
  Object.defineProperty(globalThis, 'navigator', {configurable:true, value:{clipboard:{writeText:async(text:string)=>{clipboard=text;}}}});
  Object.defineProperty(globalThis, 'window', {configurable:true, value:{isSecureContext:true, dispatchEvent:()=>{}}});
  // Server without migration 20261029150000: marks stay in this browser.
  Object.defineProperty(globalThis, 'fetch', {configurable:true, writable:true, value:async()=>new Response(JSON.stringify({code:'PGRST202',message:'Could not find the function public.curation_sql_state'}),{status:404,headers:{'Content-Type':'application/json'}})});
  let renderer:any;
  const questions = Array.from({length:51}, (_, i)=>({id:String(i+1),status:'questao_corrigida',enunciado:'Correction',sync_version:1} as Question));
  const render = (data=questions) => <SqlWorkspace {...common} auditLogs={[]} allQuestions={data} onClearLogs={()=>{}}/>;
  const textOf = (node:any):string => typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('');
  const button = (text:string) => renderer.root.findAllByType('button').filter((node:any)=>textOf(node).includes(text));
  const settle = async () => { for (let i=0;i<5;i++) await act(async()=>{await new Promise(r=>setTimeout(r,0));}); };
  try {
    await act(async()=>{renderer=create(render());});
    await settle();
    const headings = () => renderer.root.findAllByType('h2').map((h:any)=>h.children.join(''));
    assert.deepEqual(headings(), ['Lote 1','Lote 2']);
    assert.equal(renderer.root.findAllByType('pre').length, 0);
    await act(async()=>button('Copiar SQL')[1].props.onClick());
    assert.match(clipboard,/WHERE id = 51;/);
    await act(async()=>button('Ver SQL')[0].props.onClick());
    assert.equal(renderer.root.findAllByType('pre').length, 1);
    await act(async()=>{await button('Marcar migrado')[0].props.onClick();});
    await settle();
    assert.deepEqual(headings(), ['Lote 2']);
    await act(async()=>renderer.unmount());
    await act(async()=>{renderer=create(render());});
    await settle();
    assert.deepEqual(headings(), ['Lote 2']);
    await act(async()=>renderer.update(render(questions.map(q=>q.id==='3'?{...q,sync_version:2}:q))));
    await settle();
    assert.deepEqual(headings(), ['Lote 2']);
    assert.match(textOf(renderer.root), /2 correções pendentes/);
  } finally {
    if(renderer) await act(async()=>renderer.unmount());
    for(const [name, original] of originals) {
      if(original) Object.defineProperty(globalThis,name,original);
      else delete (globalThis as any)[name];
    }
  }
});

for (const [name, Component, props] of [
  ['batch', BatchAssignModal, {onAssignBatch:async()=>true,onReleaseAllMyAssignments:async()=>true}],
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
 assert.equal(renderer.root.findAllByType('textarea').length,7);
 await act(async()=>renderer.root.findByProps({'aria-label':'Comentário geral'}).props.onChange({target:{value:'Explanation'}}));
 await act(async()=>renderer.root.findByProps({'aria-label':'Referências'}).props.onChange({target:{value:'Ver https://example.org/d.pdf'}}));
 assert.equal(renderer.root.findAll((node:any)=>node.type==='a'&&node.props.href==='https://example.org/d.pdf').length,1);
 await act(async()=>renderer.root.findAllByProps({role:'tab'})[2].props.onClick());
 for(const label of ['ID da questão','Categoria','Especialidade','Tema específico','Ano','Origem','Data de criação','Dificuldade','Competências','Descritores']) assert.ok(renderer.root.findByProps({'aria-label':label}));
 await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(latest.a,'Updated alternative');assert.equal(latest.comentario,'Explanation');assert.equal(latest.referencias,'Ver https://example.org/d.pdf');assert.equal(saves,1);
 await act(async()=>renderer.unmount());
});

test('marking a question as annulled clears and locks the answer key; unmarking requires a new one',async()=>{
 let renderer:any;let latest:Question={...rows[0],correta:'B',sync_source_id:'1'};let saves=0;
 const render=()=> <QuestionEditor question={latest} busy={false} onChange={q=>{latest=q;renderer.update(render());}} onSave={async()=>{saves++;}} onCancel={()=>{}}/>;
 await act(async()=>{renderer=create(render());});
 const box=()=>renderer.root.findByProps({type:'checkbox'});
 await act(async()=>box().props.onChange({target:{checked:true}}));
 assert.equal(latest.anulada,true);assert.equal(latest.correta,'');
 assert.ok(renderer.root.findAllByProps({name:'correta'}).every((r:any)=>r.props.disabled&&!r.props.checked));
 await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(saves,1);
 await act(async()=>box().props.onChange({target:{checked:false}}));
 await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(saves,1);assert.match(renderer.root.findByProps({role:'alert'}).children.join(''),/anulada/);
 await act(async()=>renderer.unmount());
});


import {QuestionImageField} from '../src/components/QuestionImageField';
const FIGURE='https://beedxpjaufgujusyuziq.supabase.co/storage/v1/object/public/question-images/1/3f2a9c1e-6c1b-4a0e-9a53-7d2b8f5e1a10.webp';
const textOf=(node:any):string=>typeof node==='string'?node:(node.children??[]).map(textOf).join('');
test('image field: add when empty; with a figure it shows the caption box and removing asks first',async()=>{
 let renderer:any;const patches:Partial<Question>[]=[];
 let current:Question={...rows[0],sync_source_id:'1'};
 const render=()=> <QuestionImageField question={current} onChange={p=>{patches.push(p);}}/>;
 await act(async()=>{renderer=create(render());});
 assert.match(textOf(renderer.root),/Adicionar imagem/);
 assert.equal(renderer.root.findAllByType('textarea').length,0,'no caption box without a figure');
 assert.equal(renderer.root.findAllByType('img').length,0);

 current={...current,imagem:FIGURE,imagem_legenda:'ECG com supradesnivelamento de ST'};
 await act(async()=>{renderer.update(render());});
 assert.match(textOf(renderer.root),/Trocar imagem/);
 assert.equal(renderer.root.findByType('img').props.alt,'ECG com supradesnivelamento de ST');
 assert.equal(renderer.root.findByType('textarea').props.value,'ECG com supradesnivelamento de ST');
 await act(async()=>renderer.root.findByType('textarea').props.onChange({target:{value:'Nova descrição'}}));
 assert.deepEqual(patches.at(-1),{imagem_legenda:'Nova descrição'});

 // Removing needs a confirmation: nothing changes until it is given.
 const before=patches.length;
 const removeButtons=()=>renderer.root.findAll((n:any)=>n.type==='button'&&/Remover imagem/.test(textOf(n)));
 assert.equal(removeButtons().length,1);
 await act(async()=>removeButtons()[0].props.onClick());
 assert.equal(patches.length,before,'removal waited for the confirmation');
 const dialog=renderer.root.findByProps({role:'alertdialog'});
 await act(async()=>dialog.findAll((n:any)=>n.type==='button'&&textOf(n)==='Voltar')[0].props.onClick());
 assert.equal(patches.length,before,'going back removes nothing');
 await act(async()=>removeButtons()[0].props.onClick());
 await act(async()=>renderer.root.findByProps({role:'alertdialog'}).findAll((n:any)=>n.type==='button'&&/Remover imagem/.test(textOf(n)))[0].props.onClick());
 assert.deepEqual(patches.at(-1),{imagem:null,imagem_legenda:null});
 await act(async()=>renderer.unmount());
});

test('saving is refused for a figure without its description or outside the Apex bucket',async()=>{
 let renderer:any;let latest:Question={...rows[0],sync_source_id:'1',imagem:FIGURE};let saves=0;
 const render=()=> <QuestionEditor question={latest} busy={false} onChange={q=>{latest=q;renderer.update(render());}} onSave={async()=>{saves++;}} onCancel={()=>{}}/>;
 await act(async()=>{renderer=create(render());});
 const submit=()=>act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
 await submit();
 assert.equal(saves,0);assert.match(renderer.root.findByProps({role:'alert'}).children.join(''),/Descreva a imagem/);
 await act(async()=>renderer.root.findByProps({'aria-invalid':true}).props.onChange({target:{value:'   '}}));
 await submit();assert.equal(saves,0);
 latest={...latest,imagem:'https://exemplo.com/a.webp',imagem_legenda:'Descrição'};await act(async()=>renderer.update(render()));
 await submit();assert.equal(saves,0);assert.match(renderer.root.findAllByProps({role:'alert'}).map((n:any)=>n.children.join('')).join(' '),/botão de imagem/);
 latest={...latest,imagem:FIGURE};await act(async()=>renderer.update(render()));
 await submit();assert.equal(saves,1);
 await act(async()=>renderer.unmount());
});

test('AI verification buttons write one managed sentence to the general comment on the Resolução tab',async()=>{
 let renderer:any;let latest:Question={...rows[0],comentario:'Comentário original.',sync_source_id:'1'};
 const render=()=> <QuestionEditor question={latest} busy={false} onChange={q=>{latest=q;renderer.update(render());}} onSave={async()=>{}} onCancel={()=>{}}/>;
 await act(async()=>{renderer=create(render());});
 await act(async()=>renderer.root.findAllByProps({role:'tab'})[1].props.onClick());
 const toggle=(label:string)=>act(async()=>renderer.root.findByProps({'aria-label':label,role:'checkbox'}).props.onClick());
 await toggle('ChatGPT');
 await toggle('Claude');
 assert.equal(latest.comentario,'Comentário original.\n\nQuestão verificada por IA: ChatGPT e Claude.');
 assert.equal(renderer.root.findByProps({'aria-label':'Claude',role:'checkbox'}).props['aria-checked'],true);
 assert.equal(renderer.root.findByProps({'aria-label':'Gemini',role:'checkbox'}).props['aria-checked'],false);
 await toggle('ChatGPT');
 await toggle('Claude');
 assert.equal(latest.comentario,'Comentário original.');
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
    // A server without migration 20261028150000 falls back to curation_base.
    if(url.endsWith('curation_list_plan')) return new Response(JSON.stringify({code:'PGRST202',message:'Could not find the function public.curation_list_plan(p_block) in the schema cache'}),{status:404,headers:{'Content-Type':'application/json'}});
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

test('Supabase light list requests every planned block at once and loads full text on demand', async () => {
  const {loadSupabaseBase, loadFullQuestions, mutateSupabase}=await import('../src/lib/supabaseCuration');
  const originalFetch=globalThis.fetch;
  const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=> 'test-token'}});
  let inFlight=0, peak=0;
  const requested:any[]=[];
  globalThis.fetch=(async(input:any,init:any)=> {
    const url=String(input);
    const body=init?.body ? JSON.parse(String(init.body)) : {};
    let result:any;
    if(url.endsWith('curation_list_plan')) result={cursor:7,block:1000,starts:['1','1001','2001','3001']};
    else if(url.endsWith('curation_list')) {
      requested.push(body);inFlight++;peak=Math.max(peak,inFlight);
      await new Promise(resolve=>setTimeout(resolve,5));inFlight--;
      result=[{...rows[0],id:body.p_from,enunciado:'Prévia',a:undefined,parcial:true,sync_version:0}];
    } else if(url.endsWith('curation_full')) result=body.p_ids.map((id:string)=>({...rows[0],id,sync_version:0}));
    else throw new Error('inesperado '+url);
    return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try {
    const loaded=await loadSupabaseBase();
    assert.equal(peak,4);
    assert.deepEqual(requested.map(r=>[r.p_from,r.p_to]),[['1','1001'],['1001','2001'],['2001','3001'],['3001',null]]);
    assert.equal(loaded.length,4);assert.ok(loaded.every(q=>q.parcial));
    await assert.rejects(mutateSupabase([loaded[0]],'save'),/carregando/);
    const full=await loadFullQuestions(['1001']);
    assert.equal(full[0].parcial,false);assert.equal(full[0].a,rows[0].a);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalStorage) Object.defineProperty(globalThis,'sessionStorage',originalStorage);
    else delete (globalThis as any).sessionStorage;
  }
});

test('difficulty card uses schema values and clears undefined difficulty to null', async()=>{
 let renderer:any;let latest:Question={...rows[0],difficulty_bucket:'Média'};
 const render=()=> <QuestionEditor question={latest} busy={false} onChange={q=>{latest=q;renderer.update(render());}} onSave={async()=>{}} onCancel={()=>{}}/>;
 await act(async()=>{renderer=create(render());});
 await act(async()=>renderer.root.findAllByProps({role:'tab'})[2].props.onClick());
 const select=()=>renderer.root.findByProps({'aria-label':'Dificuldade'});
 assert.equal(select().props.value,'medium');
 assert.deepEqual(select().findAllByType('option').map((option:any)=>option.props.value),['','easy','medium','hard']);
 for(const value of ['easy','medium','hard']) {
   await act(async()=>select().props.onChange({target:{value}}));
   assert.equal(latest.difficulty_bucket,value);
 }
 await act(async()=>select().props.onChange({target:{value:''}}));
 assert.equal(latest.difficulty_bucket,null);
 await act(async()=>renderer.unmount());
});

test('save sends only supported difficulty values to Supabase and rejects unknown labels',async()=>{
 const {mutateSupabase}=await import('../src/lib/supabaseCuration');
 const originalFetch=globalThis.fetch;
 const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=> 'test-token'}});
 const payloads:any[]=[];
 globalThis.fetch=(async(_input:any,init:any)=>{
   payloads.push(JSON.parse(init.body));
   return new Response(JSON.stringify({questions:[]}),{status:200,headers:{'Content-Type':'application/json'}});
 }) as typeof fetch;
 try {
   for(const [input,expected] of [['Fácil','easy'],['Média','medium'],['Médio','medium'],['Difícil','hard'],['easy','easy'],['medium','medium'],['hard','hard'],['',null],[null,null],[undefined,undefined]] as const) {
     await mutateSupabase([{...rows[0],difficulty_bucket:input}],'save');
     assert.equal(payloads.at(-1).p_items[0].patch.difficulty_bucket,expected);
   }
   const count=payloads.length;
   await assert.rejects(mutateSupabase([{...rows[0],difficulty_bucket:'impossível'}],'save'),/easy, medium ou hard/);
   assert.equal(payloads.length,count);
 } finally {
   globalThis.fetch=originalFetch;
   if(originalStorage) Object.defineProperty(globalThis,'sessionStorage',originalStorage);
   else delete (globalThis as any).sessionStorage;
 }
});

test('table sorting exposes native keyboard buttons and announces sort direction', async()=>{
 let renderer:any;
 await act(async()=>{renderer=create(<QuestionsTable {...common} presences={{}} comments={{}} onSelectQuestion={()=>{}} onUpdateStatus={async()=>true} onAssignQuestion={()=>{}} onSelectedQuestions={async()=>true}/>);});
 for(const label of ['ID','Status','Especialidade / Tema']) {
   const button=renderer.root.findByProps({'aria-label':`Ordenar por ${label}`});
   assert.equal(button.type,'button');
   await act(async()=>button.props.onClick());
   assert.ok(renderer.root.findAllByType('th').some((th:any)=>['ascending','descending'].includes(th.props['aria-sort'])));
 }
 await act(async()=>renderer.unmount());
});

test('unauthenticated app exposes only login controls, without background audit controls', async()=>{
 const {default:App}=await import('../src/App');
 const originals=new Map(['window','localStorage','sessionStorage'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
 for(const name of ['localStorage','sessionStorage']) Object.defineProperty(globalThis,name,{configurable:true,value:{getItem:()=>null,setItem(){},removeItem(){}}});
 let renderer:any;
 try {
   await act(async()=>{renderer=create(<App/>);});
   assert.equal(renderer.root.findAllByType('table').length,0);
   assert.equal(renderer.root.findAllByProps({'aria-label':'Buscar questões'}).length,0);
   assert.equal(renderer.root.findAllByProps({'aria-label':'Senha mestra'}).length,1);
 } finally {
   if(renderer) await act(async()=>renderer.unmount());
   for(const [name,descriptor] of originals) {
     if(descriptor) Object.defineProperty(globalThis,name,descriptor);
     else delete (globalThis as any)[name];
   }
 }
});

import {QuestionDetailView} from '../src/components/QuestionDetailView';
import {presencesFromLeases} from '../src/lib/supabaseCuration';

test('AI verification accepts a typed AI, refuses a name that would break the sentence, and lists typed names as removable',async()=>{
 let renderer:any;let latest:Question={...rows[0],comentario:'Comentário original.',sync_source_id:'1'};
 const render=()=> <QuestionEditor question={latest} busy={false} onChange={q=>{latest=q;renderer.update(render());}} onSave={async()=>{}} onCancel={()=>{}}/>;
 await act(async()=>{renderer=create(render());});
 await act(async()=>renderer.root.findAllByProps({role:'tab'})[1].props.onClick());
 const field=()=>renderer.root.findByProps({'aria-label':'Outra IA'});
 const addButton=()=>renderer.root.findAll((n:any)=>n.type==='button'&&n.props.children==='Adicionar IA')[0];
 await act(async()=>field().props.onChange({target:{value:'Ana, Bia'}}));
 await act(async()=>addButton().props.onClick());
 assert.equal(latest.comentario,'Comentário original.');
 assert.match(JSON.stringify(renderer.toJSON()),/vírgula/);
 await act(async()=>field().props.onChange({target:{value:'Perplexity'}}));
 await act(async()=>addButton().props.onClick());
 assert.equal(latest.comentario,'Comentário original.\n\nQuestão verificada por IA: Perplexity.');
 assert.equal(renderer.root.findByProps({'aria-label':'Perplexity',role:'checkbox'}).props['aria-checked'],true);
 await act(async()=>renderer.root.findByProps({'aria-label':'Perplexity',role:'checkbox'}).props.onClick());
 assert.equal(latest.comentario,'Comentário original.');
 await act(async()=>renderer.unmount());
});

test('presence lists every curator on a question and still reads the single-lease format',()=>{
 const until=Date.now()+60000;
 const list=presencesFromLeases([{question_id:'1',actor:'patrick',name:'Patrick',session:'s1',until},{question_id:'1',actor:'lucas',name:'Lucas',session:'s2',until}]);
 assert.deepEqual(Object.values(list).map(p=>[p.questao_atual_id,p.curador_id]).sort(),[['1','lucas'],['1','patrick']]);
 const legacy=presencesFromLeases({'7':{actor:'thierry',name:'Thierry',session:'s3',until}});
 assert.deepEqual(Object.values(legacy).map(p=>[p.questao_atual_id,p.curador_id]),[['7','thierry']]);
 assert.deepEqual(presencesFromLeases(undefined),{});
});

test('editing with someone else on the question: remote saves arrive live and only changed fields are saved',async()=>{
 // QuestionDetailView binds arrow-key navigation on window.
 const g=globalThis as any;const hadWindow='window' in g;
 if(!hadWindow) g.window={addEventListener(){},removeEventListener(){}};
 const base={id:'1',sync_source_id:'1',sync_version:1,status:'pendente',enunciado:'Original',comentario:'C0',a:'A0',correta:'A'} as Question;
 const lucas=DEFAULT_CURATORS.find(c=>c.id==='lucas')!;
 const presences={'s2:1':{curador_id:'lucas',curador_nome:lucas.nome,curador_cor:'#3b82f6',questao_atual_id:'1',status_atividade:'visualizando',ultima_atividade:new Date().toISOString()}} as any;
 const saves:{q:Question;fields?:readonly string[]}[]=[];
 const view=(question:Question)=> <QuestionDetailView question={question} busy={false} allQuestions={[question]} activeCurator={actor} presences={presences} comments={[]}
  onBackToList={()=>{}} onNavigateQuestion={()=>{}} onUpdateQuestion={async(q,fields)=>{saves.push({q,fields});return true;}} onUpdateStatus={async()=>true}
  onAssignQuestion={()=>{}} onAddComment={async()=>true} onShowToast={()=>{}}/>;
 let renderer:any;
 await act(async()=>{renderer=create(view(base));});
 const text=(node:any):string=>typeof node==='string'?node:(node.children||[]).map(text).join('');
 assert.match(text(renderer.toJSON()),/Edição compartilhada/);
 const edit=renderer.root.findAll((n:any)=>n.type==='button'&&/Editar questão/.test(text(n)))[0];
 await act(async()=>edit.props.onClick());
 await act(async()=>renderer.root.findByProps({'aria-label':'Enunciado'}).props.onChange({target:{value:'Meu enunciado'}}));
 // Another curator saves the enunciado and the comentário.
 await act(async()=>renderer.update(view({...base,sync_version:2,enunciado:'Enunciado remoto',comentario:'Comentário remoto'})));
 assert.equal(renderer.root.findByProps({'aria-label':'Enunciado'}).props.value,'Meu enunciado');
 assert.match(text(renderer.toJSON()),/Outra pessoa também alterou este campo/);
 assert.match(text(renderer.toJSON()),/também está nesta questão/);
 await act(async()=>renderer.root.findAllByProps({role:'tab'})[1].props.onClick());
 assert.equal(renderer.root.findByProps({'aria-label':'Comentário geral'}).props.value,'Comentário remoto');
 await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(saves.length,1);
 assert.deepEqual(saves[0].fields,['enunciado']);
 assert.equal(saves[0].q.enunciado,'Meu enunciado');
 await act(async()=>renderer.unmount());
 if(!hadWindow) delete g.window;
});

test('detail view never shows a fake answer key and asks before changing the gabarito, eliminating or discarding an edit',async()=>{
 const g=globalThis as any;const hadWindow='window' in g;
 if(!hadWindow) g.window={addEventListener(){},removeEventListener(){}};
 const base={id:'5',sync_source_id:'5',sync_version:1,status:'pendente',enunciado:'Enunciado',comentario:'',a:'A0',b:'B0',correta:''} as Question;
 const updates:{q:Question;fields?:readonly string[]}[]=[];const statuses:string[]=[];
 const view=(question:Question)=> <QuestionDetailView question={question} busy={false} allQuestions={[question]} activeCurator={actor} presences={{}} comments={[]}
  onBackToList={()=>{}} onNavigateQuestion={()=>{}} onUpdateQuestion={async(q,fields)=>{updates.push({q,fields});return true;}} onUpdateStatus={async(_id,status)=>{statuses.push(status);return true;}}
  onAssignQuestion={()=>{}} onAddComment={async()=>true} onShowToast={()=>{}}/>;
 const text=(node:any):string=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
 const dialogs=(r:any)=>r.root.findAll((n:any)=>n.props&&n.props.role==='alertdialog');
 let renderer:any;
 await act(async()=>{renderer=create(view(base));});
 assert.match(text(renderer.toJSON()),/Sem gabarito oficial/);
 assert.equal(dialogs(renderer).length,0);
 // Choosing a letter opens a confirmation; nothing is saved until it is confirmed.
 await act(async()=>renderer.root.findByProps({'aria-label':'Definir C como gabarito oficial'}).props.onClick());
 assert.equal(dialogs(renderer).length,1);
 assert.equal(updates.length,0);
 await act(async()=>renderer.root.findByProps({'aria-label':'Definir C como gabarito oficial'}).props.onClick());
 await act(async()=>dialogs(renderer)[0].findAll((n:any)=>n.type==='button'&&n.props.onClick&&/Confirmar gabarito/.test(text(n)))[0].props.onClick());
 assert.equal(updates.length,1);assert.equal(updates[0].q.correta,'C');assert.deepEqual(updates[0].fields,['anulada','correta']);
 // Eliminating asks first too.
 await act(async()=>renderer.root.findAll((n:any)=>n.type==='button'&&/Eliminar questão/.test(text(n)))[0].props.onClick());
 assert.equal(statuses.length,0);
 await act(async()=>dialogs(renderer)[0].findAll((n:any)=>n.type==='button'&&/Eliminar questão/.test(text(n)))[0].props.onClick());
 assert.deepEqual(statuses,['eliminar_questao']);
 await act(async()=>renderer.unmount());
 if(!hadWindow) delete g.window;
});

test('cancelling an edit with unsaved changes asks before discarding them',async()=>{
 const g=globalThis as any;const hadWindow='window' in g;
 if(!hadWindow) g.window={addEventListener(){},removeEventListener(){}};
 const base={id:'6',sync_source_id:'6',sync_version:1,status:'pendente',enunciado:'Original',comentario:'',a:'A0',b:'B0',correta:'A'} as Question;
 const text=(node:any):string=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
 const dialogs=(r:any)=>r.root.findAll((n:any)=>n.props&&n.props.role==='alertdialog');
 let renderer:any;
 await act(async()=>{renderer=create(<QuestionDetailView question={base} busy={false} allQuestions={[base]} activeCurator={actor} presences={{}} comments={[]}
  onBackToList={()=>{}} onNavigateQuestion={()=>{}} onUpdateQuestion={async()=>true} onUpdateStatus={async()=>true}
  onAssignQuestion={()=>{}} onAddComment={async()=>true} onShowToast={()=>{}}/>);});
 await act(async()=>renderer.root.findAll((n:any)=>n.type==='button'&&/Editar questão/.test(text(n)))[0].props.onClick());
 // Without changes, cancelling closes straight away.
 await act(async()=>renderer.root.findByProps({'aria-label':'Alternativa A'}).props.onChange({target:{value:'Mudei'}}));
 await act(async()=>renderer.root.findAll((n:any)=>n.type==='button'&&/Cancelar edição/.test(text(n)))[0].props.onClick());
 assert.equal(dialogs(renderer).length,1);
 assert.match(text(dialogs(renderer)[0]),/Descartar as alterações/);
 await act(async()=>dialogs(renderer)[0].findAll((n:any)=>n.type==='button'&&/Voltar/.test(text(n)))[0].props.onClick());
 assert.equal(dialogs(renderer).length,0);
 assert.equal(renderer.root.findByProps({'aria-label':'Alternativa A'}).props.value,'Mudei');
 await act(async()=>renderer.unmount());
 if(!hadWindow) delete g.window;
});

test('filters show status and responsável as removable chips and remove them back to "todas"/"todos"',async()=>{
 const {AdvancedFilters} = await import('../src/components/AdvancedFilters');
 const state={status:'aprovadas',responsavel:'lucas',categorias:[],origens:[],anos:[],especialidades:[],competencias:[],temas_especificos:[],searchQueries:[]} as any;
 const changes:any[]=[];
 const text=(node:any):string=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
 let renderer:any;
 await act(async()=>{renderer=create(<AdvancedFilters questions={rows} activeCurator={actor} filterState={state} onChangeFilterState={s=>changes.push(s)} totalFilteredCount={3}/>);});
 assert.match(text(renderer.toJSON()),/Status: Aprovada/);
 assert.match(text(renderer.toJSON()),/Responsável: Lucas/);
 await act(async()=>renderer.root.findByProps({'aria-label':'Remover filtro Status: Aprovada'}).props.onClick());
 assert.equal(changes.at(-1).status,'todas');
 assert.equal(changes.at(-1).responsavel,'lucas');
 await act(async()=>renderer.root.findByProps({'aria-label':'Remover filtro Responsável: Lucas'}).props.onClick());
 assert.equal(changes.at(-1).responsavel,'todos');
 await act(async()=>renderer.unmount());
});

test('detail view has a decision bar for phones that approves and asks before eliminating',async()=>{
 const g=globalThis as any;const hadWindow='window' in g;
 if(!hadWindow) g.window={addEventListener(){},removeEventListener(){}};
 const base={id:'7',sync_source_id:'7',sync_version:1,status:'pendente',enunciado:'Enunciado',comentario:'',a:'A0',b:'B0',correta:'A'} as Question;
 const statuses:string[]=[];
 const text=(node:any):string=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
 let renderer:any;
 await act(async()=>{renderer=create(<QuestionDetailView question={base} busy={false} allQuestions={[base]} activeCurator={actor} presences={{}} comments={[]}
  onBackToList={()=>{}} onNavigateQuestion={()=>{}} onUpdateQuestion={async()=>true} onUpdateStatus={async(_id,status)=>{statuses.push(status);return true;}}
  onAssignQuestion={()=>{}} onAddComment={async()=>true} onShowToast={()=>{}}/>);});
 const bar=renderer.root.findByProps({role:'group','aria-label':'Decisão sobre a questão'});
 await act(async()=>bar.findAll((n:any)=>n.type==='button'&&text(n).includes('Aprovar'))[0].props.onClick());
 assert.deepEqual(statuses,['aprovadas']);
 await act(async()=>bar.findAll((n:any)=>n.type==='button'&&text(n).includes('Eliminar'))[0].props.onClick());
 assert.equal(statuses.length,1);
 assert.match(JSON.stringify(renderer.toJSON()),/Eliminar a questão #7/);
 await act(async()=>renderer.unmount());
 if(!hadWindow) delete g.window;
});
