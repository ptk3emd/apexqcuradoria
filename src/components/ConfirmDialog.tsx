import React from 'react';
import {AlertTriangle} from 'lucide-react';
import {useDialog} from '../lib/useDialog';

// Asks before an action that cannot be undone with one click (eliminating a
// question, changing the official answer key, discarding an edit). Focus moves
// into the dialog, Esc cancels, and focus returns to the control that opened it.
export function ConfirmDialog({open, title, message, confirmLabel, tone = 'default', onConfirm, onCancel}:{
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useDialog<HTMLDivElement>(onCancel, open);
  if (!open) return null;
  const confirmClass = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-500 text-white'
    : 'bg-brand hover:bg-brand-hover text-white';
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
   <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-shell-2 p-5 shadow-2xl">
    <div className="flex items-start gap-3">
     <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${tone === 'danger' ? 'text-rose-400' : 'text-amber-300'}`} aria-hidden="true"/>
     <div className="min-w-0">
      <h2 id="confirm-dialog-title" className="text-base font-bold text-white">{title}</h2>
      <p id="confirm-dialog-message" className="mt-1.5 text-sm leading-relaxed text-apex-readable">{message}</p>
     </div>
    </div>
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
     <button type="button" onClick={onCancel} className="min-h-[44px] rounded-xl border border-white/15 px-4 text-sm font-bold text-apex-text hover:bg-white/10">Voltar</button>
     <button type="button" onClick={onConfirm} className={`min-h-[44px] rounded-xl px-4 text-sm font-bold ${confirmClass}`}>{confirmLabel}</button>
    </div>
   </div>
  </div>;
}
