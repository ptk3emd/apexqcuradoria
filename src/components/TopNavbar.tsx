import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Database, 
  FileSpreadsheet, 
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
  Lock
} from 'lucide-react';
import { Curator } from '../types/question';

interface TopNavbarProps {
  curators: Curator[];
  activeCurator: Curator;
  onSelectCurator: (curator: Curator) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeView: 'table' | 'detail' | 'cockpit';
  onViewChange: (view: 'table' | 'detail' | 'cockpit') => void;
  onOpenSqlModal: () => void;
  onOpenSheetsModal: () => void;
  onOpenBatchAssignModal: () => void;
  totalQuestions: number;
  modifiedCount: number;
  onlineCuratorsCount: number;
  onLockSession: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  curators,
  activeCurator,
  onSelectCurator,
  onLockSession,
  searchQuery,
  onSearchChange,
  activeView,
  onViewChange,
  onOpenSqlModal,
  onOpenSheetsModal,
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-[#31302e]/90 backdrop-blur-xl transition-all">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#A43939] flex items-center justify-center shadow-[0_0_16px_rgba(164,57,57,0.4)]">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-[#f8fafc]">ApexMed</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#A43939]/20 text-[#DF9696] border border-[#A43939]/30">
                  Curadoria
                </span>
              </div>
              <p className="text-[11px] text-[#7a7468] hidden sm:block">
                Validação de Questões Médicas & SQL Progressivo
              </p>
            </div>
          </div>
        </div>

        {/* Quick Search Bar */}
        <div className="flex-1 max-w-md min-w-[240px]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#7a7468] absolute left-3.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por ID, tema, especialidade ou enunciado... (Ctrl+K)"
              className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-[#1e1d1b] border border-white/[0.09] focus:border-[#A43939] rounded-full pl-9 pr-10 py-1.5 text-xs text-[#f8fafc] placeholder-[#7a7468] transition-all outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 text-xs text-[#7a7468] hover:text-[#f8fafc]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-[#1e1d1b] p-1 rounded-full border border-white/[0.07]">
          <button
            onClick={() => onViewChange('table')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full transition-all ${
              activeView === 'table'
                ? 'bg-[#A43939] text-white shadow-[0_0_14px_rgba(164,57,57,0.4)]'
                : 'text-[#bdbdbd] hover:text-white'
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
                ? 'bg-[#A43939] text-white shadow-[0_0_14px_rgba(164,57,57,0.4)]'
                : 'text-[#bdbdbd] hover:text-white'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>1 a 1</span>
          </button>

          <button
            onClick={() => onViewChange('cockpit')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full transition-all ${
              activeView === 'cockpit'
                ? 'bg-[#A43939] text-white shadow-[0_0_14px_rgba(164,57,57,0.4)]'
                : 'text-[#bdbdbd] hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Cockpit</span>
          </button>
        </div>

        {/* Action Controls & Modal Triggers */}
        <div className="flex items-center gap-2">
          {/* Batch Reserve Button */}
          <button
            onClick={onOpenBatchAssignModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[#f8fafc] bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] transition-all"
            title="Reservar lote de questões para evitar sobreposição"
          >
            <Layers className="w-3.5 h-3.5 text-[#DF9696]" />
            <span className="hidden md:inline">Reservar Lote</span>
          </button>

          {/* Google Sheets Synchronization Hub */}
          <button
            onClick={onOpenSheetsModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border bg-emerald-950/40 border-emerald-600/40 text-emerald-300 hover:bg-emerald-900/50 cursor-pointer shadow-sm"
            title="Sincronização com Google Sheets (Planilha Oficial Ativa)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Google Sheets</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          {/* Progressive SQL Editor */}
          <button
            onClick={onOpenSqlModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[#f8fafc] bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] relative transition-all cursor-pointer"
            title="Visualizar SQL gerado progressivamente pela curadoria"
          >
            <Code2 className="w-3.5 h-3.5 text-amber-400" />
            <span>SQL</span>
            {modifiedCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#A43939] text-white text-[10px] flex items-center justify-center font-bold">
                {modifiedCount}
              </span>
            )}
          </button>

          {/* Active Curator Profile Switcher (3 Curators) */}
          <div className="relative" ref={curatorMenuRef}>
            <button
              onClick={() => setIsCuratorMenuOpen(!isCuratorMenuOpen)}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-[#1e1d1b] border border-white/[0.1] hover:border-[#A43939] transition-all"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                style={{ backgroundColor: activeCurator.avatarCor }}
              >
                {activeCurator.iniciais}
              </div>
              <span className="text-xs font-bold text-[#f8fafc] max-w-[100px] truncate hidden lg:inline">
                {activeCurator.nome}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#7a7468]" />
            </button>

            {isCuratorMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#1e1d1b] border border-white/[0.12] shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-3 py-2 border-b border-white/[0.07] mb-1">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[#DF9696] leading-tight">
                    Responsáveis pela curadoria: Patrick, Lucas, Thierry.
                  </p>
                  <p className="text-xs text-[#7a7468] mt-0.5">Sessão ativa de curadoria</p>
                </div>

                <div className="space-y-1">
                  {curators.map((c) => {
                    const isCurrent = c.id === activeCurator.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          onSelectCurator(c);
                          setIsCuratorMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                          isCurrent
                            ? 'bg-[#A43939]/15 border border-[#A43939]/40 text-white'
                            : 'hover:bg-white/[0.05] text-[#bdbdbd]'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: c.avatarCor }}
                        >
                          {c.iniciais}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[#f8fafc] truncate">{c.nome}</p>
                          <p className="text-[10px] text-[#7a7468] truncate">{c.cargo}</p>
                        </div>
                        {isCurrent && <UserCheck className="w-4 h-4 text-[#DF9696] shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 pt-2 border-t border-white/[0.07] px-2 flex flex-col gap-2">
                  <div className="text-[11px] text-[#7a7468] flex items-center justify-between">
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
                    <span>Bloquear / Trocar de Usuário</span>
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
