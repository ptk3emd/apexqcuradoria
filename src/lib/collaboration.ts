import { usesSupabase, fetchSupabaseShared, mutateSupabase } from './supabaseCuration';
import { getStoredSheetsSyncConfig } from './googleSheetsSync';
import { Curator, Question, CuratorPresence } from '../types/question';
import { mergeShared, type SharedRow } from './sharedState';
export { mergeShared } from './sharedState';
export type { SharedRow } from './sharedState';
import { DEFAULT_CURATORS } from '../data/defaultCurators';
const session = crypto.randomUUID();

let cursor = 0;
const shared = new Map<string, SharedRow>();
export async function sheetsRequest(payload: Record<string, unknown>, credentials?: {key:string; actor:string}) {
  const key = credentials?.key || sessionStorage.getItem('apexmed_sheets_access_key');
  if (!key) throw new Error('Bloqueie a sessão e entre novamente para conectar ao Google Sheets.');
  const response = await fetch(getStoredSheetsSyncConfig().webhookUrl, {
    method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, key, session, actor: credentials?.actor || sessionStorage.getItem('apexmed_authenticated_curator_id') }),
    signal: AbortSignal.timeout(35000),
  });
  if (!response.ok) throw new Error(`Google Sheets retornou HTTP ${response.status}`);
  const result = await response.json();
  if (result.protocol !== 2) throw new Error('Atualize a implantação do Apps Script para a versão colaborativa v2.');
  if (!result.ok) throw new Error(result.message || 'Operação recusada pelo Google Sheets.');
  return result;
}
function remember(changes: SharedRow[]) {
  for (const row of changes) {
    const old = shared.get(row.id);
    // Sync runs in journal order. Mutations do not advance the sync cursor.
    if (!old || row.version > old.version) shared.set(row.id, {
      ...row, patch: { ...old?.patch, ...row.patch },
    });
  }
}
type SharedSnapshot = {rows: SharedRow[]; presences: Record<string, CuratorPresence>};
let syncInFlight: Promise<SharedSnapshot> | null = null;
export function fetchShared(): Promise<SharedSnapshot> {
  // Polling, reconnects and conflict recovery share one cursor pipeline.
  if (!syncInFlight) syncInFlight = loadShared().finally(() => {syncInFlight = null;});
  return syncInFlight;
}
async function loadShared(): Promise<SharedSnapshot> {
  if (usesSupabase) return fetchSupabaseShared();
  let result;
  do {
    result = await sheetsRequest({action:'sync', cursor});
    for (const entry of result.entries) remember(entry.changes);
    cursor = result.cursor;
  } while (result.more);
  const presences: Record<string, CuratorPresence> = {};
  for (const [id, lease] of Object.entries(result.leases) as [string, any][]) {
    const curator = DEFAULT_CURATORS.find(c=>c.id===lease.actor);
    presences[lease.session] = { curador_id:lease.actor,curador_nome:lease.name,
      curador_cor:curator?.avatarCor || '#888',questao_atual_id:id,status_atividade:'visualizando',ultima_atividade:new Date(lease.until - 90000).toISOString() };
  }
  return {rows:[...shared.values()], presences};
}
export async function mutateShared(questions: Question[], action: string, actor: Curator, target?: Curator | null): Promise<Question[]> {
  if (!questions.length) return [];
  if (usesSupabase) return mutateSupabase(questions, action, target);
  const result = await sheetsRequest({action, request:crypto.randomUUID(), items:questions.map(q=>({
    id:q.id,version:q.sync_version ?? 0,patch: action==='save' ? q : undefined,target:target?.id || null,
  }))});
  // Do not fold an out-of-order mutation into the incremental journal cache.
  return result.questions || mergeShared(questions, result.changes);
}
