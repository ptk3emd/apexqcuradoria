import {useEffect, useState} from 'react';
import {searchQuestionIds} from './supabaseCuration';

/**
 * Light-list rows carry only a preview of the statement, so a text search also
 * asks the server which questions contain every term. Returns those ids, or
 * null while there is no search, it is still running, or the server cannot search.
 */
export function useServerSearch(terms:string[], enabled:boolean):Set<string>|null {
  const key=terms.map(t=>t.trim()).filter(Boolean).join('\u0000');
  const [result,setResult]=useState<{key:string; ids:Set<string>}|null>(null);
  useEffect(()=>{
    if(!enabled || !key) return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      searchQuestionIds(key.split('\u0000'),controller.signal)
        .then(ids=>{if(ids) setResult({key,ids:new Set(ids)});})
        .catch(error=>{if((error as Error).name!=='AbortError') console.warn('[curadoria] busca no servidor', (error as Error).message);});
    },250);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[key,enabled]);
  return enabled && key && result?.key===key ? result.ids : null;
}
