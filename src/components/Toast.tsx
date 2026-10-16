import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-28 right-5 z-50 sm:bottom-5 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4">
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-3"
          style={{
            backgroundColor: 'rgba(30, 29, 27, 0.96)',
            borderColor:
              t.type === 'success'
                ? 'rgba(22, 163, 74, 0.4)'
                : t.type === 'error'
                ? 'rgba(220, 38, 38, 0.4)'
                : 'rgba(164, 57, 57, 0.4)',
          }}
        >
          {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
          {t.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info className="w-5 h-5 text-brand-muted shrink-0 mt-0.5" />}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-apex-text leading-tight">{t.title}</p>
            {t.message && <p className="text-sm text-apex-readable mt-1 leading-relaxed">{t.message}</p>}
          </div>

          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label={`Fechar aviso: ${t.title}`}
            className="min-h-11 min-w-11 -m-2 inline-flex items-center justify-center rounded text-apex-readable hover:text-apex-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
