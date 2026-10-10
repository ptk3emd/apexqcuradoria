import React, { useState, useMemo, useEffect } from 'react';
import { 
  Copy, 
  ExternalLink, 
  UserPlus, 
  Filter, 
  Eye, 
  Sparkles,
  ChevronRight,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { Question, QuestionStatus, Curator, CuratorPresence, QuestionComment } from '../types/question';
import { StatusBadge } from './StatusBadge';
import { formatQuestionForAiPrompt, copyTextToClipboard } from '../lib/clipboardHelper';

interface QuestionsTableProps {
  questions: Question[];
  activeCurator: Curator;
  presences: Record<string, CuratorPresence>;
  comments: Record<string, QuestionComment[]>;
  onSelectQuestion: (question: Question) => void;
  onUpdateStatus: (id: string, status: QuestionStatus, notas?: string) => void;
  onAssignQuestion: (id: string, curator: Curator | null) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const QuestionsTable: React.FC<QuestionsTableProps> = ({
  questions,
  activeCurator,
  presences,
  comments,
  onSelectQuestion,
  onUpdateStatus,
  onAssignQuestion,
  onShowToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('todas');
  const [especialidadeFilter, setEspecialidadeFilter] = useState<string>('todas');
  const [responsavelFilter, setResponsavelFilter] = useState<string>('todos');
  const [sortBy, setSortBy] = useState<'id' | 'especialidade' | 'status'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, especialidadeFilter, responsavelFilter, sortBy, sortOrder]);

  // Extract unique specialties
  const specialties = useMemo(() => {
    const set = new Set<string>();
    questions.forEach(q => {
      if (q.especialidade) set.add(q.especialidade);
      else if (q.categoria) set.add(q.categoria);
    });
    return Array.from(set).sort();
  }, [questions]);

  // Filtered and sorted questions
  const filteredQuestions = useMemo(() => {
    return questions
      .filter(q => {
        if (statusFilter !== 'todas' && q.status !== statusFilter) return false;
        if (especialidadeFilter !== 'todas' && q.especialidade !== especialidadeFilter) return false;
        if (responsavelFilter === 'minhas' && q.responsavel_id !== activeCurator.id) return false;
        if (responsavelFilter === 'sem_responsavel' && q.responsavel_id) return false;
        if (
          responsavelFilter !== 'todos' &&
          responsavelFilter !== 'minhas' &&
          responsavelFilter !== 'sem_responsavel' &&
          q.responsavel_id !== responsavelFilter
        ) {
          return false;
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
          comp = a.status.localeCompare(b.status);
        }
        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [questions, statusFilter, especialidadeFilter, responsavelFilter, sortBy, sortOrder, activeCurator.id]);

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
    <div className="w-full space-y-4">
      {/* Status Bar / Filter Chips */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1e1d1b] p-3 rounded-2xl border border-white/[0.07]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase font-bold tracking-wider text-[#7a7468] mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-[#DF9696]" />
            Status:
          </span>

          <button
            onClick={() => setStatusFilter('todas')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'todas'
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-[#bdbdbd] hover:bg-white/[0.04]'
            }`}
          >
            Todas ({counts.total})
          </button>

          <button
            onClick={() => setStatusFilter('pendente')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'pendente'
                ? 'bg-white/10 text-[#f8fafc] border border-white/20'
                : 'text-[#7a7468] hover:text-[#f8fafc]'
            }`}
          >
            Pendentes ({counts.pendente})
          </button>

          <button
            onClick={() => setStatusFilter('aprovadas')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'aprovadas'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-[#7a7468] hover:text-emerald-400'
            }`}
          >
            Aprovadas ({counts.aprovadas})
          </button>

          <button
            onClick={() => setStatusFilter('eliminar_questao')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'eliminar_questao'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-[#7a7468] hover:text-rose-400'
            }`}
          >
            Eliminar ({counts.eliminar_questao})
          </button>

          <button
            onClick={() => setStatusFilter('revisar_questao')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'revisar_questao'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-[#7a7468] hover:text-amber-400'
            }`}
          >
            Revisar ({counts.revisar_questao})
          </button>

          <button
            onClick={() => setStatusFilter('questao_corrigida')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              statusFilter === 'questao_corrigida'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-[#7a7468] hover:text-blue-400'
            }`}
          >
            Corrigidas ({counts.questao_corrigida})
          </button>
        </div>

        {/* Secondary dropdown filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Especialidade Select */}
          <select
            value={especialidadeFilter}
            onChange={(e) => setEspecialidadeFilter(e.target.value)}
            className="bg-[#272522] border border-white/[0.1] rounded-xl px-2.5 py-1 text-xs text-[#f8fafc] outline-none focus:border-[#A43939]"
          >
            <option value="todas">Todas as Especialidades</option>
            {specialties.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Responsável Select */}
          <select
            value={responsavelFilter}
            onChange={(e) => setResponsavelFilter(e.target.value)}
            className="bg-[#272522] border border-white/[0.1] rounded-xl px-2.5 py-1 text-xs text-[#f8fafc] outline-none focus:border-[#A43939]"
          >
            <option value="todos">Todos os Responsáveis</option>
            <option value="minhas">Atribuídas a mim ({activeCurator.nome})</option>
            <option value="sem_responsavel">Não atribuídas (Livres)</option>
            <option value="patrick">Patrick</option>
            <option value="lucas">Lucas</option>
            <option value="thierry">Thierry</option>
          </select>
        </div>
      </div>

      {/* Main Questions Table */}
      <div className="w-full rounded-2xl bg-[#1e1d1b] border border-white/[0.08] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#f8fafc] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#272522]/80 text-[#7a7468] uppercase text-[10px] tracking-wider select-none">
                <th
                  onClick={() => {
                    if (sortBy === 'id') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('id'); setSortOrder('asc'); }
                  }}
                  className="py-3 px-4 font-bold cursor-pointer hover:text-white"
                >
                  ID {sortBy === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => {
                    if (sortBy === 'status') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('status'); setSortOrder('asc'); }
                  }}
                  className="py-3 px-4 font-bold cursor-pointer hover:text-white"
                >
                  Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => {
                    if (sortBy === 'especialidade') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('especialidade'); setSortOrder('asc'); }
                  }}
                  className="py-3 px-4 font-bold cursor-pointer hover:text-white"
                >
                  Especialidade / Tema {sortBy === 'especialidade' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="py-3 px-4 font-bold">Ano / Origem</th>
                <th className="py-3 px-4 font-bold w-[34%]">Enunciado</th>
                <th className="py-3 px-3 font-bold text-center">Gabarito</th>
                <th className="py-3 px-4 font-bold">Responsável</th>
                <th className="py-3 px-4 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#7a7468]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-8 h-8 text-[#A43939]/60" />
                      <p className="text-sm font-bold text-[#f8fafc]">Nenhuma questão encontrada</p>
                      <p className="text-xs">Tente ajustar seus filtros de status ou busca.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredQuestions
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((q) => {
                    const qComments = comments[q.id] || [];
                    const viewers = Object.values(presences).filter(
                      p => p.questao_atual_id === q.id && p.curador_id !== activeCurator.id
                    );
                    const isAssignedToMe = q.responsavel_id === activeCurator.id;

                    return (
                      <tr
                        key={q.id}
                        onClick={() => onSelectQuestion(q)}
                        className="group hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        {/* ID with active viewer beacon */}
                        <td className="py-3.5 px-4 font-bold text-[#f8fafc] whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08]">
                              #{q.id}
                            </span>
                            {viewers.length > 0 && (
                              <span
                                className="w-2 h-2 rounded-full animate-ping"
                                style={{ backgroundColor: viewers[0].curador_cor }}
                                title={`Sendo visualizada por ${viewers[0].curador_nome}`}
                              />
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <StatusBadge status={q.status} size="sm" />
                        </td>

                        {/* Especialidade & Tema */}
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-[#f8fafc] leading-tight">
                            {q.especialidade || q.categoria || 'Geral'}
                          </p>
                          <p className="text-[11px] text-[#7a7468] truncate max-w-[200px]" title={q.tema_especifico}>
                            {q.tema_especifico || 'Sem tema específico'}
                          </p>
                        </td>

                        {/* Ano / Origem */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-[#bdbdbd]">
                          <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-[11px]">
                            {q.origem || 'ENARE'} {q.ano}
                          </span>
                        </td>

                        {/* Enunciado Preview */}
                        <td className="py-3.5 px-4 text-[#bdbdbd]">
                          <p className="line-clamp-2 leading-relaxed text-xs group-hover:text-white transition-colors">
                            {q.enunciado}
                          </p>
                          {qComments.length > 0 && (
                            <div className="flex items-center gap-1 text-[11px] text-[#DF9696] mt-1 font-semibold">
                              <MessageSquare className="w-3 h-3" />
                              <span>{qComments.length} comentário{qComments.length > 1 ? 's' : ''}</span>
                            </div>
                          )}
                        </td>

                        {/* Gabarito */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <span className="w-6 h-6 inline-flex items-center justify-center rounded-lg bg-[#A43939]/20 border border-[#A43939]/40 text-[#DF9696] font-bold">
                            {q.correta || 'A'}
                          </span>
                        </td>

                        {/* Responsável */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {q.responsavel_nome ? (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                isAssignedToMe
                                  ? 'bg-[#A43939]/20 border-[#A43939]/40 text-[#f8fafc]'
                                  : 'bg-white/[0.04] border-white/[0.08] text-[#bdbdbd]'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[#DF9696]" />
                              {q.responsavel_nome.split(' ')[0]}
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onAssignQuestion(q.id, activeCurator);
                              }}
                              className="text-[11px] text-[#7a7468] hover:text-[#f8fafc] hover:underline flex items-center gap-1"
                            >
                              <UserPlus className="w-3 h-3" /> Assumir
                            </button>
                          )}
                        </td>

                        {/* Quick Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Copiar Texto para IA/Google */}
                            <button
                              onClick={(e) => handleCopyQuestion(q, e)}
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-[#bdbdbd] hover:text-white transition-all"
                              title="Copiar texto para IA (Gemini/ChatGPT) ou Google"
                            >
                              <Copy className="w-3.5 h-3.5 text-[#DF9696]" />
                            </button>

                            {/* Quick Status Select */}
                            <select
                              value={q.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                onUpdateStatus(q.id, e.target.value as QuestionStatus);
                              }}
                              className="bg-[#272522] hover:bg-[#31302e] border border-white/[0.1] rounded-lg px-2 py-1 text-[11px] text-[#f8fafc] outline-none cursor-pointer"
                            >
                              <option value="pendente">Pendente</option>
                              <option value="aprovadas">Aprovar</option>
                              <option value="eliminar_questao">Eliminar</option>
                              <option value="revisar_questao">Revisar</option>
                              <option value="questao_corrigida">Corrigida</option>
                            </select>

                            {/* Abrir 1 a 1 */}
                            <button
                              onClick={() => onSelectQuestion(q)}
                              className="p-1.5 rounded-lg bg-[#A43939]/20 hover:bg-[#A43939]/40 text-[#DF9696] hover:text-white transition-all"
                              title="Abrir em tela cheia"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
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
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#272522]/90 border-t border-white/[0.08] text-xs">
            <div className="flex items-center gap-3 text-[#bdbdbd]">
              <span>
                Mostrando{' '}
                <b className="text-white">
                  {Math.min((currentPage - 1) * pageSize + 1, filteredQuestions.length)}
                </b>{' '}
                a{' '}
                <b className="text-white">
                  {Math.min(currentPage * pageSize, filteredQuestions.length)}
                </b>{' '}
                de <b className="text-[#DF9696]">{filteredQuestions.length}</b> questões
              </span>

              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-[11px] text-[#7a7468]">Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-[#1e1d1b] border border-white/[0.1] rounded px-2 py-0.5 text-xs text-white outline-none"
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
                onClick={() => setCurrentPage(1)}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-xs text-white"
              >
                « Primeira
              </button>
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-xs text-white"
              >
                ‹ Anterior
              </button>

              <span className="px-3 py-1 rounded-lg bg-[#1e1d1b] border border-white/[0.1] font-mono font-bold text-white text-xs">
                {currentPage} / {Math.max(1, Math.ceil(filteredQuestions.length / pageSize))}
              </span>

              <button
                disabled={currentPage >= Math.ceil(filteredQuestions.length / pageSize)}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-xs text-white"
              >
                Próxima ›
              </button>
              <button
                disabled={currentPage >= Math.ceil(filteredQuestions.length / pageSize)}
                onClick={() => setCurrentPage(Math.ceil(filteredQuestions.length / pageSize))}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-xs text-white"
              >
                Última »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
