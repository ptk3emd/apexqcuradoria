import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPriorities, priorityOrder, quarantineOrder, reviewOrder} from '../src/lib/priorities';

test('quarantine precedes P0 and ownership and respects closure on refresh', () => {
  const priorities = {...buildPriorities({P0:['1']},{}), quarantined:new Set(['9'])};
  const questions = [
    {id:'1',status:'pendente',responsavel_id:'patrick'},
    {id:'9',status:'aprovadas',responsavel_id:'lucas'},
    {id:'2',status:'pendente',responsavel_id:null},
  ];
  assert.deepEqual([...questions].sort(priorityOrder(priorities)).map(q=>q.id), ['9','1','2']);
  assert.deepEqual(reviewOrder(questions,'patrick',priorities).map(q=>q.id), ['9','1','2']);
  // Table descending affects only the order within each group.
  assert.deepEqual([...questions].sort((a,b)=>quarantineOrder(priorities,a.id,b.id)||Number(b.id)-Number(a.id)).map(q=>q.id), ['9','2','1']);
  priorities.quarantined = new Set();
  assert.deepEqual(reviewOrder(questions,'patrick',priorities).map(q=>q.id), ['1','2','9']);
});

test('bridge requires a valid curation session and reads only open public IDs with pagination', async () => {
  let handler: (req:Request)=>Promise<Response>;
  const originalFetch=globalThis.fetch;
  const originalDeno=(globalThis as any).Deno;
  const calls: string[]=[];
  const env: Record<string,string>={SUPABASE_URL:'https://curation.test',SUPABASE_ANON_KEY:'anon',APEX_SERVICE_ROLE_KEY:'server-secret'};
  (globalThis as any).Deno={serve:(fn:any)=>{handler=fn;},env:{get:(name:string)=>env[name]}};
  try {
    await import('../supabase/functions/question-quarantine/index');
    globalThis.fetch=async (input,init)=>{
      const url=String(input); calls.push(url);
      if(url.includes('curation_session')) {
        const session=new Headers(init?.headers).get('x-apex-session');
        return new Response(JSON.stringify(session==='valid'?{curator_id:'patrick'}:{message:'Sessão expirada'}),{status:session==='valid'?200:400});
      }
      assert.equal(new Headers(init?.headers).get('apikey'),'server-secret');
      const query=new URL(url).searchParams;
      assert.equal(query.get('question_source'),'eq.public');
      assert.equal(query.get('resolved_at'),'is.null');
      assert.equal(query.get('select'),'public_question_id');
      return Response.json(query.get('public_question_id')==='gt.0'?[{public_question_id:9}]:[]);
    };
    const request=(session?:string)=>new Request('https://bridge.test',{headers:session?{'x-apex-session':session}:{}});
    assert.equal((await handler!(request())).status,401);
    assert.equal(calls.length,0);
    assert.equal((await handler!(request('invalid'))).status,401);
    assert.equal(calls.length,1); // An invalid session never reaches Apex.
    const result=await handler!(request('valid'));
    assert.equal(result.status,200);
    const body=await result.json();
    assert.deepEqual(body.ids,['9']);
    assert.ok(!JSON.stringify(body).includes('server-secret'));
    assert.ok(calls.some(url=>url.includes('gt.9')));
    delete env.APEX_SERVICE_ROLE_KEY;
    assert.equal((await handler!(request('valid'))).status,503);
  } finally { globalThis.fetch=originalFetch; (globalThis as any).Deno=originalDeno; }
});
