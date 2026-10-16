import React, { useState, useMemo, useCallback } from 'react';
import { 
  Filter, 
  Layers, 
  Building2, 
  CalendarDays, 
  Stethoscope, 
  Brain, 
  BookOpen, 
  ChevronDown, 
  Check, 
  Search, 
  X, 
  Trash2, 
  Tag, 
  User, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  PenTool, 
  Sparkles 
} from 'lucide-react';
import { Question, Curator, QuestionStatus } from '../types/question';

export const GRANDES_AREAS_MAP: Record<string, string> = {
  'CB': 'Ciclo Básico',
  'CC': 'Clínica Cirúrgica',
  'CM': 'Clínica Médica',
  'GO': 'Ginecologia e Obstetrícia',
  'PED': 'Pediatria',
  'SC': 'Saúde Coletiva',
  'PREV': 'Medicina Preventiva',
  'SM': 'Saúde Mental',
  'CM7p': 'Clínica 7p',
};

export const COMPETENCIA_PRIORITY = ['Epidemiologia', 'Fisiopatologia', 'Diagnóstico', 'Conduta'];
const COMPETENCIA_PRIORITY_MAP = new Map<string, number>(
  COMPETENCIA_PRIORITY.map((v, i) => [v.toLowerCase(), i])
);

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface FilterSectionProps {
  title: string;
  icon: React.ElementType;
  items: FilterOption[];
  selectedItems: string[];
  onToggle: (val: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  enableSearch?: boolean;
}

export const FilterSection = React.memo<FilterSectionProps>(({
  title,
  icon: Icon,
  items,
  selectedItems,
  onToggle,
  isOpen,
  onToggleOpen,
  enableSearch,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const visibleItems = useMemo(() => {
    if (!enableSearch || !searchTerm.trim()) return items;
    const s = searchTerm.toLowerCase().trim();
    return items.filter(opt => opt.label.toLowerCase().includes(s) || opt.value.toLowerCase().includes(s));
  }, [items, searchTerm, enableSearch]);

  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);

  const selectionSummary = selectedItems.length === 0
    ? 'Todas'
    : selectedItems.length === 1
      ? (items.find(o => o.value === selectedItems[0])?.label ?? `${selectedItems.length} selecionado`)
      : `${selectedItems.length} selecionados`;

  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        className="flex min-h-[48px] w-full items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-white/[0.03] text-left cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${selectedItems.length > 0 ? 'text-brand-muted' : 'text-apex-readable'}`} />
          <span className="font-bold text-xs text-apex-text shrink-0">{title}</span>
          {selectedItems.length > 0 && (
            <span className="text-xs bg-brand text-white px-2 py-0.5 rounded-full font-bold shrink-0 shadow-sm">
              {selectedItems.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {!isOpen && (
            <span className="text-xs text-apex-readable truncate max-w-[140px]">
              {selectionSummary}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-apex-readable shrink-0 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-white' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="space-y-2 px-3 pb-3 pt-1 animate-in fade-in duration-150">
          {enableSearch && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-apex-readable absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                aria-label={`Buscar ${title.toLowerCase()}`}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Buscar ${title.toLowerCase()}...`}
                className="w-full bg-shell-2 border border-white/[0.1] rounded-xl pl-8 pr-10 py-1.5 text-xs text-apex-text placeholder:text-apex-readable outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand-muted/60"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpar busca"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full text-xs text-apex-readable hover:text-white"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
            {visibleItems.length === 0 ? (
              <p className="text-xs text-apex-readable text-center py-3">Nenhuma opção encontrada.</p>
            ) : (
              visibleItems.map((opt) => {
                const isSelected = selectedSet.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex min-h-[34px] cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1 transition-all ${
                      isSelected
                        ? 'bg-brand/15 text-white font-bold'
                        : 'text-apex-readable hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(opt.value)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? 'border-brand bg-brand'
                          : 'border-white/[0.2] bg-white/[0.02]'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate text-xs">{opt.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-apex-readable">
                        {opt.count.toLocaleString('pt-BR')}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const STATUS_CHIP_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aprovadas: 'Aprovada',
  eliminar_questao: 'Eliminar Questão',
  revisar_questao: 'Revisar Questão',
  questao_corrigida: 'Questão Corrigida',
};

const RESPONSAVEL_CHIP_LABELS: Record<string, string> = {
  minhas: 'Atribuídas a mim',
  sem_responsavel: 'Não atribuídas',
  patrick: 'Patrick',
  lucas: 'Lucas',
  thierry: 'Thierry',
};

export interface AdvancedFilterState {
  status: string;
  responsavel: string;
  categorias: string[];
  origens: string[];
  anos: string[];
  especialidades: string[];
  competencias: string[];
  temas_especificos: string[];
  searchQueries: string[];
}

interface AdvancedFiltersProps {
  questions: Question[];
  activeCurator: Curator;
  filterState: AdvancedFilterState;
  onChangeFilterState: (newState: AdvancedFilterState) => void;
  totalFilteredCount: number;
}

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  questions,
  activeCurator,
  filterState,
  onChangeFilterState,
  totalFilteredCount,
}) => {
  const [isOpenPanel, setIsOpenPanel] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');

  const toggleSection = (sectionName: string) => {
    setExpandedSection(prev => (prev === sectionName ? null : sectionName));
  };

  // Helper to toggle multi-choice filter arrays
  const toggleArrayFilter = useCallback((key: keyof AdvancedFilterState, value: string) => {
    const current = (filterState[key] as string[]) || [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];

    onChangeFilterState({
      ...filterState,
      [key]: updated,
    });
  }, [filterState, onChangeFilterState]);

  // Keyword query handlers
  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = keywordInput.trim();
    if (!clean) return;
    if (!filterState.searchQueries.includes(clean)) {
      onChangeFilterState({
        ...filterState,
        searchQueries: [...filterState.searchQueries, clean],
      });
    }
    setKeywordInput('');
  };

  const handleRemoveKeyword = (tag: string) => {
    onChangeFilterState({
      ...filterState,
      searchQueries: filterState.searchQueries.filter(t => t !== tag),
    });
  };

  const handleClearAll = () => {
    onChangeFilterState({
      status: 'todas',
      responsavel: 'todos',
      categorias: [],
      origens: [],
      anos: [],
      especialidades: [],
      competencias: [],
      temas_especificos: [],
      searchQueries: [],
    });
  };

  // Build facet counts based on current questions dataset
  const facets = useMemo(() => {
    const catMap = new Map<string, number>();
    const origMap = new Map<string, number>();
    const anoMap = new Map<string, number>();
    const espMap = new Map<string, number>();
    const compMap = new Map<string, number>();
    const temaMap = new Map<string, number>();

    questions.forEach(q => {
      // Categoria / Grande Área
      if (q.categoria) {
        catMap.set(q.categoria, (catMap.get(q.categoria) || 0) + 1);
      }
      // Origem / Banca
      if (q.origem) {
        origMap.set(q.origem, (origMap.get(q.origem) || 0) + 1);
      }
      // Ano
      if (q.ano) {
        anoMap.set(q.ano, (anoMap.get(q.ano) || 0) + 1);
      }
      // Especialidade
      if (q.especialidade) {
        espMap.set(q.especialidade, (espMap.get(q.especialidade) || 0) + 1);
      }
      // Competência
      if (q.competencias) {
        const c = q.competencias.trim();
        compMap.set(c, (compMap.get(c) || 0) + 1);
      }
      // Tema específico
      if (q.tema_especifico) {
        temaMap.set(q.tema_especifico, (temaMap.get(q.tema_especifico) || 0) + 1);
      }
    });

    // Formatter for options
    const categorias: FilterOption[] = Array.from(catMap.entries()).map(([val, count]) => ({
      value: val,
      label: GRANDES_AREAS_MAP[val] || val,
      count,
    })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    const origens: FilterOption[] = Array.from(origMap.entries()).map(([val, count]) => ({
      value: val,
      label: val,
      count,
    })).sort((a, b) => b.count - a.count);

    const anos: FilterOption[] = Array.from(anoMap.entries()).map(([val, count]) => ({
      value: val,
      label: val,
      count,
    })).sort((a, b) => (parseInt(b.value, 10) || 0) - (parseInt(a.value, 10) || 0));

    const especialidades: FilterOption[] = Array.from(espMap.entries()).map(([val, count]) => ({
      value: val,
      label: val,
      count,
    })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    const competencias: FilterOption[] = Array.from(compMap.entries()).map(([val, count]) => ({
      value: val,
      label: val,
      count,
    })).sort((a, b) => {
      const orderA = COMPETENCIA_PRIORITY_MAP.get(a.value.toLowerCase()) ?? 99;
      const orderB = COMPETENCIA_PRIORITY_MAP.get(b.value.toLowerCase()) ?? 99;
      return orderA !== orderB ? orderA - orderB : a.label.localeCompare(b.label, 'pt-BR');
    });

    const temas_especificos: FilterOption[] = Array.from(temaMap.entries()).map(([val, count]) => ({
      value: val,
      label: val,
      count,
    })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    return {
      categorias,
      origens,
      anos,
      especialidades,
      competencias,
      temas_especificos,
    };
  }, [questions]);

  // Applied filter chips list
  const appliedChips = useMemo(() => {
    const list: { key: keyof AdvancedFilterState; value: string; label: string }[] = [];

    // Disciplinas
    filterState.categorias.forEach(v => {
      list.push({ key: 'categorias', value: v, label: `Disciplina: ${GRANDES_AREAS_MAP[v] || v}` });
    });
    // Bancas
    filterState.origens.forEach(v => {
      list.push({ key: 'origens', value: v, label: `Banca: ${v}` });
    });
    // Anos
    filterState.anos.forEach(v => {
      list.push({ key: 'anos', value: v, label: `Ano: ${v}` });
    });
    // Especialidades
    filterState.especialidades.forEach(v => {
      list.push({ key: 'especialidades', value: v, label: `Especialidade: ${v}` });
    });
    // Competências
    filterState.competencias.forEach(v => {
      list.push({ key: 'competencias', value: v, label: `Competência: ${v}` });
    });
    // Temas
    filterState.temas_especificos.forEach(v => {
      list.push({ key: 'temas_especificos', value: v, label: `Tema específico: ${v}` });
    });
    // Status and responsável are single choices, but they narrow the list just as much
    if (filterState.status !== 'todas') {
      list.push({ key: 'status', value: filterState.status, label: `Status: ${STATUS_CHIP_LABELS[filterState.status] ?? filterState.status}` });
    }
    if (filterState.responsavel !== 'todos') {
      list.push({ key: 'responsavel', value: filterState.responsavel, label: `Responsável: ${RESPONSAVEL_CHIP_LABELS[filterState.responsavel] ?? filterState.responsavel}` });
    }
    // Search queries
    filterState.searchQueries.forEach(v => {
      list.push({ key: 'searchQueries', value: v, label: `Busca: "${v}"` });
    });

    return list;
  }, [filterState]);

  // Status and responsável are already among the chips.
  const totalActiveFilterCount = appliedChips.length;

  // Status counts
  const statusCounts = useMemo(() => ({
    todas: questions.length,
    pendente: questions.filter(q => q.status === 'pendente').length,
    aprovadas: questions.filter(q => q.status === 'aprovadas').length,
    eliminar_questao: questions.filter(q => q.status === 'eliminar_questao').length,
    revisar_questao: questions.filter(q => q.status === 'revisar_questao').length,
    questao_corrigida: questions.filter(q => q.status === 'questao_corrigida').length,
  }), [questions]);

  return (
    <div className="w-full space-y-3">
      {/* 1. Main Status & Quick Scope Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-shell-2 p-3 rounded-2xl border border-white/[0.08] shadow-lg">
        {/* Status Chips */}
        <div className="flex flex-nowrap md:flex-wrap items-center gap-1.5 overflow-x-auto md:overflow-visible [&>*]:shrink-0 pb-1 md:pb-0">
          <span className="text-xs uppercase font-bold tracking-wider text-apex-readable mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-brand-muted" />
            Status:
          </span>

          <button
            type="button"
            onClick={() => onChangeFilterState({ ...filterState, status: 'todas' })}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filterState.status === 'todas'
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-apex-readable hover:bg-white/[0.04]'
            }`}
          >
            Todas ({statusCounts.todas})
          </button>

          <button
            type="button"
            onClick={() => onChangeFilterState({ ...filterState, status: 'pendente' })}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filterState.status === 'pendente'
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-apex-readable hover:text-white'
            }`}
          >
            Pendentes ({statusCounts.pendente})
          </button>

          <button
            type="button"
            onClick={() => onChangeFilterState({ ...filterState, status: 'aprovadas' })}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filterState.status === 'aprovadas'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-apex-readable hover:text-emerald-400'
            }`}
          >
            Aprovadas ({statusCounts.aprovadas})
          </button>

          <button
            type="button"
            onClick={() => onChangeFilterState({ ...filterState, status: 'eliminar_questao' })}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filterState.status === 'eliminar_questao'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-apex-readable hover:text-rose-400'
            }`}
          >
            Eliminar ({statusCounts.eliminar_questao})
          </button>

          <button
            type="button"
            onClick={() => onChangeFilterState({ ...filterState, status: 'revisar_questao' })}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filterState.status === 'revisar_questao'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-apex-readable hover:text-amber-400'
            }`}
          >
            Revisar ({statusCounts.revisar_questao})
          </button>

          <button
            type="button"
            onClick={() => onChangeFilterState({ ...filterState, status: 'questao_corrigida' })}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filterState.status === 'questao_corrigida'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-apex-readable hover:text-blue-400'
            }`}
          >
            Corrigidas ({statusCounts.questao_corrigida})
          </button>
        </div>

        {/* Right side controls: Responsável select & Toggle Refinar Filtros button */}
        <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-2">
          {/* Responsável Select */}
          <select
            aria-label="Filtrar por responsável"
            value={filterState.responsavel}
            onChange={(e) => onChangeFilterState({ ...filterState, responsavel: e.target.value })}
            className="col-span-2 md:col-auto w-full md:w-auto min-h-11 md:min-h-0 bg-shell-3 border border-white/[0.1] rounded-xl px-2.5 py-1 text-xs text-apex-text outline-none focus:border-brand cursor-pointer"
          >
            <option value="todos">Todos os Responsáveis</option>
            <option value="minhas">Atribuídas a mim ({activeCurator.nome})</option>
            <option value="sem_responsavel">Não atribuídas (Livres)</option>
            <option value="patrick">Patrick</option>
            <option value="lucas">Lucas</option>
            <option value="thierry">Thierry</option>
          </select>

          {/* Toggle Refinar Filtros Accordion */}
          <button
            type="button"
            onClick={() => setIsOpenPanel(!isOpenPanel)}
            className={`col-span-2 md:col-auto flex items-center justify-center gap-1.5 px-3 py-1 min-h-11 md:min-h-0 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              isOpenPanel || totalActiveFilterCount > 0
                ? 'bg-brand/20 border-brand/50 text-white shadow-sm'
                : 'bg-white/[0.04] border-white/[0.1] text-apex-readable hover:bg-white/[0.08]'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-brand-muted" />
            <span>Refinar Filtros</span>
            {totalActiveFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-brand text-white text-xs flex items-center justify-center font-bold">
                {totalActiveFilterCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isOpenPanel ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* 2. Active Filter Chips Row (if any active filter) */}
      {appliedChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-shell-2/70 p-2.5 rounded-xl border border-white/[0.07] animate-in fade-in">
          <span className="text-xs uppercase font-bold tracking-wider text-apex-readable mr-1 flex items-center gap-1">
            Filtros ativos:
          </span>

          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {appliedChips.map((chip) => (
              <span
                key={`${chip.key}_${chip.value}`}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs text-apex-text font-normal"
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  aria-label={`Remover filtro ${chip.label}`}
                  onClick={() => {
                    if (chip.key === 'searchQueries') {
                      handleRemoveKeyword(chip.value);
                    } else if (chip.key === 'status') {
                      onChangeFilterState({ ...filterState, status: 'todas' });
                    } else if (chip.key === 'responsavel') {
                      onChangeFilterState({ ...filterState, responsavel: 'todos' });
                    } else {
                      toggleArrayFilter(chip.key, chip.value);
                    }
                  }}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-apex-readable hover:text-white hover:bg-white/[0.1] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-1 text-xs font-bold text-brand-muted hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar filtros</span>
          </button>
        </div>
      )}

      {/* 3. Collapsible Refine Filters Panel (Exactly matching FilterScreen) */}
      {isOpenPanel && (
        <div className="bg-shell-2 rounded-2xl border border-white/[0.1] p-4 space-y-4 shadow-2xl animate-in fade-in duration-200">
          {/* Header of Refine Panel with Keyword Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
            <div className="flex items-center gap-2">
              <span className="label-micro">
                Filtros Avançados de Questões
              </span>
              <span className="text-xs text-apex-readable">
                ({totalFilteredCount.toLocaleString('pt-BR')} encontradas)
              </span>
            </div>

            {/* Keyword tag input */}
            <form onSubmit={handleAddKeyword} className="flex items-center gap-2 max-w-sm w-full">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 text-apex-readable absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  aria-label="Buscar palavra-chave"
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Buscar palavra-chave (ex: AVC, choque)..."
                  className="w-full bg-shell-3 border border-white/[0.1] rounded-full pl-8 pr-3 py-1.5 text-xs text-apex-text placeholder:text-apex-readable outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand-muted/60"
                />
              </div>
              <button
                type="submit"
                disabled={!keywordInput.trim()}
                className="px-3 py-1.5 rounded-full text-xs font-bold bg-brand hover:bg-brand-hover disabled:opacity-40 text-white transition-all cursor-pointer shrink-0"
              >
                Adicionar palavra-chave
              </button>
            </form>
          </div>

          {/* Facets Grid: Disciplina, Banca, Ano, Especialidade, Competência, Tema Específico */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* 1. Disciplina / Grande Área */}
            <div className="bg-shell-3 rounded-xl border border-white/[0.07] overflow-hidden">
              <FilterSection
                title="Disciplina / Grande Área"
                icon={Layers}
                items={facets.categorias}
                selectedItems={filterState.categorias}
                onToggle={(v) => toggleArrayFilter('categorias', v)}
                isOpen={expandedSection === 'categorias'}
                onToggleOpen={() => toggleSection('categorias')}
              />
            </div>

            {/* 2. Instituição / Banca */}
            <div className="bg-shell-3 rounded-xl border border-white/[0.07] overflow-hidden">
              <FilterSection
                title="Instituição / Banca"
                icon={Building2}
                items={facets.origens}
                selectedItems={filterState.origens}
                onToggle={(v) => toggleArrayFilter('origens', v)}
                isOpen={expandedSection === 'origens'}
                onToggleOpen={() => toggleSection('origens')}
                enableSearch
              />
            </div>

            {/* 3. Ano */}
            <div className="bg-shell-3 rounded-xl border border-white/[0.07] overflow-hidden">
              <FilterSection
                title="Ano da Prova"
                icon={CalendarDays}
                items={facets.anos}
                selectedItems={filterState.anos}
                onToggle={(v) => toggleArrayFilter('anos', v)}
                isOpen={expandedSection === 'anos'}
                onToggleOpen={() => toggleSection('anos')}
              />
            </div>

            {/* 4. Especialidade */}
            <div className="bg-shell-3 rounded-xl border border-white/[0.07] overflow-hidden">
              <FilterSection
                title="Especialidade"
                icon={Stethoscope}
                items={facets.especialidades}
                selectedItems={filterState.especialidades}
                onToggle={(v) => toggleArrayFilter('especialidades', v)}
                isOpen={expandedSection === 'especialidades'}
                onToggleOpen={() => toggleSection('especialidades')}
                enableSearch
              />
            </div>

            {/* 5. Competência */}
            <div className="bg-shell-3 rounded-xl border border-white/[0.07] overflow-hidden">
              <FilterSection
                title="Competência Clínica"
                icon={Brain}
                items={facets.competencias}
                selectedItems={filterState.competencias}
                onToggle={(v) => toggleArrayFilter('competencias', v)}
                isOpen={expandedSection === 'competencias'}
                onToggleOpen={() => toggleSection('competencias')}
              />
            </div>

            {/* 6. Tema Específico */}
            <div className="bg-shell-3 rounded-xl border border-white/[0.07] overflow-hidden">
              <FilterSection
                title="Tema Específico"
                icon={BookOpen}
                items={facets.temas_especificos}
                selectedItems={filterState.temas_especificos}
                onToggle={(v) => toggleArrayFilter('temas_especificos', v)}
                isOpen={expandedSection === 'temas_especificos'}
                onToggleOpen={() => toggleSection('temas_especificos')}
                enableSearch
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
