import React from 'react';
import {CheckCircle2} from 'lucide-react';
import {AI_VERIFIERS, readVerification, toggleVerification} from '../lib/aiVerification';

// Toggle buttons for the AIs that validated the question. The marked state is
// read from the comment itself, and each click writes the managed sentence
// back through onChange. Nothing is saved here: the editor's
// "Salvar alterações" button persists the comment, as for every other field.
export function AiVerificationControl({comentario, onChange}:{comentario:string|null|undefined; onChange:(next:string)=>void}) {
 const marked = readVerification(comentario);
 return <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
  <p className="text-sm font-bold text-white">Verificada por IA</p>
  <p className="mt-1 text-xs text-apex-readable">Marque as IAs que validaram a questão. A frase entra no fim do comentário geral; grave com Salvar alterações.</p>
  <div role="group" aria-label="IAs que verificaram a questão" className="mt-3 flex flex-wrap gap-2">
   {AI_VERIFIERS.map(({id,label})=>{const on=marked.includes(id);return <button key={id} type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={()=>onChange(toggleVerification(comentario,id))} className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${on?'border-emerald-500/50 bg-emerald-500/15 text-emerald-200':'border-white/15 bg-shell-2 text-apex-readable hover:bg-white/10'}`}>
    {on&&<CheckCircle2 size={16} aria-hidden="true"/>}{label}
   </button>;})}
  </div>
 </div>;
}
