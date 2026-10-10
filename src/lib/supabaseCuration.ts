import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import type {Curator, CuratorPresence, Question} from '../types/question';
import type {SharedRow} from './sharedState';
import {DEFAULT_CURATORS} from '../data/defaultCurators';

export const usesSupabase = import.meta.env?.VITE_CURATOR_BACKEND === 'supabase';
let client:SupabaseClient | null = null;
const tabSession = crypto.randomUUID();
let cursor=0;
const shared=new Map<string,SharedRow>();
export function curationClient() {
  if (client) return client;
  const url=import.meta.env.VITE_SUPABASE_URL;
  const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Configure a URL e a chave pública do Supabase antes de ativar a migração.');
  client=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  return client;
}
export async function currentSupabaseCurator():Promise<Curator> {
  const {data,error}=await curationClient().auth.getUser();
  if(error || !data.user) throw new Error('Entre com sua conta de curador.');
  const membership=await curationClient().from('curation_members').select('curator_id,active').eq('user_id',data.user.id).single();
  const curator=DEFAULT_CURATORS.find(c=>c.id===membership.data?.curator_id);
  if(membership.error || !membership.data?.active || !curator) throw new Error('Sua conta ainda não foi cadastrada como curador neste projeto.');
  return curator;
}
async function rpc(name:string, args:Record<string,unknown>) {
  const {data,error}=await curationClient().rpc(name,args);
  if(error) throw new Error(error.message);
  return data;
}
export async function loadSupabaseBase():Promise<Question[]> {
  cursor=await rpc('curation_initial_cursor',{});
  shared.clear();
  const questions:Question[]=[];
  let after:string|null=null;
  while(true) {
    const page=await rpc('curation_base',{p_after:after,p_limit:500}) as Question[];
    questions.push(...page);
    if(page.length<500) break;
    after=page[page.length-1].id;
  }
  
  return questions;
}
export async function fetchSupabaseShared() {
  let result;
  do {
    result=await rpc('curation_sync',{p_cursor:cursor});
    for(const q of result.questions as Question[]) {
      const previous=shared.get(q.id);
      if(!previous || previous.deleted || (q.sync_version??0)>previous.version) shared.set(q.id,{id:q.id,patch:q,version:q.sync_version??0});
    }
    for(const id of result.removed_ids || []) shared.set(id,{id,patch:{},version:0,deleted:true});
    cursor=result.cursor;
  } while(result.more);
  const presences:Record<string,CuratorPresence>={};
  for(const [id,lease] of Object.entries(result.leases) as [string,any][]) {
    presences[lease.session]={curador_id:lease.actor,curador_nome:lease.name,
      curador_cor:DEFAULT_CURATORS.find(c=>c.id===lease.actor)?.avatarCor || '#888',
      questao_atual_id:id,status_atividade:'visualizando',ultima_atividade:new Date(lease.until-90000).toISOString()};
  }
  return {rows:[...shared.values()],presences};
}
export async function mutateSupabase(questions:Question[],action:string,target?:Curator|null):Promise<Question[]> {
  const result=await rpc('curation_mutate',{
    p_action:action,p_session:tabSession,p_request:crypto.randomUUID(),
    p_items:questions.map(q=>({id:q.sync_source_id || q.id,version:q.sync_version??0,target:target?.id||null,
      patch:['save','status'].includes(action)?{...q,created_at:q.created_at === '' ? null : q.created_at}:undefined,
      comment:action==='comment'?q.shared_comments?.at(-1)?.texto:undefined})),
  });
  return result.questions;
}
export function subscribeSupabaseChanges(refresh:()=>void) {
  const db=curationClient();
  let debounce:ReturnType<typeof setTimeout>;
  const channel=db.channel(`curation-${tabSession}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'curation_questions'},()=>{
      clearTimeout(debounce);debounce=setTimeout(refresh,150);
    }).subscribe(status=>{if(status==='SUBSCRIBED') refresh();});
  return ()=>{clearTimeout(debounce);void db.removeChannel(channel);};
}
export async function signOutSupabase() {
  const {error}=await curationClient().auth.signOut({scope:'local'});
  if(error) throw new Error(error.message);
  cursor=0;shared.clear();
}
