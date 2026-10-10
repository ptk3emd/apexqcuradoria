import {fetchSupabaseShared, mutateSupabase} from './supabaseCuration';
import type {Curator, Question, CuratorPresence} from '../types/question';
import type {SharedRow} from './sharedState';
export {mergeShared} from './sharedState';
export type {SharedRow} from './sharedState';
type SharedSnapshot = {rows: SharedRow[]; presences: Record<string, CuratorPresence>};
let syncInFlight: Promise<SharedSnapshot> | null = null;
export function fetchShared(): Promise<SharedSnapshot> {
  if (!syncInFlight) syncInFlight = fetchSupabaseShared().finally(() => {syncInFlight = null;});
  return syncInFlight;
}
export async function mutateShared(questions: Question[], action: string, _actor: Curator, target?: Curator | null): Promise<Question[]> {
  return questions.length ? mutateSupabase(questions, action, target) : [];
}
