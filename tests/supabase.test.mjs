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
// One browser tab per curator: presence is keyed by (question, tab session).
const sessions={[patrick]:'10000000-0000-0000-0000-000000000001',[lucas]:'10000000-0000-0000-0000-000000000002'};
let session=sessions[patrick];
let seq=0;
await db.query('insert into auth.users values($1),($2)',[patrick,lucas]);
await db.query("insert into public.curation_members values($1,'patrick','Patrick',true),($2,'lucas','Lucas',true)",[patrick,lucas]);
await db.exec(`create schema extensions;
-- PGlite lacks pgcrypto: isolate password hashing with a stub; live RPC tests verify bcrypt separately.
create function extensions.crypt(value text,salt text) returns text language sql immutable as $$select 'hash:'||value$$;
create schema realtime; create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$ select $$;`);
const masterSql=(await readFile('supabase/migrations/20261010151200_master_password_sessions.sql','utf8')).replace('create extension if not exists pgcrypto with schema extensions;','');
await db.exec(masterSql);
await db.exec(await readFile('supabase/migrations/20261012120000_questions_anulada_referencias.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261012190000_concurrent_editing.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261023120000_question_image_mutate.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261028150000_curation_light_list.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261028160000_curation_light_list_anon.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261028170000_curation_quality_flags.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261028180000_quality_flags_null_text.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261028190000_quality_flags_ranges.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261028200000_curation_activity_goals.sql','utf8'));
await db.exec("insert into public.questions(id,enunciado) values(3294,'P0 Patrick'),(9398,'P0 Thierry'),(11131,'P0 Lucas'),(7098,'P2 primeira')");
await db.exec(await readFile('supabase/migrations/20261029120000_curation_priorities.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261029150000_sql_export_tracking.sql','utf8'));
await db.exec("insert into curation_private.master_access values(true,'hash:test-master-password')");
await db.exec(`insert into public.questions(id,enunciado) values(1,'Original'),(2,'Second');`);
const asUser=async user=>{
 session=sessions[user]||'10000000-0000-0000-0000-000000000009';
 await db.exec('reset role');
 await db.query("insert into curation_private.sessions(token_hash,user_id,expires_at) select encode(sha256(convert_to($1,'UTF8')),'hex'),user_id,now()+interval '1 hour' from public.curation_members where user_id=$2 on conflict(token_hash) do update set expires_at=excluded.expires_at",['test-'+user,user]);
 await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-apex-session':'test-'+user})]);
 await db.exec('set role authenticated');
};
const call=async(action,items,request)=> (await db.query('select public.curation_mutate($1,$2,$3,$4::jsonb) as result',[action,session,request||`20000000-0000-0000-0000-${String(++seq).padStart(12,'0')}`,JSON.stringify(items)])).rows[0].result;

const sync=async()=>(await db.query('select public.curation_sync(0) as result')).rows[0].result;
const presenceOn=async id=>(await sync()).leases.filter(l=>l.question_id===id).map(l=>l.actor).sort();

test('opening a question only registers presence; two curators edit it at once and saves merge by field',async()=>{
 await asUser(patrick);
 const claimed=await call('claim',[{id:'1',version:0}]);
 assert.equal(claimed.questions[0].responsavel_id,null);assert.equal(claimed.questions[0].sync_version,0);
 await asUser(lucas);
 await call('claim',[{id:'1',version:0}]);
 assert.deepEqual(await presenceOn('1'),['lucas','patrick']);
 await asUser(patrick);
 const request='30000000-0000-0000-0000-000000000001';
 const saved=await call('save',[{id:'1',version:0,patch:{enunciado:'Edited',status:'questao_corrigida'}}],request);
 assert.equal(saved.questions[0].enunciado,'Edited');
 const repeated=await call('save',[{id:'1',version:0,patch:{enunciado:'Edited'}}],request);
 assert.deepEqual(repeated,saved);
 // Lucas saves from the version he opened: no refusal, and his field merges with Patrick's.
 await asUser(lucas);
 await call('save',[{id:'1',version:0,patch:{comentario:'Comentário do Lucas'}}]);
 let row=(await db.query('select enunciado,comentario from public.questions where id=1')).rows[0];
 assert.equal(row.enunciado,'Edited');assert.equal(row.comentario,'Comentário do Lucas');
 // Same field: the last save wins.
 await call('save',[{id:'1',version:0,patch:{enunciado:'Versão do Lucas'}}]);
 await asUser(patrick);
 await call('save',[{id:'1',version:0,patch:{enunciado:'Versão do Patrick'}}]);
 row=(await db.query('select enunciado,comentario from public.questions where id=1')).rows[0];
 assert.equal(row.enunciado,'Versão do Patrick');assert.equal(row.comentario,'Comentário do Lucas');
 const commented=await call('comment',[{id:'1',version:0,comment:'Discussão'}]);
 assert.equal(commented.questions[0].shared_comments[0].curador_nome,'Patrick');
 assert.equal(commented.questions[0].shared_comments[0].texto,'Discussão');
 const snapshot=await sync();
 assert.equal(snapshot.questions.find(q=>q.id==='1').enunciado,'Versão do Patrick');assert.ok(snapshot.cursor>0);
 // Leaving removes only the caller's presence; an expired one disappears from the list.
 await call('unlock',[{id:'1'}]);
 assert.deepEqual(await presenceOn('1'),['lucas']);
 await db.exec('reset role');await db.exec("update curation_private.presence set until=now()-interval '1 second'");
 await asUser(lucas);
 assert.deepEqual(await presenceOn('1'),[]);
 await call('heartbeat',[{id:'1'}]);
 assert.deepEqual(await presenceOn('1'),['lucas']);
});

test('the responsible curator never blocks others, and a real error still rolls back the whole batch',async()=>{
 await asUser(lucas);
 await call('assign',[{id:'1',version:0,target:'lucas'}]);
 await asUser(patrick);
 await call('save',[{id:'1',version:0,patch:{comentario:'Patrick edita mesmo com o Lucas responsável'}}]);
 assert.equal((await db.query('select comentario from public.questions where id=1')).rows[0].comentario,'Patrick edita mesmo com o Lucas responsável');
 await assert.rejects(call('assign',[{id:'1',version:0,target:'patrick'},{id:'2',version:0,target:'ninguem'}]),/Responsável inválido/);
 assert.equal((await db.query('select responsible_id from public.curation_questions where question_id=1')).rows[0].responsible_id,'lucas');
 await assert.rejects(db.exec("update public.curation_questions set responsible_id='lucas'"),/permission denied/);
 await assert.rejects(db.exec('select * from curation_private.presence'),/permission denied/);
});

test('nonmembers and anonymous callers cannot read or mutate drafts',async()=>{
 await asUser('00000000-0000-0000-0000-000000000009');
 assert.equal((await db.query('select * from public.curation_questions')).rows.length,0);
 await assert.rejects(db.query('select public.curation_base()'),/não autorizado/);
 await db.exec('set role anon');
 await assert.rejects(db.query('select public.curation_sync(0)'),/não autorizado/);
 assert.equal((await db.query('select * from public.questions')).rows.length,0);
});

const FILE=id=>`https://beedxpjaufgujusyuziq.supabase.co/storage/v1/object/public/question-images/${id}/3f2a9c1e-6c1b-4a0e-9a53-7d2b8f5e1a10.webp`;
test('a figure needs a Apex-bucket address and its caption; removing it drops the caption; other saves leave it alone',async()=>{
 await db.exec('reset role');await db.exec("insert into public.questions(id,enunciado,correta) values(40,'Com figura','A')");
 await asUser(patrick);await call('claim',[{id:'40',version:0}]);
 let saved=await call('save',[{id:'40',version:1,patch:{imagem:FILE(40),imagem_legenda:'  ECG com supradesnivelamento de ST  '}}]);
 assert.equal(saved.questions[0].imagem,FILE(40));assert.equal(saved.questions[0].imagem_legenda,'ECG com supradesnivelamento de ST');
 let row=(await db.query('select imagem,imagem_legenda from public.questions where id=40')).rows[0];
 assert.equal(row.imagem,FILE(40));assert.equal(row.imagem_legenda,'ECG com supradesnivelamento de ST');
 // A caption cannot be blanked while the figure stays; nothing changes.
 await assert.rejects(call('save',[{id:'40',version:saved.questions[0].sync_version,patch:{imagem_legenda:'   '}}]),/Descreva a imagem/);
 await assert.rejects(call('save',[{id:'40',version:saved.questions[0].sync_version,patch:{imagem_legenda:'a'.repeat(501)}}]),/até 500 caracteres/);
 // Only files of the Apex bucket: no third-party address, no other bucket, no other format.
 for(const bad of ['https://exemplo.com/a.webp','https://beedxpjaufgujusyuziq.supabase.co/storage/v1/object/public/professor-question-images/a/b.webp',FILE(40).replace('.webp','.svg')])
  await assert.rejects(call('save',[{id:'40',version:saved.questions[0].sync_version,patch:{imagem:bad,imagem_legenda:'x'}}]),/enviada pelo botão de imagem/);
 // Saving another field never touches the figure.
 saved=await call('save',[{id:'40',version:saved.questions[0].sync_version,patch:{comentario:'Outro campo'}}]);
 row=(await db.query('select imagem,imagem_legenda,comentario from public.questions where id=40')).rows[0];
 assert.equal(row.imagem,FILE(40));assert.equal(row.imagem_legenda,'ECG com supradesnivelamento de ST');assert.equal(row.comentario,'Outro campo');
 // Removing the figure drops its caption too.
 saved=await call('save',[{id:'40',version:saved.questions[0].sync_version,patch:{imagem:''}}]);
 row=(await db.query('select imagem,imagem_legenda from public.questions where id=40')).rows[0];
 assert.equal(row.imagem,null);assert.equal(row.imagem_legenda,null);
 assert.equal(saved.questions[0].imagem,null);assert.equal(saved.questions[0].imagem_legenda,null);
 // The database holds the same rules for anything written outside the curation.
 await db.exec('reset role');
 await assert.rejects(db.exec(`update public.questions set imagem='${FILE(40)}' where id=40`),/questions_imagem_requires_legenda_check/);
 await assert.rejects(db.exec("update public.questions set imagem='https://exemplo.com/a.webp', imagem_legenda='x' where id=40"),/questions_imagem_storage_check/);
});

test('the upload gate needs a live session, names the curator and allows 30 uploads in 10 minutes',async()=>{
 await db.exec('reset role');await db.exec("insert into public.questions(id,enunciado,correta) values(41,'Para envio','A')");
 await asUser(patrick);
 for(let i=0;i<30;i+=1){
  const {rows}=await db.query('select public.curation_register_image_upload(41) as result');
  assert.equal(rows[0].result.curator_id,'patrick');
 }
 await assert.rejects(db.query('select public.curation_register_image_upload(41)'),/Muitos envios de imagem/);
 // The limit is per curator, and an unknown question is refused.
 await asUser(lucas);
 assert.equal((await db.query('select public.curation_register_image_upload(41) as result')).rows[0].result.curator_id,'lucas');
 await assert.rejects(db.query('select public.curation_register_image_upload(999999)'),/Questão não encontrada/);
 // No session, no gate; and the log is closed to the browser.
 await asUser('00000000-0000-0000-0000-000000000009');
 await assert.rejects(db.query('select public.curation_register_image_upload(41)'),/Sessão expirada/);
 await assert.rejects(db.query('select * from curation_private.image_uploads'),/permission denied/);
 await db.exec('set role anon');
 await assert.rejects(db.query('select * from curation_private.image_uploads'),/permission denied/);
});

test.after(async()=>{await db.close();});

test('batch review/status work on questions held by others; another tab saves without opening the question',async()=>{
 await db.exec('reset role');
 await db.exec(`insert into public.questions(id) values(3),(4); update public.curation_questions set responsible_id='patrick' where question_id=4;`);
 await asUser(lucas);
 const reviewed=await call('review',[{id:'3',version:0},{id:'4',version:0}]);
 assert.deepEqual(reviewed.questions.map(q=>q.status),['revisar_questao','revisar_questao']);
 const status=await call('status',[{id:'3',version:0,patch:{status:'aprovadas',enunciado:'MUST NOT APPLY'}}]);
 assert.equal(status.questions[0].status,'aprovadas');assert.equal(status.questions[0].enunciado,null);
 await db.query('select public.curation_mutate($1,$2,$3,$4::jsonb)',['save',crypto.randomUUID(),crypto.randomUUID(),JSON.stringify([{id:'3',version:0,patch:{enunciado:'Other tab'}}])]);
 assert.equal((await db.query('select enunciado from public.questions where id=3')).rows[0].enunciado,'Other tab');
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

test('annulled questions lose their answer key; references are saved and blank ones become NULL',async()=>{
 await db.exec('reset role');await db.exec("insert into public.questions(id,enunciado,correta) values(30,'Anulável','C')");
 await asUser(patrick);await call('claim',[{id:'30',version:0}]);
 await assert.rejects(call('save',[{id:'30',version:1,patch:{anulada:'sim'}}]),/verdadeiro ou falso/);
 const saved=await call('save',[{id:'30',version:1,patch:{anulada:true,correta:'B',referencias:'Diretriz: https://example.org/d.pdf'}}]);
 assert.equal(saved.questions[0].anulada,true);assert.equal(saved.questions[0].correta,null);
 let row=(await db.query('select anulada,correta,referencias from public.questions where id=30')).rows[0];
 assert.equal(row.anulada,true);assert.equal(row.correta,null);assert.equal(row.referencias,'Diretriz: https://example.org/d.pdf');
 const restored=await call('save',[{id:'30',version:saved.questions[0].sync_version,patch:{anulada:false,correta:'A',referencias:'  '}}]);
 row=(await db.query('select anulada,correta,referencias from public.questions where id=30')).rows[0];
 assert.equal(row.anulada,false);assert.equal(row.correta,'A');assert.equal(row.referencias,null);
 assert.equal(restored.questions[0].correta,'A');
 await db.exec('reset role');
 await assert.rejects(db.exec("update public.questions set anulada=true where id=30"),/questions_anulada_sem_gabarito_check/);
});

test('the light list comes in planned ranges, full content and search on demand',async()=>{
 await db.exec('reset role');
 await db.exec("insert into public.questions(id,enunciado,a,comentario) select g,'Enunciado '||g||' '||repeat('x',300),'Alternativa '||g,case when g=950 then 'Bronquiolite: 50%_off' else 'Comentário' end from generate_series(700,1049) g");
 await asUser(patrick);
 const plan=(await db.query('select public.curation_list_plan(100) as r')).rows[0].r;
 assert.equal(plan.block,100);
 const starts=plan.starts.map(Number);
 const pages=await Promise.all(starts.map(async(from,i)=>(await db.query('select public.curation_list($1,$2) as r',[from,starts[i+1]??null])).rows[0].r));
 const rows=pages.flat();
 const all=(await db.query('select count(*)::int n from public.curation_questions')).rows[0].n;
 assert.equal(rows.length,all);
 assert.equal(new Set(rows.map(r=>r.id)).size,all);
 const row=rows.find(r=>r.id==='800');
 assert.equal(row.parcial,true);assert.equal(row.a,undefined);assert.equal(row.comentario,undefined);
 assert.equal(row.enunciado.length,240);assert.equal(row.status,'pendente');
 const full=(await db.query('select public.curation_full($1::bigint[]) as r',[[800,801]])).rows[0].r;
 assert.deepEqual(full.map(q=>q.id),['800','801']);assert.equal(full[0].a,'Alternativa 800');assert.equal(full[0].parcial,undefined);
 const search=async terms=>(await db.query('select public.curation_search($1::text[]) as r',[terms])).rows[0].r;
 assert.deepEqual(await search(['BRONQUIOLITE']),['950']);
 assert.deepEqual(await search(['bronquiolite','50%_']),['950']);
 assert.deepEqual(await search(['bronquiolite','5_%']),[]);
 assert.deepEqual(await search(['alternativa 1001']),['1001']);
 await db.exec('reset role');await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-apex-session':'invented'})]);await db.exec('set role authenticated');
 await assert.rejects(db.query('select public.curation_list(1)'),/não autorizado/);
 await assert.rejects(db.query("select public.curation_search(array['x'])"),/não autorizado/);
 // The browser calls as anon with the session header, like curation_base.
 await asUser(patrick);await db.exec('set role anon');
 assert.ok((await db.query('select public.curation_list_plan() as r')).rows[0].r.starts.length>0);
 assert.equal((await db.query('select public.curation_full($1::bigint[]) as r',[[800]])).rows[0].r.length,1);
 assert.deepEqual((await db.query("select public.curation_search(array['BRONQUIOLITE']) as r")).rows[0].r,['950']);
 await db.exec('reset role');
});

test('quality flags find missing parts and answer keys contradicted by justifications or comment',async()=>{
 await db.exec('reset role');
 const ok={enunciado:'Paciente de 30 anos com febre.',a:'Um',b:'Dois',c:'Três',d:'Quatro',e:'Cinco',correta:'A',
  comentario:'A resposta correta é a letra A, e a conduta é expectante.',justificativa_a:'Correta. Conduta indicada.',justificativa_b:'Incorreta: não indicada.',
  justificativa_c:'Errada, pois não é a correta.',justificativa_d:'Não é a alternativa correta.',justificativa_e:'Falsa.',
  especialidade:'Pediatria',tema_especifico:'Febre',origem:'ENARE',ano:'2024'};
 const flags=async content=>(await db.query('select curation_private.quality_flags($1::jsonb) as f',[JSON.stringify(content)])).rows[0].f;
 assert.deepEqual(await flags(ok),[]);
 assert.deepEqual(await flags({...ok,justificativa_c:'Correta, é a conduta indicada.'}),['justificativa_contradiz']);
 assert.deepEqual(await flags({...ok,justificativa_a:'Incorreta, a febre não justifica.'}),['justificativa_contradiz']);
 assert.deepEqual(await flags({...ok,comentario:'Gabarito: C. A conduta é expectante.'}),['comentario_contradiz']);
 assert.deepEqual(await flags({...ok,comentario:'A alternativa D está correta porque...'}),['comentario_contradiz']);
 assert.deepEqual(await flags({...ok,comentario:'A resposta a esse quadro e a conduta e a evolução.'}),[]);
 assert.deepEqual(await flags({...ok,b:'',justificativa_e:'  ',origem:null}),['falta_b','falta_justificativa_e','falta_origem']);
 assert.deepEqual(await flags({...ok,correta:'F'}),['gabarito_invalido']);
 assert.deepEqual(await flags({...ok,b:'null',justificativa_c:' NULL ',comentario:'Null',correta:'null'}),['falta_b','falta_comentario','falta_justificativa_c','falta_correta']);
 assert.deepEqual(await flags({...ok,c:'Nulla est'}),[]);
 assert.deepEqual(await flags({...ok,correta:null,anulada:true}),[]);
 assert.deepEqual(await flags({...ok,correta:null,anulada:'sim'}),[]);
 assert.deepEqual(await flags({...ok,anulada:''}),[]);
 assert.deepEqual(await flags({...ok,c:'um '}),['alternativas_repetidas']);
 await db.exec("insert into public.questions(id,enunciado) values(5001,'Só enunciado')");
 await asUser(patrick);await db.exec('set role anon');
 const all=(await db.query('select public.curation_quality_flags() as r')).rows[0].r;
 assert.ok(all['5001'].includes('falta_a'));
 const ranged=(await db.query('select public.curation_quality_flags(5001,5002) as r')).rows[0].r;
 assert.deepEqual(Object.keys(ranged),['5001']);
 await db.exec('reset role');
});

test('activity counts distinct questions audited per curator and day; goals are shared and validated',async()=>{
 await db.exec('reset role');
 await db.exec("insert into public.questions(id,enunciado) values(6001,'x'),(6002,'y'),(6003,'z')");
 await asUser(lucas);
 await call('status',[{id:'6001',version:0,patch:{status:'aprovadas'}},{id:'6002',version:0,patch:{status:'aprovadas'}}]);
 await call('review',[{id:'6001',version:1}]);
 await call('claim',[{id:'6003',version:0}]);
 await db.exec('set role anon');
 const activity=(await db.query('select public.curation_activity(30) as r')).rows[0].r;
 const today=activity.daily.filter(d=>d.curator==='lucas'&&d.day===activity.today);
 assert.equal(today.length,1);assert.ok(today[0].audited>=2);
 assert.ok(activity.totals.lucas>=2);
 assert.deepEqual(activity.goals.daily,{});
 const saved=(await db.query("select public.curation_set_goals('{\"lucas\":40,\"patrick\":25}'::jsonb,'2026-12-31') as r")).rows[0].r;
 assert.equal(saved.daily.lucas,40);assert.equal(saved.deadline,'2026-12-31');assert.equal(saved.updated_by,'Lucas');
 await assert.rejects(db.query("select public.curation_set_goals('{\"lucas\":-1}'::jsonb,null)"),/inteiro de 0 a 1000/);
 await assert.rejects(db.query("select public.curation_set_goals('{\"zé\":10}'::jsonb,null)"),/desconhecido/);
 await db.exec('reset role');await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-apex-session':'invented'})]);await db.exec('set role anon');
 await assert.rejects(db.query('select public.curation_activity()'),/não autorizado/);
 await assert.rejects(db.query("select public.curation_set_goals('{}'::jsonb,null)"),/não autorizado/);
 await db.exec('reset role');
});

test('priorities assign P0/P1 to their curator, plan P2/P3 in rotation and add a P0/P1 deadline',async()=>{
 await db.exec('reset role');
 const owner=async id=>(await db.query('select responsible_id from public.curation_questions where question_id=$1',[id])).rows[0].responsible_id;
 assert.equal(await owner(3294),'patrick');assert.equal(await owner(9398),'thierry');assert.equal(await owner(11131),'lucas');
 assert.equal(await owner(7098),null);
 const counts=(await db.query("select priority,count(*)::int n from public.curation_priorities group by priority order by priority")).rows;
 assert.deepEqual(counts.map(r=>[r.priority,r.n]),[['P0',25],['P1',617],['P2',12955],['P3',6]]);
 const ev=(await db.query("select question_ids from curation_private.events where action='priority_assign'")).rows;
 assert.equal(ev.length,1);
 await asUser(patrick);await db.exec('set role anon');
 const pr=(await db.query('select public.curation_priorities() as r')).rows[0].r;
 assert.equal(pr.priority.P0.length,25);assert.equal(pr.planned.patrick.length+pr.planned.thierry.length+pr.planned.lucas.length,13603);
 assert.ok(pr.planned.patrick.includes('7098'));
 const g=(await db.query("select public.curation_set_goals('{\"patrick\":30}'::jsonb,'2027-03-01','2026-11-30') as r")).rows[0].r;
 assert.equal(g.deadline_priority,'2026-11-30');
 await assert.rejects(db.query("select public.curation_set_goals('{}'::jsonb,'2026-11-01','2026-12-01')"),/antes do prazo/);
 assert.equal((await db.query('select public.curation_activity() as r')).rows[0].r.goals.deadline_priority,'2026-11-30');
 await db.exec('reset role');
});

test('exported corrections and applied migrations are shared, per question version',async()=>{
 await asUser(lucas);await db.exec('set role anon');
 const state=async()=>(await db.query('select public.curation_sql_state() as r')).rows[0].r;
 assert.ok((await state()).migrations['20261029150000_sql_export_tracking.sql']);
 assert.equal((await db.query(`select public.curation_mark_exported('[{"id":"10","version":2},{"id":"11","version":1}]'::jsonb,'Lote 1') as n`)).rows[0].n,2);
 assert.equal((await db.query(`select public.curation_mark_exported('[{"id":"10","version":2}]'::jsonb,'Lote 1') as n`)).rows[0].n,0);
 let s=await state();
 assert.deepEqual(s.exported.map(e=>[e.id,e.version,e.by,e.batch]),[['10',2,'Lucas','Lote 1'],['11',1,'Lucas','Lote 1']]);
 await db.query(`select public.curation_mark_exported('[{"id":"11","version":1}]'::jsonb,null,false)`);
 assert.equal((await state()).exported.length,1);
 const m=(await db.query("select public.curation_mark_migration('20261029120000_curation_priorities.sql') as r")).rows[0].r;
 assert.equal(m['20261029120000_curation_priorities.sql'].by,'Lucas');
 await assert.rejects(db.query("select public.curation_mark_migration('x; drop table')"),/inválido/);
 await db.exec('reset role');await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-apex-session':'invented'})]);await db.exec('set role anon');
 await assert.rejects(db.query('select public.curation_sql_state()'),/não autorizado/);
 await db.exec('reset role');
});
