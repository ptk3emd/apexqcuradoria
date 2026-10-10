import React, { useState } from 'react';
import { Layers, X, UserCheck, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Question, Curator } from '../types/question';

interface BatchAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  curators: Curator[];
  activeCurator: Curator;
  onAssignBatch: (questionIds: string[], curatorId: string, curatorName: string) => Promise<boolean>;
  onReleaseAllMyAssignments: (curatorId: string) => Promise<boolean>;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const BatchAssignModal: React.FC<BatchAssignModalProps> = ({
  isOpen,
  onClose,
  questions,
  curators,
  activeCurator,
  onAssignBatch,
  onReleaseAllMyAssignments,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const [quantity, setQuantity] = useState<number>(10);
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('todas');

  // Workload calculations
  const total = questions.length;
  const unassigned = questions.filter(q => !q.responsavel_id);
  const unassignedPending = unassigned.filter(q => q.status === 'pendente');

  const workloadByCurator = curators.map(c => {
    const assigned = questions.filter(q => q.responsavel_id === c.id);
    const completed = assigned.filter(q => q.status !== 'pendente');
    return {
      curator: c,
      totalAssigned: assigned.length,
      completed: completed.length,
      pending: assigned.length - completed.length,
    };
  });

  const availableSpecialties = Array.from(
    new Set(unassignedPending.map(q => q.especialidade || q.categoria).filter(Boolean))
  ).sort();

  const handleClaim = async () => {
    let pool = unassignedPending;
    if (specialtyFilter !== 'todas') {
      pool = pool.filter(q => (q.especialidade || q.categoria) === specialtyFilter);
    }

    if (pool.length === 0) {
      onShowToast('Nenhuma questão livre disponível', 'Tente outro filtro de especialidade.', 'error');
      return;
    }

    const selected = pool.slice(0, quantity);
    const ids = selected.map(q => q.id);

    if (!await onAssignBatch(ids, activeCurator.id, activeCurator.nome)) return;
    onShowToast(
      `${ids.length} questões reservadas!`,
      `Atribuídas para ${activeCurator.nome}. Outros curadores verão sua responsabilidade para evitar redundância.`,
      'success'
    );
    onClose();
  };

  const handleRelease = async () => {
    if (!await onReleaseAllMyAssignments(activeCurator.id)) return;
    onShowToast('Questões liberadas', 'Todas as suas questões atribuídas voltaram para o banco livre.', 'info');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-[#1e1d1b] border border-white/[0.12] p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#A43939]/20 border border-[#A43939]/40 flex items-center justify-center">
              <Layers className="w-4 h-4 text-[#DF9696]" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#f8fafc]">Divisão de Lotes de Questões</h3>
              <p className="text-xs text-[#7a7468]">
                Evite redundância atribuindo lotes de questões não auditadas para cada especialista
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#7a7468] hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Workload Breakdown (Patrick, Lucas, Thierry) */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase font-bold tracking-wider text-[#DF9696]">
            Responsáveis pela curadoria: Patrick, Lucas, Thierry
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {workloadByCurator.map(({ curator, totalAssigned, pending }) => {
              const isCurrent = curator.id === activeCurator.id;
              return (
                <div
                  key={curator.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-[#A43939]/15 border-[#A43939]/40 text-white'
                      : 'bg-white/[0.03] border-white/[0.07] text-[#bdbdbd]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: curator.avatarCor }}
                    />
                    <p className="font-bold text-xs truncate">{curator.nome.split(' ')[0]}</p>
                    {isCurrent && <span className="text-[9px] text-[#DF9696] font-bold">(Você)</span>}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#7a7468]">Atribuídas:</span>
                    <span className="font-bold text-[#f8fafc]">{totalAssigned}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#7a7468]">Pendentes:</span>
                    <span className="font-bold text-amber-400">{pending}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] text-xs text-[#7a7468]">
            <span>Questões livres disponíveis para assumir:</span>
            <span className="font-bold text-emerald-400">{unassignedPending.length} pendentes</span>
          </div>
        </div>

        {/* Batch Selection Form */}
        <div className="space-y-4 pt-1 border-t border-white/[0.06]">
          <div>
            <label className="block text-xs font-bold text-[#f8fafc] mb-1.5">
              Quantas questões pendentes deseja reservar para você agora?
            </label>
            <div className="flex gap-2">
              {[5, 10, 15, 20].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setQuantity(num)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                    quantity === num
                      ? 'bg-[#A43939] border-[#A43939] text-white shadow-[0_0_15px_rgba(164,57,57,0.35)]'
                      : 'bg-[#272522] border-white/[0.08] text-[#bdbdbd] hover:border-white/[0.2]'
                  }`}
                >
                  {num} questões
                </button>
              ))}
            </div>
          </div>

          {availableSpecialties.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-[#f8fafc] mb-1.5">
                Filtrar especialidade para o lote (opcional):
              </label>
              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="w-full bg-[#272522] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-[#f8fafc] outline-none focus:border-[#A43939]"
              >
                <option value="todas">Qualquer Especialidade (Todas as disponíveis)</option>
                {availableSpecialties.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
          <button
            onClick={handleRelease}
            className="text-xs text-[#7a7468] hover:text-rose-400 underline"
          >
            Liberar minhas atribuições pendentes
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-bold text-[#7a7468] hover:text-white"
            >
              Cancelar
            </button>
            <button
              onClick={handleClaim}
              disabled={unassignedPending.length === 0}
              className="px-6 py-2 rounded-full text-xs font-bold bg-[#A43939] hover:bg-[#913232] disabled:opacity-40 text-white shadow-lg transition-all cursor-pointer"
            >
              Reservar {quantity} Questões
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
