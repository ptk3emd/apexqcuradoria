import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCorrectedQuestionsSql, sqlText} from '../src/lib/correctedQuestionsSql';
import type {Question} from '../src/types/question';
import {generateProgressiveSqlBatches} from '../src/lib/sqlGenerator';
const FIG='https://beedxpjaufgujusyuziq.supabase.co/storage/v1/object/public/question-images/1/3f2a9c1e-6c1b-4a0e-9a53-7d2b8f5e1a10.webp';
const q = (id:string, data:Partial<Question>={}) => ({id, status:'questao_corrigida', enunciado:'Original', ...data} as Question);

test('progressive batches contain at most 50 distinct questions in numeric order', () => {
  for (const count of [0, 1, 49, 50, 51, 100, 101]) {
    const questions = Array.from({length:count}, (_, i) => q(String(count - i)));
    const {batches, errors} = generateProgressiveSqlBatches(questions);
    assert.deepEqual(errors, []);
    assert.deepEqual(batches.map(batch => batch.questionIds.length),
      Array.from({length:Math.ceil(count / 50)}, (_, i) => Math.min(50, count - i * 50)));
    assert.deepEqual(batches.flatMap(batch => batch.questionIds), Array.from({length:count}, (_, i) => String(i + 1)));
  }
  const original = Array.from({length:51}, (_, i) => q(String(i + 1)));
  const result = generateProgressiveSqlBatches([...original, q('01', {sync_version:2, enunciado:'Latest'})]);
  assert.match(result.batches[0].sql, /Latest/);
  assert.equal(result.batches[0].questionIds.length, 50);
  assert.equal(result.batches[0].key, generateProgressiveSqlBatches([...original, q('01', {sync_version:2, enunciado:'Latest'})].reverse()).batches[0].key);
  const changed = generateProgressiveSqlBatches(original);
  assert.notEqual(result.batches[0].key, changed.batches[0].key);
  assert.equal(result.batches[1].key, changed.batches[1].key);
});

test('progressive batches filter complete questions and block all export on invalid content', () => {
  const questions = Array.from({length:101}, (_, i) => q(String(i + 1), {enunciado:i % 2 ? 'Other' : 'Selected'}));
  assert.deepEqual(generateProgressiveSqlBatches(questions, 'Selected').batches.map(b => b.questionIds.length), [50, 1]);
  assert.deepEqual(generateProgressiveSqlBatches(questions, 'No matches').batches, []);
  const invalidRegex = generateProgressiveSqlBatches(questions, '[');
  assert.equal(invalidRegex.batches.length, 0);
  assert.match(invalidRegex.errors.join(), /inválido/);
  const invalidContent = generateProgressiveSqlBatches([...questions, q('bad-id')]);
  assert.equal(invalidContent.batches.length, 0);
  assert.match(invalidContent.errors.join(), /bigint/);
});

test('each progressive batch executes independently without changing another batch', async () => {
  const {PGlite} = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE public.questions(id bigint PRIMARY KEY, enunciado text); INSERT INTO public.questions SELECT id, 'Before' FROM generate_series(1, 51) AS id;");
    const {batches} = generateProgressiveSqlBatches(Array.from({length:51}, (_, i) => q(String(i + 1), {enunciado:"After ' ; $$ $apex_update_0$"})));
    await db.exec(batches[1].sql);
    assert.deepEqual((await db.query('SELECT enunciado FROM public.questions WHERE id = 1')).rows, [{enunciado:'Before'}]);
    assert.deepEqual((await db.query('SELECT enunciado FROM public.questions WHERE id = 51')).rows, [{enunciado:"After ' ; $$ $apex_update_0$"}]);
    await db.exec(batches[0].sql);
    assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM public.questions WHERE enunciado <> 'Before'")).rows[0].count, 51);
  } finally {await db.close();}
});

test('global script includes all authors, consolidates latest versions and retains changed content after approval', () => {
  const result=generateCorrectedQuestionsSql([
    q('2',{revisado_por:'Lucas'}),q('1',{enunciado:'Old',sync_version:1}),
    q('1',{enunciado:'Latest',sync_version:2,revisado_por:'Thierry'}),
    q('3',{status:'aprovadas',modificado:true,revisado_por:'Patrick'}),
    q('4',{status:'pendente',modificado:'false' as any}),
  ]);
  assert.equal(result.count,3);
  assert.equal(result.errors.length,0);
  assert.equal((result.sql.match(/UPDATE public.questions/g)||[]).length,3);
  assert.match(result.sql,/Latest/); assert.doesNotMatch(result.sql,/Old/);
  assert.ok(result.sql.indexOf('WHERE id = 1')<result.sql.indexOf('WHERE id = 2'));
  assert.match(result.sql,/BEGIN;/);assert.match(result.sql,/COMMIT;/);
  assert.doesNotMatch(result.sql,/DELETE|INSERT|WHERE id = 4/);
});

test('only writable schema fields are exported; absent optional data is preserved', () => {
  const {sql}=generateCorrectedQuestionsSql([q('7',{
    categoria:'Clínica',competencias:'Diagnóstico',ano:'2024',
    ano_int:'2024',competencias_normalized:'fake',created_at:'old',
    responsavel_nome:'Lucas',revisado_por:'Lucas',notas_revisao:'note',shared_comments:[],
  })]);
  assert.match(sql,/competencias = E'Diagnóstico'/);
  assert.match(sql,/ano = E'2024'/);
  for(const column of ['ano_int','competencias_normalized','created_at','status','responsavel_nome','revisado_por','notas_revisao','shared_comments','descritores']) assert.doesNotMatch(sql,new RegExp(`\\b${column} =`));
});

test('PostgreSQL E literals escape quotes and backslashes, preserving multiline and dollar text', () => {
  assert.equal(sqlText(null),'NULL');
  assert.equal(sqlText("O'Brien\\path\n$$"),"E'O''Brien\\\\path\\n$$'");
  assert.equal(sqlText(''),'E\'\'');
  const {sql}=generateCorrectedQuestionsSql([q('5',{comentario:null as any,difficulty_bucket:''})]);
  assert.match(sql,/comentario = NULL/);assert.match(sql,/difficulty_bucket = NULL/);
});

test('invalid bigint IDs or schema constraints block the full export', () => {
  for (const row of [q('1; DROP TABLE questions'),q('9223372036854775808'),q('1',{difficulty_bucket:'invalid'}),q('1',{descritores:'x'.repeat(501)}),q('1',{enunciado:'bad\u0000text'})]) {
    const result=generateCorrectedQuestionsSql([q('9'),row]);
    assert.ok(result.errors.length>0);
    assert.equal(result.sql,'');
  }
  assert.equal(generateCorrectedQuestionsSql([q('1',{descritores:'😀'.repeat(500)})]).errors.length,0);
});

test('confirmed updates dynamically expand and replace the accumulated script', () => {
  const initial=generateCorrectedQuestionsSql([]);
  assert.equal(initial.count,0);
  const first=generateCorrectedQuestionsSql([q('1',{modificado:true,enunciado:'First'})]);
  const next=generateCorrectedQuestionsSql([q('1',{modificado:true,enunciado:'Second'}),q('2',{modificado:true})]);
  assert.equal(first.count,1);assert.equal(next.count,2);
  assert.match(next.sql,/Second/);assert.doesNotMatch(next.sql,/First/);
});

test('all SQL entry points use confirmed questions rather than executable SQL stored in logs', async()=>{
  const {generateSqlForQuestion,generateProgressiveSqlScript}=await import('../src/lib/sqlGenerator');
  const row=q('1',{imagem:FIG,imagem_legenda:'ECG com supradesnivelamento de ST',difficulty_bucket:'Difícil'});
  assert.match(generateSqlForQuestion(row),/UPDATE public.questions/);
  assert.match(generateSqlForQuestion(row),/difficulty_bucket = E'hard'/);
  const sql=generateProgressiveSqlScript([{sql_gerado:'DROP TABLE public.questions;'} as any],[row]);
  assert.doesNotMatch(sql,/DROP TABLE|UPDATE questoes|revisado_por =|status =/);
  assert.equal(sql,generateCorrectedQuestionsSql([row]).sql);
  assert.doesNotMatch(generateSqlForQuestion(q('1',{status:'eliminar_questao'})),/DELETE FROM/);
  // A figure must be a file of the Apex bucket and carry its description; blank means no figure.
  for(const imagem of ['x'.repeat(2049), 'https://example.com/image.png']) assert.equal(generateCorrectedQuestionsSql([q('1',{imagem,imagem_legenda:'Descrição'})]).sql,'');
  assert.match(generateCorrectedQuestionsSql([q('1',{imagem:FIG})]).errors.join(' '),/Descreva a imagem/);
  assert.match(generateCorrectedQuestionsSql([q('1',{imagem:FIG,imagem_legenda:'a'.repeat(501)})]).errors.join(' '),/até 500 caracteres/);
  assert.equal(generateCorrectedQuestionsSql([q('1',{imagem:null})]).errors.length,0);
  assert.equal(generateCorrectedQuestionsSql([q('1',{imagem:''})]).errors.length,0);
  assert.match(generateCorrectedQuestionsSql([q('1',{imagem:null,imagem_legenda:'Sobrou'})]).sql,/imagem_legenda = NULL/);
  assert.equal(generateCorrectedQuestionsSql([q('1'),q('01')]).count,1);
});

test('generated SQL executes against the schema, preserves text and rolls back missing IDs',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const {getSupabaseInitialSchemaSql}=await import('../src/lib/sqlGenerator');
  const db=new PGlite();
  try {
    await db.exec(`CREATE FUNCTION normalize_competencies(value text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(lower(value),';') $$;`);
    await db.exec(getSupabaseInitialSchemaSql());
    await db.exec("INSERT INTO public.questions(id,enunciado,created_at) VALUES(1,'Original','2020-01-01'),(2,'Other','2020-01-01');");
    const text="O'Brien\\path\n$$ $apex_update_0$ '; DROP TABLE public.questions; --";
    const script=generateCorrectedQuestionsSql([q('1',{enunciado:text,correta:"A'",ano:'2026',competencias:'I;II',imagem:FIG,imagem_legenda:'  ECG de teste  ',comentario:null as any})]);
    assert.equal(script.errors.length,0);await db.exec(script.sql);
    const row=(await db.query<any>('SELECT * FROM public.questions WHERE id=1')).rows[0];
    assert.equal(row.enunciado,text);assert.equal(row.correta,"A'");assert.equal(row.comentario,null);
    assert.equal(row.ano_int,2026);assert.deepEqual(row.competencias_normalized,['i','ii']);
    assert.equal(row.imagem,FIG);assert.equal(row.imagem_legenda,'ECG de teste');assert.equal(row.created_at.getUTCFullYear(),2020);
    const missing=generateCorrectedQuestionsSql([q('1',{enunciado:'MUST ROLLBACK'}),q('999')]);
    await assert.rejects(db.exec(missing.sql),/esperado exatamente um registro/);
    await db.exec('ROLLBACK;');
    assert.equal((await db.query<any>('SELECT enunciado FROM public.questions WHERE id=1')).rows[0].enunciado,text);
  } finally {await db.close();}
});

test('annulled questions export without an answer key; references are exported and validated',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const {getSupabaseInitialSchemaSql}=await import('../src/lib/sqlGenerator');
  const annulled=generateCorrectedQuestionsSql([q('1',{anulada:true,correta:'B',referencias:'Diretriz: https://example.org/d.pdf'})]);
  assert.equal(annulled.errors.length,0);
  assert.match(annulled.sql,/anulada = TRUE/);assert.match(annulled.sql,/correta = NULL/);
  assert.match(generateCorrectedQuestionsSql([q('1',{anulada:'false' as any,correta:'C'})]).sql,/anulada = FALSE[\s\S]*correta = E'C'/);
  assert.doesNotMatch(generateCorrectedQuestionsSql([q('1')]).sql,/anulada/);
  assert.match(generateCorrectedQuestionsSql([q('1',{referencias:'   '})]).sql,/referencias = NULL/);
  assert.equal(generateCorrectedQuestionsSql([q('1',{referencias:'x'.repeat(5001)})]).sql,'');
  const db=new PGlite();
  try {
    await db.exec(`CREATE FUNCTION normalize_competencies(value text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(lower(value),';') $$;`);
    await db.exec(getSupabaseInitialSchemaSql());
    await db.exec("INSERT INTO public.questions(id,enunciado,correta) VALUES(1,'Original','A');");
    await db.exec(annulled.sql);
    const row=(await db.query<any>('SELECT anulada,correta,referencias FROM public.questions WHERE id=1')).rows[0];
    assert.equal(row.anulada,true);assert.equal(row.correta,null);assert.equal(row.referencias,'Diretriz: https://example.org/d.pdf');
    await assert.rejects(db.exec("UPDATE public.questions SET correta='A' WHERE id=1"),/questions_anulada_sem_gabarito_check/);
  } finally {await db.close();}
});

test('batch numbers stay fixed: pending batches skip the numbers already migrated', () => {
  const questions = Array.from({length:120}, (_, i) => q(String(i + 1)));
  assert.deepEqual(generateProgressiveSqlBatches(questions).batches.map(b => b.number), [1, 2, 3]);
  // Lote 2 migrated: its questions leave, the others keep 1 and 3.
  const rest = questions.filter(x => Number(x.id) <= 50 || Number(x.id) > 100);
  const {batches} = generateProgressiveSqlBatches(rest, undefined, [2]);
  assert.deepEqual(batches.map(b => [b.number, b.questionIds[0]]), [[1, '1'], [3, '101']]);
});

test('line breaks are escaped and CRLF normalized, so pasted SQL keeps the counted length', () => {
  const {sql} = generateCorrectedQuestionsSql([q('7', {referencias:'a\r\nb\nc'})]);
  assert.match(sql, /referencias = E'a\\nb\\nc'/);
});

test('a migrated batch never grows: new corrections open the next batch', () => {
  // Lote 1 migrated with only 30 questions; 5 new corrections arrive later (lower and higher IDs).
  const fresh = ['3', '40', '41', '42', '43'].map(id => q(id));
  const {batches} = generateProgressiveSqlBatches(fresh, undefined, [1]);
  assert.deepEqual(batches.map(b => [b.number, b.questionIds.length]), [[2, 5]]);
});
