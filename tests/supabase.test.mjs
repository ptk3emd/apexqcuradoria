import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
await db.exec(await readFile('supabase/migrations/20261010144126_curation_collaboration.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261010145252_questions_source.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261010145534_curation_initial_cursor.sql','utf8'));
const patrick='00000000-0000-0000-0000-000000000001',lucas='00000000-0000-0000-0000-000000000002';
const session='10000000-0000-0000-0000-000000000001';
let seq=0;
await db.query('insert into auth.users values($1),($2)',[patrick,lucas]);
await db.query("insert into public.curation_members values($1,'patrick','Patrick',true),($2,'lucas','Lucas',true)",[patrick,lucas]);
await db.exec(`create schema extensions;
-- PGlite lacks pgcrypto: isolate password hashing with a stub; live RPC tests verify bcrypt separately.
create function extensions.crypt(value text,salt text) returns text language sql immutable as $$select 'hash:'||value$$;
create schema realtime; create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$ select $$;`);
const masterSql=(await readFile('supabase/migrations/20261010150224_master_password_sessions.sql','utf8')).replace('create extension if not exists pgcrypto with schema extensions;','');
await db.exec(masterSql);
await db.exec("insert into curation_private.master_access values(true,'hash:test-master-password')");
await db.exec(`insert into public.questions(id,enunciado) values(1,'Original'),(2,'Second');`);
const asUser=async user=>{
 await db.exec('reset role');
 await db.query("insert into curation_private.sessions(token_hash,user_id,expires_at) select encode(sha256(convert_to($1,'UTF8')),'hex'),user_id,now()+interval '1 hour' from public.curation_members where user_id=$2 on conflict(token_hash) do update set expires_at=excluded.expires_at",['test-'+user,user]);
 await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-apex-session':'test-'+user})]);
 await db.exec('set role authenticated');
};
const call=async(action,items,request)=> (await db.query('select public.curation_mutate($1,$2,$3,$4::jsonb) as result',[action,session,request||`20000000-0000-0000-0000-${String(++seq).padStart(12,'0')}`,JSON.stringify(items)])).rows[0].result;

test('RPC ownership, stale versions, content persistence, comments and idempotency',async()=>{
 await asUser(patrick);
 let claimed=await call('claim',[{id:'1',version:0}]);assert.equal(claimed.questions[0].sync_version,1);
 await asUser(lucas);
 await assert.rejects(call('claim',[{id:'1',version:1}]),/reservada/);
 await asUser(patrick);
 await assert.rejects(call('save',[{id:'1',version:0,patch:{enunciado:'lost'}}]),/atualizada/);
 const request='30000000-0000-0000-0000-000000000001';
 const saved=await call('save',[{id:'1',version:1,patch:{enunciado:'Edited',status:'questao_corrigida',responsavel_id:'lucas'}}],request);
 assert.equal(saved.questions[0].enunciado,'Edited');assert.equal(saved.questions[0].responsavel_id,'patrick');
 const repeated=await call('save',[{id:'1',version:1,patch:{enunciado:'Edited'}}],request);
 assert.deepEqual(repeated,saved);
 const commented=await call('comment',[{id:'1',version:3,comment:'Discussão'}]);
 assert.equal(commented.questions[0].shared_comments[0].curador_nome,'Patrick');
 assert.equal(commented.questions[0].shared_comments[0].texto,'Discussão');
 const snapshot=(await db.query('select public.curation_sync(0) as result')).rows[0].result;
 assert.equal(snapshot.questions.find(q=>q.id==='1').enunciado,'Edited');assert.ok(snapshot.cursor>0);
});

test('batch conflict rolls back all rows and direct writes are denied',async()=>{
 await asUser(lucas);
 await assert.rejects(call('assign',[{id:'2',version:0,target:'lucas'},{id:'1',version:4,target:'lucas'}]),/reservada/);
 const rows=(await db.query('select version,responsible_id from public.curation_questions where question_id=2')).rows;
 assert.equal(Number(rows[0].version),0);assert.equal(rows[0].responsible_id,null);
 await assert.rejects(db.exec("update public.curation_questions set responsible_id='lucas'"),/permission denied/);
});

test('nonmembers and anonymous callers cannot read or mutate drafts',async()=>{
 await asUser('00000000-0000-0000-0000-000000000009');
 assert.equal((await db.query('select * from public.curation_questions')).rows.length,0);
 await assert.rejects(db.query('select public.curation_base()'),/não autorizado/);
 await db.exec('set role anon');
 await assert.rejects(db.query('select public.curation_sync(0)'),/não autorizado/);
 assert.equal((await db.query('select * from public.questions')).rows.length,0);
});

test.after(async()=>{await db.close();});

test('batch review/status are atomic; expired leases and another tab cannot save',async()=>{
 await db.exec('reset role');
 await db.exec(`insert into public.questions(id) values(3),(4); update public.curation_questions set responsible_id='patrick' where question_id=4;`);
 await asUser(lucas);
 await assert.rejects(call('review',[{id:'3',version:0},{id:'4',version:0}]),/reservada/);
 assert.equal(Number((await db.query('select version from public.curation_questions where question_id=3')).rows[0].version),0);
 const reviewed=await call('review',[{id:'3',version:0}]);assert.equal(reviewed.questions[0].status,'revisar_questao');
 const status=await call('status',[{id:'3',version:1,patch:{status:'aprovadas',enunciado:'MUST NOT APPLY'}}]);
 assert.equal(status.questions[0].status,'aprovadas');assert.equal(status.questions[0].enunciado,null);
 await call('claim',[{id:'3',version:2}]);
 await assert.rejects(db.query('select public.curation_mutate($1,$2,$3,$4::jsonb)', ['save',crypto.randomUUID(),crypto.randomUUID(),JSON.stringify([{id:'3',version:3,patch:{enunciado:'Other tab'}}])]),/outra sessão/);
 await db.exec('reset role');await db.exec("update public.curation_questions set lease_until=now()-interval '1 second' where question_id=3");
 await asUser(lucas);await assert.rejects(call('save',[{id:'3',version:3,patch:{enunciado:'Expired'}}]),/reservar antes/);
 await assert.rejects(call('heartbeat',[{id:'3'}]),/expirada/);
});

test('source imports, all writable columns and ID changes synchronize without writing generated columns',async()=>{
 await db.exec('reset role');await db.exec("insert into public.questions(id,enunciado,correta) values(20,'Example','A')");
 await asUser(patrick);await call('claim',[{id:'20',version:0}]);
 const saved=await call('save',[{id:'20',version:1,patch:{id:'21',enunciado:'New',correta:'B',ano:'2026',competencias:'I; II; I',created_at:'2020-01-01T00:00:00Z',descritores:'teste',difficulty_bucket:'hard',ano_int:1999}}]);
 assert.equal(saved.questions[0].id,'21');assert.equal(saved.questions[0].previous_id,'20');
 assert.equal(saved.questions[0].ano_int,2026);
 assert.deepEqual(saved.questions[0].competencias_normalized,['i','ii']);
 const row=(await db.query('select id::text,correta,ano_int,created_at from public.questions where id=21')).rows[0];
 assert.equal(row.correta,'B');assert.equal(row.ano_int,2026);
 assert.equal((await db.query('select * from public.questions where id=20')).rows.length,0);
 assert.equal((await db.query('select * from public.question_competencies where question_id=21')).rows.length,2);
 const synced=(await db.query('select public.curation_sync(0) as result')).rows[0].result;
 assert.ok(synced.removed_ids.includes('20'));assert.ok(synced.questions.some(q=>q.id==='21'));
 await assert.rejects(call('save',[{id:'21',version:saved.questions[0].sync_version,patch:{id:'1'}}]),/duplicate key/);
});

test('master login requires only password/profile, rejects forged tokens and revokes logout',async()=>{
 await db.exec('reset role');await db.query("select set_config('request.headers','{}',false)");await db.exec('set role anon');
 const login=async(curator,password)=>(await db.query('select public.curation_login($1,$2) as result',[curator,password])).rows[0].result;
 assert.equal((await login('patrick','wrong')).ok,false);
 assert.equal((await login('invalid','test-master-password')).ok,false);
 const result=await login('patrick','test-master-password');assert.equal(result.ok,true);assert.equal(result.curator_id,'patrick');
 await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-apex-session':result.token,actor:'lucas'})]);
 assert.equal((await db.query('select public.curation_session() as result')).rows[0].result.curator_id,'patrick');
 const member=(await db.query('select public.curation_is_member() as value')).rows[0].value;assert.equal(member,true);
 await db.query('select public.curation_logout()');
 await assert.rejects(db.query('select public.curation_session()'),/expirada/);
 await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-apex-session':'invented'})]);
 await assert.rejects(db.query('select public.curation_base()'),/não autorizado/);
});
