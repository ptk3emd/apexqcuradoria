import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import type {Curator, CuratorPresence, Question} from '../types/question';
import type {SharedRow} from './sharedState';
import {DEFAULT_CURATORS} from '../data/defaultCurators';
import {normalizeDifficulty} from './difficulty';
import type {CurationActivity} from './curationPace';
import {buildPriorities, type CurationPriorities} from './priorities';
import {clearCachedBase, readCachedBase, writeCachedBase} from './questionCache';

let client:SupabaseClient | null = null;
const tabSession = crypto.randomUUID();
let cursor=0;
const shared=new Map<string,SharedRow>();
// Latest server snapshot of every question, mirrored to the local cache.
const base=new Map<string,Question>();
let saveTimer:ReturnType<typeof setTimeout>|undefined;
function scheduleCacheSave() {
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{void writeCachedBase(cursor,[...base.values()]);},1000);
}
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
  shared.clear();
  base.clear();
  // A cached base shows at once; the regular sync then replays only the events after its cursor.
  const cached=await readCachedBase();
  if(cached) {
    signal?.throwIfAborted();
    cursor=cached.cursor;
    for(const q of cached.questions) base.set(q.id,q);
    onPage?.(cached.questions);
    return cached.questions;
  }
  try {
    const questions=await loadLightList(onPage,signal);
    scheduleCacheSave();
    return questions;
  } catch(error) {
    if(!isMissingFunction(error)) throw error;
  }
  const questions=await loadFullBase(onPage,signal);
  scheduleCacheSave();
  return questions;
}
// Before migrations 20261028150000/160000 the server has only curation_base,
// or the new functions exist without the anon grant the browser calls with.
function isMissingFunction(error:unknown) {
  return /Could not find the function|does not exist|permission denied for function/i.test((error as Error)?.message ?? '');
}
const PARALLEL_REQUESTS=6;
async function inParallel<T>(tasks:(()=>Promise<T>)[], limit:number):Promise<T[]> {
  const results:T[]=new Array(tasks.length);
  let next=0;
  const worker=async()=>{while(next<tasks.length){const index=next++;results[index]=await tasks[index]();}};
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},worker));
  return results;
}
// Rows the sync already replaced keep the newer snapshot in the cache.
function keep(page:Question[]) {
  const current=page.filter(q=>!shared.get(q.id)?.deleted);
  for(const q of current) if(!shared.has(q.id)) base.set(q.id,q);
  return current;
}
// Metadata and a statement preview for every question, in blocks requested together.
async function loadLightList(onPage?:(page:Question[])=>void, signal?:AbortSignal):Promise<Question[]> {
  const plan=await rpc('curation_list_plan',{p_block:1000},signal) as {cursor:number; starts:(string|number)[]};
  cursor=plan.cursor;
  const starts=plan.starts.map(String);
  const pages=await inParallel(starts.map((from,i)=>async()=>{
    const page=keep(await rpc('curation_list',{p_from:from,p_to:starts[i+1]??null},signal) as Question[]);
    onPage?.(page);
    return page;
  }),PARALLEL_REQUESTS);
  return pages.flat();
}
async function loadFullBase(onPage?:(page:Question[])=>void, signal?:AbortSignal):Promise<Question[]> {
  cursor=await rpc('curation_initial_cursor',{},signal);
  const questions:Question[]=[];
  let after:string|null=null;
  while(true) {
    const page=await rpc('curation_base',{p_after:after,p_limit:500},signal) as Question[];
    const currentPage=keep(page);
    questions.push(...currentPage);
    onPage?.(currentPage);
    if(page.length<500) break;
    after=page[page.length-1].id;
  }
  return questions;
}
/** Full content of light-list questions, 200 per request. */
export async function loadFullQuestions(ids:string[], signal?:AbortSignal):Promise<Question[]> {
  const unique=[...new Set(ids)];
  const chunks:string[][]=[];
  for(let i=0;i<unique.length;i+=200) chunks.push(unique.slice(i,i+200));
  const pages=await inParallel(chunks.map(chunk=>async()=>await rpc('curation_full',{p_ids:chunk},signal) as Question[]),3);
  const full=pages.flat().map(q=>({...q,parcial:false}));
  for(const q of full) {
    const known=base.get(q.id);
    if(!known || (q.sync_version??0)>=(known.sync_version??0)) base.set(q.id,q);
  }
  if(full.length) scheduleCacheSave();
  return full;
}
/**
 * Problem codes per question id (migrations 20261028170000/190000), checked in
 * the same id blocks as the light list so no request runs into the server's
 * statement timeout. Null when the server cannot check.
 */
export async function fetchQualityFlags(signal?:AbortSignal):Promise<Record<string,string[]>|null> {
  try {
    const plan=await rpc('curation_list_plan',{p_block:1000},signal) as {starts:(string|number)[]};
    const starts=plan.starts.map(String);
    const parts=await inParallel(starts.map((from,i)=>async()=>
      await rpc('curation_quality_flags',{p_from:from,p_to:starts[i+1]??null},signal) as Record<string,string[]>),PARALLEL_REQUESTS);
    return Object.assign({},...parts);
  } catch(error) {
    if(isMissingFunction(error)) return null;
    throw error;
  }
}
/** Audits per curator and day plus the shared goals (migration 20261028200000); null when not installed. */
export async function fetchCurationActivity(signal?:AbortSignal):Promise<CurationActivity|null> {
  try {
    return await rpc('curation_activity',{p_days:90},signal) as CurationActivity;
  } catch(error) {
    if(isMissingFunction(error)) return null;
    throw error;
  }
}
export async function saveCurationGoals(daily:Record<string,number>, deadline:string|null, deadlinePriority:string|null=null):Promise<CurationActivity['goals']> {
  return await rpc('curation_set_goals',{p_daily:daily,p_deadline:deadline||null,p_deadline_priority:deadlinePriority||null}) as CurationActivity['goals'];
}
/** Priorities (P0–P3) and the planned owner of each question (migration 20261029120000); null when not installed. */
export async function fetchPriorities(signal?:AbortSignal):Promise<CurationPriorities|null> {
  try {
    const raw=await rpc('curation_priorities',{},signal) as {priority?:Record<string,string[]>; planned?:Record<string,string[]>};
    return buildPriorities(raw.priority??{},raw.planned??{});
  } catch(error) {
    if(isMissingFunction(error)) return null;
    throw error;
  }
}
/** Ids whose full text contains every term; null when the server cannot search. */
export async function searchQuestionIds(terms:string[], signal?:AbortSignal):Promise<string[]|null> {
  try {
    return await rpc('curation_search',{p_terms:terms.slice(0,10)},signal) as string[];
  } catch(error) {
    if(isMissingFunction(error)) return null;
    throw error;
  }
}
export async function fetchSupabaseShared() {
  const changes=new Map<string,SharedRow>();
  let result;
  do {
    result=await rpc('curation_sync',{p_cursor:cursor});
    for(const q of result.questions as Question[]) {
      const previous=shared.get(q.id);
      if(!previous || previous.deleted || (q.sync_version??0)>previous.version) {
        const row={id:q.id,patch:{...q,parcial:false},version:q.sync_version??0};
        shared.set(q.id,row);changes.set(q.id,row);
        base.set(q.id,row.patch);
      }
    }
    for(const id of result.removed_ids || []) {
      const row={id,patch:{},version:0,deleted:true};
      shared.set(id,row);changes.set(id,row);
      base.delete(id);
    }
    cursor=result.cursor;
  } while(result.more);
  if(changes.size) scheduleCacheSave();
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
  // A light-list row lacks the long fields; saving it whole would blank them.
  if(action==='save' && !fields && questions.some(q=>q.parcial)) throw new Error('A questão ainda está carregando. Aguarde e tente de novo.');
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
  clearTimeout(saveTimer);
  cursor=0;shared.clear();base.clear();
  await clearCachedBase();
}
