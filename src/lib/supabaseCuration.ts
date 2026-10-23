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
function projectConfig() {
  const url=import.meta.env.VITE_SUPABASE_URL || 'https://jcbinmjiimqomjdyfdia.supabase.co';
  const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_2dVE51sq6_Sb7-Hj9R1MdA_1qclrXTY";
  return {url,key};
}
export function curationClient() {
  if (client) return client;
  const {url,key}=projectConfig();
  if (!url || !key) throw new Error('Configure a URL e a chave pública do Supabase antes de ativar a migração.');
  client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
    const headers=new Headers(init?.headers);
    const token=sessionStorage.getItem(SESSION_KEY);
    if(token) headers.set('x-apex-session',token);
    return fetch(input,{...init,headers});
  }}});
  return client;
}
/**
 * Sends one WebP figure to the `upload-question-image` Edge Function, which
 * checks the curator's session and writes it to the Apex project's bucket.
 * Returns the public address to store in `questions.imagem`.
 */
export async function uploadQuestionImage(questionId:string,webp:Blob,signal?:AbortSignal):Promise<string> {
  const token=sessionStorage.getItem(SESSION_KEY);
  if(!token) throw new Error('Sessão expirada. Entre novamente com a senha mestra.');
  if(!/^[1-9][0-9]*$/.test(questionId)) throw new Error('Salve o novo ID da questão antes de enviar a imagem.');
  const {url,key}=projectConfig();
  let response:Response;
  try {
    response=await fetch(`${url}/functions/v1/upload-question-image`,{
      method:'POST',signal,body:webp,
      headers:{'Content-Type':'image/webp',apikey:key,'x-apex-session':token,'x-question-id':questionId},
    });
  } catch(error) {
    if((error as Error).name==='AbortError') throw error;
    throw new Error('Não foi possível enviar a imagem. Verifique a conexão e tente de novo.');
  }
  const body=await response.json().catch(()=>({})) as {url?:string;error?:string};
  if(response.status===401) {
    sessionStorage.removeItem(SESSION_KEY);
    if(typeof window !== 'undefined') window.dispatchEvent(new Event('apex-session-expired'));
  }
  if(!response.ok||!body.url) throw new Error(body.error||'Não foi possível enviar a imagem agora. Tente novamente.');
  return body.url;
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
  return {rows:[...changes.values()],presences:presencesFromLeases(result.leases)};
}
type Lease = {question_id?:string; actor:string; name:string; session:string; until:number};
// Several curators (and tabs) may be on the same question. The server sends a
// list; before migration 20261012190000 it sent one lease per question, keyed
// by question id, which is still read so either order of deploy works.
export function presencesFromLeases(leases:unknown):Record<string,CuratorPresence> {
  const list:[string,Lease][]=Array.isArray(leases)
    ? (leases as Lease[]).map(lease=>[String(lease.question_id),lease])
    : Object.entries((leases ?? {}) as Record<string,Lease>);
  const presences:Record<string,CuratorPresence>={};
  for(const [id,lease] of list) {
    presences[`${lease.session}:${id}`]={curador_id:lease.actor,curador_nome:lease.name,
      curador_cor:DEFAULT_CURATORS.find(c=>c.id===lease.actor)?.avatarCor || '#888',
      questao_atual_id:id,status_atividade:'visualizando',ultima_atividade:new Date(lease.until-90000).toISOString()};
  }
  return presences;
}
// Builds the save/status patch. With `fields`, only those content fields go
// (plus the curation metadata), so a save never overwrites what another
// curator changed in a field this one did not touch.
function patchFor(q:Question, fields?:readonly string[]):Record<string,unknown> {
  const full:Record<string,unknown>={...q,created_at:q.created_at === '' ? null : q.created_at,difficulty_bucket:normalizeDifficulty(q.difficulty_bucket)};
  if(!fields) return full;
  const patch:Record<string,unknown>={status:q.status};
  if(q.notas_revisao!==undefined) patch.notas_revisao=q.notas_revisao;
  for(const field of fields) if(field in full) patch[field]=full[field];
  return patch;
}
export async function mutateSupabase(questions:Question[],action:string,target?:Curator|null,fields?:readonly string[]):Promise<Question[]> {
  const result=await rpc('curation_mutate',{
    p_action:action,p_session:tabSession,p_request:crypto.randomUUID(),
    p_items:questions.map(q=>({id:q.sync_source_id || q.id,version:q.sync_version??0,target:target?.id||null,
      patch:['save','status'].includes(action)?patchFor(q,action==='save'?fields:undefined):undefined,
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
