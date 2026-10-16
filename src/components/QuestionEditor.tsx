import React,{useState} from 'react';
import {Save,ArrowLeft,CheckCircle2,Users} from 'lucide-react';
import type {Question} from '../types/question';
import {normalizeDifficulty} from '../lib/difficulty';
import {REFERENCIAS_MAX_LENGTH} from '../lib/correctedQuestionsSql';
import {LinkifiedText} from './LinkifiedText';
import {AiVerificationControl} from './AiVerificationControl';

const fieldClass='mt-2 w-full rounded-xl border border-white/15 bg-shell-2 px-4 py-3 text-base leading-7 text-white outline-none focus:border-brand-muted focus:ring-2 focus:ring-brand-muted/20';
// `conflicts`: fields another curator saved while this draft also changed them
// (the draft keeps its text and wins on save). `othersEditing`: who else is on
// the question; editing is never blocked.
export function QuestionEditor({question,busy,onChange,onSave,onCancel,conflicts,othersEditing}:{question:Question;busy:boolean;onChange:(q:Question)=>void;onSave:()=>Promise<void>;onCancel:()=>void;conflicts?:ReadonlySet<string>;othersEditing?:string}) {
 const conflictNote=(key:string)=>conflicts?.has(key)?<p role="status" className="mt-1 text-xs font-normal text-amber-300">Outra pessoa também alterou este campo. Ao salvar, vale o seu texto.</p>:null;
 const [section,setSection]=useState('questao');
 const [error,setError]=useState('');
 let difficultyValue = question.difficulty_bucket || '';
 try {difficultyValue = normalizeDifficulty(question.difficulty_bucket) || '';} catch { /* Invalid legacy values must be replaced before saving. */ }
 const set=(key:keyof Question,value:string)=>onChange({...question,[key]:value});
 const text=(key:keyof Question,label:string,rows=3)=><label className="block text-sm font-bold text-apex-readable" key={key}>{label}<textarea aria-label={label} rows={rows} value={String(question[key]??'')} onChange={e=>set(key,e.target.value)} className={fieldClass}/>{conflictNote(key)}</label>;
 const save=async(e:React.FormEvent)=>{
  e.preventDefault(); if(busy)return;
  if(!/^[0-9]+$/.test(question.id) || BigInt(question.id)>9223372036854775807n) {setSection('classificacao');setError('Informe um ID numérico válido.');return;}
  if(!question.enunciado?.trim()) {setSection('questao');setError('Preencha o enunciado.');return;}
  if(!question.anulada && !/^[A-E]$/i.test(question.correta??'')) {setSection('questao');setError('Selecione a alternativa correta ou marque a questão como anulada.');return;}
  if([...question.referencias??''].length>REFERENCIAS_MAX_LENGTH){setSection('resolucao');setError(`As referências devem ter até ${REFERENCIAS_MAX_LENGTH} caracteres.`);return;}
  if([...question.descritores??''].length>500){setSection('classificacao');setError('Os descritores devem ter até 500 caracteres.');return;}
  try {normalizeDifficulty(question.difficulty_bucket);} catch (error) {setSection('classificacao');setError((error as Error).message);return;}
  setError('');await onSave();
 };
 return <form onSubmit={save} className="mx-auto max-w-5xl space-y-6 pb-24">
  <fieldset disabled={busy} className="min-w-0 space-y-6" aria-busy={busy}>
   <header className="flex flex-wrap items-center justify-between gap-4">
    <div><p className="text-xs uppercase tracking-widest text-brand-muted">Curadoria • Questão #{question.id}</p><h1 className="mt-2 text-3xl font-bold">Editar questão</h1><p className="mt-2 text-sm text-apex-readable">Revise o conteúdo e salve para sincronizar com os outros curadores.</p></div>
    <button type="button" onClick={onCancel} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm"><ArrowLeft size={16}/> Cancelar edição</button>
   </header>
   <div role="tablist" aria-label="Seções da edição" className="flex gap-2 overflow-x-auto border-b border-white/10 pb-3"
    onKeyDown={e=>{
     const order=['questao','resolucao','classificacao'];
     const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
     if(!step) return;
     e.preventDefault();
     const next=order[(order.indexOf(section)+step+order.length)%order.length];
     setSection(next);
     document.getElementById(`editor-tab-${next}`)?.focus();
    }}>
    {[['questao','Enunciado e alternativas'],['resolucao','Resolução'],['classificacao','Classificação']].map(([key,label])=><button key={key} id={`editor-tab-${key}`} type="button" role="tab" aria-selected={section===key} tabIndex={section===key?0:-1} aria-controls={`editor-${key}`} onClick={()=>setSection(key)} className={`min-h-11 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-muted ${section===key?'bg-brand text-white':'bg-white/5 text-apex-readable hover:bg-white/10'}`}>{label}</button>)}
   </div>
   {othersEditing&&<p role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><Users size={18} className="mt-0.5 shrink-0" aria-hidden="true"/><span>{othersEditing}</span></p>}
   {error&&<p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-rose-200">{error}</p>}
   {section==='questao'&&<section id="editor-questao" role="tabpanel" className="space-y-6">
    {text('enunciado','Enunciado',7)}
    <div><h2 className="text-xl font-bold">Alternativas</h2><p className="mt-1 text-sm text-apex-readable">{question.anulada?'Questão anulada: não há gabarito oficial.':'Marque o gabarito e edite cada alternativa abaixo.'}</p></div>
    <label className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${question.anulada?'border-amber-400/50 bg-amber-500/10':'border-white/10 bg-white/[0.02]'}`}>
     <input type="checkbox" checked={!!question.anulada} onChange={e=>onChange({...question,anulada:e.target.checked,correta:e.target.checked?'':question.correta})} className="mt-0.5 h-5 w-5 accent-amber-500"/>
     <span><span className="block font-bold text-white">Questão anulada pela banca</span><span className="block text-apex-readable">Sem gabarito oficial. Ao salvar, o gabarito é apagado; desmarque e escolha uma alternativa para restaurar.</span>{conflictNote('anulada')}</span>
    </label>
    {conflictNote('correta')}
    {['a','b','c','d','e'].map(key=>{const selected=!question.anulada&&question.correta?.toUpperCase()===key.toUpperCase();return <div key={key} className={`rounded-2xl border p-4 sm:p-5 ${selected?'border-emerald-500/50 bg-emerald-500/5':'border-white/10 bg-white/[0.02]'}`}>
     <label className="flex items-center gap-3 text-sm font-bold"><input type="radio" name="correta" value={key.toUpperCase()} checked={selected} disabled={!!question.anulada} onChange={()=>set('correta',key.toUpperCase())} className="h-5 w-5 accent-emerald-500 disabled:opacity-40"/>{key.toUpperCase()} {selected&&<span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={16}/>Gabarito</span>}</label>
     <textarea aria-label={`Alternativa ${key.toUpperCase()}`} rows={3} value={String(question[key as keyof Question]??'')} onChange={e=>set(key as keyof Question,e.target.value)} className={fieldClass}/>{conflictNote(key)}
    </div>;})}
   </section>}
   {section==='resolucao'&&<section id="editor-resolucao" role="tabpanel" className="space-y-6">{text('comentario','Comentário geral',6)}
    <div>{text('referencias','Referências',4)}<p className="mt-1 flex justify-between gap-3 text-xs text-apex-readable"><span>Aparecem junto ao comentário geral. Endereços http(s) viram links.</span><span>{[...question.referencias??''].length}/{REFERENCIAS_MAX_LENGTH}</span></p>
     {question.referencias?.trim()&&<div className="mt-3 rounded-xl bg-white/5 p-4 text-sm text-apex-readable"><p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-muted">Prévia</p><LinkifiedText text={question.referencias}/></div>}</div>
    <AiVerificationControl comentario={question.comentario} onChange={c=>onChange({...question,comentario:c})}/>
    {['a','b','c','d','e'].map(key=>text(`justificativa_${key}` as keyof Question,`Justificativa da alternativa ${key.toUpperCase()}`,4))}</section>}
   {section==='classificacao'&&<section id="editor-classificacao" role="tabpanel" className="space-y-6">
    <div className="grid gap-5 sm:grid-cols-2">{[['id','ID da questão'],['categoria','Categoria'],['especialidade','Especialidade'],['tema_especifico','Tema específico'],['ano','Ano'],['origem','Origem']].map(([key,label])=><label key={key} className="text-sm font-bold text-apex-readable">{label}<input aria-label={label} value={String(question[key as keyof Question]??'')} onChange={e=>set(key as keyof Question,e.target.value)} className={fieldClass}/>{conflictNote(key)}</label>)}
     <label className="text-sm font-bold text-apex-readable">Dificuldade<select aria-label="Dificuldade" value={difficultyValue} onChange={e=>onChange({...question,difficulty_bucket:normalizeDifficulty(e.target.value)})} className={fieldClass}><option value="">Não definida</option><option value="easy">easy — Fácil</option><option value="medium">medium — Média</option><option value="hard">hard — Difícil</option>{difficultyValue && !['easy','medium','hard'].includes(difficultyValue) && <option value={difficultyValue} disabled>Valor inválido — selecione a dificuldade</option>}</select>{conflictNote('difficulty_bucket')}</label>
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
