import React,{useEffect,useState} from 'react';
import {curationClient,currentSupabaseCurator,signOutSupabase} from '../lib/supabaseCuration';
import type {Curator} from '../types/question';

export function SupabaseAuthGate({onAuthenticated}:{onAuthenticated:(curator:Curator)=>void}) {
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    void (async()=>{
      try {
        const {data}=await curationClient().auth.getSession();
        if(data.session) {const curator=await currentSupabaseCurator();if(!cancelled) onAuthenticated(curator);}
      } catch(error:any) {if(!cancelled) setError(error.message);}
    })();
    return ()=>{cancelled=true;};
  },[]);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy) return;setBusy(true);setError('');
    try {
      const {error}=await curationClient().auth.signInWithPassword({email:email.trim(),password});
      if(error) throw error;
      const curator=await currentSupabaseCurator();
      setPassword('');onAuthenticated(curator);
    } catch(error:any) {setError(error.message);await signOutSupabase().catch(()=>{});}
    finally {setBusy(false);}
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e1d1b]/95 p-4">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-[#272522] border border-white/10 p-8 space-y-5">
      <h2 className="text-2xl font-bold">ApexMed — Acesso à curadoria</h2>
      <p className="text-sm text-[#bdbdbd]">Entre com sua conta individual. Seu perfil de curador é definido pelo cadastro.</p>
      <label className="block">E-mail<input type="email" autoComplete="username" required disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} className="block mt-2 w-full rounded-lg bg-black/20 border border-white/20 p-3"/></label>
      <label className="block">Senha<input type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} className="block mt-2 w-full rounded-lg bg-black/20 border border-white/20 p-3"/></label>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#A43939] p-3 font-bold disabled:opacity-50">{busy?'Entrando…':'Entrar na curadoria'}</button>
      <p className="text-xs text-[#bdbdbd]">Primeiro acesso ou senha esquecida? Solicite ao administrador a configuração da sua conta.</p>
    </form>
  </div>;
}
