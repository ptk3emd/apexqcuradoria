export type QuestionStatus = 
  | 'pendente'
  | 'aprovadas'
  | 'eliminar_questao'
  | 'revisar_questao'
  | 'questao_corrigida';

export interface Question {
  sync_version?: number;
  shared_comments?: QuestionComment[];
  id: string;
  categoria: string;
  tema_especifico: string;
  ano: string;
  origem: string;
  enunciado: string;
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
  correta: string; // 'A' | 'B' | 'C' | 'D' | 'E'
  comentario: string;
  justificativa_a: string;
  justificativa_b: string;
  justificativa_c: string;
  justificativa_d: string;
  justificativa_e: string;
  created_at?: string;
  especialidade: string;
  competencias?: string;
  ano_int?: string;
  competencias_normalized?: string;
  difficulty_bucket?: string;
  descritores?: string;

  // Curation metadata
  status: QuestionStatus;
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
  revisado_por?: string | null;
  revisado_em?: string | null;
  notas_revisao?: string | null;
  modificado?: boolean;
}

export interface Curator {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  avatarCor: string;
  iniciais: string;
}

export interface QuestionComment {
  id: string;
  questao_id: string;
  curador_id: string;
  curador_nome: string;
  curador_cor: string;
  texto: string;
  criado_em: string;
}

export interface CuratorPresence {
  curador_id: string;
  curador_nome: string;
  curador_cor: string;
  questao_atual_id?: string | null;
  status_atividade: 'visualizando' | 'editando' | 'comentando' | 'ocioso';
  ultima_atividade: string;
}

export interface AuditLogItem {
  id: string;
  questao_id: string;
  curador_id: string;
  curador_nome: string;
  tipo_acao: 'status_alterado' | 'conteudo_editado' | 'atribuicao' | 'comentario';
  detalhes: string;
  timestamp: string;
  sql_gerado: string;
}

export type GoogleSheetsSyncStatus = 'idle' | 'pending' | 'success' | 'error';
