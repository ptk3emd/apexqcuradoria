import React, {useState} from 'react';
import {CheckCircle2} from 'lucide-react';
import {AI_VERIFIERS, MAX_IA_NAME_LENGTH, addTypedVerification, readVerification, toggleVerification} from '../lib/aiVerification';

// Toggle buttons for the AIs that validated the question, plus a field for an
// AI that is not listed. The marked state is read from the comment itself, and
// each change is written back through onChange. Nothing is saved here: the
// editor's "Salvar alterações" button persists the comment, as for every field.
export function AiVerificationControl({comentario, onChange}:{comentario:string|null|undefined; onChange:(next:string)=>void}) {
 const marked = readVerification(comentario);
 const [typed, setTyped] = useState('');
 const [error, setError] = useState('');
 const typedMarked = marked.filter(label => !AI_VERIFIERS.some(v => v.label === label));
 const chipClass = (on: boolean) => `inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${on?'border-emerald-500/50 bg-emerald-500/15 text-emerald-200':'border-white/15 bg-shell-2 text-apex-readable hover:bg-white/10'}`;
 const addTyped = () => {
  const result = addTypedVerification(comentario, typed);
  if ('error' in result) { setError(result.error); return; }
  onChange(result.comentario);
  setTyped('');
  setError('');
 };
 return <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
  <p className="text-sm font-bold text-white">Verificada por IA</p>
  <p className="mt-1 text-xs text-apex-readable">Marque as IAs que validaram a questão. A frase entra no fim do comentário geral; grave com Salvar alterações.</p>
  <div role="group" aria-label="IAs que verificaram a questão" className="mt-3 flex flex-wrap gap-2">
   {AI_VERIFIERS.map(({label})=>{const on=marked.includes(label);return <button key={label} type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={()=>onChange(toggleVerification(comentario,label))} className={chipClass(on)}>
    {on&&<CheckCircle2 size={16} aria-hidden="true"/>}{label}
   </button>;})}
   {typedMarked.map(label=><button key={label} type="button" role="checkbox" aria-checked aria-label={label} onClick={()=>onChange(toggleVerification(comentario,label))} className={chipClass(true)}>
    <CheckCircle2 size={16} aria-hidden="true"/>{label}
   </button>)}
  </div>
  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
   <input type="text" aria-label="Outra IA" value={typed} maxLength={MAX_IA_NAME_LENGTH} placeholder="Ex.: Perplexity" onChange={e=>{setTyped(e.target.value);setError('');}}
    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTyped();}}}
    className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-shell-2 px-4 text-sm text-white outline-none focus:border-brand-muted focus:ring-2 focus:ring-brand-muted/20"/>
   <button type="button" onClick={addTyped} disabled={!typed.trim()} className="min-h-[44px] rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-hover disabled:opacity-40">Adicionar IA</button>
  </div>
  {error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
 </div>;
}
