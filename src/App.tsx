import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  DEFAULT_CURATORS 
} from './data/defaultCurators';
import { INITIAL_CSV_STRING } from './data/rawCsvData';
import { parseCSV, convertRowsToQuestions } from './lib/csvParser';
import { 
  Question, 
  QuestionStatus, 
  Curator, 
  QuestionComment, 
  CuratorPresence, 
  AuditLogItem 
} from './types/question';
import { 
  getStoredSupabaseConfig, 
  broadcastRealtimeEvent, 
  subscribeToRealtimeEvents 
} from './lib/supabaseClient';
import { generateSqlForQuestion } from './lib/sqlGenerator';
import { TopNavbar } from './components/TopNavbar';
import { QuestionsTable } from './components/QuestionsTable';
import { QuestionDetailView } from './components/QuestionDetailView';
import { AuditCockpit } from './components/AuditCockpit';
import { BatchAssignModal } from './components/BatchAssignModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { SqlEditorModal } from './components/SqlEditorModal';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { MasterAuthGate } from './components/MasterAuthGate';

import { INITIAL_QUESTIONS_SAMPLE } from './data/initialQuestions';
import { 
  getQuestionsFromDb, 
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
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isBatchAssignModalOpen, setIsBatchAssignModalOpen] = useState(false);

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
        const cached = await getQuestionsFromDb();
        if (cached && cached.length > 200 && isMounted) {
          setQuestions(cached);
          setIsLoadingFullDataset(false);
          return;
        }

        const res = await fetch('./base_questoes.json');
        if (res.ok) {
          const full = await res.json();
          if (isMounted && Array.isArray(full) && full.length > 0) {
            setQuestions(full);
            await saveQuestionsToDb(full);
          }
        }
      } catch (err) {
        console.warn('Carregamento inicial completo:', err);
      } finally {
        if (isMounted) setIsLoadingFullDataset(false);
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

  // Subscribe to real-time sync events
  useEffect(() => {
    const unsubscribe = subscribeToRealtimeEvents((event) => {
      if (event.type === 'STATUS_CHANGED') {
        const { id, status, curatorName, notas } = event.payload;
        setQuestions(prev =>
          prev.map(q => {
            if (q.id === id) {
              return {
                ...q,
                status,
                revisado_por: curatorName,
                revisado_em: new Date().toISOString(),
                notas_revisao: notas || q.notas_revisao,
              };
            }
            return q;
          })
        );
      } else if (event.type === 'QUESTION_UPDATED') {
        const updated = event.payload;
        setQuestions(prev => prev.map(q => (q.id === updated.id ? updated : q)));
      } else if (event.type === 'BATCH_ASSIGNED') {
        const { questionIds, curatorId, curatorName } = event.payload;
        setQuestions(prev =>
          prev.map(q => {
            if (questionIds.includes(q.id)) {
              return {
                ...q,
                responsavel_id: curatorId,
                responsavel_nome: curatorName,
              };
            }
            return q;
          })
        );
      } else if (event.type === 'NEW_COMMENT') {
        const comment = event.payload;
        setCommentsMap(prev => {
          const list = prev[comment.questao_id] || [];
          return {
            ...prev,
            [comment.questao_id]: [...list, comment],
          };
        });
      } else if (event.type === 'PRESENCE_PING') {
        const presence = event.payload;
        setPresences(prev => ({
          ...prev,
          [presence.curador_id]: presence,
        }));
      } else if (event.type === 'BULK_IMPORT') {
        setQuestions(event.payload);
      }
    });

    return () => unsubscribe();
  }, []);

  // Broadcast presence ping when active question or curator changes
  useEffect(() => {
    const presence: CuratorPresence = {
      curador_id: activeCurator.id,
      curador_nome: activeCurator.nome,
      curador_cor: activeCurator.avatarCor,
      questao_atual_id: activeView === 'detail' ? selectedQuestionId : null,
      status_atividade: activeView === 'detail' ? 'visualizando' : 'ocioso',
      ultima_atividade: new Date().toISOString(),
    };

    broadcastRealtimeEvent({
      type: 'PRESENCE_PING',
      payload: presence,
    });
  }, [activeCurator, activeView, selectedQuestionId]);

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

  // Actions: Update Question Status & Append to Progressive SQL Audit Log
  const handleUpdateStatus = useCallback(
    (id: string, newStatus: QuestionStatus, notas?: string) => {
      setQuestions(prev => {
        const target = prev.find(q => q.id === id);
        if (!target) return prev;

        const updated: Question = {
          ...target,
          status: newStatus,
          revisado_por: activeCurator.nome,
          revisado_em: new Date().toISOString(),
          notas_revisao: notas || target.notas_revisao,
        };

        // Generate SQL statement for this action
        const generatedSql = generateSqlForQuestion(updated, activeCurator.nome);

        // Append to audit log
        const logItem: AuditLogItem = {
          id: `${Date.now()}_${Math.random()}`,
          questao_id: id,
          curador_id: activeCurator.id,
          curador_nome: activeCurator.nome,
          tipo_acao: 'status_alterado',
          detalhes: `Status alterado para "${newStatus}"`,
          timestamp: new Date().toISOString(),
          sql_gerado: generatedSql,
        };

        setAuditLogs(logs => [logItem, ...logs]);

        // Broadcast to other curators in real time
        broadcastRealtimeEvent({
          type: 'STATUS_CHANGED',
          payload: { id, status: newStatus, curatorName: activeCurator.nome, notas },
        });

        // Persist single question in IndexedDB
        updateSingleQuestionInDb(updated);

        return prev.map(q => (q.id === id ? updated : q));
      });
    },
    [activeCurator]
  );

  // Actions: Full Question Update (when edited)
  const handleUpdateQuestion = useCallback(
    (updated: Question) => {
      setQuestions(prev => prev.map(q => (q.id === updated.id ? updated : q)));
      updateSingleQuestionInDb(updated);

      const generatedSql = generateSqlForQuestion(updated, activeCurator.nome);
      const logItem: AuditLogItem = {
        id: `${Date.now()}_${Math.random()}`,
        questao_id: updated.id,
        curador_id: activeCurator.id,
        curador_nome: activeCurator.nome,
        tipo_acao: 'conteudo_editado',
        detalhes: `Conteúdo da questão #${updated.id} modificado`,
        timestamp: new Date().toISOString(),
        sql_gerado: generatedSql,
      };

      setAuditLogs(logs => [logItem, ...logs]);

      broadcastRealtimeEvent({
        type: 'QUESTION_UPDATED',
        payload: updated,
        curatorName: activeCurator.nome,
      });
    },
    [activeCurator]
  );

  // Actions: Assign Single Question
  const handleAssignQuestion = useCallback(
    (id: string, curator: Curator | null) => {
      setQuestions(prev => {
        const next = prev.map(q => {
          if (q.id === id) {
            const u = {
              ...q,
              responsavel_id: curator ? curator.id : null,
              responsavel_nome: curator ? curator.nome : null,
            };
            updateSingleQuestionInDb(u);
            return u;
          }
          return q;
        });
        return next;
      });

      broadcastRealtimeEvent({
        type: 'BATCH_ASSIGNED',
        payload: {
          questionIds: [id],
          curatorId: curator ? curator.id : '',
          curatorName: curator ? curator.nome : '',
        },
      });

      if (curator) {
        showToast('Questão Atribuída', `Responsável: ${curator.nome}`, 'info');
      } else {
        showToast('Questão Liberada', 'A questão voltou para a fila geral sem responsável.', 'info');
      }
    },
    [showToast]
  );

  // Actions: Batch Assign Questions
  const handleAssignBatch = useCallback(
    (questionIds: string[], curatorId: string, curatorName: string) => {
      setQuestions(prev => {
        const next = prev.map(q => {
          if (questionIds.includes(q.id)) {
            const u = {
              ...q,
              responsavel_id: curatorId,
              responsavel_nome: curatorName,
            };
            updateSingleQuestionInDb(u);
            return u;
          }
          return q;
        });
        return next;
      });

      broadcastRealtimeEvent({
        type: 'BATCH_ASSIGNED',
        payload: { questionIds, curatorId, curatorName },
      });
    },
    []
  );

  // Actions: Release all assignments for active curator
  const handleReleaseAllMyAssignments = useCallback((curatorId: string) => {
    setQuestions(prev => {
      const next = prev.map(q => {
        if (q.responsavel_id === curatorId && q.status === 'pendente') {
          const u = {
            ...q,
            responsavel_id: null,
            responsavel_nome: null,
          };
          updateSingleQuestionInDb(u);
          return u;
        }
        return q;
      });
      return next;
    });
  }, []);

  // Actions: Add Comment
  const handleAddComment = useCallback(
    (questionId: string, text: string) => {
      const newComment: QuestionComment = {
        id: `${Date.now()}_${Math.random()}`,
        questao_id: questionId,
        curador_id: activeCurator.id,
        curador_nome: activeCurator.nome,
        curador_cor: activeCurator.avatarCor,
        texto: text,
        criado_em: new Date().toISOString(),
      };

      setCommentsMap(prev => {
        const list = prev[questionId] || [];
        return {
          ...prev,
          [questionId]: [...list, newComment],
        };
      });

      broadcastRealtimeEvent({
        type: 'NEW_COMMENT',
        payload: newComment,
      });
    },
    [activeCurator]
  );

  // Actions: Bulk Import Questions
  const handleImportQuestions = useCallback((imported: Question[]) => {
    setQuestions(imported);
    saveQuestionsToDb(imported);
    setSelectedQuestionId(imported[0]?.id || null);
    broadcastRealtimeEvent({
      type: 'BULK_IMPORT',
      payload: imported,
    });
  }, []);

  // Actions: Lock session / Switch user with master password
  const handleLockSession = useCallback(() => {
    try {
      sessionStorage.removeItem('apexmed_master_auth_token');
      sessionStorage.removeItem('apexmed_authenticated_curator_id');
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    showToast('Sessão Bloqueada', 'Digite a senha mestra para desbloquear.', 'info');
  }, [showToast]);

  // Check Supabase connection state
  const supabaseConfig = getStoredSupabaseConfig();
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
        onViewChange={setActiveView}
        onOpenSqlModal={() => setIsSqlModalOpen(true)}
        onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
        onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
        onOpenBatchAssignModal={() => setIsBatchAssignModalOpen(true)}
        isSupabaseConnected={supabaseConfig.isConnected}
        totalQuestions={questions.length}
        modifiedCount={modifiedCount}
        onlineCuratorsCount={3}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6">
        {activeView === 'table' && (
          <QuestionsTable
            questions={searchedQuestions}
            activeCurator={activeCurator}
            presences={presences}
            comments={commentsMap}
            onSelectQuestion={(q) => {
              setSelectedQuestionId(q.id);
              setActiveView('detail');
            }}
            onUpdateStatus={handleUpdateStatus}
            onAssignQuestion={handleAssignQuestion}
            onShowToast={showToast}
          />
        )}

        {activeView === 'detail' && currentQuestion && (
          <QuestionDetailView
            question={currentQuestion}
            allQuestions={searchedQuestions}
            activeCurator={activeCurator}
            presences={presences}
            comments={commentsMap[currentQuestion.id] || []}
            onBackToList={() => setActiveView('table')}
            onNavigateQuestion={(idx) => {
              const target = searchedQuestions[idx];
              if (target) setSelectedQuestionId(target.id);
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
            questions={questions}
            curators={curators}
            onOpenQuestionById={(id) => {
              setSelectedQuestionId(id);
              setActiveView('detail');
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

      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        questions={questions}
        onImportQuestions={handleImportQuestions}
        onShowToast={showToast}
      />

      <SupabaseConfigModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        questions={questions}
        onQuestionsLoadedFromSupabase={handleImportQuestions}
        onShowToast={showToast}
      />

      <BatchAssignModal
        isOpen={isBatchAssignModalOpen}
        onClose={() => setIsBatchAssignModalOpen(false)}
        questions={questions}
        curators={curators}
        activeCurator={activeCurator}
        onAssignBatch={handleAssignBatch}
        onReleaseAllMyAssignments={handleReleaseAllMyAssignments}
        onShowToast={showToast}
      />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
