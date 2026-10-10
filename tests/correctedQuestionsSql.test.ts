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
