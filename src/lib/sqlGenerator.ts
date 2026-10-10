import { Question, AuditLogItem } from '../types/question';

/**
 * Escapes text for Postgres safe insertion using dollar quoting or escaped quotes
 */
export function pgEscape(val: string | undefined | null): string {
  if (val === undefined || val === null) return "''";
  const str = String(val);
  // If text contains $$, we can use standard string quotes with doubled single quotes
  if (str.includes('$$')) {
    return `'${str.replace(/'/g, "''")}'`;
  }
  return `$$${str}$$`;
}

/**
 * Generates SQL for a single audited question based on its status and modified fields
 */
export function generateSqlForQuestion(q: Question, curatorName: string = 'Curador ApexMed'): string {
  const timestamp = new Date().toISOString();
  const safeId = pgEscape(q.id);

  if (q.status === 'eliminar_questao') {
    return `-- [AUDITORIA ${timestamp}] ID: ${q.id} | Ação: ELIMINAR QUESTÃO | Auditado por: ${curatorName}
DELETE FROM questoes 
WHERE id = ${safeId};`;
  }

  if (q.status === 'aprovadas') {
    return `-- [AUDITORIA ${timestamp}] ID: ${q.id} | Ação: APROVADA | Auditado por: ${curatorName}
UPDATE questoes 
SET 
  status = 'aprovada',
  revisado_por = ${pgEscape(curatorName)},
  revisado_em = NOW()
WHERE id = ${safeId};`;
  }

  if (q.status === 'revisar_questao') {
    return `-- [AUDITORIA ${timestamp}] ID: ${q.id} | Ação: REVISAR QUESTÃO | Solicitado por: ${curatorName}
UPDATE questoes 
SET 
  status = 'revisar_questao',
  revisado_por = ${pgEscape(curatorName)},
  revisado_em = NOW(),
  notas_revisao = ${pgEscape(q.notas_revisao || 'Revisão pendente solicitada pelo curador')}
WHERE id = ${safeId};`;
  }

  if (q.status === 'questao_corrigida' || q.modificado) {
    return `-- [AUDITORIA ${timestamp}] ID: ${q.id} | Ação: CORREÇÃO DE QUESTÃO | Corrigido por: ${curatorName}
UPDATE questoes 
SET 
  status = 'questao_corrigida',
  enunciado = ${pgEscape(q.enunciado)},
  a = ${pgEscape(q.a)},
  b = ${pgEscape(q.b)},
  c = ${pgEscape(q.c)},
  d = ${pgEscape(q.d)},
  e = ${pgEscape(q.e)},
  correta = '${q.correta || 'A'}',
  comentario = ${pgEscape(q.comentario)},
  justificativa_a = ${pgEscape(q.justificativa_a)},
  justificativa_b = ${pgEscape(q.justificativa_b)},
  justificativa_c = ${pgEscape(q.justificativa_c)},
  justificativa_d = ${pgEscape(q.justificativa_d)},
  justificativa_e = ${pgEscape(q.justificativa_e)},
  especialidade = ${pgEscape(q.especialidade)},
  tema_especifico = ${pgEscape(q.tema_especifico)},
  revisado_por = ${pgEscape(curatorName)},
  revisado_em = NOW()
WHERE id = ${safeId};`;
  }

  return '';
}

/**
 * Generates the complete accumulated progressive SQL script
 */
export function generateProgressiveSqlScript(
  auditLogs: AuditLogItem[],
  allQuestions: Question[],
  regexFilter?: string
): string {
  const parts: string[] = [];

  parts.push(`-- ==============================================================================`);
  parts.push(`-- APEXMED — SCRIPT PROGRESSIVO DE AUDITORIA & CURADORIA MÉDICA`);
  parts.push(`-- Gerado para: Supabase SQL Editor`);
  parts.push(`-- Data de Geração: ${new Date().toLocaleString('pt-BR')}`);
  parts.push(`-- Total de registros no log: ${auditLogs.length}`);
  parts.push(`-- ==============================================================================\n`);

  parts.push(`-- Iniciar transação atômica`);
  parts.push(`BEGIN;\n`);

  let validLogs = auditLogs.filter(l => l.sql_gerado && l.sql_gerado.trim().length > 0);

  // If a regex filter is supplied, filter SQL statements matching it
  if (regexFilter && regexFilter.trim().length > 0) {
    try {
      const reg = new RegExp(regexFilter, 'i');
      validLogs = validLogs.filter(l => reg.test(l.sql_gerado) || reg.test(l.detalhes) || reg.test(l.questao_id));
      parts.push(`-- [FILTRO REGEX APLICADO: /${regexFilter}/i]\n`);
    } catch {
      // Invalid regex pattern, skip regex filtering safely
    }
  }

  if (validLogs.length === 0) {
    // If no explicit audit log items yet, check if any questions have non-pending status
    const modifiedQuestions = allQuestions.filter(q => q.status !== 'pendente');
    if (modifiedQuestions.length > 0) {
      parts.push(`-- Alterações acumuladas com base no status atual das questões:`);
      modifiedQuestions.forEach(q => {
        const sql = generateSqlForQuestion(q, q.revisado_por || 'Curador');
        if (sql) parts.push(sql + '\n');
      });
    } else {
      parts.push(`-- Nenhuma alteração foi realizada até o momento.`);
      parts.push(`-- À medida que os 3 curadores aprovam, corrigem ou eliminam questões,`);
      parts.push(`-- os comandos SQL de DELETE e UPDATE serão progressivamente gerados aqui.\n`);
    }
  } else {
    validLogs.forEach(log => {
      parts.push(log.sql_gerado + '\n');
    });
  }

  parts.push(`\n-- Confirmar alterações`);
  parts.push(`COMMIT;`);

  return parts.join('\n');
}

/**
 * Generates Supabase DDL schema for initial table creation
 */
export function getSupabaseInitialSchemaSql(): string {
  return `-- ==============================================================================
-- APEXMED SCHEMA DDL — SUPABASE SQL EDITOR
-- Cole este script no SQL Editor do seu projeto Supabase para criar as tabelas
-- ==============================================================================

-- 1. Tabela Principal de Questões
CREATE TABLE IF NOT EXISTS public.questoes (
  id TEXT PRIMARY KEY,
  categoria TEXT,
  tema_especifico TEXT,
  ano TEXT,
  origem TEXT,
  enunciado TEXT,
  a TEXT,
  b TEXT,
  c TEXT,
  d TEXT,
  e TEXT,
  correta VARCHAR(2),
  comentario TEXT,
  justificativa_a TEXT,
  justificativa_b TEXT,
  justificativa_c TEXT,
  justificativa_d TEXT,
  justificativa_e TEXT,
  especialidade TEXT,
  competencias TEXT,
  ano_int TEXT,
  competencias_normalized TEXT,
  difficulty_bucket TEXT,
  descritores TEXT,
  status VARCHAR(30) DEFAULT 'pendente',
  responsavel_id TEXT,
  responsavel_nome TEXT,
  revisado_por TEXT,
  revisado_em TIMESTAMPTZ,
  notas_revisao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Comentários / Discussão Colaborativa
CREATE TABLE IF NOT EXISTS public.questoes_comentarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  questao_id TEXT NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  curador_id TEXT NOT NULL,
  curador_nome TEXT NOT NULL,
  curador_cor TEXT,
  texto TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Logs de Auditoria
CREATE TABLE IF NOT EXISTS public.questoes_auditoria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  questao_id TEXT NOT NULL,
  curador_id TEXT NOT NULL,
  curador_nome TEXT NOT NULL,
  tipo_acao VARCHAR(50) NOT NULL,
  detalhes TEXT,
  sql_gerado TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Habilitar Realtime para colaboração ao vivo
ALTER PUBLICATION supabase_realtime ADD TABLE public.questoes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.questoes_comentarios;
ALTER PUBLICATION supabase_realtime ADD TABLE public.questoes_auditoria;

-- 5. Índices de Busca Rápida
CREATE INDEX IF NOT EXISTS idx_questoes_status ON public.questoes(status);
CREATE INDEX IF NOT EXISTS idx_questoes_especialidade ON public.questoes(especialidade);
CREATE INDEX IF NOT EXISTS idx_questoes_responsavel ON public.questoes(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_questao ON public.questoes_comentarios(questao_id);
`;
}
