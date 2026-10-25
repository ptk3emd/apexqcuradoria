import React, { useState, useEffect, useRef } from 'react';
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
import { useDialog } from '../lib/useDialog';
import { Question, QuestionStatus, Curator, CuratorPresence, QuestionComment } from '../types/question';
import { QuestionEditor } from './QuestionEditor';
import { changedFields, mergeRemote, type ContentField } from '../lib/draftMerge';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusBadge } from './StatusBadge';
import { formatQuestionForAiPrompt, copyTextToClipboard } from '../lib/clipboardHelper';
import { generateSqlForQuestion } from '../lib/sqlGenerator';
import { LinkifiedText } from './LinkifiedText';
import { questionTransitionName } from '../lib/viewTransition';

interface QuestionDetailViewProps {
  question: Question;
  busy: boolean;
  allQuestions: Question[];
  activeCurator: Curator;
  presences: Record<string, CuratorPresence>;
  comments: QuestionComment[];
  onBackToList: () => void;
  onNavigateQuestion: (index: number) => void;
  onUpdateQuestion: (updated: Question, fields?: readonly string[]) => Promise<boolean>;
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
  const revisionDialogRef = useDialog<HTMLDivElement>(() => setShowRevisionModal(false), showRevisionModal);

  // Concurrent editing: `baseRef` is the server version the draft started
  // from (advanced on every remote save), so a save sends only the fields
  // this curator changed and a remote save fills the fields left untouched.
  const baseRef = useRef<Question>(question);
  const draftRef = useRef(editedQuestion);
  draftRef.current = editedQuestion;
  const [conflicts, setConflicts] = useState<ReadonlySet<ContentField>>(new Set());
  const startEditing = () => {
    baseRef.current = { ...question, sync_source_id:question.id };
    setEditedQuestion({ ...question, sync_source_id:question.id });
    setConflicts(new Set());
    setIsEditing(true);
  };
  const stopEditing = () => {
    setEditedQuestion({ ...question, sync_source_id:question.id });
    setConflicts(new Set());
    setIsEditing(false);
  };
  // Cancelling with unsaved changes asks first; with none it closes at once.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const requestDiscard = () => {
    if (changedFields(baseRef.current, editedQuestion).length > 0) setConfirmingDiscard(true);
    else stopEditing();
  };
  // Official answer key and elimination change the question for everyone, so
  // each asks first (the letter or the action is stored until confirmed).
  const [pendingGabarito, setPendingGabarito] = useState<string | null>(null);
  const [confirmingElimination, setConfirmingElimination] = useState(false);

  // Sync state when selected question changes
  useEffect(() => {
    setEditedQuestion({ ...question, sync_source_id:question.id });
    setConflicts(new Set());
    setIsEditing(false);
  }, [question.id]);

  useEffect(() => {
    if (!isEditing) { setEditedQuestion({ ...question, sync_source_id:question.id }); return; }
    if ((question.sync_version ?? 0) <= (baseRef.current.sync_version ?? 0)) return;
    const merged = mergeRemote(baseRef.current, draftRef.current, { ...question, sync_source_id:question.id });
    baseRef.current = merged.base;
    setEditedQuestion(merged.draft);
    if (merged.conflicts.length) setConflicts(previous => new Set([...previous, ...merged.conflicts]));
  }, [question, isEditing]);

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
    if (!await onUpdateQuestion(updated, changedFields(baseRef.current, editedQuestion))) return;
    setConflicts(new Set());
    setIsEditing(false);
    onShowToast('Questão Atualizada!', 'Modificações salvas e marcadas como "Questão Corrigida".', 'success');
  };

  const applyGabarito = async (letter: string) => {
    const updated = {
      ...question,
      anulada: false,
      correta: letter,
      modificado: true,
      status: 'questao_corrigida' as QuestionStatus,
      revisado_por: activeCurator.nome,
      revisado_em: new Date().toISOString(),
    };
    if (!await onUpdateQuestion(updated, ['anulada', 'correta'])) return;
    onShowToast(`Gabarito alterado para (${letter})`, 'Atualização registrada e SQL correspondente gerado.', 'success');
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

  // Other curators on this question (one entry per curator, even with several tabs)
  const activeViewers = [...new Map(Object.values(presences).filter(
    p => p.questao_atual_id === question.id && p.curador_id !== activeCurator.id
  ).map(p => [p.curador_id, p])).values()];
  const viewerNames = activeViewers.map(v => v.curador_nome).join(', ');

  const sqlPreview = generateSqlForQuestion(question, activeCurator.nome);
  const isAssignedToMe = question.responsavel_id === activeCurator.id;

  const confirmations = (
    <>
      <ConfirmDialog
        open={pendingGabarito !== null}
        title={`Trocar o gabarito para ${pendingGabarito ?? ''}?`}
        message={`A questão passa a ter o gabarito ${pendingGabarito ?? ''} como alternativa oficial e entra no SQL de correções. A questão deixa de ser anulada, se estiver.`}
        confirmLabel={`Confirmar gabarito ${pendingGabarito ?? ''}`}
        onCancel={() => setPendingGabarito(null)}
        onConfirm={async () => {
          const letter = pendingGabarito;
          setPendingGabarito(null);
          if (letter) await applyGabarito(letter);
        }}
      />
      <ConfirmDialog
        open={confirmingElimination}
        title={`Eliminar a questão #${question.id}?`}
        message="A questão será marcada para eliminação e entra no SQL de correções. Você pode mudar o status de volta depois."
        confirmLabel="Eliminar questão"
        tone="danger"
        onCancel={() => setConfirmingElimination(false)}
        onConfirm={async () => {
          setConfirmingElimination(false);
          if (await onUpdateStatus(question.id, 'eliminar_questao')) onShowToast('Questão marcada para eliminação', `Questão #${question.id} salva no Supabase.`, 'info');
        }}
      />
      <ConfirmDialog
        open={confirmingDiscard}
        title="Descartar as alterações?"
        message="O que você mudou nesta edição ainda não foi salvo e será perdido."
        confirmLabel="Descartar alterações"
        tone="danger"
        onCancel={() => setConfirmingDiscard(false)}
        onConfirm={() => { setConfirmingDiscard(false); stopEditing(); }}
      />
    </>
  );

  if (isEditing) return (
    <>
      <QuestionEditor question={editedQuestion} busy={busy} onChange={setEditedQuestion} onSave={handleSaveChanges} onCancel={requestDiscard} conflicts={conflicts}
        othersEditing={activeViewers.length ? `${viewerNames} também ${activeViewers.length === 1 ? 'está' : 'estão'} nesta questão. O que for salvo aparece aqui ao vivo nos campos que você não alterou.` : undefined}/>
      {confirmations}
    </>
  );


  return (
    <fieldset disabled={busy} aria-busy={busy} className="w-full min-w-0 space-y-5 pb-28 animate-in fade-in duration-200 lg:pb-0">
      {/* Top Navigation & Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-shell-2 p-4 rounded-2xl border border-white/[0.08] shadow-lg">
        {/* Left: Back button & Counter */}
        <div className="flex items-center gap-3">
          <button
            disabled={isEditing}
            onClick={onBackToList}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-apex-readable hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-brand-muted" />
            <span>Voltar à Tabela</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              disabled={isEditing || currentIndex <= 0}
              onClick={() => onNavigateQuestion(currentIndex - 1)}
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-white transition-all"
              aria-label="Questão anterior"
              title="Questão anterior (Seta para a esquerda)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-bold text-apex-text px-2.5 py-1 rounded bg-shell-3 border border-white/[0.08]">
              {currentIndex + 1} / {total}
            </span>

            <button
              disabled={isEditing || currentIndex >= total - 1}
              onClick={() => onNavigateQuestion(currentIndex + 1)}
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none text-white transition-all"
              aria-label="Próxima questão"
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
              {viewerNames} {activeViewers.length === 1 ? 'está' : 'estão'} nesta questão agora
            </span>
          </div>
        )}

        {/* Right: Copy for AI + Assignment Button */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Copy for AI Button */}
          <button
            onClick={handleCopy}
            className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-white bg-brand hover:bg-brand-hover shadow-[0_0_20px_rgba(164,57,57,0.35)] transition-all cursor-pointer sm:w-auto sm:py-2"
            title="Copiar texto formatado para enviar à IA ou Google"
          >
            <Copy className="w-4 h-4" />
            <span className="sm:hidden">Copiar para IA</span>
            <span className="hidden sm:inline">Copiar Texto p/ IA ou Google</span>
          </button>

          {/* Responsible Assignment */}
          {question.responsavel_id ? (
            <div className="flex items-center gap-2">
              <span
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                  isAssignedToMe
                    ? 'bg-brand/20 border-brand/40 text-white'
                    : 'bg-white/[0.05] border-white/[0.1] text-apex-readable'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-brand-muted" />
                <span>Responsável: {question.responsavel_nome?.split(' ')[0]}</span>
              </span>

              {isAssignedToMe ? (
                <button
                  onClick={() => onAssignQuestion(question.id, null)}
                  className="text-xs text-apex-readable hover:text-apex-text underline ml-1"
                >
                  Liberar
                </button>
              ) : (
                <button
                  onClick={() => onAssignQuestion(question.id, activeCurator)}
                  className="min-h-11 whitespace-nowrap text-xs text-brand-muted hover:text-white underline ml-1"
                >
                  Assumir para mim
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => onAssignQuestion(question.id, activeCurator)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-apex-text transition-all"
            >
              <UserPlus className="w-3.5 h-3.5 text-brand-muted" />
              <span>Assumir Questão</span>
            </button>
          )}
        </div>
      </div>

      {/* Shared-editing notice: several curators may edit at once */}
      {activeViewers.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Info className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-200">
                Edição compartilhada
              </p>
              <p className="text-xs text-amber-200/80 mt-0.5">
                <b className="text-white">{viewerNames}</b> também {activeViewers.length === 1 ? 'está' : 'estão'} nesta questão. Todos podem editar ao mesmo tempo: o que cada um salva aparece ao vivo, e salvar grava só os campos que você alterou.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:shrink-0">
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
          <div className="bg-shell-2 p-5 rounded-2xl border border-white/[0.08] space-y-4" style={{ viewTransitionName: questionTransitionName(question.id) }}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-base font-bold text-white px-2.5 py-0.5 rounded-lg bg-brand/20 border border-brand/40">
                  ID #{question.id}
                </span>
                <StatusBadge status={question.status} size="md" />
                {question.modificado && (
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Editada
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-apex-readable">
                <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
                  {question.origem || 'ENARE'} {question.ano}
                </span>
                {question.anulada ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                    Anulada · sem gabarito
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-emerald-400 font-bold">
                    {question.correta ? `Gabarito: ${question.correta}` : 'Sem gabarito oficial'}
                  </span>
                )}
              </div>
            </div>

            {/* Specialty and Specific Theme */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-shell-3 p-3 rounded-xl border border-white/[0.06]">
                <p className="text-xs uppercase font-bold tracking-wider text-brand-muted mb-1">
                  Especialidade Médica
                </p>
                {isEditing ? (
                  <input
                    aria-label="Especialidade médica"
                    type="text"
                    value={editedQuestion.especialidade}
                    onChange={(e) => setEditedQuestion({ ...editedQuestion, especialidade: e.target.value })}
                    className="w-full bg-shell-2 border border-white/[0.15] rounded px-2 py-1 text-xs text-white"
                  />
                ) : (
                  <p className="font-bold text-sm text-apex-text">{question.especialidade || question.categoria}</p>
                )}
              </div>

              <div className="bg-shell-3 p-3 rounded-xl border border-white/[0.06]">
                <p className="text-xs uppercase font-bold tracking-wider text-brand-muted mb-1">
                  Tema Específico
                </p>
                {isEditing ? (
                  <input
                    aria-label="Tema específico"
                    type="text"
                    value={editedQuestion.tema_especifico}
                    onChange={(e) => setEditedQuestion({ ...editedQuestion, tema_especifico: e.target.value })}
                    className="w-full bg-shell-2 border border-white/[0.15] rounded px-2 py-1 text-xs text-white"
                  />
                ) : (
                  <p className="font-bold text-sm text-apex-text truncate" title={question.tema_especifico}>
                    {question.tema_especifico || 'Geral'}
                  </p>
                )}
              </div>
            </div>

            {/* Enunciado Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold tracking-wider text-brand-muted flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-brand-muted" />
                  Enunciado Clínico
                </span>
                <button
                  onClick={() => (isEditing ? requestDiscard() : startEditing())}
                  className="flex items-center gap-1 text-xs font-bold text-apex-readable hover:text-white px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1]"
                >
                  <Edit3 className="w-3.5 h-3.5 text-brand-muted" />
                  <span>{isEditing ? 'Cancelar Edição' : 'Editar questão'}</span>
                </button>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    aria-label="Enunciado da questão"
                    rows={6}
                    value={editedQuestion.enunciado}
                    onChange={(e) => setEditedQuestion({ ...editedQuestion, enunciado: e.target.value })}
                    className="w-full bg-shell-3 border border-white/[0.15] rounded-xl p-3 text-sm text-apex-text leading-relaxed outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand-muted/60"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold text-apex-readable hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveChanges}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-brand hover:bg-brand-hover text-white"
                    >
                      <Save className="w-3.5 h-3.5" /> Salvar Alterações
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm leading-relaxed text-apex-text">
                  {question.enunciado}
                </div>
              )}
              {question.imagem?.trim() && (
                <figure className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <img
                    src={question.imagem}
                    alt={question.imagem_legenda?.trim() || 'Imagem da questão, sem descrição'}
                    loading="lazy"
                    className="max-h-80 w-auto max-w-full rounded-md object-contain"
                  />
                  {question.imagem_legenda?.trim() ? (
                    <figcaption className="max-w-prose text-center text-xs leading-relaxed text-apex-readable">{question.imagem_legenda.trim()}</figcaption>
                  ) : (
                    <figcaption className="text-xs text-amber-300">Imagem sem descrição: edite a questão para descrevê-la.</figcaption>
                  )}
                </figure>
              )}
            </div>
          </div>

          {/* Alternatives A, B, C, D, E Cards */}
          <div className="bg-shell-2 p-5 rounded-2xl border border-white/[0.08] space-y-4">
            <div className="flex flex-col gap-1 border-b border-white/[0.06] pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="text-xs uppercase font-bold tracking-wider text-brand-muted flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-brand-muted" />
                Alternativas & Justificativas Clínicas
              </span>
              <span className="text-xs text-apex-readable">
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
                const isCorrect = !question.anulada && question.correta?.toUpperCase() === letter;

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
                        onClick={() => { if (question.anulada || question.correta !== letter) setPendingGabarito(letter); }}
                        aria-label={`Definir ${letter} como gabarito oficial`}
                        className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 transition-all ${
                          isCorrect
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'bg-white/[0.08] hover:bg-brand text-apex-text hover:text-white'
                        }`}
                        title={`Clique para definir alternativa ${letter} como correta`}
                      >
                        {letter}
                      </button>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        {isEditing ? (
                          <input
                            aria-label={`Texto da alternativa ${letter}`}
                            type="text"
                            value={text}
                            onChange={(e) =>
                              setEditedQuestion({ ...editedQuestion, [lower]: e.target.value })
                            }
                            className="w-full bg-shell-3 border border-white/[0.15] rounded px-2.5 py-1 text-xs text-white"
                          />
                        ) : (
                          <p
                            className={`text-xs leading-relaxed font-normal ${
                              isCorrect ? 'text-white font-bold' : 'text-apex-text'
                            }`}
                          >
                            {text}
                          </p>
                        )}

                        {/* Justification snippet */}
                        {(justification || isEditing) && (
                          <div className="pt-1.5 border-t border-white/[0.04]">
                            <p className="text-xs uppercase font-bold tracking-wider text-apex-readable">
                              Justificativa:
                            </p>
                            {isEditing ? (
                              <input
                                aria-label={`Justificativa da alternativa ${letter}`}
                                type="text"
                                value={justification || ''}
                                onChange={(e) =>
                                  setEditedQuestion({
                                    ...editedQuestion,
                                    [justKey]: e.target.value,
                                  })
                                }
                                placeholder={`Justificativa para alternativa ${letter}...`}
                                className="w-full bg-shell-3 border border-white/[0.15] rounded px-2 py-0.5 text-xs text-apex-readable mt-1"
                              />
                            ) : (
                              <p className="text-xs text-apex-readable leading-normal italic">
                                {justification || 'Sem justificativa cadastrada.'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {isCorrect && (
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
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
          {(question.comentario || question.referencias?.trim()) && (
            <div className="bg-shell-2 p-5 rounded-2xl border border-white/[0.08] space-y-2">
              <span className="text-xs uppercase font-bold tracking-wider text-brand-muted flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-brand-muted" />
                Comentário Oficial / Gabarito Comentado
              </span>
              {question.comentario && (
                <p className="text-xs text-apex-readable leading-relaxed p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  {question.comentario}
                </p>
              )}
              {question.referencias?.trim() && (
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-xs uppercase font-bold tracking-wider text-apex-readable mb-1">Referências</p>
                  <LinkifiedText text={question.referencias} className="text-xs text-apex-readable leading-relaxed" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column (Actions, Comments, SQL Diff) - 4 cols */}
        <div className="lg:col-span-4 space-y-5">
          {/* Curation Decision Actions Box */}
          <div className="bg-shell-2 p-5 rounded-2xl border border-white/[0.08] space-y-4 shadow-xl">
            <div className="border-b border-white/[0.06] pb-2">
              <p className="text-xs uppercase font-bold tracking-wider text-brand-muted">
                Decisão de Auditoria Médica
              </p>
              <p className="text-xs text-apex-readable">
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
                  <span>Aprovar questão</span>
                </div>
                {question.status === 'aprovadas' && <span className="text-xs">Ativa</span>}
              </button>

              {/* Eliminar Questão */}
              <button
                onClick={() => setConfirmingElimination(true)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all border ${
                  question.status === 'eliminar_questao'
                    ? 'bg-rose-600 text-white border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.35)]'
                    : 'bg-rose-950/20 hover:bg-rose-900/40 text-rose-300 border-rose-600/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Eliminar questão</span>
                </div>
                {question.status === 'eliminar_questao' && <span className="text-xs">Ativa</span>}
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
                  <span>Revisar questão</span>
                </div>
                {question.status === 'revisar_questao' && <span className="text-xs">Ativa</span>}
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
                {question.status === 'questao_corrigida' && <span className="text-xs">Ativa</span>}
              </button>
            </div>

            {/* Audit Status Info */}
            <div className="pt-2 border-t border-white/[0.06] text-xs text-apex-readable space-y-1">
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
          <div className="bg-shell-2 p-5 rounded-2xl border border-white/[0.08] space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span className="text-xs uppercase font-bold tracking-wider text-brand-muted flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Área de Debate / Comentários
              </span>
              <span className="text-xs text-apex-readable">
                {comments.length} nota{comments.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Comment Thread List */}
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <div className="py-6 text-center text-apex-readable text-xs">
                  <p>Nenhum debate nesta questão.</p>
                  <p className="text-xs text-apex-readable mt-1">
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
                          style={{ backgroundColor: c.curador_cor || 'var(--brand)' }}
                        />
                        <span className="text-xs font-bold text-apex-text">{c.curador_nome}</span>
                      </div>
                      <span className="text-xs text-apex-readable">
                        {new Date(c.criado_em).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-apex-readable leading-relaxed">{c.texto}</p>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input Form */}
            <form onSubmit={handleSendComment} className="pt-2 flex gap-2">
              <input
                aria-label="Novo comentário"
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={`Comentar como ${activeCurator.nome.split(' ')[0]}...`}
                className="flex-1 bg-shell-3 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-apex-text placeholder:text-apex-readable outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand-muted/60"
              />
              <button
                type="submit"
                disabled={!commentInput.trim()}
                className="p-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-40 text-white transition-all cursor-pointer"
                title="Publicar comentário"
                aria-label="Publicar comentário"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Real-time Generated SQL Statement Preview */}
          <div className="bg-shell-2 p-4 rounded-2xl border border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5" />
                SQL Gerado p/ Supabase
              </span>
              <button
                onClick={async () => {
                  if (sqlPreview) {
                    const copied = await copyTextToClipboard(sqlPreview);
                    if (copied) onShowToast('Comando SQL copiado!', 'Pronto para executar no Supabase SQL Editor.', 'success');
                    else onShowToast('Não foi possível copiar o SQL', 'Selecione o código abaixo e copie manualmente.', 'error');
                  }
                }}
                disabled={!sqlPreview}
                className="min-h-11 min-w-11 px-3 text-sm text-brand-muted hover:text-white disabled:opacity-40"
              >
                Copiar SQL
              </button>
            </div>

            <pre className="p-2.5 rounded-xl bg-shell-2 border border-white/[0.05] text-xs font-mono text-apex-readable overflow-x-auto max-h-[140px] leading-relaxed">
              {sqlPreview || '-- Nenhuma alteração pendente de SQL para esta questão (Status: Pendente)'}
            </pre>
          </div>
        </div>
      </div>

      {/* Revision Note Modal Dialog */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div ref={revisionDialogRef} role="dialog" aria-modal="true" aria-labelledby="revision-dialog-title" className="w-full max-w-md rounded-2xl bg-shell-2 border border-white/[0.15] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 id="revision-dialog-title" className="font-bold text-base text-apex-text">Solicitar Revisão de Questão</h3>
            </div>

            <p className="text-xs text-apex-readable leading-relaxed">
              Descreva os pontos que necessitam de correção (ex: discrepância de gabarito, erro de digitação no enunciado ou alternativas dúbias) para orientar os outros curadores.
            </p>

            <textarea
              aria-label="Pontos para revisão"
              rows={4}
              value={revisionNotesInput}
              onChange={(e) => setRevisionNotesInput(e.target.value)}
              placeholder="Ex: O gabarito oficial dizia alternativa C, porém a diretriz mais recente de 2024 aponta para conduta expectante..."
              className="w-full bg-shell-3 border border-white/[0.12] rounded-xl p-3 text-xs text-apex-text placeholder:text-apex-readable outline-none focus:border-amber-500"
            />

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowRevisionModal(false)}
                className="px-4 py-2 rounded-full text-xs font-bold text-apex-readable hover:text-white"
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
      {/* Below the desktop breakpoint the decision actions stay in reach while the question is read. */}
      <div role="group" aria-label="Decisão sobre a questão" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.1] bg-shell-2/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-2">
          <button type="button" onClick={async () => { if (!await onUpdateStatus(question.id, 'aprovadas')) return; onShowToast('Questão Aprovada!', 'Validada e pronta para publicação.', 'success'); }}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold ${question.status === 'aprovadas' ? 'border-emerald-500 bg-emerald-600/30 text-white' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Aprovar
          </button>
          <button type="button" onClick={() => setShowRevisionModal(true)}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold ${question.status === 'revisar_questao' ? 'border-amber-400 bg-amber-500/25 text-white' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />Revisar
          </button>
          <button type="button" onClick={() => setConfirmingElimination(true)}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold ${question.status === 'eliminar_questao' ? 'border-rose-500 bg-rose-600 text-white' : 'border-rose-600/30 bg-rose-950/30 text-rose-200'}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />Eliminar
          </button>
          <button type="button" onClick={() => onAssignQuestion(question.id, isAssignedToMe ? null : activeCurator)}
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border border-white/15 bg-white/[0.05] text-xs font-bold text-apex-text">
            <UserCheck className="h-4 w-4 text-brand-muted" aria-hidden="true" />{isAssignedToMe ? 'Liberar' : 'Assumir'}
          </button>
        </div>
      </div>
      {confirmations}
    </fieldset>
  );
};
