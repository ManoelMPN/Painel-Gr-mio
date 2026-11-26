import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
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
  downloadSchoolDetailPdf,
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
  isAuthenticated: boolean;
}

type SortDir = 'asc' | 'desc';
type PresenceFilter = 'records' | 'all_schools' | 'with_record' | 'without_record';

interface SchoolComparisonRow {
  compliance: SchoolCompliance;
  matchedCount: number;
  matchedParticipants: number;
  latestMatchDate: string | null;
  hasRecord: boolean;
}

export const UnifiedExplorerView: React.FC<UnifiedExplorerViewProps> = ({
  viewMode,
  onViewModeChange,
  selectedUre,
  onSelectUre,
  compliance,
  atas,
  acoes,
  isAuthenticated,
}) => {
  // Unified filter bar state (Escola -> Registro -> Tipo/Tema/Subtema -> Com/Sem Registro -> Mês -> Busca Rápida)
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [subthemeFilter, setSubthemeFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all_schools');

  // Column-click sorting state per table mode
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

  const prevViewModeRef = useRef<ExplorerViewMode>(viewMode);
  const skipNextViewSyncRef = useRef(false);

  // Sync external viewMode changes (e.g. header nav or overview cards)
  useEffect(() => {
    if (prevViewModeRef.current === viewMode) return;
    prevViewModeRef.current = viewMode;
    if (skipNextViewSyncRef.current) {
      skipNextViewSyncRef.current = false;
      return;
    }
    setCategoryFilter('all');
    setSubthemeFilter('all');
    setMonthFilter('all');
    setPresenceFilter(viewMode === 'schools' ? 'all_schools' : 'records');
    setPage(1);
  }, [viewMode]);

  // Effective presence mode: 'schools' view cannot be in 'records' mode
  const effectivePresence: PresenceFilter =
    viewMode === 'schools' && presenceFilter === 'records' ? 'all_schools' : presenceFilter;
  const isSchoolTableMode = viewMode === 'schools' || effectivePresence !== 'records';

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

  useEffect(() => {
    setPage(1);
  }, [selectedUre]);

  useEffect(() => {
    if (
      schoolFilter !== 'all' &&
      !schoolOptions.some((name) => normalizeSchoolKey(name) === normalizeSchoolKey(schoolFilter))
    ) {
      setSchoolFilter('all');
    }
  }, [schoolFilter, schoolOptions]);

  useEffect(() => {
    if (viewMode === 'atas' && categoryFilter !== 'all' && !ataModels.includes(categoryFilter)) {
      setCategoryFilter('all');
    } else if (viewMode === 'acoes') {
      if (categoryFilter !== 'all' && !acaoThemes.includes(categoryFilter)) {
        setCategoryFilter('all');
        setSubthemeFilter('all');
      } else if (subthemeFilter !== 'all' && !acaoSubthemes.includes(subthemeFilter)) {
        setSubthemeFilter('all');
      }
    }
  }, [viewMode, categoryFilter, subthemeFilter, ataModels, acaoThemes, acaoSubthemes]);

  function toggleSort(mode: ExplorerViewMode, key: string) {
    const toggle = (prev: { key: string; dir: SortDir }) => {
      if (prev.key === key) {
        return { key, dir: (prev.dir === 'asc' ? 'desc' : 'asc') as SortDir };
      }
      const defaultDesc =
        key === 'totalAtas' ||
        key === 'totalAcoes' ||
        key === 'matchedCount' ||
        key === 'matchedParticipants' ||
        key === 'participantes' ||
        key === 'dataIso' ||
        key === 'latestDate';
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

  // Base ATAs / Ações filtered by Category (Modelo / Tema), Subtema, and Mês (before school/search filter)
  const baseCategoryAtas = useMemo(() => {
    if (viewMode !== 'atas') return [];
    return atas.filter(
      (a) =>
        (categoryFilter === 'all' || a.modeloNormalizado === categoryFilter) &&
        (monthFilter === 'all' || a.mesAno === monthFilter)
    );
  }, [viewMode, atas, categoryFilter, monthFilter]);

  const baseCategoryAcoes = useMemo(() => {
    if (viewMode !== 'acoes') return [];
    return acoes.filter(
      (a) =>
        (categoryFilter === 'all' || a.tema === categoryFilter) &&
        (subthemeFilter === 'all' || a.subtema === subthemeFilter) &&
        (monthFilter === 'all' || a.mesAno === monthFilter)
    );
  }, [viewMode, acoes, categoryFilter, subthemeFilter, monthFilter]);

  // Comparison rows against the FULL school list (all 104 schools in URE Sul 3 or active URE)
  const schoolComparisonBase = useMemo<SchoolComparisonRow[]>(() => {
    if (viewMode === 'atas') {
      const grouped = new Map<string, AtaRecord[]>();
      for (const ata of baseCategoryAtas) {
        const key = normalizeSchoolKey(ata.escola);
        const list = grouped.get(key) ?? [];
        list.push(ata);
        grouped.set(key, list);
      }
      return compliance.map((c) => {
        const list = grouped.get(normalizeSchoolKey(c.school.nomeSed)) ?? [];
        const latest =
          list
            .map((a) => a.dataIso)
            .filter(Boolean)
            .sort()
            .reverse()[0] ?? null;
        return {
          compliance: c,
          matchedCount: list.length,
          matchedParticipants: list.reduce((sum, a) => sum + (a.participantes || 0), 0),
          latestMatchDate: latest,
          hasRecord: list.length > 0,
        };
      });
    }

    if (viewMode === 'acoes') {
      const grouped = new Map<string, AcaoRecord[]>();
      for (const acao of baseCategoryAcoes) {
        const key = normalizeSchoolKey(acao.escola);
        const list = grouped.get(key) ?? [];
        list.push(acao);
        grouped.set(key, list);
      }
      return compliance.map((c) => {
        const list = grouped.get(normalizeSchoolKey(c.school.nomeSed)) ?? [];
        const latest =
          list
            .map((a) => a.dataIso)
            .filter(Boolean)
            .sort()
            .reverse()[0] ?? null;
        return {
          compliance: c,
          matchedCount: list.length,
          matchedParticipants: list.reduce((sum, a) => sum + (a.participantes || 0), 0),
          latestMatchDate: latest,
          hasRecord: list.length > 0,
        };
      });
    }

    // Default 'schools' ('Todos') mode: compare general presence (ATAs + Ações)
    return compliance.map((c) => {
      const total = c.totalAtas + c.totalAcoes;
      const latest =
        [c.ultimaAtaData, c.ultimaAcaoData]
          .filter((d): d is string => Boolean(d))
          .sort()
          .reverse()[0] ?? null;
      return {
        compliance: c,
        matchedCount: total,
        matchedParticipants: c.totalParticipantesAtas + c.totalParticipantesAcoes,
        latestMatchDate: latest,
        hasRecord: total > 0,
      };
    });
  }, [viewMode, compliance, baseCategoryAtas, baseCategoryAcoes]);

  // Network-wide counts for the active filter (for dropdown labels and summary banner)
  const comparisonTotals = useMemo(() => {
    const totalSchools = schoolComparisonBase.length;
    const withRecord = schoolComparisonBase.filter((r) => r.hasRecord).length;
    const withoutRecord = totalSchools - withRecord;
    const launches =
      viewMode === 'atas'
        ? baseCategoryAtas.length
        : viewMode === 'acoes'
          ? baseCategoryAcoes.length
          : atas.length + acoes.length;
    return { totalSchools, withRecord, withoutRecord, launches };
  }, [schoolComparisonBase, viewMode, baseCategoryAtas, baseCategoryAcoes, atas.length, acoes.length]);

  // Filtered + sorted School comparison list
  const filteredComparisonSchools = useMemo(() => {
    if (!isSchoolTableMode) return [];
    const q = searchTerm.trim().toLowerCase();
    const schoolKeyFilter = schoolFilter !== 'all' ? normalizeSchoolKey(schoolFilter) : '';

    const items = schoolComparisonBase.filter((row) => {
      const c = row.compliance;
      const schoolKey = normalizeSchoolKey(c.school.nomeSed);
      if (schoolKeyFilter && schoolKey !== schoolKeyFilter) return false;
      if (effectivePresence === 'with_record' && !row.hasRecord) return false;
      if (effectivePresence === 'without_record' && row.hasRecord) return false;

      if (q) {
        const hay = `${c.school.nomeSed} ${c.school.nomePdf} ${c.school.cie} ${c.school.ure}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const mult = schoolSort.dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      switch (schoolSort.key) {
        case 'cie':
          return a.compliance.school.cie.localeCompare(b.compliance.school.cie) * mult;
        case 'ure':
          return a.compliance.school.ure.localeCompare(b.compliance.school.ure) * mult;
        case 'matchedCount':
          return (a.matchedCount - b.matchedCount) * mult;
        case 'matchedParticipants':
          return (a.matchedParticipants - b.matchedParticipants) * mult;
        case 'totalAtas':
          return (a.compliance.totalAtas - b.compliance.totalAtas) * mult;
        case 'totalAcoes':
          return (a.compliance.totalAcoes - b.compliance.totalAcoes) * mult;
        case 'latestDate':
          return (a.latestMatchDate ?? '').localeCompare(b.latestMatchDate ?? '') * mult;
        default:
          return a.compliance.school.nomeSed.localeCompare(b.compliance.school.nomeSed) * mult;
      }
    });
  }, [isSchoolTableMode, schoolComparisonBase, schoolFilter, effectivePresence, searchTerm, schoolSort]);

  // Filtered + sorted ATAs (individual launches mode)
  const filteredAtas = useMemo(() => {
    if (viewMode !== 'atas' || isSchoolTableMode) return [];
    const q = searchTerm.trim().toLowerCase();
    const schoolKeyFilter = schoolFilter !== 'all' ? normalizeSchoolKey(schoolFilter) : '';

    const items = baseCategoryAtas.filter((a) => {
      if (schoolKeyFilter && normalizeSchoolKey(a.escola) !== schoolKeyFilter) return false;
      if (q) {
        const text = `${a.diretoria} ${a.escola} ${a.modeloAta} ${a.convocacao} ${a.dataReuniao}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    const mult = ataSort.dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
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
  }, [viewMode, isSchoolTableMode, baseCategoryAtas, schoolFilter, searchTerm, ataSort]);

  // Filtered + sorted Ações (individual launches mode)
  const filteredAcoes = useMemo(() => {
    if (viewMode !== 'acoes' || isSchoolTableMode) return [];
    const q = searchTerm.trim().toLowerCase();
    const schoolKeyFilter = schoolFilter !== 'all' ? normalizeSchoolKey(schoolFilter) : '';

    const items = baseCategoryAcoes.filter((a) => {
      if (schoolKeyFilter && normalizeSchoolKey(a.escola) !== schoolKeyFilter) return false;
      if (q) {
        const text = `${a.diretoria} ${a.escola} ${a.tema} ${a.subtema} ${a.nomeAcao} ${a.proposta}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    const mult = acaoSort.dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
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
  }, [viewMode, isSchoolTableMode, baseCategoryAcoes, schoolFilter, searchTerm, acaoSort]);

  const totalCount = isSchoolTableMode
    ? filteredComparisonSchools.length
    : viewMode === 'atas'
      ? filteredAtas.length
      : filteredAcoes.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedComparisonSchools = filteredComparisonSchools.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );
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

  function handleRecordFilterChange(nextRecord: 'all' | 'ata' | 'acao') {
    const nextMode: ExplorerViewMode =
      nextRecord === 'all' ? 'schools' : nextRecord === 'ata' ? 'atas' : 'acoes';
    if (nextMode !== viewMode) {
      skipNextViewSyncRef.current = true;
      onViewModeChange(nextMode);
    }
    setCategoryFilter('all');
    setSubthemeFilter('all');
    setMonthFilter('all');
    // Preserve 'with_record' / 'without_record' if user is actively comparing schools across types
    setPresenceFilter((prev) => {
      if (nextMode === 'schools') {
        return prev === 'with_record' || prev === 'without_record' ? prev : 'all_schools';
      }
      return prev === 'with_record' || prev === 'without_record' || prev === 'all_schools'
        ? prev
        : 'records';
    });
    setPage(1);
  }

  function handleResetFilters() {
    onSelectUre('all');
    setSchoolFilter('all');
    setSearchTerm('');
    setCategoryFilter('all');
    setSubthemeFilter('all');
    setMonthFilter('all');
    setPresenceFilter(viewMode === 'schools' ? 'all_schools' : 'records');
    setPage(1);
  }

  function describeActiveFilter(): string {
    const parts: string[] = [];
    if (viewMode === 'atas') {
      parts.push(categoryFilter === 'all' ? 'Todas as ATAs' : `ATA: ${categoryFilter}`);
    } else if (viewMode === 'acoes') {
      if (categoryFilter !== 'all') parts.push(`Tema: ${categoryFilter}`);
      else parts.push('Todas as Ações');
      if (subthemeFilter !== 'all') parts.push(`Subtema: ${subthemeFilter}`);
    } else {
      parts.push('Geral (ATAs e Ações)');
    }
    if (monthFilter !== 'all') parts.push(`Mês: ${monthFilter}`);
    if (effectivePresence === 'with_record') parts.push('Somente escolas com registro');
    else if (effectivePresence === 'without_record') parts.push('Somente escolas sem registro');
    else if (effectivePresence === 'all_schools' && viewMode !== 'schools') {
      parts.push('Comparativo completo das escolas');
    }
    return parts.join(' · ');
  }

  function buildExportDataset(): {
    baseName: string;
    sheetName: string;
    title: string;
    headers: string[];
    rows: (string | number)[][];
  } {
    const dateSuffix = new Date().toISOString().slice(0, 10);

    if (isSchoolTableMode) {
      if (viewMode === 'schools') {
        return {
          baseName: `gremio-estudantil-escolas-${dateSuffix}`,
          sheetName: 'Escolas',
          title: 'Grêmio Estudantil SEDUC-SP — Comparativo de Unidades Escolares',
          headers: [
            'URE',
            'CIE',
            'Escola',
            'Situação',
            'Total ATAs',
            'Participantes ATAs',
            'Total Ações',
            'Estudantes Ações',
          ],
          rows: filteredComparisonSchools.map((r) => [
            r.compliance.school.ure,
            r.compliance.school.cie,
            r.compliance.school.nomeSed,
            r.hasRecord ? 'Com registro' : 'Sem registro',
            r.compliance.totalAtas,
            r.compliance.totalParticipantesAtas,
            r.compliance.totalAcoes,
            r.compliance.totalParticipantesAcoes,
          ]),
        };
      }

      const isAta = viewMode === 'atas';
      return {
        baseName: `gremio-estudantil-comparativo-${isAta ? 'atas' : 'acoes'}-${dateSuffix}`,
        sheetName: isAta ? 'Comparativo ATAs' : 'Comparativo Ações',
        title: `Grêmio Estudantil SEDUC-SP — Comparativo por Escola (${isAta ? 'ATAs' : 'Ações'})`,
        headers: [
          'URE',
          'CIE',
          'Escola',
          'Situação no Filtro',
          isAta ? 'ATAs no Filtro' : 'Ações no Filtro',
          isAta ? 'Participantes (Filtro)' : 'Estudantes (Filtro)',
          isAta ? 'Total Geral de ATAs' : 'Total Geral de Ações',
          'Último Lançamento (Filtro)',
        ],
        rows: filteredComparisonSchools.map((r) => [
          r.compliance.school.ure,
          r.compliance.school.cie,
          r.compliance.school.nomeSed,
          r.hasRecord ? 'Com registro' : 'Sem registro',
          r.matchedCount,
          r.matchedParticipants,
          isAta ? r.compliance.totalAtas : r.compliance.totalAcoes,
          formatIsoDateBr(r.latestMatchDate),
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
    const filterContext = describeActiveFilter();
    const generatedAt = formatTimestampBr(new Date().toISOString());
    downloadPdfReport({
      filename: `${ds.baseName}.pdf`,
      title: ds.title,
      subtitle: `${ureScope} · ${filterContext} · ${formatNumberBr(ds.rows.length)} registro(s) · Gerado em ${generatedAt}`,
      headers: ds.headers,
      rows: ds.rows,
    });
  }

  const thClass =
    'py-3 px-3.5 border-r border-slate-300 dark:border-slate-800 last:border-r-0 select-none';
  const tdBorder = 'border-r border-slate-300/80 dark:border-slate-800 last:border-r-0';

  const currentRecordValue: 'all' | 'ata' | 'acao' =
    viewMode === 'atas' ? 'ata' : viewMode === 'acoes' ? 'acao' : 'all';

  return (
    <div className="space-y-4">
      {/* Unified Filter Bar (Starts directly at filters, dropdown controls only) */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* 1. UNIDADE ESCOLAR */}
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

          {/* 2. REGISTRO (Todos | ATA | Ações) */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
              Registro
            </label>
            <select
              aria-label="Filtrar por tipo de registro"
              value={currentRecordValue}
              onChange={(e) => handleRecordFilterChange(e.target.value as 'all' | 'ata' | 'acao')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">Todos ({compliance.length} escolas)</option>
              <option value="ata">ATA ({atas.length})</option>
              <option value="acao">Ações ({acoes.length})</option>
            </select>
          </div>

          {/* 3. CONTEXT FILTERS */}
          {viewMode === 'schools' && (
            <>
              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Tipo de ATA / Ação
                </label>
                <select
                  aria-label="Filtrar por tipo de ATA ou ação"
                  value="all"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('ata::')) {
                      skipNextViewSyncRef.current = true;
                      onViewModeChange('atas');
                      setCategoryFilter(val.slice(5));
                      setSubthemeFilter('all');
                      setMonthFilter('all');
                      setPresenceFilter((prev) =>
                        prev === 'with_record' || prev === 'without_record' ? prev : 'records'
                      );
                      setPage(1);
                    } else if (val.startsWith('acao::')) {
                      skipNextViewSyncRef.current = true;
                      onViewModeChange('acoes');
                      setCategoryFilter(val.slice(6));
                      setSubthemeFilter('all');
                      setMonthFilter('all');
                      setPresenceFilter((prev) =>
                        prev === 'with_record' || prev === 'without_record' ? prev : 'records'
                      );
                      setPage(1);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Todos os tipos</option>
                  <optgroup label="Modelos de ATA">
                    {ataModels.map((m) => (
                      <option key={`ata-${m}`} value={`ata::${m}`}>
                        {m}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Temas de Ação">
                    {acaoThemes.map((t) => (
                      <option key={`acao-${t}`} value={`acao::${t}`}>
                        {t}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Com / Sem Registro
                </label>
                <select
                  aria-label="Comparar escolas com ou sem registro"
                  value={effectivePresence}
                  onChange={(e) => {
                    setPresenceFilter(e.target.value as PresenceFilter);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all_schools">
                    Todas ({comparisonTotals.totalSchools})
                  </option>
                  <option value="with_record">
                    Com registro ({comparisonTotals.withRecord})
                  </option>
                  <option value="without_record">
                    Sem registro ({comparisonTotals.withoutRecord})
                  </option>
                </select>
              </div>

              <div className="lg:col-span-2 relative">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Busca Rápida
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Escola ou CIE..."
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
              <div className="lg:col-span-4">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Tipo de ATA
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

              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Com / Sem Registro (Escolas)
                </label>
                <select
                  aria-label="Comparar escolas com ou sem registro de ATA"
                  value={effectivePresence}
                  onChange={(e) => {
                    setPresenceFilter(e.target.value as PresenceFilter);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="records">
                    Lançamentos ({comparisonTotals.launches})
                  </option>
                  <option value="all_schools">
                    Todas as escolas ({comparisonTotals.totalSchools})
                  </option>
                  <option value="with_record">
                    Com registro ({comparisonTotals.withRecord})
                  </option>
                  <option value="without_record">
                    Sem registro ({comparisonTotals.withoutRecord})
                  </option>
                </select>
              </div>

              <div className="lg:col-span-3">
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

              <div className="lg:col-span-9">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Busca Rápida
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Buscar por escola, CIE, modelo de ATA ou convocação..."
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
              <div className="lg:col-span-4">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Tipo de Ação (Tema)
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

              <div className="lg:col-span-3">
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
                  <option value="all">Todos os subtemas</option>
                  {acaoSubthemes.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-4">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Com / Sem Registro (Escolas)
                </label>
                <select
                  aria-label="Comparar escolas com ou sem registro de Ação"
                  value={effectivePresence}
                  onChange={(e) => {
                    setPresenceFilter(e.target.value as PresenceFilter);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="records">
                    Lançamentos ({comparisonTotals.launches})
                  </option>
                  <option value="all_schools">
                    Todas as escolas ({comparisonTotals.totalSchools})
                  </option>
                  <option value="with_record">
                    Com registro ({comparisonTotals.withRecord})
                  </option>
                  <option value="without_record">
                    Sem registro ({comparisonTotals.withoutRecord})
                  </option>
                </select>
              </div>

              <div className="lg:col-span-3">
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

              <div className="lg:col-span-5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-300 mb-1">
                  Busca Rápida
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Buscar por escola, CIE, ação, tema ou subtema..."
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

        {/* Utility row: Live Network Comparison Summary, Count, 25/50/100 page size selector, and CSV / Excel / PDF exports */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatNumberBr(totalCount)} registro(s) exibido(s)
            </span>
            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
              · {formatNumberBr(comparisonTotals.withRecord)} de {formatNumberBr(comparisonTotals.totalSchools)} escolas com registro ·{' '}
              {formatNumberBr(comparisonTotals.withoutRecord)} sem registro
              {viewMode !== 'schools' && ` · ${formatNumberBr(comparisonTotals.launches)} lançamento(s)`}
            </span>
            <span className="hidden xl:inline text-slate-500 dark:text-slate-400">
              · Clique no título da coluna para ordenar
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
            {isSchoolTableMode && viewMode === 'schools' && (
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
                  {pagedComparisonSchools.map((row) => {
                    const c = row.compliance;
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
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums font-semibold ${c.totalAtas > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'} ${tdBorder}`}>
                          {c.totalAtas}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums font-semibold ${c.totalAcoes > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'} ${tdBorder}`}>
                          {c.totalAcoes}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                          {formatIsoDateBr(row.latestMatchDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {isSchoolTableMode && (viewMode === 'atas' || viewMode === 'acoes') && (
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
                        onClick={() => toggleSort('schools', 'matchedCount')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        {viewMode === 'atas' ? 'ATAs no Filtro' : 'Ações no Filtro'}{' '}
                        {renderSortIcon(schoolSort, 'matchedCount')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() => toggleSort('schools', 'matchedParticipants')}
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        {viewMode === 'atas' ? 'Participantes' : 'Alunos'}{' '}
                        {renderSortIcon(schoolSort, 'matchedParticipants')}
                      </button>
                    </th>
                    <th className={`${thClass} text-right`}>
                      <button
                        type="button"
                        onClick={() =>
                          toggleSort('schools', viewMode === 'atas' ? 'totalAtas' : 'totalAcoes')
                        }
                        className="inline-flex items-center justify-end gap-1.5 w-full hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        {viewMode === 'atas' ? 'Total ATAs' : 'Total Ações'}{' '}
                        {renderSortIcon(schoolSort, viewMode === 'atas' ? 'totalAtas' : 'totalAcoes')}
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
                  {pagedComparisonSchools.map((row) => {
                    const c = row.compliance;
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
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${tdBorder}`}>
                          {row.hasRecord ? (
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {formatNumberBr(row.matchedCount)}
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400 font-medium">
                              0 · Sem registro
                            </span>
                          )}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 ${tdBorder}`}>
                          {formatNumberBr(row.matchedParticipants)}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 ${tdBorder}`}>
                          {viewMode === 'atas' ? c.totalAtas : c.totalAcoes}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap ${tdBorder}`}>
                          {formatIsoDateBr(row.latestMatchDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {!isSchoolTableMode && viewMode === 'atas' && (
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

            {!isSchoolTableMode && viewMode === 'acoes' && (
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

      {/* School Detail Drawer (Downloadable complete PDF + soft-colored Metas when authenticated) */}
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
              <div className="min-w-0">
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  URE {selectedCompliance.school.ure} · CIE {selectedCompliance.school.cie}
                </div>
                <h3
                  id="school-drawer-title"
                  className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-1"
                >
                  {selectedCompliance.school.nomeSed}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    downloadSchoolDetailPdf({
                      compliance: selectedCompliance,
                      atas: selectedSchoolAtas,
                      acoes: selectedSchoolAcoes,
                      includeMetas: isAuthenticated,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Baixar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSchoolCie(null)}
                  aria-label="Fechar detalhes da escola"
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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

              {isAuthenticated && (
                <div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                    Metas e Prazos
                  </h4>
                  {!selectedCompliance.hasConfiguredMetas || selectedCompliance.ruleEvaluations.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3.5">
                      Nenhuma meta estipulada para esta unidade até o momento.
                    </p>
                  ) : (
                    <div className="border border-slate-300 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                      {selectedCompliance.ruleEvaluations.map((ev) => (
                        <div
                          key={ev.ruleId}
                          className="p-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {ev.label}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                              Realizado: {ev.atual} / Meta: {ev.meta}
                              {ev.prazoLimite ? ` · Prazo: ${formatIsoDateBr(ev.prazoLimite)}` : ''}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-semibold shrink-0 ${
                              ev.atendido
                                ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : ev.vencido
                                  ? 'border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
                                  : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {ev.atendido ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            {ev.atendido
                              ? 'Cumprida'
                              : ev.vencido
                                ? 'Não cumprida'
                                : 'Em andamento'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
