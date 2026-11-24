import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  X,
} from 'lucide-react';
import type { AcaoRecord, AtaRecord, SchoolCompliance } from '../../shared/types.ts';
import { normalizeSchoolKey } from '../../shared/analytics.ts';
import {
  downloadExcelXlsx,
  downloadPdfReport,
  downloadSemicolonCsv,
  formatIsoDateBr,
  formatNumberBr,
  formatTimestampBr,
} from '../utils/formatters.ts';

export type ExplorerViewMode = 'schools' | 'atas' | 'acoes';

interface UnifiedExplorerViewProps {
  viewMode: ExplorerViewMode;
  onViewModeChange: (mode: ExplorerViewMode) => void;
  selectedUre: string;
  onSelectUre: (ure: string) => void;
  compliance: SchoolCompliance[];
  atas: AtaRecord[];
  acoes: AcaoRecord[];
}

type SortDir = 'asc' | 'desc';

export const UnifiedExplorerView: React.FC<UnifiedExplorerViewProps> = ({
  viewMode,
  onViewModeChange,
  selectedUre,
  onSelectUre,
  compliance,
  atas,
  acoes,
}) => {
  // Unified single-bar filters (URE first -> Escola second -> View-specific filters)
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'com_registros' | 'sem_atas' | 'sem_acoes'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [subthemeFilter, setSubthemeFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  // Column-click sorting state per view mode
  const [schoolSort, setSchoolSort] = useState<{ key: string; dir: SortDir }>({
    key: 'nomeSed',
    dir: 'asc',
  });
  const [ataSort, setAtaSort] = useState<{ key: string; dir: SortDir }>({
    key: 'dataIso',
    dir: 'desc',
  });
  const [acaoSort, setAcaoSort] = useState<{ key: string; dir: SortDir }>({
    key: 'dataIso',
    dir: 'desc',
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [selectedSchoolCie, setSelectedSchoolCie] = useState<string | null>(null);

  // Ordered school options for the URE currently selected
  const schoolOptions = useMemo(() => {
    return [...compliance]
      .map((c) => c.school.nomeSed)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [compliance]);

  const ataModels = useMemo(
    () => [...new Set(atas.map((a) => a.modeloNormalizado))].sort(),
    [atas]
  );

  const acaoThemes = useMemo(
    () => [...new Set(acoes.map((a) => a.tema).filter(Boolean))].sort(),
    [acoes]
  );

  const acaoSubthemes = useMemo(() => {
    const relevant = categoryFilter === 'all' ? acoes : acoes.filter((a) => a.tema === categoryFilter);
    return [...new Set(relevant.map((a) => a.subtema).filter(Boolean))].sort();
  }, [acoes, categoryFilter]);

  const months = useMemo(() => {
    const set = new Set<string>();
    if (viewMode === 'atas') {
      atas.forEach((a) => a.mesAno && set.add(a.mesAno));
    } else if (viewMode === 'acoes') {
      acoes.forEach((a) => a.mesAno && set.add(a.mesAno));
    }
    return [...set].sort().reverse();
  }, [viewMode, atas, acoes]);

  function toggleSort(mode: ExplorerViewMode, key: string) {
    const toggle = (prev: { key: string; dir: SortDir }) => {
      if (prev.key === key) {
        return { key, dir: (prev.dir === 'asc' ? 'desc' : 'asc') as SortDir };
      }
      const defaultDesc = key === 'totalAtas' || key === 'totalAcoes' || key === 'participantes' || key === 'dataIso' || key === 'latestDate';
      return { key, dir: (defaultDesc ? 'desc' : 'asc') as SortDir };
    };
    if (mode === 'schools') setSchoolSort(toggle);
    else if (mode === 'atas') setAtaSort(toggle);
    else setAcaoSort(toggle);
    setPage(1);
  }

  function renderSortIcon(activeSort: { key: string; dir: SortDir }, colKey: string) {
    if (activeSort.key !== colKey) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
    return activeSort.dir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
    );
  }

  // Filtered + sorted Schools
  const filteredSchools = useMemo(() => {
    if (viewMode !== 'schools') return [];
    const q = searchTerm.trim().toLowerCase();
    const schoolKeyFilter = schoolFilter !== 'all' ? normalizeSchoolKey(schoolFilter) : '';

    const items = compliance.filter((c) => {
      if (schoolKeyFilter && normalizeSchoolKey(c.school.nomeSed) !== schoolKeyFilter) return false;
      if (activityFilter === 'com_registros' && c.totalAtas === 0 && c.totalAcoes === 0) return false;
      if (activityFilter === 'sem_atas' && c.totalAtas > 0) return false;
      if (activityFilter === 'sem_acoes' && c.totalAcoes > 0) return false;
      if (q) {
        const hay = `${c.school.nomeSed} ${c.school.nomePdf} ${c.school.cie} ${c.school.ure}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const mult = schoolSort.dir === 'asc' ? 1 : -1;
    return items.sort((a, b) => {
      const latestA = [a.ultimaAtaData, a.ultimaAcaoData].filter(Boolean).sort().reverse()[0] ?? '';
      const latestB = [b.ultimaAtaData, b.ultimaAcaoData].filter(Boolean).sort().reverse()[0] ?? '';
      switch (schoolSort.key) {
        case 'cie':
          return a.school.cie.localeCompare(b.school.cie) * mult;
        case 'ure':
          return a.school.ure.localeCompare(b.school.ure) * mult;
        case 'totalAtas':
          return (a.totalAtas - b.totalAtas) * mult;
        case 'totalAcoes':
          return (a.totalAcoes - b.totalAcoes) * mult;
        case 'latestDate':
          return latestA.localeCompare(latestB) * mult;
        default:
          return a.school.nomeSed.localeCompare(b.school.nomeSed) * mult;
      }
    });
  }, [viewMode, compliance, schoolFilter, activityFilter, searchTerm, schoolSort]);

  // Filtered + sorted ATAs
  const filteredAtas = useMemo(() => {
    if (viewMode !== 'atas') return [];
    const q = searchTerm.trim().toLowerCase();
    const schoolKeyFilter = schoolFilter !== 'all' ? normalizeSchoolKey(schoolFilter) : '';

    const items = atas.filter((a) => {
      if (schoolKeyFilter && normalizeSchoolKey(a.escola) !== schoolKeyFilter) return false;
      if (categoryFilter !== 'all' && a.modeloNormalizado !== categoryFilter) return false;
      if (monthFilter !== 'all' && a.mesAno !== monthFilter) return false;
      if (q) {
        const text = `${a.diretoria} ${a.escola} ${a.modeloAta} ${a.convocacao} ${a.dataReuniao}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    const mult = ataSort.dir === 'asc' ? 1 : -1;
    return items.sort((a, b) => {
      switch (ataSort.key) {
        case 'diretoria':
          return a.diretoria.localeCompare(b.diretoria) * mult;
        case 'escola':
          return a.escola.localeCompare(b.escola) * mult;
        case 'modeloAta':
          return a.modeloAta.localeCompare(b.modeloAta) * mult;
        case 'convocacao':
          return (a.convocacao || '').localeCompare(b.convocacao || '') * mult;
        case 'participantes':
          return (a.participantes - b.participantes) * mult;
        default:
          return (a.dataIso || '').localeCompare(b.dataIso || '') * mult;
      }
    });
  }, [viewMode, atas, schoolFilter, searchTerm, categoryFilter, monthFilter, ataSort]);

  // Filtered + sorted Ações
  const filteredAcoes = useMemo(() => {
    if (viewMode !== 'acoes') return [];
    const q = searchTerm.trim().toLowerCase();
    const schoolKeyFilter = schoolFilter !== 'all' ? normalizeSchoolKey(schoolFilter) : '';

    const items = acoes.filter((a) => {
      if (schoolKeyFilter && normalizeSchoolKey(a.escola) !== schoolKeyFilter) return false;
      if (categoryFilter !== 'all' && a.tema !== categoryFilter) return false;
      if (subthemeFilter !== 'all' && a.subtema !== subthemeFilter) return false;
      if (monthFilter !== 'all' && a.mesAno !== monthFilter) return false;
      if (q) {
        const text = `${a.diretoria} ${a.escola} ${a.tema} ${a.subtema} ${a.nomeAcao} ${a.proposta}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    const mult = acaoSort.dir === 'asc' ? 1 : -1;
    return items.sort((a, b) => {
      switch (acaoSort.key) {
        case 'diretoria':
          return a.diretoria.localeCompare(b.diretoria) * mult;
        case 'escola':
          return a.escola.localeCompare(b.escola) * mult;
        case 'nomeAcao':
          return a.nomeAcao.localeCompare(b.nomeAcao) * mult;
        case 'tema':
          return `${a.tema} ${a.subtema}`.localeCompare(`${b.tema} ${b.subtema}`) * mult;
        case 'proposta':
          return (a.proposta || '').localeCompare(b.proposta || '') * mult;
        case 'participantes':
          return (a.participantes - b.participantes) * mult;
        default:
          return (a.dataIso || '').localeCompare(b.dataIso || '') * mult;
      }
    });
  }, [viewMode, acoes, schoolFilter, searchTerm, categoryFilter, subthemeFilter, monthFilter, acaoSort]);

  const totalCount =
    viewMode === 'schools'
      ? filteredSchools.length
      : viewMode === 'atas'
        ? filteredAtas.length
        : filteredAcoes.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedSchools = filteredSchools.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pagedAtas = filteredAtas.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pagedAcoes = filteredAcoes.slice((safePage - 1) * pageSize, safePage * pageSize);

  const selectedCompliance = useMemo(
    () => compliance.find((c) => c.school.cie === selectedSchoolCie) ?? null,
    [compliance, selectedSchoolCie]
  );

  const selectedSchoolAtas = useMemo(() => {
    if (!selectedCompliance) return [];
    return atas
      .filter((a) => normalizeSchoolKey(a.escola) === normalizeSchoolKey(selectedCompliance.school.nomeSed))
      .sort((a, b) => (b.dataIso || '').localeCompare(a.dataIso || ''));
  }, [atas, selectedCompliance]);

  const selectedSchoolAcoes = useMemo(() => {
    if (!selectedCompliance) return [];
    return acoes
      .filter((a) => normalizeSchoolKey(a.escola) === normalizeSchoolKey(selectedCompliance.school.nomeSed))
      .sort((a, b) => (b.dataIso || '').localeCompare(a.dataIso || ''));
  }, [acoes, selectedCompliance]);

  function handleSwitchMode(nextMode: ExplorerViewMode) {
    onViewModeChange(nextMode);
    setCategoryFilter('all');
    setSubthemeFilter('all');
    setMonthFilter('all');
    setPage(1);
  }

  function handleResetFilters() {
    onSelectUre('all');
    setSchoolFilter('all');
    setSearchTerm('');
    setActivityFilter('all');
    setCategoryFilter('all');
    setSubthemeFilter('all');
    setMonthFilter('all');
    setPage(1);
  }

  function buildExportDataset(): {
    baseName: string;
    sheetName: string;
    title: string;
    headers: string[];
    rows: (string | number)[][];
  } {
    const dateSuffix = new Date().toISOString().slice(0, 10);
    if (viewMode === 'schools') {
      return {
        baseName: `gremio-estudantil-escolas-${dateSuffix}`,
        sheetName: 'Escolas',
        title: 'Grêmio Estudantil SEDUC-SP — Unidades Escolares',
        headers: ['URE', 'CIE', 'Escola', 'Total ATAs', 'Participantes ATAs', 'Total Ações', 'Estudantes Ações'],
        rows: filteredSchools.map((c) => [
          c.school.ure,
          c.school.cie,
          c.school.nomeSed,
          c.totalAtas,
          c.totalParticipantesAtas,
          c.totalAcoes,
          c.totalParticipantesAcoes,
        ]),
      };
    }
    if (viewMode === 'atas') {
      return {
        baseName: `gremio-estudantil-atas-${dateSuffix}`,
        sheetName: 'ATAs',
        title: 'Grêmio Estudantil SEDUC-SP — ATAs Registradas',
        headers: ['Diretoria', 'Escola', 'Modelo de ATA', 'Participantes', 'Convocação', 'Data da Reunião'],
        rows: filteredAtas.map((a) => [
          a.diretoria,
          a.escola,
          a.modeloAta,
          a.participantes,
          a.convocacao,
          a.dataReuniao,
        ]),
      };
    }
    return {
      baseName: `gremio-estudantil-acoes-${dateSuffix}`,
      sheetName: 'Ações',
      title: 'Grêmio Estudantil SEDUC-SP — Ações do Grêmio',
      headers: ['Diretoria', 'Escola', 'Tema', 'Subtema', 'Nome da Ação', 'Estudantes', 'Data', 'Proposta'],
      rows: filteredAcoes.map((a) => [
        a.diretoria,
        a.escola,
        a.tema,
        a.subtema,
        a.nomeAcao,
        a.participantes,
        a.dataAcao,
        a.proposta,
      ]),
    };
  }

  function handleExportCsv() {
    const ds = buildExportDataset();
    downloadSemicolonCsv(`${ds.baseName}.csv`, ds.headers, ds.rows);
  }

  function handleExportExcel() {
    const ds = buildExportDataset();
    downloadExcelXlsx(`${ds.baseName}.xlsx`, ds.sheetName, ds.headers, ds.rows);
  }

  function handleExportPdf() {
    const ds = buildExportDataset();
    const ureScope = selectedUre === 'all' ? 'Todas as UREs' : `URE ${selectedUre}`;
    const generatedAt = formatTimestampBr(new Date().toISOString());
    downloadPdfReport({
      filename: `${ds.baseName}.pdf`,
      title: ds.title,
      subtitle: `${ureScope} · ${formatNumberBr(ds.rows.length)} registro(s) · Gerado em ${generatedAt}`,
      headers: ds.headers,
      rows: ds.rows,
    });
  }

  const thClass =
    'py-3 px-3.5 border-r border-slate-300 dark:border-slate-800 last:border-r-0 select-none';
  const tdBorder = 'border-r border-slate-300/80 dark:border-slate-800 last:border-r-0';

  return (
    <div className="space-y-4">
      {/* Unified Filter Bar (Starts directly at filters, no title heading, dropdown mode instead of buttons) */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-sm">

        {/* Single Filter Row: 1) Tipo de Consulta (Dropdown) -> 2) Escola -> 3) Contexto (Modelo/Tema/Subtema/Mês) -> Busca */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* 1. VISUALIZAR (Dropdown instead of pill buttons) */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
              Visualizar
            </label>
            <select
              aria-label="Selecionar tipo de consulta"
              value={viewMode}
              onChange={(e) => handleSwitchMode(e.target.value as ExplorerViewMode)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="schools">Escolas ({compliance.length})</option>
              <option value="atas">ATAs ({atas.length})</option>
              <option value="acoes">Ações ({acoes.length})</option>
            </select>
          </div>

          {/* 2. ESCOLA */}
          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
              Unidade Escolar
            </label>
            <select
              aria-label="Filtrar por Escola"
              value={schoolFilter}
              onChange={(e) => {
                setSchoolFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">Todas as escolas ({schoolOptions.length})</option>
              {schoolOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. CONTEXT FILTERS */}
          {viewMode === 'schools' && (
            <>
              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Situação dos Registros
                </label>
                <select
                  aria-label="Filtrar escolas por atividade"
                  value={activityFilter}
                  onChange={(e) => {
                    setActivityFilter(e.target.value as typeof activityFilter);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Todas as unidades</option>
                  <option value="com_registros">Com lançamentos</option>
                  <option value="sem_atas">Sem ATAs registradas</option>
                  <option value="sem_acoes">Sem Ações registradas</option>
                </select>
              </div>
              <div className="lg:col-span-4 relative">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Busca Rápida
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Nome da escola ou código CIE..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </>
          )}

          {viewMode === 'atas' && (
            <>
              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Modelo de ATA
                </label>
                <select
                  aria-label="Filtrar por modelo de ATA"
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Todos os modelos de ATA</option>
                  {ataModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Mês
                </label>
                <select
                  aria-label="Filtrar por mês"
                  value={monthFilter}
                  onChange={(e) => {
                    setMonthFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Todos os meses</option>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Palavra-chave
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </>
          )}

          {viewMode === 'acoes' && (
            <>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Tema
                </label>
                <select
                  aria-label="Filtrar por tema da ação"
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setSubthemeFilter('all');
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Todos os temas</option>
                  {acaoThemes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Subtema
                </label>
                <select
                  aria-label="Filtrar por subtema"
                  value={subthemeFilter}
                  onChange={(e) => {
                    setSubthemeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Todos subtemas</option>
                  {acaoSubthemes.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Mês
                </label>
                <select
                  aria-label="Filtrar por mês"
                  value={monthFilter}
                  onChange={(e) => {
                    setMonthFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Todos</option>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Palavra-chave
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Utility row: Count, 25/50/100 page size selector, and CSV / Excel / PDF exports */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatNumberBr(totalCount)} registro(s) localizado(s)
            </span>
            <span className="hidden md:inline text-slate-500 dark:text-slate-400">
              · Clique no título da coluna para ordenar
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mr-1">
              <span>Exibir:</span>
              <select
                aria-label="Registros por página"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Data Table Card with Crisp Light Mode Column & Row Borders and Clickable Column Sorting */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        {totalCount === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Nenhum registro localizado com os filtros atuais
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-2 inline-flex px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {viewMode === 'schools' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 dark:border-slate-700 bg-slate-200/75 dark:bg-slate-950/70 text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('schools', 'cie')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        CIE {renderSortIcon(schoolSort, 'cie')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('schools', 'nomeSed')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Unidade Escolar {renderSortIcon(schoolSort, 'nomeSed')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('schools', 'ure')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        URE {renderSortIcon(schoolSort, 'ure')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => toggleSort('schools', 'totalAtas')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        ATAs {renderSortIcon(schoolSort, 'totalAtas')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => toggleSort('schools', 'totalAcoes')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Ações {renderSortIcon(schoolSort, 'totalAcoes')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => toggleSort('schools', 'latestDate')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Último Lançamento {renderSortIcon(schoolSort, 'latestDate')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300/80 dark:divide-slate-800 text-sm">
                  {pagedSchools.map((c) => {
                    const latestDate =
                      [c.ultimaAtaData, c.ultimaAcaoData]
                        .filter((d): d is string => Boolean(d))
                        .sort()
                        .reverse()[0] ?? null;

                    return (
                      <tr
                        key={c.school.cie}
                        onClick={() => setSelectedSchoolCie(c.school.cie)}
                        className="cursor-pointer even:bg-slate-50/75 dark:even:bg-slate-900/40 hover:bg-blue-50/80 dark:hover:bg-slate-800/70 transition-colors"
                      >
                        <td className={`py-3 px-3.5 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                          {c.school.cie}
                        </td>
                        <td className={`py-3 px-3.5 font-semibold text-slate-900 dark:text-slate-100 ${tdBorder}`}>
                          {c.school.nomeSed}
                        </td>
                        <td className={`py-3 px-3.5 text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                          {c.school.ure}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 ${tdBorder}`}>
                          {c.totalAtas}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 ${tdBorder}`}>
                          {c.totalAcoes}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                          {formatIsoDateBr(latestDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {viewMode === 'atas' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 dark:border-slate-700 bg-slate-200/75 dark:bg-slate-950/70 text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('atas', 'diretoria')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        URE {renderSortIcon(ataSort, 'diretoria')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('atas', 'escola')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Escola {renderSortIcon(ataSort, 'escola')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('atas', 'modeloAta')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Modelo de ATA {renderSortIcon(ataSort, 'modeloAta')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('atas', 'convocacao')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Convocação {renderSortIcon(ataSort, 'convocacao')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => toggleSort('atas', 'participantes')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Participantes {renderSortIcon(ataSort, 'participantes')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => toggleSort('atas', 'dataIso')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Data {renderSortIcon(ataSort, 'dataIso')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300/80 dark:divide-slate-800 text-sm">
                  {pagedAtas.map((ata) => (
                    <tr
                      key={ata.id}
                      className="even:bg-slate-100/70 dark:even:bg-slate-900/40 hover:bg-blue-50/80 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <td className={`py-3 px-3.5 text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                        {ata.diretoria}
                      </td>
                      <td className={`py-3 px-3.5 font-semibold text-slate-900 dark:text-slate-100 ${tdBorder}`}>
                        {ata.escola}
                      </td>
                      <td className={`py-3 px-3.5 text-slate-800 dark:text-slate-200 ${tdBorder}`}>
                        {ata.modeloAta}
                      </td>
                      <td className={`py-3 px-3.5 text-slate-700 dark:text-slate-400 ${tdBorder}`}>
                        {ata.convocacao || '—'}
                      </td>
                      <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 ${tdBorder}`}>
                        {formatNumberBr(ata.participantes)}
                      </td>
                      <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                        {ata.dataReuniao}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {viewMode === 'acoes' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 dark:border-slate-700 bg-slate-200/75 dark:bg-slate-950/70 text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('acoes', 'diretoria')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        URE {renderSortIcon(acaoSort, 'diretoria')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('acoes', 'escola')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Escola {renderSortIcon(acaoSort, 'escola')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('acoes', 'nomeAcao')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Nome da Ação {renderSortIcon(acaoSort, 'nomeAcao')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('acoes', 'tema')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Tema / Subtema {renderSortIcon(acaoSort, 'tema')}
                      </button>
                    </th>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => toggleSort('acoes', 'proposta')}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Proposta {renderSortIcon(acaoSort, 'proposta')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => toggleSort('acoes', 'participantes')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Alunos {renderSortIcon(acaoSort, 'participantes')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => toggleSort('acoes', 'dataIso')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Data {renderSortIcon(acaoSort, 'dataIso')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300/80 dark:divide-slate-800 text-sm">
                  {pagedAcoes.map((acao) => (
                    <tr
                      key={acao.id}
                      className="even:bg-slate-100/70 dark:even:bg-slate-900/40 hover:bg-blue-50/80 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <td className={`py-3 px-3.5 text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                        {acao.diretoria}
                      </td>
                      <td className={`py-3 px-3.5 font-semibold text-slate-900 dark:text-slate-100 ${tdBorder}`}>
                        {acao.escola}
                      </td>
                      <td className={`py-3 px-3.5 text-slate-900 dark:text-slate-100 ${tdBorder}`}>
                        {acao.nomeAcao}
                      </td>
                      <td className={`py-3 px-3.5 ${tdBorder}`}>
                        <div className="text-slate-900 dark:text-slate-200 font-medium">{acao.tema}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          {acao.subtema || '—'}
                        </div>
                      </td>
                      <td className={`py-3 px-3.5 text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                        {acao.proposta}
                      </td>
                      <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 ${tdBorder}`}>
                        {formatNumberBr(acao.participantes)}
                      </td>
                      <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                        {acao.dataAcao}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3.5 border-t border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-sm">
            <span className="text-slate-700 dark:text-slate-300 tabular-nums font-medium">
              Página {safePage} de {totalPages} ({formatNumberBr(totalCount)} itens)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Public School Detail Drawer (No email, no distrito, no ensino, no metas) */}
      {selectedCompliance && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="school-drawer-title"
          onClick={() => setSelectedSchoolCie(null)}
        >
          <div
            className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 border-l border-slate-300 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  URE {selectedCompliance.school.ure} · CIE {selectedCompliance.school.cie}
                </div>
                <h3
                  id="school-drawer-title"
                  className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1"
                >
                  {selectedCompliance.school.nomeSed}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSchoolCie(null)}
                aria-label="Fechar detalhes da escola"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    ATAs Registradas
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                    {selectedCompliance.totalAtas}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                    {formatNumberBr(selectedCompliance.totalParticipantesAtas)} participantes
                  </div>
                </div>
                <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Ações Realizadas
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                    {selectedCompliance.totalAcoes}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                    {formatNumberBr(selectedCompliance.totalParticipantesAcoes)} alunos
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  ATAs Registradas ({selectedSchoolAtas.length})
                </h4>
                {selectedSchoolAtas.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma ATA registrada até o momento.
                  </p>
                ) : (
                  <div className="border border-slate-300 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                    {selectedSchoolAtas.map((ata) => (
                      <div key={ata.id} className="p-3 text-sm flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {ata.modeloAta}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            Convocação: {ata.convocacao || '—'}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-xs text-slate-700 dark:text-slate-300">
                            {ata.dataReuniao}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                            {ata.participantes} part.
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Ações Realizadas ({selectedSchoolAcoes.length})
                </h4>
                {selectedSchoolAcoes.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma ação registrada até o momento.
                  </p>
                ) : (
                  <div className="border border-slate-300 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                    {selectedSchoolAcoes.map((acao) => (
                      <div key={acao.id} className="p-3 text-sm flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {acao.nomeAcao}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            {acao.tema} · {acao.subtema || 'Geral'} · {acao.proposta}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-xs text-slate-700 dark:text-slate-300">
                            {acao.dataAcao}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                            {acao.participantes} alunos
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
