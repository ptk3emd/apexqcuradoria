import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import type {Curator, CuratorPresence, Question} from '../types/question';
import type {SharedRow} from './sharedState';
import {DEFAULT_CURATORS} from '../data/defaultCurators';
import {normalizeDifficulty} from './difficulty';

let client:SupabaseClient | null = null;
const tabSession = crypto.randomUUID();
let cursor=0;
const shared=new Map<string,SharedRow>();
const SESSION_KEY='apexmed_supabase_session';
export function hasSupabaseSession() {return Boolean(sessionStorage.getItem(SESSION_KEY));}
export async function loginSupabase(curatorId:string,password:string):Promise<Curator> {
  const result=await rpc('curation_login',{p_curator:curatorId,p_password:password});
  if(!result.ok) throw new Error(result.message);
  const curator=DEFAULT_CURATORS.find(c=>c.id===result.curator_id);
  if(!curator) throw new Error('Perfil inválido.');
  sessionStorage.setItem(SESSION_KEY,result.token);
  return curator;
}
export function curationClient() {
  if (client) return client;
  const url=import.meta.env.VITE_SUPABASE_URL || 'https://jcbinmjiimqomjdyfdia.supabase.co';
  const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_2dVE51sq6_Sb7-Hj9R1MdA_1qclrXTY";
  if (!url || !key) throw new Error('Configure a URL e a chave pública do Supabase antes de ativar a migração.');
  client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
    const headers=new Headers(init?.headers);
    const token=sessionStorage.getItem(SESSION_KEY);
    if(token) headers.set('x-apex-session',token);
    return fetch(input,{...init,headers});
  }}});
  return client;
}
export async function currentSupabaseCurator():Promise<Curator> {
  const result=await rpc('curation_session',{});
  const curator=DEFAULT_CURATORS.find(c=>c.id===result.curator_id);
  if(!curator) throw new Error('Sessão inválida.');
  return curator;
}

async function rpc(name:string, args:Record<string,unknown>, signal?:AbortSignal) {
  const request=curationClient().rpc(name,args);
  const {data,error}=await (signal ? request.abortSignal(signal) : request);
  if(error) {
    if(/não autorizado|Sessão expirada/.test(error.message)) {
      sessionStorage.removeItem(SESSION_KEY);
      if(typeof window !== 'undefined') window.dispatchEvent(new Event('apex-session-expired'));
    }
    throw new Error(error.message);
  }
  return data;
}
export async function loadSupabaseBase(onPage?:(page:Question[])=>void, signal?:AbortSignal):Promise<Question[]> {
  cursor=await rpc('curation_initial_cursor',{},signal);
  shared.clear();
  const questions:Question[]=[];
  let after:string|null=null;
  while(true) {
    const page=await rpc('curation_base',{p_after:after,p_limit:500},signal) as Question[];
    const currentPage=page.filter(q=>!shared.get(q.id)?.deleted);
    questions.push(...currentPage);
    onPage?.(currentPage);
    if(page.length<500) break;
    after=page[page.length-1].id;
  }
  
  return questions;
}
export async function fetchSupabaseShared() {
  const changes=new Map<string,SharedRow>();
  let result;
  do {
    result=await rpc('curation_sync',{p_cursor:cursor});
    for(const q of result.questions as Question[]) {
      const previous=shared.get(q.id);
      if(!previous || previous.deleted || (q.sync_version??0)>previous.version) {
        const row={id:q.id,patch:q,version:q.sync_version??0};
        shared.set(q.id,row);changes.set(q.id,row);
      }
    }
    for(const id of result.removed_ids || []) {
      const row={id,patch:{},version:0,deleted:true};
      shared.set(id,row);changes.set(id,row);
    }
    cursor=result.cursor;
  } while(result.more);
  const presences:Record<string,CuratorPresence>={};
  for(const [id,lease] of Object.entries(result.leases) as [string,any][]) {
    presences[lease.session]={curador_id:lease.actor,curador_nome:lease.name,
      curador_cor:DEFAULT_CURATORS.find(c=>c.id===lease.actor)?.avatarCor || '#888',
      questao_atual_id:id,status_atividade:'visualizando',ultima_atividade:new Date(lease.until-90000).toISOString()};
  }
  return {rows:[...changes.values()],presences};
}
export async function mutateSupabase(questions:Question[],action:string,target?:Curator|null):Promise<Question[]> {
  const result=await rpc('curation_mutate',{
    p_action:action,p_session:tabSession,p_request:crypto.randomUUID(),
    p_items:questions.map(q=>({id:q.sync_source_id || q.id,version:q.sync_version??0,target:target?.id||null,
      patch:['save','status'].includes(action)?{...q,created_at:q.created_at === '' ? null : q.created_at,difficulty_bucket:normalizeDifficulty(q.difficulty_bucket)}:undefined,
      comment:action==='comment'?q.shared_comments?.at(-1)?.texto:undefined})),
  });
  return result.questions;
}
export function subscribeSupabaseChanges(refresh:()=>void) {
  const db=curationClient();
  let debounce:ReturnType<typeof setTimeout>;
  const channel=db.channel('apex-curation',{config:{private:false}})
    .on('broadcast',{event:'refresh'},()=>{
      clearTimeout(debounce);debounce=setTimeout(refresh,150);
    }).subscribe(status=>{if(status==='SUBSCRIBED') refresh();});
  return ()=>{clearTimeout(debounce);void db.removeChannel(channel);};
}
export async function signOutSupabase() {
  try {await rpc('curation_logout',{});} catch { /* Local sign-out remains available offline. */ } finally {sessionStorage.removeItem(SESSION_KEY);}
  cursor=0;shared.clear();
}
