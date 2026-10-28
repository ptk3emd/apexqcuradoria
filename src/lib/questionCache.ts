import type {Question} from '../types/question';

// The question base, kept in IndexedDB so a reload shows it at once and then
// asks the server only for the events since `cursor`, not every page again.
export type CachedBase = {version:number; cursor:number; savedAt:number; questions:Question[]};

const DB_NAME='apexmed_curation';
const STORE='base';
const KEY='questions';
const FORMAT=1;
// Past this age, a full load is cheaper than replaying the event log.
const MAX_AGE_MS=7*24*60*60*1000;

function open():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined') return reject(new Error('IndexedDB indisponível'));
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function run<T>(mode:IDBTransactionMode, action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db=await open();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const request=action(db.transaction(STORE,mode).objectStore(STORE));
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  } finally {db.close();}
}

export async function readCachedBase():Promise<CachedBase|null> {
  try {
    const cached=await run<CachedBase|undefined>('readonly',store=>store.get(KEY));
    if(!cached || cached.version!==FORMAT || Date.now()-cached.savedAt>MAX_AGE_MS || !cached.questions?.length) return null;
    return cached;
  } catch {return null;}
}

export async function writeCachedBase(cursor:number, questions:Question[]) {
  const value:CachedBase={version:FORMAT,cursor,savedAt:Date.now(),questions};
  try {await run('readwrite',store=>store.put(value,KEY));} catch { /* The cache is an accelerator; the server stays the source. */ }
}

export async function clearCachedBase() {
  try {await run('readwrite',store=>store.delete(KEY));} catch { /* Nothing cached. */ }
}
