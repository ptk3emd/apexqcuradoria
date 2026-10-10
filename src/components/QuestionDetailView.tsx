import React, { useState, useEffect } from 'react';
import { 
  Copy, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Trash2, 
  AlertTriangle, 
  PenTool, 
  MessageSquare, 
  Send, 
  Save, 
  Edit3, 
  ArrowLeft,
  UserCheck,
  UserPlus,
  Code2,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import { Question, QuestionStatus, Curator, CuratorPresence, QuestionComment } from '../types/question';
import { QuestionEditor } from './QuestionEditor';
import { StatusBadge } from './StatusBadge';
import { formatQuestionForAiPrompt, copyTextToClipboard } from '../lib/clipboardHelper';
import { generateSqlForQuestion } from '../lib/sqlGenerator';

interface QuestionDetailViewProps {
  question: Question;
  busy: boolean;
  allQuestions: Question[];
  activeCurator: Curator;
  presences: Record<string, CuratorPresence>;
  comments: QuestionComment[];
  onBackToList: () => void;
  onNavigateQuestion: (index: number) => void;
  onUpdateQuestion: (updated: Question) => Promise<boolean>;
  onUpdateStatus: (id: string, status: QuestionStatus, notas?: string) => Promise<boolean>;
  onAssignQuestion: (id: string, curator: Curator | null) => void;
  onAddComment: (questionId: string, text: string) => Promise<boolean>;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onEditingChange?: (isEditing: boolean) => void;
}

export const QuestionDetailView: React.FC<QuestionDetailViewProps> = ({
  question,
  busy,
  allQuestions,
  activeCurator,
  presences,
  comments,
  onBackToList,
  onNavigateQuestion,
  onUpdateQuestion,
  onUpdateStatus,
  onAssignQuestion,
  onAddComment,
  onShowToast,
  onEditingChange,
}) => {
  const currentIndex = allQuestions.findIndex(q => q.id === question.id);
  const total = allQuestions.length;

  const [isEditing, setIsEditing] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState<Question>({ ...question, sync_source_id:question.id });

  useEffect(() => {
    if (onEditingChange) {
      onEditingChange(isEditing);
    }
  }, [isEditing, onEditingChange]);
  const [commentInput, setCommentInput] = useState('');
  const [revisionNotesInput, setRevisionNotesInput] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  // Sync state when selected question changes
  useEffect(() => {
    setEditedQuestion({ ...question, sync_source_id:question.id });
    setIsEditing(false);
  }, [question.id]);

  useEffect(() => { if (!isEditing) setEditedQuestion({ ...question, sync_source_id:question.id }); }, [question, isEditing]);

  // Keyboard navigation Left/Right arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (busy || isEditing || showRevisionModal || (e.target as HTMLElement).isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigateQuestion(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < total - 1) {
        onNavigateQuestion(currentIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, total, onNavigateQuestion, busy, isEditing, showRevisionModal]);

  const handleCopy = async () => {
    const formatted = formatQuestionForAiPrompt(question);
    const success = await copyTextToClipboard(formatted);
    if (success) {
      onShowToast(
        `Questão #${question.id} copiada com sucesso!`,
        'Enunciado, alternativas e justificativas prontos para colar na IA (Gemini/ChatGPT) ou Google.',
        'success'
      );
    } else {
      onShowToast('Erro ao copiar', 'Tente novamente.', 'error');
    }
  };

  const handleSaveChanges = async () => {
    const updated = {
      ...editedQuestion,
      modificado: true,
      status: 'questao_corrigida' as QuestionStatus,
      revisado_por: activeCurator.nome,
      revisado_em: new Date().toISOString(),
    };
    if (!await onUpdateQuestion(updated)) return;
    setIsEditing(false);
    onShowToast('Questão Atualizada!', 'Modificações salvas e marcadas como "Questão Corrigida".', 'success');
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    if (!await onAddComment(question.id, commentInput.trim())) return;
    setCommentInput('');
    onShowToast('Comentário publicado!', 'Sincronizado em tempo real para os outros curadores.', 'info');
  };

  const handleConfirmRevision = async () => {
    if (!await onUpdateStatus(question.id, 'revisar_questao', revisionNotesInput)) return;
    setShowRevisionModal(false);
    setRevisionNotesInput('');
    onShowToast('Status: Revisar Questão', 'A questão foi enviada para fila de revisão com suas observações.', 'info');
  };

  // Other curators looking at this question
  const activeViewers = Object.values(presences).filter(
    p => p.questao_atual_id === question.id && p.curador_id !== activeCurator.id
  );

  const sqlPreview = generateSqlForQuestion(question, activeCurator.nome);
  const isAssignedToMe = question.responsavel_id === activeCurator.id;

  if (isEditing) return <QuestionEditor question={editedQuestion} busy={busy} onChange={setEditedQuestion} onSave={handleSaveChanges} onCancel={() => {setEditedQuestion({...question, sync_source_id:question.id}); setIsEditing(false);}}/>;

  return (
    <fieldset disabled={busy} aria-busy={busy} className="w-full min-w-0 space-y-5 animate-in fade-in duration-200">
      {/* Top Navigation & Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1e1d1b] p-4 rounded-2xl border border-white/[0.08] shadow-lg">
        {/* Left: Back button & Counter */}
        <div className="flex items-center gap-3">
          <button
            disabled={isEditing}
            onClick={onBackToList}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[#bdbdbd] hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-[#DF9696]" />
            <span>Voltar à Tabela</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              disabled={isEditing || currentIndex <= 0}
              onClick={() => onNavigateQuestion(currentIndex - 1)}
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-white transition-all"
              title="Questão anterior (Seta para a esquerda)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-bold text-[#f8fafc] px-2.5 py-1 rounded bg-[#272522] border border-white/[0.08]">
              {currentIndex + 1} / {total}
            </span>

            <button
              disabled={isEditing || currentIndex >= total - 1}
              onClick={() => onNavigateQuestion(currentIndex + 1)}
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-white transition-all"
              title="Próxima questão (Seta para a direita)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Live Presence Beacon */}
        {activeViewers.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>
              {activeViewers.map(v => v.curador_nome).join(', ')} {activeViewers.length === 1 ? 'está' : 'estão'} visualizando esta questão agora
            </span>
          </div>
        )}

        {/* Right: Copy for AI + Assignment Button */}
        <div className="flex items-center gap-2">
          {/* Copy for AI Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-white bg-[#A43939] hover:bg-[#913232] shadow-[0_0_20px_rgba(164,57,57,0.35)] transition-all cursor-pointer"
            title="Copiar texto formatado para enviar à IA ou Google"
          >
            <Copy className="w-4 h-4" />
            <span>Copiar Texto p/ IA ou Google</span>
          </button>

          {/* Responsible Assignment */}
          {question.responsavel_id ? (
            <div className="flex items-center gap-2">
              <span
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                  isAssignedToMe
                    ? 'bg-[#A43939]/20 border-[#A43939]/40 text-white'
                    : 'bg-white/[0.05] border-white/[0.1] text-[#bdbdbd]'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-[#DF9696]" />
                <span>Responsável: {question.responsavel_nome?.split(' ')[0]}</span>
              </span>

              {isAssignedToMe ? (
                <button
                  onClick={() => onAssignQuestion(question.id, null)}
                  className="text-xs text-[#7a7468] hover:text-[#f8fafc] underline ml-1"
                >
                  Liberar
                </button>
              ) : (
                <button
                  onClick={() => onAssignQuestion(question.id, activeCurator)}
                  className="text-xs text-[#DF9696] hover:text-white underline ml-1"
                >
                  Assumir para mim
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => onAssignQuestion(question.id, activeCurator)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[#f8fafc] transition-all"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#DF9696]" />
              <span>Assumir Questão</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Curator Collision Banner (prevents another curator from doing the same question) */}
      {activeViewers.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border-2 border-amber-500/50 flex items-center justify-between gap-4 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/40">
              <AlertTriangle className="w-5 h-5 text-amber-400 animate-bounce" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-200">
                Atenção: Questão em uso por outro curador!
              </p>
              <p className="text-xs text-amber-300/80 mt-0.5">
                <b className="text-white underline">{activeViewers.map(v => v.curador_nome).join(', ')}</b> está {activeViewers[0].status_atividade === 'editando' ? 'editando o texto desta questão neste instante' : 'analisando e auditando esta questão agora'}. Evite modificar simultaneamente para não sobrepor o trabalho.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {question.responsavel_nome && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/[0.08] text-white font-bold">
                Responsável atribuído: {question.responsavel_nome}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main 2-Column Cockpit Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (Question Content & Alternatives) - 8 cols */}
        <div className="lg:col-span-8 space-y-5">
          {/* Question Metadata Bar */}
          <div className="bg-[#1e1d1b] p-5 rounded-2xl border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-base font-bold text-white px-2.5 py-0.5 rounded-lg bg-[#A43939]/20 border border-[#A43939]/40">
                  ID #{question.id}
                </span>
                <StatusBadge status={question.status} size="md" />
                {question.modificado && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Editada
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-[#bdbdbd]">
                <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
                  {question.origem || 'ENARE'} {question.ano}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-emerald-400 font-bold">
                  Gabarito: {question.correta || 'C'}
                </span>
              </div>
            </div>

            {/* Specialty and Specific Theme */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#272522] p-3 rounded-xl border border-white/[0.06]">
                <p className="text-[10px] uppercase font-bold tracking-wider text-[#DF9696] mb-1">
                  Especialidade Médica
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedQuestion.especialidade}
                    onChange={(e) => setEditedQuestion({ ...editedQuestion, especialidade: e.target.value })}
                    className="w-full bg-[#1e1d1b] border border-white/[0.15] rounded px-2 py-1 text-xs text-white"
                  />
                ) : (
                  <p className="font-bold text-sm text-[#f8fafc]">{question.especialidade || question.categoria}</p>
                )}
              </div>

              <div className="bg-[#272522] p-3 rounded-xl border border-white/[0.06]">
                <p className="text-[10px] uppercase font-bold tracking-wider text-[#DF9696] mb-1">
                  Tema Específico
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedQuestion.tema_especifico}
                    onChange={(e) => setEditedQuestion({ ...editedQuestion, tema_especifico: e.target.value })}
                    className="w-full bg-[#1e1d1b] border border-white/[0.15] rounded px-2 py-1 text-xs text-white"
                  />
                ) : (
                  <p className="font-bold text-sm text-[#f8fafc] truncate" title={question.tema_especifico}>
                    {question.tema_especifico || 'Geral'}
                  </p>
                )}
              </div>
            </div>

            {/* Enunciado Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold tracking-wider text-[#DF9696] flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-[#DF9696]" />
                  Enunciado Clínico
                </span>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="flex items-center gap-1 text-xs font-bold text-[#bdbdbd] hover:text-white px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1]"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#DF9696]" />
                  <span>{isEditing ? 'Cancelar Edição' : 'Editar questão'}</span>
                </button>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    value={editedQuestion.enunciado}
                    onChange={(e) => setEditedQuestion({ ...editedQuestion, enunciado: e.target.value })}
                    className="w-full bg-[#272522] border border-white/[0.15] rounded-xl p-3 text-sm text-[#f8fafc] leading-relaxed outline-none focus:border-[#A43939]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold text-[#7a7468] hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveChanges}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-[#A43939] hover:bg-[#913232] text-white"
                    >
                      <Save className="w-3.5 h-3.5" /> Salvar Alterações
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm leading-relaxed text-[#f8fafc]">
                  {question.enunciado}
                </div>
              )}
            </div>
          </div>

          {/* Alternatives A, B, C, D, E Cards */}
          <div className="bg-[#1e1d1b] p-5 rounded-2xl border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <span className="text-[11px] uppercase font-bold tracking-wider text-[#DF9696] flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-[#DF9696]" />
                Alternativas & Justificativas Clínicas
              </span>
              <span className="text-[11px] text-[#7a7468]">
                Selecione para alterar o gabarito oficial se necessário
              </span>
            </div>

            <div className="space-y-3">
              {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
                const lower = letter.toLowerCase() as 'a' | 'b' | 'c' | 'd' | 'e';
                const text = isEditing ? (editedQuestion[lower] as string) : (question[lower] as string);
                const justKey = `justificativa_${lower}` as keyof Question;
                const justification = isEditing
                  ? (editedQuestion[justKey] as string)
                  : (question[justKey] as string);
                const isCorrect = question.correta?.toUpperCase() === letter;

                return (
                  <div
                    key={letter}
                    className={`rounded-xl p-3.5 border transition-all ${
                      isCorrect
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.06)]'
                        : 'bg-white/[0.02] border-white/[0.07] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Letter Badge / Radio button */}
                      <button
                        onClick={async () => {
                          if (question.correta !== letter) {
                            const updated = {
                              ...question,
                              correta: letter,
                              modificado: true,
                              status: 'questao_corrigida' as QuestionStatus,
                              revisado_por: activeCurator.nome,
                              revisado_em: new Date().toISOString(),
                            };
                            if (!await onUpdateQuestion(updated)) return;
                            onShowToast(
                              `Gabarito alterado para (${letter})`,
                              'Atualização registrada e SQL correspondente gerado.',
                              'success'
                            );
                          }
                        }}
                        className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 transition-all ${
                          isCorrect
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'bg-white/[0.08] hover:bg-[#A43939] text-[#f8fafc] hover:text-white'
                        }`}
                        title={`Clique para definir alternativa ${letter} como correta`}
                      >
                        {letter}
                      </button>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={text}
                            onChange={(e) =>
                              setEditedQuestion({ ...editedQuestion, [lower]: e.target.value })
                            }
                            className="w-full bg-[#272522] border border-white/[0.15] rounded px-2.5 py-1 text-xs text-white"
                          />
                        ) : (
                          <p
                            className={`text-xs leading-relaxed font-normal ${
                              isCorrect ? 'text-white font-bold' : 'text-[#f8fafc]'
                            }`}
                          >
                            {text}
                          </p>
                        )}

                        {/* Justification snippet */}
                        {(justification || isEditing) && (
                          <div className="pt-1.5 border-t border-white/[0.04]">
                            <p className="text-[10px] uppercase font-bold tracking-wider text-[#7a7468]">
                              Justificativa:
                            </p>
                            {isEditing ? (
                              <input
                                type="text"
                                value={justification || ''}
                                onChange={(e) =>
                                  setEditedQuestion({
                                    ...editedQuestion,
                                    [justKey]: e.target.value,
                                  })
                                }
                                placeholder={`Justificativa para alternativa ${letter}...`}
                                className="w-full bg-[#272522] border border-white/[0.15] rounded px-2 py-0.5 text-[11px] text-[#bdbdbd] mt-1"
                              />
                            ) : (
                              <p className="text-[11px] text-[#bdbdbd] leading-normal italic">
                                {justification || 'Sem justificativa cadastrada.'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {isCorrect && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                          Correta
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Professor Commentary / Resolution */}
          {question.comentario && (
            <div className="bg-[#1e1d1b] p-5 rounded-2xl border border-white/[0.08] space-y-2">
              <span className="text-[11px] uppercase font-bold tracking-wider text-[#DF9696] flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-[#DF9696]" />
                Comentário Oficial / Gabarito Comentado
              </span>
              <p className="text-xs text-[#bdbdbd] leading-relaxed p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                {question.comentario}
              </p>
            </div>
          )}
        </div>

        {/* Right Column (Actions, Comments, SQL Diff) - 4 cols */}
        <div className="lg:col-span-4 space-y-5">
          {/* Curation Decision Actions Box */}
          <div className="bg-[#1e1d1b] p-5 rounded-2xl border border-white/[0.08] space-y-4 shadow-xl">
            <div className="border-b border-white/[0.06] pb-2">
              <p className="text-[10px] uppercase font-bold tracking-wider text-[#DF9696]">
                Decisão de Auditoria Médica
              </p>
              <p className="text-xs text-[#7a7468]">
                Tudo o que você fizer gera SQL e sincroniza em tempo real
              </p>
            </div>

            <div className="space-y-2">
              {/* Aprovar Questão */}
              <button
                onClick={async () => {
                  if (!await onUpdateStatus(question.id, 'aprovadas')) return;
                  onShowToast('Questão Aprovada!', 'Validada e pronta para publicação.', 'success');
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all border ${
                  question.status === 'aprovadas'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                    : 'bg-emerald-950/20 hover:bg-emerald-900/40 text-emerald-300 border-emerald-600/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Aprovar Questão</span>
                </div>
                {question.status === 'aprovadas' && <span className="text-[10px]">Ativa</span>}
              </button>

              {/* Eliminar Questão */}
              <button
                onClick={async () => {
                  if (!await onUpdateStatus(question.id, 'eliminar_questao')) return;
                  onShowToast('Questão marcada para Eliminação', 'Comando DELETE SQL gerado automaticamente.', 'error');
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all border ${
                  question.status === 'eliminar_questao'
                    ? 'bg-rose-600 text-white border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.35)]'
                    : 'bg-rose-950/20 hover:bg-rose-900/40 text-rose-300 border-rose-600/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Eliminar Questão (DELETE SQL)</span>
                </div>
                {question.status === 'eliminar_questao' && <span className="text-[10px]">Ativa</span>}
              </button>

              {/* Revisar Questão */}
              <button
                onClick={() => setShowRevisionModal(true)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all border ${
                  question.status === 'revisar_questao'
                    ? 'bg-amber-600 text-white border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                    : 'bg-amber-950/20 hover:bg-amber-900/40 text-amber-300 border-amber-600/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Revisar Questão</span>
                </div>
                {question.status === 'revisar_questao' && <span className="text-[10px]">Ativa</span>}
              </button>

              {/* Questão Corrigida */}
              <button
                onClick={async () => {
                  if (!await onUpdateStatus(question.id, 'questao_corrigida')) return;
                  onShowToast('Marcada como Corrigida!', 'Alterações salvas com comando UPDATE SQL.', 'info');
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all border ${
                  question.status === 'questao_corrigida'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.35)]'
                    : 'bg-blue-950/20 hover:bg-blue-900/40 text-blue-300 border-blue-600/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-blue-400" />
                  <span>Questão Corrigida (UPDATE SQL)</span>
                </div>
                {question.status === 'questao_corrigida' && <span className="text-[10px]">Ativa</span>}
              </button>
            </div>

            {/* Audit Status Info */}
            <div className="pt-2 border-t border-white/[0.06] text-[11px] text-[#7a7468] space-y-1">
              {question.revisado_por && (
                <p>
                  Última ação por: <b className="text-white">{question.revisado_por}</b>
                </p>
              )}
              {question.revisado_em && (
                <p>
                  Data: {new Date(question.revisado_em).toLocaleString('pt-BR')}
                </p>
              )}
              {question.notas_revisao && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 mt-1">
                  <b>Nota de revisão:</b> {question.notas_revisao}
                </div>
              )}
            </div>
          </div>

          {/* Area Comum de Comentários (Common discussion between 3 users) */}
          <div className="bg-[#1e1d1b] p-5 rounded-2xl border border-white/[0.08] space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#DF9696] flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Área de Debate / Comentários
              </span>
              <span className="text-[11px] text-[#7a7468]">
                {comments.length} nota{comments.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Comment Thread List */}
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <div className="py-6 text-center text-[#7a7468] text-xs">
                  <p>Nenhum debate nesta questão.</p>
                  <p className="text-[11px] text-[#4a4540] mt-1">
                    Escreva abaixo para sugerir correções ou debater o gabarito.
                  </p>
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: c.curador_cor || '#A43939' }}
                        />
                        <span className="text-xs font-bold text-[#f8fafc]">{c.curador_nome}</span>
                      </div>
                      <span className="text-[10px] text-[#7a7468]">
                        {new Date(c.criado_em).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-[#bdbdbd] leading-relaxed">{c.texto}</p>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input Form */}
            <form onSubmit={handleSendComment} className="pt-2 flex gap-2">
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={`Comentar como ${activeCurator.nome.split(' ')[0]}...`}
                className="flex-1 bg-[#272522] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-[#f8fafc] placeholder-[#7a7468] outline-none focus:border-[#A43939]"
              />
              <button
                type="submit"
                disabled={!commentInput.trim()}
                className="p-2 rounded-xl bg-[#A43939] hover:bg-[#913232] disabled:opacity-40 text-white transition-all cursor-pointer"
                title="Publicar comentário"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Real-time Generated SQL Statement Preview */}
          <div className="bg-[#1e1d1b] p-4 rounded-2xl border border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5" />
                SQL Gerado p/ Supabase
              </span>
              <button
                onClick={async () => {
                  if (sqlPreview) {
                    await copyTextToClipboard(sqlPreview);
                    onShowToast('Comando SQL copiado!', 'Pronto para executar no Supabase SQL Editor.', 'success');
                  }
                }}
                disabled={!sqlPreview}
                className="text-[11px] text-[#DF9696] hover:text-white disabled:opacity-40"
              >
                Copiar SQL
              </button>
            </div>

            <pre className="p-2.5 rounded-xl bg-[#1e1d1b] border border-white/[0.05] text-[10px] font-mono text-[#bdbdbd] overflow-x-auto max-h-[140px] leading-relaxed">
              {sqlPreview || '-- Nenhuma alteração pendente de SQL para esta questão (Status: Pendente)'}
            </pre>
          </div>
        </div>
      </div>

      {/* Revision Note Modal Dialog */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#1e1d1b] border border-white/[0.15] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-base text-[#f8fafc]">Solicitar Revisão de Questão</h3>
            </div>

            <p className="text-xs text-[#bdbdbd] leading-relaxed">
              Descreva os pontos que necessitam de correção (ex: discrepância de gabarito, erro de digitação no enunciado ou alternativas dúbias) para orientar os outros curadores.
            </p>

            <textarea
              rows={4}
              value={revisionNotesInput}
              onChange={(e) => setRevisionNotesInput(e.target.value)}
              placeholder="Ex: O gabarito oficial dizia alternativa C, porém a diretriz mais recente de 2024 aponta para conduta expectante..."
              className="w-full bg-[#272522] border border-white/[0.12] rounded-xl p-3 text-xs text-[#f8fafc] placeholder-[#7a7468] outline-none focus:border-amber-500"
            />

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowRevisionModal(false)}
                className="px-4 py-2 rounded-full text-xs font-bold text-[#7a7468] hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRevision}
                className="px-5 py-2 rounded-full text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md"
              >
                Marcar como Revisar Questão
              </button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
};
