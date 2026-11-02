import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeApex} from '../supabase/functions/sync-apex-questions/sync';
import {apexStateKey,matchesApexFilter} from '../src/lib/apexState';

test('worker imports only missing open quarantines and handles lifecycle, exclusions and capped pages',async()=>{
 const original=globalThis.fetch;
 const calls:{name:string;args:Record<string,any>}[]=[];
 const qid=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const source={questions:[{id:1},{id:2},{id:3}],question_lifecycle:[{question_id:2,state:'archived'}],question_quarantine:[
  {id:qid(1),public_question_id:3,resolved_at:null,resolution:null,reason:'gabarito'},
  {id:qid(2),public_question_id:1,resolved_at:'2026-01-01',resolution:'applied',reason:'exclusao_proposta'},
 ]};
 globalThis.fetch=async input=>{
  const url=new URL(String(input));const table=url.pathname.split('/').pop()!;
  if(table==='question_quarantine') {assert.equal(url.searchParams.get('question_source'),'eq.public');assert.ok(url.searchParams.get('or')?.includes('resolved_at.is.null'));}
  const column=table==='question_lifecycle'?'question_id':'id';
  const filter=url.searchParams.get(column)!;
  if(filter.startsWith('in.')) return Response.json([{id:3,enunciado:'New quarantine',correta:'A'}]);
  const after=filter.slice(3);
  // The server caps responses below the requested limit: still read every page.
  return Response.json((source[table as keyof typeof source] as any[]).filter(row=>table==='question_quarantine'?row[column]>after:row[column]>Number(after)).slice(0,1));
 };
 const rpc=async(name:string,args:Record<string,any>)=>{
  calls.push({name,args});
  if(name==='curation_apex_missing') {assert.deepEqual(args.p_ids,['3']);return ['3'];}
  if(name==='curation_apex_import') return 1;
  return null;
 };
 try {
  assert.deepEqual(await synchronizeApex('https://source.test','server-secret',rpc,'run'),{sourceCount:3,quarantined:1,imported:1});
  const states=calls.find(c=>c.name==='curation_apex_finish')!.args.p_states;
  assert.equal(states.find((s:any)=>s.question_id==='1').excluded,true);
  assert.equal(states.find((s:any)=>s.question_id==='2').lifecycle_state,'archived');
  assert.equal(states.find((s:any)=>s.question_id==='3').quarantined,true);
  const imported=calls.find(c=>c.name==='curation_apex_import')!.args.p_questions;
  assert.deepEqual(imported.map((q:any)=>q.id),[3]);
  calls.length=0;
  globalThis.fetch=async()=>new Response(null,{status:503});
  await assert.rejects(synchronizeApex('https://source.test','key',rpc,'run'),/Apex/);
  assert.ok(!calls.some(c=>c.name==='curation_apex_finish'));
 } finally {globalThis.fetch=original;}
});

test('active/inactive filters never mistake unknown or quarantined questions for active ones',()=>{
 const question=(state:any='active',quarantined=false,excluded=false)=>({apex:{id:'1',state,quarantined,excluded,reason:null}});
 assert.equal(apexStateKey(question()),'active');
 assert.equal(matchesApexFilter(question(),'active'),true);
 assert.equal(matchesApexFilter(question('active',true),'active'),false);
 assert.equal(matchesApexFilter(question('active',true),'quarantine'),true);
 assert.equal(matchesApexFilter(question('active',false,true),'inactive'),true);
 assert.equal(matchesApexFilter(question('archived'),'inactive'),true);
 assert.equal(matchesApexFilter(question('missing'),'inactive'),true);
 assert.equal(matchesApexFilter({},'inactive'),false);
 assert.equal(matchesApexFilter({},'unknown'),true);
});
