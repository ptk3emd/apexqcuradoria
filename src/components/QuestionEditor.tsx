import React,{useState} from 'react';
import {Save,ArrowLeft,CheckCircle2} from 'lucide-react';
import type {Question} from '../types/question';

const fieldClass='mt-2 w-full rounded-xl border border-white/15 bg-shell-2 px-4 py-3 text-base leading-7 text-white outline-none focus:border-brand-muted focus:ring-2 focus:ring-brand-muted/20';
export function QuestionEditor({question,busy,onChange,onSave,onCancel}:{question:Question;busy:boolean;onChange:(q:Question)=>void;onSave:()=>Promise<void>;onCancel:()=>void}) {
 const [section,setSection]=useState('questao');
 const [error,setError]=useState('');
 const set=(key:keyof Question,value:string)=>onChange({...question,[key]:value});
 const text=(key:keyof Question,label:string,rows=3)=><label className="block text-sm font-bold text-apex-readable" key={key}>{label}<textarea aria-label={label} rows={rows} value={String(question[key]??'')} onChange={e=>set(key,e.target.value)} className={fieldClass}/></label>;
 const save=async(e:React.FormEvent)=>{
  e.preventDefault(); if(busy)return;
  if(!/^[0-9]+$/.test(question.id) || BigInt(question.id)>9223372036854775807n) {setSection('classificacao');setError('Informe um ID numérico válido.');return;}
  if(!question.enunciado?.trim()) {setSection('questao');setError('Preencha o enunciado.');return;}
  if(!/^[A-E]$/i.test(question.correta??'')) {setSection('questao');setError('Selecione a alternativa correta.');return;}
  if([...question.descritores??''].length>500){setSection('classificacao');setError('Os descritores devem ter até 500 caracteres.');return;}
  setError('');await onSave();
 };
 return <form onSubmit={save} className="mx-auto max-w-5xl space-y-6 pb-24">
  <fieldset disabled={busy} className="min-w-0 space-y-6" aria-busy={busy}>
   <header className="flex flex-wrap items-center justify-between gap-4">
    <div><p className="text-xs uppercase tracking-widest text-brand-muted">Curadoria • Questão #{question.id}</p><h1 className="mt-2 text-3xl font-bold">Editar questão</h1><p className="mt-2 text-sm text-apex-readable">Revise o conteúdo e salve para sincronizar com os outros curadores.</p></div>
    <button type="button" onClick={onCancel} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm"><ArrowLeft size={16}/> Cancelar edição</button>
   </header>
   <div role="tablist" aria-label="Seções da edição" className="flex gap-2 overflow-x-auto border-b border-white/10 pb-3">
    {[['questao','Enunciado e alternativas'],['resolucao','Resolução'],['classificacao','Classificação']].map(([key,label])=><button key={key} type="button" role="tab" aria-selected={section===key} aria-controls={`editor-${key}`} onClick={()=>setSection(key)} className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-normal ${section===key?'bg-brand text-white':'bg-white/5 text-apex-readable hover:bg-white/10'}`}>{label}</button>)}
   </div>
   {error&&<p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-rose-200">{error}</p>}
   {section==='questao'&&<section id="editor-questao" role="tabpanel" className="space-y-6">
    {text('enunciado','Enunciado',7)}
    <div><h2 className="text-xl font-bold">Alternativas</h2><p className="mt-1 text-sm text-apex-readable">Marque o gabarito e edite cada alternativa abaixo.</p></div>
    {['a','b','c','d','e'].map(key=>{const selected=question.correta?.toUpperCase()===key.toUpperCase();return <div key={key} className={`rounded-2xl border p-4 sm:p-5 ${selected?'border-emerald-500/50 bg-emerald-500/5':'border-white/10 bg-white/[0.02]'}`}>
     <label className="flex items-center gap-3 text-sm font-bold"><input type="radio" name="correta" value={key.toUpperCase()} checked={selected} onChange={()=>set('correta',key.toUpperCase())} className="h-5 w-5 accent-emerald-500"/>{key.toUpperCase()} {selected&&<span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={16}/>Gabarito</span>}</label>
     <textarea aria-label={`Alternativa ${key.toUpperCase()}`} rows={3} value={String(question[key as keyof Question]??'')} onChange={e=>set(key as keyof Question,e.target.value)} className={fieldClass}/>
    </div>;})}
   </section>}
   {section==='resolucao'&&<section id="editor-resolucao" role="tabpanel" className="space-y-6">{text('comentario','Comentário geral',6)}{['a','b','c','d','e'].map(key=>text(`justificativa_${key}` as keyof Question,`Justificativa da alternativa ${key.toUpperCase()}`,4))}</section>}
   {section==='classificacao'&&<section id="editor-classificacao" role="tabpanel" className="space-y-6">
    <div className="grid gap-5 sm:grid-cols-2">{[['id','ID da questão'],['categoria','Categoria'],['especialidade','Especialidade'],['tema_especifico','Tema específico'],['ano','Ano'],['origem','Origem']].map(([key,label])=><label key={key} className="text-sm font-bold text-apex-readable">{label}<input aria-label={label} value={String(question[key as keyof Question]??'')} onChange={e=>set(key as keyof Question,e.target.value)} className={fieldClass}/></label>)}
     <label className="text-sm font-bold text-apex-readable">Dificuldade<select aria-label="Dificuldade" value={question.difficulty_bucket||''} onChange={e=>set('difficulty_bucket',e.target.value)} className={fieldClass}><option value="">Não definida</option><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select></label>
    </div>
    <label className="block text-sm font-bold text-apex-readable">Data de criação (ISO 8601)<input aria-label="Data de criação" placeholder="2026-10-10T12:00:00Z" value={question.created_at??''} onChange={e=>set('created_at',e.target.value)} className={fieldClass}/></label>
    <div className="rounded-xl bg-white/5 p-4 text-sm text-apex-readable"><p>Calculadas pelo banco após salvar:</p><p className="mt-2">Ano numérico: {question.ano_int??'—'}</p><p>Competências normalizadas: {Array.isArray(question.competencias_normalized)?question.competencias_normalized.join(', '):question.competencias_normalized||'—'}</p></div>
    {text('competencias','Competências',3)}{text('descritores','Descritores',4)}<p className="text-right text-xs text-apex-readable">{[...question.descritores??''].length}/500 caracteres</p>
   </section>}
   <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/15 bg-shell-2/95 px-4 py-4 backdrop-blur">
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-4"><span role="status" className="text-sm text-apex-readable">{busy?'Salvando alterações…':'As alterações serão salvas ao confirmar.'}</span><button type="submit" disabled={busy} className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-bold text-white disabled:opacity-50"><Save size={18}/>{busy?'Salvando…':'Salvar alterações'}</button></div>
   </footer>
  </fieldset>
 </form>;
}
