import React, { useState, useMemo, useEffect } from 'react';
import { 
  Copy, 
  ExternalLink, 
  UserPlus, 
  Filter, 
  Eye, 
  PenTool, 
  Sparkles,
  ChevronRight,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { Question, QuestionStatus, Curator, CuratorPresence, QuestionComment } from '../types/question';
import { StatusBadge } from './StatusBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { formatQuestionForAiPrompt, copyTextToClipboard } from '../lib/clipboardHelper';
import { AdvancedFilters, AdvancedFilterState, GRANDES_AREAS_MAP } from './AdvancedFilters';
import { viewTransition, nameQuestionRowOf } from '../lib/viewTransition';

interface QuestionsTableProps {
  questions: Question[];
  busy: boolean;
  onSelectedQuestions: (ids: string[], action: 'assign' | 'review') => Promise<boolean>;
  activeCurator: Curator;
  presences: Record<string, CuratorPresence>;
  comments: Record<string, QuestionComment[]>;
  onSelectQuestion: (question: Question) => void;
  onUpdateStatus: (id: string, status: QuestionStatus, notas?: string) => Promise<boolean>;
  onAssignQuestion: (id: string, curator: Curator | null) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  searchActive?: boolean;
  onClearSearch?: () => void;
}

const STATUS_WORKFLOW = ['pendente', 'revisar_questao', 'questao_corrigida', 'aprovadas', 'eliminar_questao'];

const INITIAL_FILTER_STATE: AdvancedFilterState = {
  status: 'todas',
  responsavel: 'todos',
  categorias: [],
  origens: [],
  anos: [],
  especialidades: [],
  competencias: [],
  temas_especificos: [],
  searchQueries: [],
};

export const QuestionsTable: React.FC<QuestionsTableProps> = ({
  questions,
  busy,
  onSelectedQuestions,
  activeCurator,
  presences,
  comments,
  onSelectQuestion,
  onUpdateStatus,
  onAssignQuestion,
  onShowToast,
  searchActive = false,
  onClearSearch,
}) => {
  const [filterState, setFilterState] = useState<AdvancedFilterState>(INITIAL_FILTER_STATE);

  const [sortBy, setSortBy] = useState<'id' | 'especialidade' | 'status'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Eliminating is confirmed before it is saved; the select keeps its old value until then.
  const [pendingElimination, setPendingElimination] = useState<Question | null>(null);
  useEffect(() => { setSelectedIds(new Set()); }, [filterState, activeCurator.id]);
  useEffect(() => {
    const eligible = new Set(questions.map(q => q.id));
    setSelectedIds(previous => {
      const next = new Set([...previous].filter(id => eligible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [questions]);
  const toggleSelection = (id: string) => {
    if (!selectedIds.has(id) && selectedIds.size >= 100) {
      onShowToast('Limite de seleção', 'Selecione até 100 questões por operação.', 'info');
      return;
    }
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const submitSelection = async (action: 'assign' | 'review') => {
    if (await onSelectedQuestions([...selectedIds], action)) setSelectedIds(new Set());
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterState, sortBy, sortOrder]);

  // Filtered and sorted questions with all facets
  // Queue summary for the header: everything audited vs. still pending, and what is waiting on you.
  const queue = useMemo(() => {
    const count = (status: QuestionStatus) => questions.filter(q => q.status === status).length;
    const pending = count('pendente');
    return {
      total: questions.length,
      audited: questions.length - pending,
      pending,
      mine: questions.filter(q => q.status === 'pendente' && q.responsavel_id === activeCurator.id).length,
      segments: [
        { label: 'Aprovadas', value: count('aprovadas'), className: 'bg-emerald-500' },
        { label: 'Corrigidas', value: count('questao_corrigida'), className: 'bg-blue-500' },
        { label: 'Revisar', value: count('revisar_questao'), className: 'bg-amber-500' },
        { label: 'Eliminar', value: count('eliminar_questao'), className: 'bg-rose-500' },
      ],
    };
  }, [questions, activeCurator.id]);

  const filteredQuestions = useMemo(() => {
    return questions
      .filter(q => {
        // 1. Status Filter
        if (filterState.status !== 'todas' && q.status !== filterState.status) return false;

        // 2. Responsável Filter
        if (filterState.responsavel === 'minhas' && q.responsavel_id !== activeCurator.id) return false;
        if (filterState.responsavel === 'sem_responsavel' && q.responsavel_id) return false;
        if (
          filterState.responsavel !== 'todos' &&
          filterState.responsavel !== 'minhas' &&
          filterState.responsavel !== 'sem_responsavel' &&
          q.responsavel_id !== filterState.responsavel
        ) {
          return false;
        }

        // 3. Disciplinas (Categorias)
        if (filterState.categorias.length > 0 && (!q.categoria || !filterState.categorias.includes(q.categoria))) {
          return false;
        }

        // 4. Instituições / Bancas (Origens)
        if (filterState.origens.length > 0 && (!q.origem || !filterState.origens.includes(q.origem))) {
          return false;
        }

        // 5. Anos
        if (filterState.anos.length > 0 && (!q.ano || !filterState.anos.includes(q.ano))) {
          return false;
        }

        // 6. Especialidades
        if (filterState.especialidades.length > 0 && (!q.especialidade || !filterState.especialidades.includes(q.especialidade))) {
          return false;
        }

        // 7. Competências
        if (filterState.competencias.length > 0) {
          const cLow = (q.competencias || '').toLowerCase();
          const matchComp = filterState.competencias.some(c => cLow.includes(c.toLowerCase()));
          if (!matchComp) return false;
        }

        // 8. Temas Específicos
        if (filterState.temas_especificos.length > 0 && (!q.tema_especifico || !filterState.temas_especificos.includes(q.tema_especifico))) {
          return false;
        }

        // 9. Search Queries / Palavras-chave
        if (filterState.searchQueries.length > 0) {
          const haystack = `${q.id} ${q.enunciado || ''} ${q.tema_especifico || ''} ${q.especialidade || ''} ${q.categoria || ''} ${q.a || ''} ${q.b || ''} ${q.c || ''} ${q.d || ''} ${q.e || ''} ${q.comentario || ''}`.toLowerCase();
          const matchesAll = filterState.searchQueries.every(term => haystack.includes(term.toLowerCase()));
          if (!matchesAll) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortBy === 'id') {
          const numA = parseInt(a.id, 10);
          const numB = parseInt(b.id, 10);
          comp = !isNaN(numA) && !isNaN(numB) ? numA - numB : a.id.localeCompare(b.id);
        } else if (sortBy === 'especialidade') {
          comp = (a.especialidade || '').localeCompare(b.especialidade || '');
        } else if (sortBy === 'status') {
          // Workflow order, not alphabetical: what is still to do comes first.
          const rank = (status: string) => STATUS_WORKFLOW.indexOf(status);
          comp = rank(a.status) - rank(b.status);
        }
        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [questions, filterState, sortBy, sortOrder, activeCurator.id]);

  const pageQuestions = filteredQuestions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectablePage = pageQuestions;
  const allPageSelected = selectablePage.length > 0 && selectablePage.every(q => selectedIds.has(q.id));
  const togglePageSelection = () => {
    const next = new Set(selectedIds);
    if (allPageSelected) selectablePage.forEach(q => next.delete(q.id));
    else selectablePage.forEach(q => { if (next.size < 100) next.add(q.id); });
    setSelectedIds(next);
  };
  useEffect(() => { setCurrentPage(page => Math.min(page, Math.max(1, Math.ceil(filteredQuestions.length / pageSize)))); }, [filteredQuestions.length, pageSize]);

  // Counts for status chips
  const counts = useMemo(() => {
    return {
      total: questions.length,
      pendente: questions.filter(q => q.status === 'pendente').length,
      aprovadas: questions.filter(q => q.status === 'aprovadas').length,
      eliminar_questao: questions.filter(q => q.status === 'eliminar_questao').length,
      revisar_questao: questions.filter(q => q.status === 'revisar_questao').length,
      questao_corrigida: questions.filter(q => q.status === 'questao_corrigida').length,
    };
  }, [questions]);

  const handleCopyQuestion = async (q: Question, e: React.MouseEvent) => {
    e.stopPropagation();
    const formatted = formatQuestionForAiPrompt(q);
    const success = await copyTextToClipboard(formatted);
    if (success) {
      onShowToast(
        `Questão #${q.id} copiada!`,
        'Texto formatado pronto para colar na IA (Gemini/ChatGPT) ou no Google.',
        'success'
      );
    } else {
      onShowToast('Falha ao copiar texto', 'Tente novamente.', 'error');
    }
  };

  return (
    <>
    <div className="w-full space-y-4">
      {/* Queue header: how far the audit is, at a glance */}
      <section aria-labelledby="queue-title" className="space-y-4 pt-1 pb-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <h1 id="queue-title" className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.02em] text-apex-text">
            Fila de curadoria: <span className="tabular-nums text-brand-soft">{queue.audited}</span>
            <span className="tabular-nums text-shell-muted"> / {queue.total}</span>
          </h1>
          <p className="text-sm text-apex-readable">
            <span className="tabular-nums font-bold text-apex-text">{queue.pending}</span> pendentes
            <span className="mx-2 text-shell-subtle" aria-hidden="true">•</span>
            <span className="tabular-nums font-bold text-apex-text">{queue.mine}</span> com você
          </p>
        </div>
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
          role="img"
          aria-label={queue.segments.map(seg => `${seg.label}: ${seg.value}`).join(', ') + `, Pendentes: ${queue.pending}`}
        >
          {queue.total > 0 && queue.segments.map(seg => (
            <div
              key={seg.label}
              className={`${seg.className} h-full transition-[width] duration-700 ease-out motion-reduce:transition-none`}
              style={{ width: `${(seg.value / queue.total) * 100}%` }}
              title={`${seg.label}: ${seg.value}`}
            />
          ))}
        </div>
      </section>

      {/* Advanced Filters Component (Todas as opções do FilterScreen) */}
      <AdvancedFilters
        questions={questions}
        activeCurator={activeCurator}
        filterState={filterState}
        onChangeFilterState={next => viewTransition(() => setFilterState(next), { glide: true })}
        totalFilteredCount={filteredQuestions.length}
      />

      {/* Main Questions Table */}
      <div className="w-full rounded-2xl bg-shell-2 border border-white/[0.08] overflow-hidden shadow-2xl">
        <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-2 md:gap-2.5 border-b border-white/[0.06] bg-shell-3/40 px-4 py-3" aria-live="polite">
          <label className="col-span-2 md:hidden flex items-center gap-2.5 min-h-11 text-xs font-bold text-apex-text cursor-pointer">
            <input type="checkbox" aria-label="Selecionar questões disponíveis desta página" disabled={busy || !selectablePage.length} checked={allPageSelected}
              ref={el => { if (el) el.indeterminate = !allPageSelected && selectablePage.some(q => selectedIds.has(q.id)); }}
              onChange={togglePageSelection} />
            Selecionar página
          </label>
          <span className="col-span-2 md:col-auto text-xs font-bold text-apex-text md:mr-1"><span className="tabular-nums">{selectedIds.size}</span> selecionadas <span className="font-normal text-apex-readable">(máximo 100)</span></span>
          <button disabled={busy || !selectedIds.size} onClick={() => void submitSelection('assign')} className="w-full md:w-auto px-4 py-2 rounded-full text-xs font-bold text-center text-white bg-brand hover:bg-brand-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand">Assumir selecionadas</button>
          <button disabled={busy || !selectedIds.size} onClick={() => void submitSelection('review')} className="w-full md:w-auto px-4 py-2 rounded-full text-xs font-bold text-center text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-500/10">Marcar selecionadas para revisão</button>
          <button disabled={busy || !selectedIds.size} onClick={() => setSelectedIds(new Set())} className="col-span-2 md:col-auto justify-self-center md:justify-self-auto px-3 py-2 rounded-full text-xs font-bold text-apex-readable hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-apex-readable">Limpar seleção</button>
          <span className="hidden md:inline text-xs text-apex-readable">A seleção acompanha a paginação. Alterar filtros limpa a seleção.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="block md:table w-full text-left text-xs text-apex-text border-collapse">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-white/[0.08] bg-shell-3/80 text-apex-readable uppercase text-xs tracking-wider select-none">
                <th className="p-0">
                  <label className="flex items-center justify-center min-w-11 min-h-11 px-3 cursor-pointer">
                    <input type="checkbox" aria-label="Selecionar questões disponíveis desta página" disabled={busy || !selectablePage.length} checked={allPageSelected}
                      ref={el => { if (el) el.indeterminate = !allPageSelected && selectablePage.some(q => selectedIds.has(q.id)); }}
                      onChange={togglePageSelection} />
                  </label>
                </th>
                <th scope="col" aria-sort={sortBy === 'id' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-4 font-bold">
                  <button type="button" aria-label="Ordenar por ID" className="min-h-11 py-3 text-left hover:text-white" onClick={() => viewTransition(() => {
                    if (sortBy === 'id') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('id'); setSortOrder('asc'); }
                  }, { glide: true })}>
                    ID {sortBy === 'id' && <span aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th scope="col" aria-sort={sortBy === 'status' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-4 font-bold">
                  <button type="button" aria-label="Ordenar por Status" className="min-h-11 py-3 text-left hover:text-white" onClick={() => viewTransition(() => {
                    if (sortBy === 'status') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('status'); setSortOrder('asc'); }
                  }, { glide: true })}>
                    Status {sortBy === 'status' && <span aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th scope="col" aria-sort={sortBy === 'especialidade' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-4 font-bold">
                  <button type="button" aria-label="Ordenar por Especialidade / Tema" className="min-h-11 py-3 text-left hover:text-white" onClick={() => viewTransition(() => {
                    if (sortBy === 'especialidade') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('especialidade'); setSortOrder('asc'); }
                  }, { glide: true })}>
                    Especialidade / Tema {sortBy === 'especialidade' && <span aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="py-3 px-4 font-bold">Ano / Origem</th>
                <th className="py-3 px-4 font-bold w-[34%]">Enunciado</th>
                <th className="py-3 px-3 font-bold text-center">Gabarito</th>
                <th className="py-3 px-4 font-bold">Responsável</th>
                <th className="py-3 px-4 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group divide-y divide-white/[0.04]">
              {filteredQuestions.length === 0 ? (
                <tr className="block md:table-row">
                  <td colSpan={9} className="block md:table-cell py-12 text-center text-apex-readable">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-8 h-8 text-brand/60" />
                      <p className="text-sm font-bold text-apex-text">Nenhuma questão encontrada</p>
                      <p className="text-xs">Tente ajustar seus filtros de status ou busca.</p>
                      {(searchActive || filteredQuestions.length < questions.length) && (
                        <button
                          type="button"
                          onClick={() => { setFilterState(INITIAL_FILTER_STATE); onClearSearch?.(); }}
                          className="mt-2 px-4 py-2 rounded-full text-xs font-bold text-apex-text bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition-all"
                        >
                          Limpar busca e filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageQuestions.map((q) => {
                    const qComments = comments[q.id] || [];
                    const viewers = Object.values(presences).filter(
                      p => p.questao_atual_id === q.id && p.curador_id !== activeCurator.id
                    );
                    const isAssignedToMe = q.responsavel_id === activeCurator.id;

                    return (
                      <tr
                        key={q.id}
                        data-question-id={q.id}
                        className="group flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3 md:table-row md:p-0 hover:bg-white/[0.03] transition-colors"
                      >
                        <td className="order-1 p-0 md:order-none" onClick={e => e.stopPropagation()}>
                          <label className="flex items-center justify-center min-w-11 min-h-11 px-3 cursor-pointer">
                            <input type="checkbox" aria-label={`Selecionar questão ${q.id}`} checked={selectedIds.has(q.id)}
                              disabled={busy} onChange={() => toggleSelection(q.id)} />
                          </label>
                        </td>
                        {/* ID with active viewer beacon */}
                        <td className="order-2 font-bold text-apex-text whitespace-nowrap md:order-none md:py-3.5 md:px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08]">
                              #{q.id}
                            </span>
                            {viewers.length > 0 && (
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold border border-amber-500/40 bg-amber-500/15 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)] animate-pulse"
                                title={`${viewers.map(v => v.curador_nome).join(', ')} está ${viewers[0].status_atividade === 'editando' ? 'editando' : 'visualizando'} esta questão`}
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: viewers[0].curador_cor }}
                                />
                                <span className="truncate max-w-[80px]">
                                  {viewers[0].status_atividade === 'editando'
                                    ? <PenTool className="inline-block w-3 h-3 mr-1 align-[-2px]" aria-hidden="true" />
                                    : <Eye className="inline-block w-3 h-3 mr-1 align-[-2px]" aria-hidden="true" />}
                                  {viewers[0].curador_nome.split(' ')[0]}
                                </span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="order-3 ml-auto whitespace-nowrap md:order-none md:ml-0 md:py-3.5 md:px-4">
                          <StatusBadge status={q.status} size="sm" />
                        </td>

                        {/* Especialidade & Tema */}
                        <td className="order-4 basis-full md:basis-auto md:py-3.5 md:px-4">
                          <p className="font-bold text-apex-text leading-tight">
                            {q.especialidade || q.categoria || 'Geral'}
                          </p>
                          <p className="text-xs text-apex-readable truncate max-w-[200px]" title={q.tema_especifico}>
                            {q.tema_especifico || 'Sem tema específico'}
                          </p>
                        </td>

                        {/* Ano / Origem */}
                        <td className="hidden md:table-cell whitespace-nowrap text-apex-readable md:py-3.5 md:px-4">
                          <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-xs">
                            {q.origem || 'ENARE'} {q.ano}
                          </span>
                        </td>

                        {/* Enunciado Preview */}
                        <td className="order-5 basis-full text-apex-readable md:order-none md:basis-auto md:py-3.5 md:px-4">
                          {/* The statement is the open control: keyboard and screen-reader users reach it, not the whole row. */}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => { nameQuestionRowOf(e.currentTarget); onSelectQuestion(q); }}
                            aria-label={`Abrir questão ${q.id}: ${(q.enunciado || '').slice(0, 80)}`}
                            className="w-full text-left line-clamp-2 leading-relaxed text-xs group-hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-muted rounded disabled:cursor-not-allowed"
                          >
                            {q.enunciado}
                          </button>
                          {qComments.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-brand-muted mt-1 font-bold">
                              <MessageSquare className="w-3 h-3" />
                              <span>{qComments.length} comentário{qComments.length > 1 ? 's' : ''}</span>
                            </div>
                          )}
                        </td>

                        {/* Gabarito */}
                        <td className="order-6 text-center whitespace-nowrap md:order-none md:py-3.5 md:px-3">
                          {q.anulada ? (
                            <span className="inline-flex items-center rounded-lg border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">Anulada</span>
                          ) : q.correta ? (
                            <span className="w-6 h-6 inline-flex items-center justify-center rounded-lg bg-brand/20 border border-brand/40 text-brand-muted font-bold">
                              {q.correta}
                            </span>
                          ) : (
                            <span className="text-xs text-apex-readable" title="A questão não tem gabarito oficial cadastrado">Sem gabarito</span>
                          )}
                        </td>

                        {/* Responsável */}
                        <td className="order-7 whitespace-nowrap md:order-none md:py-3.5 md:px-4">
                          {q.responsavel_nome ? (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                isAssignedToMe
                                  ? 'bg-brand/20 border-brand/40 text-apex-text'
                                  : 'bg-white/[0.04] border-white/[0.08] text-apex-readable'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-muted" />
                              {q.responsavel_nome.split(' ')[0]}
                            </span>
                          ) : (
                            <button
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAssignQuestion(q.id, activeCurator);
                              }}
                              className="text-xs text-apex-readable hover:text-apex-text hover:underline flex items-center gap-1"
                            >
                              <UserPlus className="w-3 h-3" /> Assumir
                            </button>
                          )}
                        </td>

                        {/* Quick Actions */}
                        <td className="order-8 ml-auto text-right whitespace-nowrap md:order-none md:ml-0 md:py-3.5 md:px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Copiar Texto para IA/Google */}
                            <button
                              onClick={(e) => handleCopyQuestion(q, e)}
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-apex-readable hover:text-white transition-all"
                              title="Copiar texto para IA (Gemini/ChatGPT) ou Google"
                              aria-label={`Copiar questão ${q.id} para IA`}
                            >
                              <Copy className="w-3.5 h-3.5 text-brand-muted" />
                            </button>

                            {/* Quick Status Select */}
                            <select
                              aria-label={`Status da questão ${q.id}`}
                              disabled={busy}
                              value={q.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={async (e) => {
                                e.stopPropagation();
                                if (e.target.value === 'eliminar_questao') { setPendingElimination(q); return; }
                                if (await onUpdateStatus(q.id, e.target.value as QuestionStatus)) onShowToast('Status atualizado', `Questão #${q.id} salva no Supabase.`, 'success');
                              }}
                              className="bg-shell-3 hover:bg-shell border border-white/[0.1] rounded-lg px-2 py-1 text-xs text-apex-text outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-muted"
                            >
                              <option value="pendente">Pendente</option>
                              <option value="aprovadas">Aprovada</option>
                              <option value="eliminar_questao">Eliminar Questão</option>
                              <option value="revisar_questao">Revisar Questão</option>
                              <option value="questao_corrigida">Questão Corrigida</option>
                            </select>

                            {/* Abrir 1 a 1 */}
                            <button
                              disabled={busy}
                              onClick={(e) => { e.stopPropagation(); nameQuestionRowOf(e.currentTarget); onSelectQuestion(q); }}
                              className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand/20 px-2.5 py-1.5 text-brand-muted transition-all hover:bg-brand/40 hover:text-white md:min-h-0 md:p-1.5"
                              title="Abrir em tela cheia"
                              aria-label={`Abrir questão ${q.id} em tela cheia`}
                            >
                              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                              <span className="text-xs font-bold md:hidden">Abrir</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {filteredQuestions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-shell-3/90 border-t border-white/[0.08] text-xs">
            <div className="flex items-center gap-3 text-apex-readable">
              <span>
                Mostrando{' '}
                <b className="text-white">
                  {Math.min((currentPage - 1) * pageSize + 1, filteredQuestions.length)}
                </b>{' '}
                a{' '}
                <b className="text-white">
                  {Math.min(currentPage * pageSize, filteredQuestions.length)}
                </b>{' '}
                de <b className="text-brand-muted">{filteredQuestions.length}</b> questões
              </span>

              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-xs text-apex-readable">Por página:</span>
                <select
                  aria-label="Questões por página"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-shell-2 border border-white/[0.1] rounded px-2 py-0.5 text-xs text-white outline-none"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Page Navigation Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => viewTransition(() => setCurrentPage(1), { glide: true })}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-xs text-white"
              >
                « Primeira
              </button>
              <button
                disabled={currentPage <= 1}
                onClick={() => viewTransition(() => setCurrentPage(p => Math.max(1, p - 1)), { glide: true })}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-xs text-white"
              >
                ‹ Anterior
              </button>

              <span className="px-3 py-1 rounded-lg bg-shell-2 border border-white/[0.1] font-mono font-bold text-white text-xs">
                {currentPage} / {Math.max(1, Math.ceil(filteredQuestions.length / pageSize))}
              </span>

              <button
                disabled={currentPage >= Math.ceil(filteredQuestions.length / pageSize)}
                onClick={() => viewTransition(() => setCurrentPage(p => p + 1), { glide: true })}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-xs text-white"
              >
                Próxima ›
              </button>
              <button
                disabled={currentPage >= Math.ceil(filteredQuestions.length / pageSize)}
                onClick={() => viewTransition(() => setCurrentPage(Math.ceil(filteredQuestions.length / pageSize)), { glide: true })}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-xs text-white"
              >
                Última »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    <ConfirmDialog
      open={pendingElimination !== null}
      title={`Eliminar a questão #${pendingElimination?.id ?? ''}?`}
      message="A questão será marcada para eliminação e entra no SQL de correções. Você pode mudar o status de volta depois."
      confirmLabel="Eliminar questão"
      tone="danger"
      onCancel={() => setPendingElimination(null)}
      onConfirm={async () => {
        const target = pendingElimination;
        setPendingElimination(null);
        if (target && await onUpdateStatus(target.id, 'eliminar_questao')) onShowToast('Questão marcada para eliminação', `Questão #${target.id} salva no Supabase.`, 'info');
      }}
    />
    </>
  );
};
