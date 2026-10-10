import React from 'react';
import { CheckCircle2, Trash2, AlertTriangle, PenTool, Clock } from 'lucide-react';
import { QuestionStatus } from '../types/question';

interface StatusBadgeProps {
  status: QuestionStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const configs: Record<
    QuestionStatus,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    pendente: {
      label: 'Pendente',
      bg: 'rgba(255, 255, 255, 0.05)',
      text: 'var(--warm-muted-readable)',
      border: 'rgba(255, 255, 255, 0.12)',
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    aprovadas: {
      label: 'Aprovada',
      bg: 'rgba(22, 163, 74, 0.15)',
      text: '#4ade80',
      border: 'rgba(22, 163, 74, 0.35)',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
    },
    eliminar_questao: {
      label: 'Eliminar Questão',
      bg: 'rgba(220, 38, 38, 0.15)',
      text: '#f87171',
      border: 'rgba(220, 38, 38, 0.35)',
      icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
    },
    revisar_questao: {
      label: 'Revisar Questão',
      bg: 'rgba(217, 119, 6, 0.15)',
      text: '#fbbf24',
      border: 'rgba(217, 119, 6, 0.35)',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
    },
    questao_corrigida: {
      label: 'Questão Corrigida',
      bg: 'rgba(37, 99, 235, 0.15)',
      text: '#60a5fa',
      border: 'rgba(37, 99, 235, 0.35)',
      icon: <PenTool className="w-3.5 h-3.5 text-blue-400" />,
    },
  };

  const current = configs[status] || configs.pendente;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-bold',
  };

  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-wider rounded-full border transition-all ${sizeClasses[size]}`}
      style={{
        backgroundColor: current.bg,
        color: current.text,
        borderColor: current.border,
      }}
    >
      {showIcon && current.icon}
      <span>{current.label}</span>
    </span>
  );
};
