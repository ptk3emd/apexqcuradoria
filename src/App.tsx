import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { reviewSelection } from './lib/bulkActions';
import { generateSqlForQuestion } from './lib/sqlGenerator';
import { TopNavbar } from './components/TopNavbar';
import { QuestionsTable } from './components/QuestionsTable';
import { QuestionDetailView } from './components/QuestionDetailView';
import { AuditCockpit } from './components/AuditCockpit';
import { BatchAssignModal } from './components/BatchAssignModal';
import { GoogleSheetsSyncModal } from './components/GoogleSheetsSyncModal';
import { SqlEditorModal } from './components/SqlEditorModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { MasterAuthGate } from './components/MasterAuthGate';
import { 
  getStoredSheetsSyncConfig 
} from './lib/googleSheetsSync';

import { INITIAL_QUESTIONS_SAMPLE } from './data/initialQuestions';
import { 
  saveQuestionsToDb,
  updateSingleQuestionInDb 
} from './lib/indexedDbHelper';

const STORAGE_KEY_LOGS = 'apexmed_audit_logs_v1';
const STORAGE_KEY_COMMENTS = 'apexmed_comments_v1';

export default function App() {
  // 1. Curators & Authentication State
  const [curators] = useState<Curator[]>(DEFAULT_CURATORS);
  
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const token = sessionStorage.getItem('apexmed_master_auth_token');
        const curatorId = sessionStorage.getItem('apexmed_authenticated_curator_id');
        return token === 'apex-auth-valid' && Boolean(curatorId);
      } catch {
        return false;
      }
    }
    return false;
  });

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

  // 2. Questions State (Starts instantly with the 150 items sample from the requested Google Sheet)
  const [questions, setQuestions] = useState<Question[]>(INITIAL_QUESTIONS_SAMPLE);
  const [isLoadingFullDataset, setIsLoadingFullDataset] = useState(false);

  const [syncMessage, setSyncMessage] = useState('Conectando à curadoria compartilhada…');
  const [datasetReady, setDatasetReady] = useState(false);
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
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 7. Modals
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isBatchAssignModalOpen, setIsBatchAssignModalOpen] = useState(false);

  // 7.1 Google Sheets Sync Status (idle, pending, success, error)
  const [sheetsSyncStatus, setSheetsSyncStatus] = useState<'idle' | 'pending' | 'success' | 'error'>(() => {
    const cfg = getStoredSheetsSyncConfig();
    return cfg.lastSendStatus || 'idle';
  });
  const [sheetsSyncMessage, setSheetsSyncMessage] = useState<string>(() => {
    const cfg = getStoredSheetsSyncConfig();
    return cfg.lastSendMessage || '';
  });

  // 8. Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (title: string, message?: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = `${Date.now()}_${Math.random()}`;
      setToasts(prev => [...prev, { id, title, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Asynchronously load the full 13,945 questions dataset from IndexedDB or base_questoes.json
  useEffect(() => {
    let isMounted = true;
    async function loadDataset() {
      setIsLoadingFullDataset(true);
      try {
        const res = await fetch('./base_questoes.json');
        if (res.ok) {
          const full = await res.json();
          if (isMounted && Array.isArray(full) && full.length > 0) {
            setQuestions(full);
            // This immutable bundled base is already available as JSON; do not
            // block collaboration while rewriting 13,945 rows into IndexedDB.
          }
        }
      } catch (err) {
        console.warn('Carregamento inicial completo:', err);
      } finally {
        if (isMounted) { setIsLoadingFullDataset(false); setDatasetReady(true); }
      }
    }

    loadDataset();
    return () => {
      isMounted = false;
    };
  }, []);

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

  // The Sheets journal is authoritative. Re-fetch on reconnect and periodically to heal missed events.
  useEffect(() => {
    if (!datasetReady || !isAuthenticated) return;
    let stopped = false;
    let loading = false;
    const refresh = async () => {
      if (loading || stopped) return;
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
          setSyncMessage('Google Sheets conectado • atualização automática a cada 5 segundos');
        }
      } catch (error: any) {
        if (!stopped) setSyncMessage(`Sincronização indisponível: ${error.message}`);
      } finally { loading = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener('online', refresh);
    return () => {
      stopped = true; clearInterval(timer);
      window.removeEventListener('online', refresh);

    };
  }, [datasetReady, isAuthenticated]);

  // Selected Question object
  const currentQuestion = useMemo(() => {
    if (!selectedQuestionId) return questions[0] || null;
    return questions.find(q => q.id === selectedQuestionId) || questions[0] || null;
  }, [questions, selectedQuestionId]);

  // Questions filtered by search query
  const searchedQuestions = useMemo(() => {
    if (!searchQuery.trim()) return questions;
    const q = searchQuery.toLowerCase().trim();
    return questions.filter(item => {
      return (
        item.id.toLowerCase().includes(q) ||
        (item.especialidade && item.especialidade.toLowerCase().includes(q)) ||
        (item.tema_especifico && item.tema_especifico.toLowerCase().includes(q)) ||
        (item.enunciado && item.enunciado.toLowerCase().includes(q)) ||
        (item.ano && item.ano.includes(q)) ||
        (item.origem && item.origem.toLowerCase().includes(q))
      );
    });
  }, [questions, searchQuery]);

  const applyConfirmed = useCallback((updated: Question[]) => {
    setQuestions(prev => {
      const changes = new Map(updated.map(q => [q.id, q]));
      return prev.map(q => {
        const next = changes.get(q.id);
        return next && (next.sync_version ?? 0) >= (q.sync_version ?? 0) ? next : q;
      });
    });
    updated.forEach(q => { void updateSingleQuestionInDb(q); });
  }, []);

  const runShared = async (targets: Question[], action: string, target?: Curator | null) => {
    if (!isAuthenticated || !datasetReady) {
      showToast('Aguarde a conexão', 'Entre na sessão e aguarde o carregamento das questões.', 'info');
      return null;
    }
    if (actionPending.current) {
      showToast('Operação em andamento', 'Aguarde a confirmação do Google Sheets.', 'info');
      return null;
    }
    actionPending.current = true;
    setIsActionPending(true);
    try {
      const updated = await mutateShared(targets, action, activeCurator, target);
      applyConfirmed(updated);
      return updated;
    } catch (error: any) {
      showToast('Ação não salva', error.message, 'error');
      try { const rows = await fetchShared(); setQuestions(prev => mergeShared(prev, rows.rows)); } catch {}
      return null;
    } finally { actionPending.current = false; setIsActionPending(false); }
  };

  const openQuestion = async (question: Question) => {
    const updated = await runShared([question], 'claim');
    if (!updated) return;
    setSelectedQuestionId(question.id);
    setActiveView('detail');
  };

  // Leases protect against two tabs using the same curator profile as well.
  useEffect(() => {
    if (!isAuthenticated || activeView !== 'detail' || !selectedQuestionId) return;
    const q = { id: selectedQuestionId } as Question;
    const timer = setInterval(() => {
      void mutateShared([q], 'heartbeat', activeCurator).catch((error: any) => {
        setSyncMessage(`Reserva interrompida: ${error.message}. Reabra a questão antes de salvar.`);
      });
    }, 25000);
    return () => {
      clearInterval(timer);
      void mutateShared([q], 'unlock', activeCurator).catch(() => {});
    };
  }, [isAuthenticated, activeView, selectedQuestionId, activeCurator]);

  const handleUpdateQuestion = async (updated: Question): Promise<boolean> => {
    const result = await runShared([updated], 'save');
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
    if (activeView !== 'detail' || selectedQuestionId !== id) {
      const claimed = await runShared([q], 'claim');
      if (!claimed) return false;
      q = claimed[0];
    }
    const saved = await handleUpdateQuestion({ ...q, status, modificado: status === 'questao_corrigida' ? true : q.modificado, notas_revisao: notas ?? q.notas_revisao,
      revisado_por: activeCurator.nome, revisado_em: new Date().toISOString() });
    if (activeView !== 'detail' || selectedQuestionId !== id) void mutateShared([q], 'unlock', activeCurator).catch(() => {});
    return saved;
  };

  const handleAssignQuestion = async (id: string, curator: Curator | null) => {
    const q = questions.find(q => q.id === id);
    if (!q) return;
    if (await runShared([q], 'assign', curator)) {
      setActiveView('table');
      showToast('Reserva atualizada', curator ? `Responsável: ${curator.nome}` : 'Questão liberada', 'success');
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
        const saved = await reviewSelection(targets, activeCurator, mutateShared, applyConfirmed);
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
      showToast('Operação não concluída', error.message, 'error');
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
    return handleUpdateQuestion({...q, shared_comments:[...(q.shared_comments || []),comment]});
  };

  // Actions: Lock session / Switch user with master password
  const handleLockSession = useCallback(() => {
    if (actionPending.current) { showToast('Operação em andamento', 'Aguarde antes de bloquear a sessão.', 'info'); return; }
    try {
      sessionStorage.removeItem('apexmed_master_auth_token');
      sessionStorage.removeItem('apexmed_sheets_access_key');
      sessionStorage.removeItem('apexmed_authenticated_curator_id');
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    showToast('Sessão Bloqueada', 'Digite a senha mestra para desbloquear.', 'info');
  }, [showToast]);

  const modifiedCount = useMemo(() => {
    return questions.filter(q => q.status !== 'pendente').length;
  }, [questions]);

  return (
    <div className="min-h-screen bg-[#31302e] text-[#f8fafc] flex flex-col font-sans selection:bg-[#A43939] selection:text-white">
      {/* Master Password Gate Overlay */}
      {!isAuthenticated && (
        <MasterAuthGate
          curators={curators}
          onAuthenticated={(curator) => {
            setActiveCurator(curator);
            setIsAuthenticated(true);
            showToast(`Bem-vindo(a), ${curator.nome}!`, 'Acesso liberado com a senha mestra.', 'success');
          }}
        />
      )}

      {/* Top Navbar */}
      <TopNavbar
        curators={curators}
        activeCurator={activeCurator}
        onSelectCurator={(c) => {
          if (actionPending.current) { showToast('Operação em andamento', 'Aguarde antes de trocar de usuário.', 'info'); return; }
          setActiveView('table');
          setActiveCurator(c);
          try {
            sessionStorage.setItem('apexmed_authenticated_curator_id', c.id);
          } catch {
            // ignore
          }
          showToast(`Sessão ativa: ${c.nome}`, c.cargo, 'info');
        }}
        onLockSession={handleLockSession}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeView={activeView}
        onViewChange={(view) => { if (actionPending.current) return; if (view === 'detail' && currentQuestion) void openQuestion(currentQuestion); else setActiveView(view); }}
        onOpenSqlModal={() => setIsSqlModalOpen(true)}
        onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
        onOpenBatchAssignModal={() => setIsBatchAssignModalOpen(true)}
        totalQuestions={questions.length}
        modifiedCount={modifiedCount}
        onlineCuratorsCount={new Set([...Object.values(presences).map(p => p.curador_id), ...(isAuthenticated ? [activeCurator.id] : [])]).size}
        sheetsSyncStatus={sheetsSyncStatus}
        sheetsSyncMessage={sheetsSyncMessage}
      />

      <div role="status" className="px-6 py-2 text-sm bg-black/20">{isActionPending ? 'Salvando no Google Sheets… Aguarde a confirmação.' : syncMessage}</div>
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
          />
        )}

        {activeView === 'detail' && currentQuestion && (
          <QuestionDetailView
            busy={isActionPending}
            key={currentQuestion.id}
            question={currentQuestion}
            allQuestions={searchedQuestions}
            activeCurator={activeCurator}
            presences={presences}
            comments={currentQuestion.shared_comments || commentsMap[currentQuestion.id] || []}
            onBackToList={() => setActiveView('table')}
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

      {/* Google Sheets Sync Hub Modal */}
      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        questions={questions}
        onQuestionsUpdated={(updated) => {
          setQuestions(updated);
          void saveQuestionsToDb(updated);
        }}
        onShowToast={showToast}
        onSyncStatusChange={(status, message) => {
          setSheetsSyncStatus(status);
          if (message) setSheetsSyncMessage(message);
        }}
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
