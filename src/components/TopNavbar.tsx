import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Database, 
  Code2, 
  Users, 
  Layers, 
  LayoutList, 
  CheckSquare, 
  BarChart3, 
  Wifi, 
  ChevronDown,
  Sparkles,
  UserCheck,
  Lock,
  X
} from 'lucide-react';
import { Curator } from '../types/question';

interface TopNavbarProps {
  allowCuratorSwitch?: boolean;
  curators: Curator[];
  activeCurator: Curator;
  onSelectCurator: (curator: Curator) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeView: 'table' | 'detail' | 'cockpit';
  onViewChange: (view: 'table' | 'detail' | 'cockpit') => void;
  onOpenSqlModal: () => void;
  onOpenBatchAssignModal: () => void;
  totalQuestions: number;
  modifiedCount: number;
  onlineCuratorsCount: number;
  onLockSession: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  allowCuratorSwitch = true,
  curators,
  activeCurator,
  onSelectCurator,
  onLockSession,
  searchQuery,
  onSearchChange,
  activeView,
  onViewChange,
  onOpenSqlModal,
  onOpenBatchAssignModal,
  totalQuestions,
  modifiedCount,
}) => {
  const [isCuratorMenuOpen, setIsCuratorMenuOpen] = useState(false);
  const curatorMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (curatorMenuRef.current && !curatorMenuRef.current.contains(e.target as Node)) {
        setIsCuratorMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K or / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCuratorMenuOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-shell/90 backdrop-blur-xl transition-all">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand Logo & Tagline */}
        <div className="order-1 md:order-none flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shadow-[0_0_16px_rgba(164,57,57,0.4)]">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-apex-text">ApexMed</span>
                <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand/20 text-brand-muted border border-brand/30">
                  Curadoria
                </span>
              </div>
              <p className="text-[11px] text-shell-muted hidden sm:block">
                Validação de Questões Médicas & SQL Progressivo
              </p>
            </div>
          </div>
        </div>

        {/* Quick Search Bar */}
        <div className="order-3 basis-full min-w-0 md:order-none md:basis-auto md:flex-1 md:max-w-md md:min-w-[240px]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-shell-muted absolute left-3.5 pointer-events-none" />
            <input
              aria-label="Buscar questões"
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por ID, tema, especialidade ou enunciado... (Ctrl+K)"
              className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-shell-2 border border-white/[0.09] focus:border-brand rounded-full pl-9 pr-10 py-1.5 text-xs text-apex-text placeholder-shell-muted transition-all outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => onSearchChange('')}
                className="absolute right-1.5 flex items-center justify-center w-7 h-7 rounded-full text-xs text-shell-muted hover:text-apex-text"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="order-4 flex items-center bg-shell-2 p-1 rounded-full border border-white/[0.07] md:order-none">
          <button
            onClick={() => onViewChange('table')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full transition-all ${
              activeView === 'table'
                ? 'bg-brand text-white shadow-[0_0_14px_rgba(164,57,57,0.4)]'
                : 'text-apex-readable hover:text-white'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>Tabela</span>
            <span className="text-[10px] opacity-80 font-normal">({totalQuestions})</span>
          </button>

          <button
            onClick={() => onViewChange('detail')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full transition-all ${
              activeView === 'detail'
                ? 'bg-brand text-white shadow-[0_0_14px_rgba(164,57,57,0.4)]'
                : 'text-apex-readable hover:text-white'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Revisar</span>
          </button>

          <button
            onClick={() => onViewChange('cockpit')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full transition-all ${
              activeView === 'cockpit'
                ? 'bg-brand text-white shadow-[0_0_14px_rgba(164,57,57,0.4)]'
                : 'text-apex-readable hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Estatísticas</span>
          </button>
        </div>

        {/* Action Controls & Modal Triggers */}
        <div className="order-2 ml-auto flex items-center gap-2 md:order-none md:ml-0">
          {/* Batch Reserve Button */}
          <button
            onClick={onOpenBatchAssignModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-apex-text bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] transition-all"
            title="Atribuir um lote de questões a você (não impede que outros curadores editem)"
            aria-label="Atribuir lote de questões"
          >
            <Layers className="w-3.5 h-3.5 text-brand-muted" />
            <span>Atribuir lote</span>
          </button>

          {/* Progressive SQL Editor */}
          <button
            onClick={onOpenSqlModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-apex-text bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] relative transition-all cursor-pointer"
            title="Visualizar SQL gerado progressivamente pela curadoria"
          >
            <Code2 className="w-3.5 h-3.5 text-amber-400" />
            <span>SQL</span>
            {modifiedCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold">
                {modifiedCount}
              </span>
            )}
          </button>

          {/* Active Curator Profile Switcher (3 Curators) */}
          <div className="relative" ref={curatorMenuRef}>
            <button
              onClick={() => setIsCuratorMenuOpen(!isCuratorMenuOpen)}
              aria-label={`Menu do curador ${activeCurator.nome}`}
              aria-expanded={isCuratorMenuOpen}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-shell-2 border border-white/[0.1] hover:border-brand transition-all"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                style={{ backgroundColor: activeCurator.avatarCor }}
              >
                {activeCurator.iniciais}
              </div>
              <span className="text-xs font-bold text-apex-text max-w-[100px] truncate hidden lg:inline">
                {activeCurator.nome}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-shell-muted" />
            </button>

            {isCuratorMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-shell-2 border border-white/[0.12] shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-3 py-2 border-b border-white/[0.07] mb-1">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-brand-muted leading-tight">
                    Responsáveis pela curadoria: Patrick, Lucas, Thierry.
                  </p>
                  <p className="text-xs text-shell-muted mt-0.5">Sessão ativa de curadoria</p>
                </div>

                <div className="space-y-1">
                  {(allowCuratorSwitch ? curators : [activeCurator]).map((c) => {
                    const isCurrent = c.id === activeCurator.id;
                    return (
                      <button
                        key={c.id}
                        disabled={!allowCuratorSwitch}
                        onClick={() => {
                          onSelectCurator(c);
                          setIsCuratorMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                          isCurrent
                            ? 'bg-brand/15 border border-brand/40 text-white'
                            : 'hover:bg-white/[0.05] text-apex-readable'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: c.avatarCor }}
                        >
                          {c.iniciais}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-apex-text truncate">{c.nome}</p>
                          <p className="text-[10px] text-shell-muted truncate">{c.cargo}</p>
                        </div>
                        {isCurrent && <UserCheck className="w-4 h-4 text-brand-muted shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 pt-2 border-t border-white/[0.07] px-2 flex flex-col gap-2">
                  <div className="text-[11px] text-shell-muted flex items-center justify-between">
                    <span>Sincronização ao vivo</span>
                    <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold">
                      <Wifi className="w-3 h-3 animate-pulse" /> Ativa
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setIsCuratorMenuOpen(false);
                      onLockSession();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 transition-all cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Bloquear sessão</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
