import type {Question} from '../types/question';
export interface ApexQuestionState {
 id:string;
 state:'active'|'draft'|'under_review'|'obsolete'|'archived'|'missing';
 quarantined:boolean;
 excluded:boolean;
 reason:string|null;
}
export interface ApexOverview {
 checkedAt:string|null;
 run:{status:'queued'|'running'|'complete'|'failed';startedAt:string;error:string|null;imported:number}|null;
 states:ApexQuestionState[];
}
export type ApexFilter='all'|'active'|'inactive'|'quarantine'|'unknown';
export function apexStateKey(q:Pick<Question,'apex'>):string {
 if(!q.apex) return 'unknown';
 if(q.apex.quarantined) return 'quarantine';
 if(q.apex.excluded) return 'excluded';
 return q.apex.state;
}
export const APEX_LABELS:Record<string,string>={active:'Ativa',draft:'Inativa · Rascunho',under_review:'Inativa · Em revisão',obsolete:'Inativa · Obsoleta',archived:'Inativa · Arquivada',missing:'Ausente no Apex',quarantine:'Inativa · Quarentena',excluded:'Inativa · Exclusão aplicada',unknown:'Estado não sincronizado'};
const REASONS:Record<string,string>={changes_requested:'Ajustes solicitados',rejected:'Reprovada',metadata:'Classificação',gabarito:'Gabarito',enunciado:'Enunciado',alternativas:'Alternativas',comentarios:'Comentários',justificativas:'Justificativas',exclusao_proposta:'Exclusão proposta',administracao:'Revisão administrativa',outro:'Outro motivo'};
export function apexReason(q:Pick<Question,'apex'>) {const reason=q.apex?.reason;return reason?(REASONS[reason]??reason):'';}
export function matchesApexFilter(q:Pick<Question,'apex'>,filter:ApexFilter) {
 const key=apexStateKey(q);
 return filter==='all'||(filter==='active'?key==='active':filter==='inactive'?key!=='active'&&key!=='unknown':filter==='quarantine'?key==='quarantine':key==='unknown');
}
