import {useCallback,useEffect,useState} from 'react';
import {fetchApexOverview,requestApexSync} from './supabaseCuration';
import type {ApexOverview} from './apexState';
export function useApexSync(authenticated:boolean) {
 const [overview,setOverview]=useState<ApexOverview|null>(null);
 const [error,setError]=useState('');
 const [requesting,setRequesting]=useState(false);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!authenticated) {setOverview(null);setError('');return;}
  const controller=new AbortController();
  let running=false;
  const refresh=async()=>{
   if(running||controller.signal.aborted) return;
   running=true;
   try {
    const data=await fetchApexOverview(controller.signal);
    if(!controller.signal.aborted) {setOverview(previous => previous?.checkedAt === data.checkedAt && JSON.stringify(previous?.run) === JSON.stringify(data.run) ? previous : data);setError('');}
   } catch(e) {if(!controller.signal.aborted) setError((e as Error).message);}
   finally {running=false;}
  };
  void refresh();
  const timer=setInterval(()=>{void refresh();},15000);
  window.addEventListener('focus',refresh);
  return ()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[authenticated,attempt]);
 const retry=useCallback(async()=>{
  if(requesting) return;
  setRequesting(true);
  try {await requestApexSync();setAttempt(n=>n+1);setError('');}
  catch(e) {setError((e as Error).message);}
  finally {setRequesting(false);}
 },[requesting]);
 return {overview,error,requesting,retry};
}
