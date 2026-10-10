import React, { useMemo } from 'react';
import { 
  CheckCircle2, 
  Trash2, 
  AlertTriangle, 
  PenTool, 
  Clock, 
  Users, 
  Layers, 
  TrendingUp,
  Activity,
  Award,
  ChevronRight
} from 'lucide-react';
import { CorrectedQuestionsSql } from './CorrectedQuestionsSql';
import { Question, Curator } from '../types/question';

interface AuditCockpitProps {
  questions: Question[];
  curators: Curator[];
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onOpenQuestionById: (id: string) => void;
}

export const AuditCockpit: React.FC<AuditCockpitProps> = ({
  questions,
  curators,
  onOpenQuestionById,
  onShowToast,
}) => {
  const total = questions.length;

  const counts = useMemo(() => {
    return {
      total,
      aprovadas: questions.filter(q => q.status === 'aprovadas').length,
      eliminar: questions.filter(q => q.status === 'eliminar_questao').length,
      revisar: questions.filter(q => q.status === 'revisar_questao').length,
      corrigidas: questions.filter(q => q.status === 'questao_corrigida').length,
      pendentes: questions.filter(q => q.status === 'pendente').length,
    };
  }, [questions, total]);

  const auditedCount = total - counts.pendentes;
  const auditProgressPct = total > 0 ? Math.round((auditedCount / total) * 100) : 0;

  // Breakdown by Specialty
  const specialtyBreakdown = useMemo(() => {
    const map: Record<string, { total: number; audited: number; pendentes: number }> = {};
    questions.forEach(q => {
      const spec = q.especialidade || q.categoria || 'Geral';
      if (!map[spec]) {
        map[spec] = { total: 0, audited: 0, pendentes: 0 };
      }
      map[spec].total++;
      if (q.status !== 'pendente') {
        map[spec].audited++;
      } else {
        map[spec].pendentes++;
      }
    });

    return Object.entries(map).map(([name, data]) => ({
      name,
      ...data,
      pct: Math.round((data.audited / data.total) * 100),
    })).sort((a, b) => b.total - a.total);
  }, [questions]);

  // Curator performance and assignments
  const curatorBreakdown = useMemo(() => {
    return curators.map(c => {
      const myAssigned = questions.filter(q => q.responsavel_id === c.id);
      const myAudited = questions.filter(q => q.revisado_por === c.nome || (q.responsavel_id === c.id && q.status !== 'pendente'));
      return {
        curator: c,
        assigned: myAssigned.length,
        audited: myAudited.length,
      };
    });
  }, [curators, questions]);

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Hero Analytics Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1e1d1b] to-[#272522] border border-white/[0.09] p-6 lg:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#A43939]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-xl">
            <span className="label-micro">
              Estatísticas de Curadoria Médica
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#f8fafc]">
              Progresso Geral de Auditoria: <span className="text-[#DF9696]">{auditProgressPct}%</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#bdbdbd] leading-relaxed">
              Acompanhe a auditoria dos três curadores e gere o SQL acumulado das questões corrigidas, atualizado com as alterações confirmadas no Supabase.
            </p>
          </div>

          {/* Quick Apex Stat Gauge */}
          <div className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/[0.08]">
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold tracking-wider text-[#7a7468]">
                Questões Auditadas
              </p>
              <p className="text-3xl font-bold text-[#f8fafc]">
                {auditedCount} <span className="text-sm font-normal text-[#7a7468]">/ {total}</span>
              </p>
              <p className="text-[11px] text-emerald-400 font-bold mt-0.5">
                {counts.pendentes} restantes na fila
              </p>
            </div>
            <div className="w-16 h-16 rounded-full border-4 border-white/[0.08] border-t-[#A43939] border-r-[#A43939] flex items-center justify-center font-bold text-sm text-[#f8fafc]">
              {auditProgressPct}%
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 rounded-full bg-white/[0.06] mt-6 overflow-hidden flex">
          <div
            style={{ width: `${(counts.aprovadas / total) * 100}%` }}
            className="bg-emerald-500 h-full transition-all"
            title={`Aprovadas: ${counts.aprovadas}`}
          />
          <div
            style={{ width: `${(counts.corrigidas / total) * 100}%` }}
            className="bg-blue-500 h-full transition-all"
            title={`Corrigidas: ${counts.corrigidas}`}
          />
          <div
            style={{ width: `${(counts.revisar / total) * 100}%` }}
            className="bg-amber-500 h-full transition-all"
            title={`A Revisar: ${counts.revisar}`}
          />
          <div
            style={{ width: `${(counts.eliminar / total) * 100}%` }}
            className="bg-rose-500 h-full transition-all"
            title={`Eliminadas: ${counts.eliminar}`}
          />
        </div>
      </div>

      <CorrectedQuestionsSql questions={questions} onShowToast={onShowToast} />

      {/* Semantic Stat Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Aprovadas */}
        <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Aprovadas</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-[#f8fafc]">{counts.aprovadas}</p>
          <p className="text-[11px] text-[#7a7468]">
            {total > 0 ? Math.round((counts.aprovadas / total) * 100) : 0}% do banco
          </p>
        </div>

        {/* Eliminadas */}
        <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-1">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Eliminar (DELETE)</span>
            <Trash2 className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-[#f8fafc]">{counts.eliminar}</p>
          <p className="text-[11px] text-[#7a7468]">
            {total > 0 ? Math.round((counts.eliminar / total) * 100) : 0}% do banco
          </p>
        </div>

        {/* A Revisar */}
        <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-1">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Revisar</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-[#f8fafc]">{counts.revisar}</p>
          <p className="text-[11px] text-[#7a7468]">Com notas anexadas</p>
        </div>

        {/* Corrigidas */}
        <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-1">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Corrigidas (UPDATE)</span>
            <PenTool className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-[#f8fafc]">{counts.corrigidas}</p>
          <p className="text-[11px] text-[#7a7468]">Gabarito ou texto retificado</p>
        </div>

        {/* Pendentes */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-[#bdbdbd]">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pendentes</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-[#f8fafc]">{counts.pendentes}</p>
          <p className="text-[11px] text-[#7a7468]">Aguardando análise inicial</p>
        </div>
      </div>

      {/* 2-Column Cockpit Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Specialty Progress Breakdown */}
        <div className="p-6 rounded-2xl bg-[#1e1d1b] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#DF9696]" />
              <h3 className="font-bold text-sm text-[#f8fafc]">Progresso por Especialidade</h3>
            </div>
            <span className="text-xs text-[#7a7468]">{specialtyBreakdown.length} áreas</span>
          </div>

          <div className="space-y-3">
            {specialtyBreakdown.map((spec) => (
              <div key={spec.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#f8fafc]">{spec.name}</span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#bdbdbd]">
                      {spec.audited} / {spec.total}
                    </span>
                    <span className="font-bold text-white px-2 py-0.5 rounded bg-white/[0.05]">
                      {spec.pct}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    style={{ width: `${spec.pct}%` }}
                    className="h-full bg-[#A43939] rounded-full transition-all"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Curator Workload & Consistency Heatmap */}
        <div className="space-y-6">
          {/* Curator Allocation Card */}
          <div className="p-6 rounded-2xl bg-[#1e1d1b] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#DF9696]" />
                <h3 className="font-bold text-sm text-[#f8fafc]">
                  Responsáveis pela curadoria: Patrick, Lucas, Thierry
                </h3>
              </div>
              <span className="text-xs text-[#7a7468]">Equipe Curadora</span>
            </div>

            <div className="space-y-3">
              {curatorBreakdown.map(({ curator, assigned, audited }) => (
                <div
                  key={curator.id}
                  className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: curator.avatarCor }}
                    >
                      {curator.iniciais}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#f8fafc]">{curator.nome}</p>
                      <p className="text-[10px] text-[#7a7468]">{curator.cargo}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-bold text-[#f8fafc]">
                      {assigned} reservadas
                    </p>
                    <p className="text-[11px] text-emerald-400">
                      {audited} auditadas
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Consistency Rhythm Heatmap (Matching design.md hm-0 to hm-4) */}
          <div className="p-6 rounded-2xl bg-[#1e1d1b] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#DF9696]" />
                <h3 className="font-bold text-sm text-[#f8fafc]">Ritmo de Curadoria</h3>
              </div>
              <span className="text-[10px] uppercase font-bold text-[#7a7468]">
                Atividade Recente
              </span>
            </div>

            <p className="text-xs text-[#bdbdbd]">
              Intensidade de alterações auditadas na base de dados por questão:
            </p>

            {/* Heatmap grid */}
            <div className="grid grid-cols-10 sm:grid-cols-12 gap-1.5 pt-2">
              {questions.slice(0, 48).map((q, idx) => {
                let cellColor = '#4a4540'; // hm-0
                if (q.status === 'aprovadas') cellColor = '#16a34a';
                else if (q.status === 'eliminar_questao') cellColor = '#dc2626';
                else if (q.status === 'revisar_questao') cellColor = '#d97706';
                else if (q.status === 'questao_corrigida') cellColor = '#2563eb';

                return (
                  <button
                    key={q.id}
                    onClick={() => onOpenQuestionById(q.id)}
                    className="aspect-square rounded-[3px] transition-all hover:scale-125 focus:outline-none"
                    style={{ backgroundColor: cellColor }}
                    title={`Questão #${q.id} (${q.especialidade}) - Status: ${q.status}`}
                  />
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#7a7468] pt-2">
              <span>Pendente</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-[#4a4540]" />
                <span className="w-2.5 h-2.5 rounded-[2px] bg-emerald-600" />
                <span className="w-2.5 h-2.5 rounded-[2px] bg-blue-600" />
                <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-600" />
                <span className="w-2.5 h-2.5 rounded-[2px] bg-rose-600" />
              </div>
              <span>Auditadas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
