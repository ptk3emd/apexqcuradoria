import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import { 
  DEFAULT_CURATORS 
} from './data/defaultCurators';
import { 
  Question, 
  QuestionStatus, 
  Curator, 
  QuestionComment, 
  CuratorPresence, 
  AuditLogItem 
} from './types/question';
import { fetchShared, mergeShared, mutateShared } from './lib/collaboration';
import { generateSqlForQuestion } from './lib/sqlGenerator';
import { describeError } from './lib/errorMessage';
import { TopNavbar } from './components/TopNavbar';
import { QuestionsTable } from './components/QuestionsTable';
import { QuestionDetailView } from './components/QuestionDetailView';
import { AuditCockpit } from './components/AuditCockpit';
import { BatchAssignModal } from './components/BatchAssignModal';
import { SqlEditorModal } from './components/SqlEditorModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { SupabaseAuthGate } from './components/SupabaseAuthGate';
import { loadSupabaseBase, loadFullQuestions, subscribeSupabaseChanges, signOutSupabase } from './lib/supabaseCuration';
import { useServerSearch } from './lib/useServerSearch';
import { isCorrectedQuestion } from './lib/correctedQuestionsSql';
import { viewTransition, nameQuestionRow } from './lib/viewTransition';
const STORAGE_KEY_LOGS = 'apexmed_audit_logs_v1';
const STORAGE_KEY_COMMENTS = 'apexmed_comments_v1';

export default function App() {
  // 1. Curators & Authentication State
  const [curators] = useState<Curator[]>(DEFAULT_CURATORS);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [activeCurator, setActiveCurator] = useState<Curator>(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedId = sessionStorage.getItem('apexmed_authenticated_curator_id');
        const found = DEFAULT_CURATORS.find(c => c.id === storedId);
        if (found) return found;
      } catch {
        // ignore
      }
    }
    return DEFAULT_CURATORS[0];
  });

  // Questions are loaded only from the authenticated Supabase session.
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingFullDataset, setIsLoadingFullDataset] = useState(false);

  const [syncMessage, setSyncMessage] = useState('Conectando à curadoria compartilhada…');
  const [datasetReady, setDatasetReady] = useState(false);
  const [completeDatasetReady, setCompleteDatasetReady] = useState(false);
  const [datasetLoadAttempt, setDatasetLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const actionPending = useRef(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // 3. Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_LOGS);
        if (stored) return JSON.parse(stored);
      } catch (e) {
        console.warn('Error reading stored logs', e);
      }
    }
    return [];
  });

  // 4. Comments State
  const [commentsMap, setCommentsMap] = useState<Record<string, QuestionComment[]>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_COMMENTS);
        if (stored) return JSON.parse(stored);
      } catch (e) {
        console.warn('Error reading stored comments', e);
      }
    }
    return {};
  });

  // 5. Presences (Who is currently viewing which question)
  const [presences, setPresences] = useState<Record<string, CuratorPresence>>({});

  // 6. UI Views & Filter Search
  const [activeView, setActiveView] = useState<'table' | 'detail' | 'cockpit'>('table');
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 7. Modals
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isBatchAssignModalOpen, setIsBatchAssignModalOpen] = useState(false);

  // 8. Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (title: string, message?: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = `${Date.now()}_${Math.random()}`;
      setToasts(prev => [...prev, { id, title, message, type }]);
      // Errors stay until the curator closes them: a save that failed must not
      // disappear while they are still reading.
      if (type !== 'error') {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
      }
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(()=>{
    const expired=()=>{setIsAuthenticated(false);setActiveView('table');setQuestions([]);setSelectedQuestionId(null);setIsEditingQuestion(false);};
    window.addEventListener('apex-session-expired',expired);
    return ()=>window.removeEventListener('apex-session-expired',expired);
  },[]);

  const shouldLoadDataset = isAuthenticated;
  // First page is usable immediately; the remaining pages load in the background.
  useEffect(() => {
    if (!shouldLoadDataset) {setDatasetReady(false);setCompleteDatasetReady(false); return;}
    let isMounted = true;
    const controller = new AbortController();
    async function loadDataset() {
      setIsLoadingFullDataset(true);
      setLoadError(null);
      setCompleteDatasetReady(false);
      try {
        const loaded = await loadSupabaseBase(page => {
          if (!isMounted) return;
          setQuestions(previous => mergeShared(previous, page.map(q => ({id:q.id, patch:q, version:q.sync_version ?? 0}))));
          setDatasetReady(true);
        }, controller.signal);
        // The SQL exports read the full text of every corrected question.
        await mergeFullQuestions(loaded.filter(q => q.parcial && isCorrectedQuestion(q)).map(q => q.id), controller.signal);
        if (isMounted) {setDatasetReady(true);setCompleteDatasetReady(true);}
      } catch (err) {
        console.warn('Carregamento inicial completo:', err);
        if (isMounted) setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted) { setIsLoadingFullDataset(false);  }
      }
    }

    loadDataset();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [shouldLoadDataset, datasetLoadAttempt]);

  // Save audit logs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(auditLogs));
    } catch (e) {
      console.warn('Storage limit reached', e);
    }
  }, [auditLogs]);

  // Save comments to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COMMENTS, JSON.stringify(commentsMap));
    } catch (e) {
      console.warn('Storage limit reached', e);
    }
  }, [commentsMap]);

  // Realtime plus cursor recovery keep server-confirmed changes synchronized.
  useEffect(() => {
    if (!datasetReady || !isAuthenticated) return;
    let stopped = false;
    let loading = false;
    let refreshAgain = false;
    const refresh = async () => {
      if (stopped) return;
      if (loading) {refreshAgain = true; return;}
      loading = true;
      try {
        const rows = await fetchShared();
        if (!stopped) {
          setQuestions(prev => mergeShared(prev, rows.rows));
          setPresences(previous => {
            const entries = Object.entries(rows.presences);
            return entries.length === Object.keys(previous).length && entries.every(([id, next]) => {
              const old = previous[id];
              return old && old.curador_id === next.curador_id && old.questao_atual_id === next.questao_atual_id &&
                old.status_atividade === next.status_atividade && old.ultima_atividade === next.ultima_atividade;
            }) ? previous : rows.presences;
          });
          setSyncMessage('Supabase conectado • sincronização automática');
        }
      } catch (error: any) {
        if (!stopped) setSyncMessage(`Sincronização indisponível: ${error.message}`);
      } finally { loading = false; if (refreshAgain && !stopped) {refreshAgain = false; void refresh();} }
    };
    void refresh();
    const unsubscribe = subscribeSupabaseChanges(refresh);
    const timer = setInterval(refresh, 30000);
    window.addEventListener('online', refresh);
    return () => {
      stopped = true; clearInterval(timer); unsubscribe?.();
      window.removeEventListener('online', refresh);

    };
  }, [datasetReady, isAuthenticated]);

  // Selected Question object
  const currentQuestion = useMemo(() => {
    if (!selectedQuestionId) return questions[0] || null;
    return questions.find(q => q.id === selectedQuestionId) || questions[0] || null;
  }, [questions, selectedQuestionId]);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const hasPartialQuestions = useMemo(() => questions.some(q => q.parcial), [questions]);
  const serverSearchIds = useServerSearch([deferredSearchQuery], hasPartialQuestions);

  // Questions filtered by search query
  const searchedQuestions = useMemo(() => {
    if (!deferredSearchQuery.trim()) return questions;
    const q = deferredSearchQuery.toLowerCase().trim();
    return questions.filter(item => {
      return (
        serverSearchIds?.has(item.id) ||
        item.id.toLowerCase().includes(q) ||
        (item.especialidade && item.especialidade.toLowerCase().includes(q)) ||
        (item.tema_especifico && item.tema_especifico.toLowerCase().includes(q)) ||
        (item.enunciado && item.enunciado.toLowerCase().includes(q)) ||
        (item.ano && item.ano.includes(q)) ||
        (item.origem && item.origem.toLowerCase().includes(q))
      );
    });
  }, [questions, deferredSearchQuery, serverSearchIds]);

  const applyConfirmed = useCallback((updated: Question[]) => {
    setQuestions(prev => {
      const changes = new Map(updated.map(q => [q.previous_id || q.id, {...q, sync_source_id:q.id,previous_id:null}]));
      return prev.map(q => {
        const next = changes.get(q.id);
        return next && (next.sync_version ?? 0) >= (q.sync_version ?? 0) ? next : q;
      });
    });
    updated.forEach(q => {if(q.previous_id) setSelectedQuestionId(old => old === q.previous_id ? q.id : old);});
  }, []);

  const runShared = async (targets: Question[], action: string, target?: Curator | null, fields?: readonly string[]) => {
    if (!isAuthenticated || !datasetReady) {
      showToast('Aguarde a conexão', 'Entre na sessão e aguarde o carregamento das questões.', 'info');
      return null;
    }
    if (actionPending.current) {
      showToast('Operação em andamento', 'Aguarde a confirmação do servidor.', 'info');
      return null;
    }
    actionPending.current = true;
    setIsActionPending(true);
    try {
      const updated = await mutateShared(targets, action, activeCurator, target, fields);
      applyConfirmed(updated);
      return updated;
    } catch (error: any) {
      showToast('Ação não salva', describeError(error), 'error');
      try { const rows = await fetchShared(); setQuestions(prev => mergeShared(prev, rows.rows)); } catch {}
      return null;
    } finally { actionPending.current = false; setIsActionPending(false); }
  };

  // Opening never reserves: several curators may edit the same question.
  // Light-list rows get their full text on demand; a newer version already in the list wins.
  const mergeFullQuestions = useCallback(async (ids: string[], signal?: AbortSignal) => {
    if (!ids.length) return [];
    const full = await loadFullQuestions(ids, signal);
    const byId = new Map(full.map(q => [q.id, q]));
    setQuestions(prev => prev.map(q => {
      const next = byId.get(q.id);
      return next && q.parcial && (next.sync_version ?? 0) >= (q.sync_version ?? 0) ? next : q;
    }));
    return full;
  }, []);
  const fullQuestion = useCallback(async (question: Question) => {
    if (!question.parcial) return question;
    return (await mergeFullQuestions([question.id])).find(q => q.id === question.id) ?? question;
  }, [mergeFullQuestions]);

  // The open question and its neighbours load in full so moving between them is instant.
  const [fullLoadError, setFullLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (activeView !== 'detail' || !currentQuestion) return;
    const index = searchedQuestions.findIndex(q => q.id === currentQuestion.id);
    const wanted = [currentQuestion, searchedQuestions[index - 1], searchedQuestions[index + 1]].filter((q): q is Question => Boolean(q?.parcial));
    if (!wanted.length) return;
    const controller = new AbortController();
    setFullLoadError(null);
    mergeFullQuestions(wanted.map(q => q.id), controller.signal).catch(error => {
      if ((error as Error).name !== 'AbortError') setFullLoadError(describeError(error));
    });
    return () => controller.abort();
  }, [activeView, currentQuestion?.id, currentQuestion?.parcial, searchedQuestions, mergeFullQuestions]);

  const openQuestion = async (question: Question) => {
    if (!isAuthenticated || !datasetReady) {
      showToast('Aguarde a conexão', 'Entre na sessão e aguarde o carregamento das questões.', 'info');
      return;
    }
    viewTransition(() => {
      setSelectedQuestionId(question.id);
      setActiveView('detail');
    });
  };

  // Presence only: tells the others who is on the question (renewed every
  // 25 s, kept for 90 s). A failure never blocks editing or saving.
  useEffect(() => {
    if (!isAuthenticated || activeView !== 'detail' || !selectedQuestionId) return;
    const q = { id: selectedQuestionId } as Question;
    const announce = (action: 'claim' | 'heartbeat') => {
      void mutateShared([q], action, activeCurator).catch((error: any) => {
        console.warn('[curadoria] presença não registrada', error?.message);
      });
    };
    announce('claim');
    const timer = setInterval(() => announce('heartbeat'), 25000);
    return () => {
      clearInterval(timer);
      void mutateShared([q], 'unlock', activeCurator).catch(() => {});
    };
  }, [isAuthenticated, activeView, selectedQuestionId, activeCurator]);

  const handleUpdateQuestion = async (updated: Question, fields?: readonly string[]): Promise<boolean> => {
    const result = await runShared([updated], 'save', undefined, fields);
    if (!result) return false;
    const confirmed = result[0];
    setAuditLogs(logs => [{ id: crypto.randomUUID(), questao_id: confirmed.id,
      curador_id: activeCurator.id, curador_nome: activeCurator.nome,
      tipo_acao: 'conteudo_editado', detalhes: `Questão #${confirmed.id} atualizada`,
      timestamp: new Date().toISOString(), sql_gerado: generateSqlForQuestion(confirmed, activeCurator.nome),
    }, ...logs]);
    return true;
  };

  const handleUpdateStatus = async (id: string, status: QuestionStatus, notas?: string): Promise<boolean> => {
    let q = questions.find(q => q.id === id);
    if (!q) return false;
    return (await runShared([{...q, status, notas_revisao: notas ?? q.notas_revisao}], 'status')) !== null;
  };

  const handleAssignQuestion = async (id: string, curator: Curator | null) => {
    const q = questions.find(q => q.id === id);
    if (!q) return;
    if (await runShared([q], 'assign', curator)) {
      setActiveView('table');
      showToast('Responsável atualizado', curator ? `Responsável: ${curator.nome}` : 'Questão sem responsável', 'success');
    }
  };

  const handleAssignBatch = async (ids: string[], curatorId: string): Promise<boolean> => {
    const target = curators.find(c => c.id === curatorId);
    if (!target) return false;
    const result = await runShared(questions.filter(q => ids.includes(q.id)), 'assign', target);
    return result !== null;
  };

  const handleSelectedQuestions = async (ids: string[], action: 'assign' | 'review'): Promise<boolean> => {
    if (actionPending.current || !isAuthenticated || !datasetReady) return false;
    const idSet = new Set(ids);
    const targets = questions.filter(q => idSet.has(q.id));
    if (!targets.length || targets.length > 100 || targets.length !== idSet.size) {
      showToast('Seleção inválida', 'Selecione entre 1 e 100 questões.', 'error');
      return false;
    }
    actionPending.current = true;
    setIsActionPending(true);
    try {
      if (action === 'assign') {
        applyConfirmed(await mutateShared(targets, 'assign', activeCurator, activeCurator));
      } else {
        const saved = await mutateShared(targets, 'review', activeCurator);
        applyConfirmed(saved);
        setAuditLogs(logs => [...saved.map(q => ({
          id: crypto.randomUUID(), questao_id: q.id, curador_id: activeCurator.id,
          curador_nome: activeCurator.nome, tipo_acao: 'status_alterado' as const,
          detalhes: `Questão #${q.id} marcada para revisão em lote`, timestamp: new Date().toISOString(),
          sql_gerado: generateSqlForQuestion(q, activeCurator.nome),
        })), ...logs]);
      }
      showToast(action === 'assign' ? 'Questões assumidas' : 'Questões marcadas para revisão',
        `${targets.length} questões • ${activeCurator.nome}`, 'success');
      return true;
    } catch (error: any) {
      showToast('Operação não concluída', describeError(error), 'error');
      try { const shared = await fetchShared(); setQuestions(prev => mergeShared(prev, shared.rows)); } catch {}
      return false;
    } finally { actionPending.current = false; setIsActionPending(false); }
  };

  const handleReleaseAllMyAssignments = async (curatorId: string): Promise<boolean> => {
    if (actionPending.current) return false;
    const targets = questions.filter(q => q.responsavel_id === curatorId && q.status === 'pendente');
    actionPending.current = true;
    setIsActionPending(true);
    let released = 0;
    try {
      for (let offset = 0; offset < targets.length; offset += 100) {
        const updated = await mutateShared(targets.slice(offset, offset + 100), 'assign', activeCurator, null);
        applyConfirmed(updated);
        released += updated.length;
      }
      setActiveView('table');
      return true;
    } catch (error: any) {
      showToast('Liberação interrompida', `${released} questões liberadas. ${error.message}`, 'error');
      return false;
    } finally { actionPending.current = false; setIsActionPending(false); }
  };

  const handleAddComment = async (questionId: string, text: string): Promise<boolean> => {
    const q = questions.find(q => q.id === questionId);
    if (!q) return false;
    const comment: QuestionComment = { id:crypto.randomUUID(), questao_id:questionId,
      curador_id:activeCurator.id,curador_nome:activeCurator.nome,curador_cor:activeCurator.avatarCor,
      texto:text,criado_em:new Date().toISOString() };
    return (await runShared([{...q, shared_comments:[...(q.shared_comments || []),comment]}], 'comment')) !== null;
  };

  // Actions: Lock session / Switch user with master password
  const handleLockSession = useCallback(async () => {
    if (actionPending.current || isEditingQuestion) { showToast('Operação em andamento', 'Salve ou cancele a edição antes de bloquear a sessão.', 'info'); return; }
    await signOutSupabase();
    setQuestions([]);
    setDatasetReady(false);
    setPresences({});
    setActiveView('table');
    try {
      sessionStorage.removeItem('apexmed_master_auth_token');
      sessionStorage.removeItem('apexmed_authenticated_curator_id');
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    showToast('Sessão Bloqueada', 'Escolha seu perfil e informe a senha mestra.', 'info');
  }, [showToast,isEditingQuestion]);

  const modifiedCount = useMemo(() => {
    return questions.filter(q => q.status !== 'pendente').length;
  }, [questions]);

  // Only the login form participates in keyboard navigation before authentication.
  if (!isAuthenticated) return <SupabaseAuthGate onAuthenticated={curator => {setActiveCurator(curator); setIsAuthenticated(true);}} />;

  return (
    <div className="min-h-screen bg-shell text-apex-text flex flex-col font-sans selection:bg-brand selection:text-white">
      {/* Master Password Gate Overlay */}

      {/* Top Navbar */}
      <TopNavbar
        allowCuratorSwitch={false}
        curators={curators}
        activeCurator={activeCurator}
        onSelectCurator={() => {}}
        onLockSession={handleLockSession}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeView={activeView}
        onViewChange={(view) => { if (view === 'cockpit' && !completeDatasetReady) {showToast('Carregando a base', 'As estatísticas globais estarão disponíveis ao concluir o carregamento.', 'info');return;} if (isEditingQuestion) {showToast('Edição em andamento', 'Salve ou cancele antes de sair.', 'info');return;} if (actionPending.current) return; if (view === 'detail' && currentQuestion) void openQuestion(currentQuestion); else setActiveView(view); }}
        onOpenSqlModal={() => {if (!completeDatasetReady) {showToast('Carregando a base', 'Aguarde para gerar o SQL de todas as questões corrigidas.', 'info');return;}setIsSqlModalOpen(true);}}
        onOpenBatchAssignModal={() => {if (!completeDatasetReady) {showToast('Carregando a base', 'A seleção na lista já está disponível; aguarde para reservar lotes de toda a base.', 'info');return;}setIsBatchAssignModalOpen(true);}}
        totalQuestions={questions.length}
        modifiedCount={modifiedCount}
        onlineCuratorsCount={new Set([...Object.values(presences).map(p => p.curador_id), ...(isAuthenticated ? [activeCurator.id] : [])]).size}
      />

      <div role="status" className="px-6 py-2 text-xs text-apex-readable bg-shell-2/60">{isActionPending ? 'Salvando… Aguarde a confirmação.' : isLoadingFullDataset ? `${questions.length} questões disponíveis • Carregando o restante…` : syncMessage}</div>
      {loadError && <div role="alert" className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-4 py-4 text-apex-text">
        <div className="min-w-0 flex-1"><p className="font-bold">Não foi possível carregar toda a base.</p><p className="mt-1 break-words text-sm text-apex-readable">{loadError}</p><p className="mt-1 text-sm text-apex-readable">As questões já carregadas continuam disponíveis. Reconecte e tente novamente.</p></div>
        <button type="button" disabled={isLoadingFullDataset || isActionPending || isEditingQuestion} onClick={() => {setDatasetReady(false);setDatasetLoadAttempt(attempt => attempt + 1);}} className="min-h-11 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-hover disabled:opacity-40">Tentar carregar novamente</button>
      </div>}
      {datasetReady && questions.length===0 && <p className="mx-auto max-w-3xl p-8 text-center text-apex-readable">Nenhuma questão cadastrada. Importe sua base na tabela questions do Supabase e atualize esta página.</p>}
      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6">
        {activeView === 'table' && (
          <QuestionsTable
            questions={searchedQuestions}
            activeCurator={activeCurator}
            presences={presences}
            comments={{...commentsMap, ...Object.fromEntries(questions.filter(q=>q.shared_comments).map(q=>[q.id,q.shared_comments!]))}}
            busy={isActionPending}
            onSelectedQuestions={handleSelectedQuestions}
            onSelectQuestion={(q) => { void openQuestion(q); }}
            onUpdateStatus={handleUpdateStatus}
            onAssignQuestion={handleAssignQuestion}
            onShowToast={showToast}
            onLoadFullQuestion={fullQuestion}
            searchActive={Boolean(searchQuery.trim())}
            onClearSearch={() => setSearchQuery('')}
          />
        )}

        {activeView === 'detail' && currentQuestion?.parcial && (
          <div role="status" className="mx-auto max-w-3xl p-8 text-center text-apex-readable">
            {fullLoadError ? <><p className="font-bold text-apex-text">Não foi possível abrir a questão #{currentQuestion.id}.</p><p className="mt-1 text-sm">{fullLoadError}</p>
              <button type="button" onClick={() => {setFullLoadError(null);void fullQuestion(currentQuestion).catch(error => setFullLoadError(describeError(error)));}} className="mt-4 min-h-11 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-hover">Tentar novamente</button></>
              : <p>Carregando a questão #{currentQuestion.id}…</p>}
          </div>
        )}
        {activeView === 'detail' && currentQuestion && !currentQuestion.parcial && (
          <QuestionDetailView
            busy={isActionPending}
            onEditingChange={setIsEditingQuestion}
            key={currentQuestion.id}
            question={currentQuestion}
            allQuestions={searchedQuestions}
            activeCurator={activeCurator}
            presences={presences}
            comments={currentQuestion.shared_comments || commentsMap[currentQuestion.id] || []}
            onBackToList={() => viewTransition(() => setActiveView('table'), { after: () => nameQuestionRow(selectedQuestionId) })}
            onNavigateQuestion={(idx) => {
              const target = searchedQuestions[idx];
              if (target) void openQuestion(target);
            }}
            onUpdateQuestion={handleUpdateQuestion}
            onUpdateStatus={handleUpdateStatus}
            onAssignQuestion={handleAssignQuestion}
            onAddComment={handleAddComment}
            onShowToast={showToast}

          />
        )}

        {activeView === 'cockpit' && (
          <AuditCockpit
            onShowToast={showToast}
            questions={questions}
            curators={curators}
            onOpenQuestionById={(id) => {
              const q = questions.find(q => q.id === id);
              if (q) void openQuestion(q);
            }}
          />
        )}
      </main>

      {/* Modals */}
      <SqlEditorModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
        auditLogs={auditLogs}
        allQuestions={questions}
        onClearLogs={() => {
          setAuditLogs([]);
          showToast('Histórico de Logs Limpo', 'O script progressivo foi reiniciado.', 'info');
        }}
        onShowToast={showToast}
      />

      <BatchAssignModal
        isOpen={isBatchAssignModalOpen}
        onClose={() => setIsBatchAssignModalOpen(false)}
        questions={questions}
        curators={curators}
        activeCurator={activeCurator}
        busy={isActionPending}
        onAssignBatch={handleAssignBatch}
        onReleaseAllMyAssignments={handleReleaseAllMyAssignments}
        onShowToast={showToast}
      />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
