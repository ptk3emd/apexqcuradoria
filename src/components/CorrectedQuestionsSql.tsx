import React, {useMemo, useState} from 'react';
import {Copy, Download, Database} from 'lucide-react';
import type {Question} from '../types/question';
import {generateCorrectedQuestionsSql} from '../lib/correctedQuestionsSql';
import {copyTextToClipboard} from '../lib/clipboardHelper';

interface Props {
  questions: Question[];
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}
export function CorrectedQuestionsSql({questions, onShowToast}: Props) {
  const result = useMemo(() => generateCorrectedQuestionsSql(questions), [questions]);
  const [copying, setCopying] = useState(false);
  const available = result.count > 0 && result.errors.length === 0;
  const copy = async () => {
    setCopying(true);
    try {
      const ok = await copyTextToClipboard(result.sql);
      onShowToast(ok ? 'SQL copiado' : 'Não foi possível copiar',
        ok ? `${result.count} questões corrigidas • public.questions` : 'Selecione o código e copie manualmente.', ok ? 'success' : 'error');
    } finally {setCopying(false);}
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([result.sql], {type:'text/sql;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url; a.download = 'apexmed_correcoes_questions.sql'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="rounded-2xl bg-shell-2 border border-white/10 p-6 space-y-4" aria-label="SQL de todas as correções">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-apex-text flex items-center gap-2"><Database className="w-4 h-4 text-brand-muted"/> SQL de todas as questões corrigidas</h3>
        <p className="text-xs text-shell-muted mt-1" aria-live="polite">{result.count} questões acumuladas • Todos os curadores • public.questions</p>
      </div>
      <div className="flex gap-2">
        <button disabled={!available || copying} onClick={() => void copy()} className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-white bg-brand hover:bg-brand-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand"><Copy className="w-3.5 h-3.5"/>{copying ? 'Copiando…' : 'Copiar SQL de correções'}</button>
        <button disabled={!available} onClick={download} className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-apex-text bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition-all disabled:opacity-40 disabled:cursor-not-allowed"><Download className="w-3.5 h-3.5"/>Baixar .sql</button>
      </div>
    </div>
    <p className="text-xs text-apex-readable leading-relaxed">Cada nova correção confirmada na base compartilhada entra neste script automaticamente. Se uma questão for corrigida novamente, seu UPDATE usa a versão mais recente. Questões já modificadas continuam incluídas mesmo após mudança de status.</p>
    <p className="text-xs text-shell-muted">As alterações já são salvas em questions. Este SQL consolidado pode aplicar as mesmas correções em outra base com os mesmos IDs.</p>
    {result.errors.length > 0 ? <div role="alert" className="text-xs text-amber-300"><p>Corrija estes dados para gerar o script completo:</p><ul className="list-disc pl-5">{result.errors.map((error,index)=><li key={index}>{error}</li>)}</ul></div> :
      <textarea aria-label="SQL acumulado de correções" readOnly value={result.count ? result.sql : '-- Nenhuma questão corrigida até o momento.'} className="w-full min-h-72 max-h-[600px] rounded-xl bg-shell-3 border border-white/[0.08] p-4 font-mono text-xs text-apex-text" spellCheck={false}/>}
  </section>;
}
