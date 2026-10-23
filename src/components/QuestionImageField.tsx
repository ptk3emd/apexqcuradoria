import React,{useId,useRef,useState} from 'react';
import {ImagePlus,Loader2,Trash2} from 'lucide-react';
import type {Question} from '../types/question';
import {IMAGE_CAPTION_MAX_LENGTH,assertAcceptedImage,toWebp} from '../lib/questionImage';
import {uploadQuestionImage} from '../lib/supabaseCuration';
import {ConfirmDialog} from './ConfirmDialog';

const fieldClass='mt-2 w-full rounded-xl border border-white/15 bg-shell-2 px-4 py-3 text-base leading-7 text-white outline-none focus:border-brand-muted focus:ring-2 focus:ring-brand-muted/20';
const buttonClass='flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-muted disabled:opacity-50';

// The figure of one question: pick a file, see it as the student will, describe
// it. The file is converted to WebP here and stored by the upload Edge Function;
// `imagem` only ever holds the address that function returns. The description
// is the alt text and the caption, so saving is refused without it.
export function QuestionImageField({question,onChange,conflicts}:{question:Question;onChange:(patch:Partial<Question>)=>void;conflicts?:ReadonlySet<string>}) {
 const inputId=useId();
 const captionRef=useRef<HTMLTextAreaElement>(null);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState('');
 const [confirmRemove,setConfirmRemove]=useState(false);
 const hasImage=!!question.imagem?.trim();
 const caption=question.imagem_legenda??'';

 const pick=async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];
  e.target.value='';
  if(!file) return;
  setError('');setSending(true);
  try {
   await assertAcceptedImage(file);
   const webp=await toWebp(file);
   const url=await uploadQuestionImage(question.id,webp);
   onChange({imagem:url});
   // A new figure needs its own description: take the curator straight to it.
   requestAnimationFrame(()=>captionRef.current?.focus());
  } catch(err) {
   setError((err as Error).message||'Não foi possível enviar a imagem.');
  } finally {
   setSending(false);
  }
 };

 return <section aria-labelledby={`${inputId}-title`} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
  <div>
   <h2 id={`${inputId}-title`} className="text-xl font-bold">Imagem da questão</h2>
   <p className="mt-1 text-sm text-apex-readable">Aparece logo abaixo do enunciado, para o aluno e na área do professor. Use só figuras que a curadoria tem direito de usar.</p>
  </div>
  {hasImage&&<figure className="flex flex-col items-center gap-2 rounded-xl bg-white/5 p-3">
   <img src={question.imagem!} alt={caption.trim()||'Imagem da questão, ainda sem descrição'} className="max-h-72 w-auto max-w-full rounded-md object-contain"/>
   {caption.trim()&&<figcaption className="max-w-prose text-center text-sm text-apex-readable">{caption.trim()}</figcaption>}
  </figure>}
  {hasImage&&<div>
   <label className="block text-sm font-bold text-apex-readable" htmlFor={`${inputId}-caption`}>Descrição da imagem (obrigatória)</label>
   <textarea id={`${inputId}-caption`} ref={captionRef} rows={3} maxLength={IMAGE_CAPTION_MAX_LENGTH} value={caption} onChange={e=>onChange({imagem_legenda:e.target.value})} aria-describedby={`${inputId}-hint`} aria-invalid={!caption.trim()} className={fieldClass}/>
   <p id={`${inputId}-hint`} className="mt-1 flex justify-between gap-3 text-xs text-apex-readable"><span>Diga o que a figura mostra e o que o aluno precisa ver nela. É lida por leitores de tela e aparece sob a imagem.</span><span>{[...caption].length}/{IMAGE_CAPTION_MAX_LENGTH}</span></p>
   {(conflicts?.has('imagem')||conflicts?.has('imagem_legenda'))&&<p role="status" className="mt-1 text-xs font-normal text-amber-300">Outra pessoa também alterou a imagem. Ao salvar, vale a sua versão.</p>}
  </div>}
  <div className="flex flex-wrap items-center gap-3">
   <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} disabled={sending} className="sr-only"/>
   <label htmlFor={inputId} className={`${buttonClass} cursor-pointer ${sending?'pointer-events-none opacity-50':''}`}>
    {sending?<Loader2 size={16} className="animate-spin" aria-hidden="true"/>:<ImagePlus size={16} aria-hidden="true"/>}
    {sending?'Enviando imagem…':hasImage?'Trocar imagem':'Adicionar imagem'}
   </label>
   {hasImage&&<button type="button" disabled={sending} onClick={()=>setConfirmRemove(true)} className={`${buttonClass} text-rose-200`}><Trash2 size={16} aria-hidden="true"/>Remover imagem</button>}
   <span className="text-xs text-apex-readable">PNG, JPG ou WebP. É convertida para WebP e reduzida a, no máximo, 2000 px.</span>
  </div>
  <p role="status" className="sr-only">{sending?'Enviando imagem':''}</p>
  {error&&<p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
  <ConfirmDialog open={confirmRemove} title="Remover a imagem?" message="A imagem sai desta questão quando você salvar, junto com a descrição. O arquivo enviado continua guardado." confirmLabel="Remover imagem" tone="danger"
   onConfirm={()=>{setConfirmRemove(false);setError('');onChange({imagem:null,imagem_legenda:null});}} onCancel={()=>setConfirmRemove(false)}/>
 </section>;
}
