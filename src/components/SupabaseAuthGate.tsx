import React,{useEffect,useState} from 'react';
import {currentSupabaseCurator,hasSupabaseSession,loginSupabase} from '../lib/supabaseCuration';
import {MasterAuthGate} from './MasterAuthGate';
import {DEFAULT_CURATORS} from '../data/defaultCurators';
import type {Curator} from '../types/question';

export function SupabaseAuthGate({onAuthenticated}:{onAuthenticated:(curator:Curator)=>void}) {
 const [checking,setChecking]=useState(hasSupabaseSession);
 useEffect(()=>{
  let stopped=false;
  if(hasSupabaseSession()) void currentSupabaseCurator().then(curator=>{if(!stopped) onAuthenticated(curator);}).catch(()=>{}).finally(()=>{if(!stopped)setChecking(false);});
  return ()=>{stopped=true;};
 },[]);
 if(checking) return <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e1d1b]">Verificando sessão…</div>;
 return <MasterAuthGate curators={DEFAULT_CURATORS} authenticate={loginSupabase} onAuthenticated={onAuthenticated}/>;
}
