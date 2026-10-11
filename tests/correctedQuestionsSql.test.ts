import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCorrectedQuestionsSql, sqlText} from '../src/lib/correctedQuestionsSql';
import type {Question} from '../src/types/question';
const q = (id:string, data:Partial<Question>={}) => ({id, status:'questao_corrigida', enunciado:'Original', ...data} as Question);

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
  assert.equal(sqlText("O'Brien\\path\n$$"),"E'O''Brien\\\\path\n$$'");
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
  const row=q('1',{imagem:'https://example.com/image.png',difficulty_bucket:'Difícil'});
  assert.match(generateSqlForQuestion(row),/UPDATE public.questions/);
  assert.match(generateSqlForQuestion(row),/difficulty_bucket = E'hard'/);
  const sql=generateProgressiveSqlScript([{sql_gerado:'DROP TABLE public.questions;'} as any],[row]);
  assert.doesNotMatch(sql,/DROP TABLE|UPDATE questoes|revisado_por =|status =/);
  assert.equal(sql,generateCorrectedQuestionsSql([row]).sql);
  assert.doesNotMatch(generateSqlForQuestion(q('1',{status:'eliminar_questao'})),/DELETE FROM/);
  for(const imagem of ['', 'x'.repeat(2049)]) assert.equal(generateCorrectedQuestionsSql([q('1',{imagem})]).sql,'');
  assert.equal(generateCorrectedQuestionsSql([q('1',{imagem:null})]).errors.length,0);
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
    const script=generateCorrectedQuestionsSql([q('1',{enunciado:text,correta:"A'",ano:'2026',competencias:'I;II',imagem:'https://example.com/image.png',comentario:null as any})]);
    assert.equal(script.errors.length,0);await db.exec(script.sql);
    const row=(await db.query<any>('SELECT * FROM public.questions WHERE id=1')).rows[0];
    assert.equal(row.enunciado,text);assert.equal(row.correta,"A'");assert.equal(row.comentario,null);
    assert.equal(row.ano_int,2026);assert.deepEqual(row.competencias_normalized,['i','ii']);
    assert.equal(row.imagem,'https://example.com/image.png');assert.equal(row.created_at.getUTCFullYear(),2020);
    const missing=generateCorrectedQuestionsSql([q('1',{enunciado:'MUST ROLLBACK'}),q('999')]);
    await assert.rejects(db.exec(missing.sql),/esperado exatamente um registro/);
    await db.exec('ROLLBACK;');
    assert.equal((await db.query<any>('SELECT enunciado FROM public.questions WHERE id=1')).rows[0].enunciado,text);
  } finally {await db.close();}
});
