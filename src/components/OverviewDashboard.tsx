import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Award,
  Building2,
  CalendarDays,
  CheckCircle2,
  Compass,
  FileText,
  Layers,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { AcaoRecord, AtaRecord, School } from '../../shared/types.ts';
import { normalizeSchoolKey } from '../../shared/analytics.ts';
import { formatNumberBr } from '../utils/formatters.ts';

interface OverviewDashboardProps {
  schools: School[];
  atas: AtaRecord[];
  acoes: AcaoRecord[];
  selectedUre: string;
  isDark: boolean;
  onJumpToSection: (tab: 'schools' | 'atas' | 'acoes') => void;
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fev',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'Mai',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Set',
  '10': 'Out',
  '11': 'Nov',
  '12': 'Dez',
};

const TREEMAP_PALETTE = [
  '#1D4ED8',
  '#0D9488',
  '#0284C7',
  '#4F46E5',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#0F766E',
];

function useAnimatedValue(target: number, durationMs = 650): number {
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    let frameId = 0;
    const startValue = display;
    const delta = target - startValue;
    if (delta === 0) return;

    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startValue + delta * eased));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

const MiniSparkline: React.FC<{ values: number[]; color: string }> = ({ values, color }) => {
  const pts = values.length >= 2 ? values : [0, ...(values.length ? values : [0])];
  const max = Math.max(...pts, 1);
  const w = 88;
  const h = 28;
  const stepX = w / Math.max(1, pts.length - 1);
  const coords = pts.map((v, idx) => {
    const x = idx * stepX;
    const y = h - 3 - ((v / max) * (h - 6));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPath = `M 0,${h} L ${coords.join(' L ')} L ${w},${h} Z`;
  const linePath = `M ${coords.join(' L ')}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible shrink-0" aria-hidden="true">
      <path d={areaPath} fill={color} fillOpacity={0.14} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

interface TreemapTileProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  size?: number;
  tema?: string;
  colorIndex?: number;
}

const CustomTreemapTile: React.FC<TreemapTileProps> = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
  name = '',
  size = 0,
  colorIndex,
}) => {
  if (width <= 4 || height <= 4) return null;
  const fill = TREEMAP_PALETTE[(colorIndex ?? index) % TREEMAP_PALETTE.length];
  const showTitle = width > 78 && height > 34;
  const showCount = width > 56 && height > 52;
  const truncated = name.length > Math.floor(width / 7.5) ? `${name.slice(0, Math.max(4, Math.floor(width / 7.5) - 1))}…` : name;

  return (
    <g>
      <rect
        x={x + 1.5}
        y={y + 1.5}
        width={Math.max(0, width - 3)}
        height={Math.max(0, height - 3)}
        rx={6}
        fill={fill}
        fillOpacity={0.9}
        stroke="#FFFFFF"
        strokeWidth={1.5}
      />
      {showTitle && (
        <text
          x={x + 10}
          y={y + 22}
          fill="#FFFFFF"
          fontSize={12}
          fontWeight={600}
          style={{ pointerEvents: 'none' }}
        >
          {truncated}
        </text>
      )}
      {showCount && (
        <text
          x={x + 10}
          y={y + 40}
          fill="#E2E8F0"
          fontSize={11}
          fontWeight={500}
          style={{ pointerEvents: 'none' }}
        >
          {formatNumberBr(size)} ações
        </text>
      )}
    </g>
  );
};

interface TreemapTooltipPayloadItem {
  payload?: {
    tema?: string;
    name?: string;
    size?: number;
    participantes?: number;
  };
}

const CustomTreemapTooltip: React.FC<{
  active?: boolean;
  payload?: TreemapTooltipPayloadItem[];
  isDark: boolean;
}> = ({ active, payload, isDark }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs shadow-xl ${
        isDark
          ? 'bg-slate-950 border-slate-600 text-slate-50'
          : 'bg-white border-slate-400 text-slate-900'
      }`}
    >
      <div className={`font-bold mb-0.5 ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
        {item.tema} › {item.name}
      </div>
      <div className={isDark ? 'text-slate-100' : 'text-slate-800'}>
        {formatNumberBr(item.size ?? 0)} ações · {formatNumberBr(item.participantes ?? 0)} alunos
      </div>
    </div>
  );
};

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  schools,
  atas,
  acoes,
  selectedUre,
  isDark,
  onJumpToSection,
}) => {
  const [heatmapFilter, setHeatmapFilter] = useState<'all' | 'atas' | 'acoes'>('all');
  const [hoveredDay, setHoveredDay] = useState<{
    iso: string;
    dateBr: string;
    atas: number;
    acoes: number;
    participantes: number;
  } | null>(null);
  const [topSchoolsMetric, setTopSchoolsMetric] = useState<'participantes' | 'registros'>('participantes');

  const summary = useMemo(() => {
    const activeSchoolKeys = new Set<string>();
    const atasKeys = new Set<string>();
    const acoesKeys = new Set<string>();
    const ureSet = new Set<string>();

    for (const s of schools) {
      if (s.ure) ureSet.add(s.ure);
    }
    for (const a of atas) {
      const k = normalizeSchoolKey(a.escola);
      activeSchoolKeys.add(k);
      atasKeys.add(k);
    }
    for (const ac of acoes) {
      const k = normalizeSchoolKey(ac.escola);
      activeSchoolKeys.add(k);
      acoesKeys.add(k);
    }

    let schoolsWithRecords = 0;
    let schoolsWithAtas = 0;
    let schoolsWithAcoes = 0;

    for (const s of schools) {
      const k = normalizeSchoolKey(s.nomeSed);
      if (activeSchoolKeys.has(k)) schoolsWithRecords += 1;
      if (atasKeys.has(k)) schoolsWithAtas += 1;
      if (acoesKeys.has(k)) schoolsWithAcoes += 1;
    }

    const totalPartAtas = atas.reduce((acc, a) => acc + a.participantes, 0);
    const totalPartAcoes = acoes.reduce((acc, a) => acc + a.participantes, 0);
    const coveragePct = schools.length > 0 ? Math.round((schoolsWithRecords / schools.length) * 100) : 0;

    return {
      totalEscolas: schools.length,
      totalUres: ureSet.size,
      schoolsWithRecords,
      schoolsWithAtas,
      schoolsWithAcoes,
      totalPartAtas,
      totalPartAcoes,
      coveragePct,
    };
  }, [schools, atas, acoes]);

  const animSchools = useAnimatedValue(summary.totalEscolas);
  const animActiveSchools = useAnimatedValue(summary.schoolsWithRecords);
  const animAtas = useAnimatedValue(atas.length);
  const animAcoes = useAnimatedValue(acoes.length);

  const monthlyData = useMemo(() => {
    const map = new Map<
      string,
      { mesAno: string; label: string; atas: number; acoes: number; participantes: number }
    >();
    for (const a of atas) {
      if (!a.mesAno || !a.mesAno.startsWith('2026-')) continue;
      const month = a.mesAno.slice(5, 7);
      const entry = map.get(a.mesAno) ?? {
        mesAno: a.mesAno,
        label: `${MONTH_LABELS[month] ?? month}/26`,
        atas: 0,
        acoes: 0,
        participantes: 0,
      };
      entry.atas += 1;
      entry.participantes += a.participantes;
      map.set(a.mesAno, entry);
    }
    for (const ac of acoes) {
      if (!ac.mesAno || !ac.mesAno.startsWith('2026-')) continue;
      const month = ac.mesAno.slice(5, 7);
      const entry = map.get(ac.mesAno) ?? {
        mesAno: ac.mesAno,
        label: `${MONTH_LABELS[month] ?? month}/26`,
        atas: 0,
        acoes: 0,
        participantes: 0,
      };
      entry.acoes += 1;
      entry.participantes += ac.participantes;
      map.set(ac.mesAno, entry);
    }
    return [...map.values()].sort((a, b) => a.mesAno.localeCompare(b.mesAno));
  }, [atas, acoes]);

  // 2026 Daily Activity Calendar Heatmap (53 columns x 7 days)
  const heatmapCalendar = useMemo(() => {
    const dailyMap = new Map<string, { atas: number; acoes: number; participantes: number }>();
    for (const a of atas) {
      if (!a.dataIso || !a.dataIso.startsWith('2026-')) continue;
      const cur = dailyMap.get(a.dataIso) ?? { atas: 0, acoes: 0, participantes: 0 };
      cur.atas += 1;
      cur.participantes += a.participantes;
      dailyMap.set(a.dataIso, cur);
    }
    for (const ac of acoes) {
      if (!ac.dataIso || !ac.dataIso.startsWith('2026-')) continue;
      const cur = dailyMap.get(ac.dataIso) ?? { atas: 0, acoes: 0, participantes: 0 };
      cur.acoes += 1;
      cur.participantes += ac.participantes;
      dailyMap.set(ac.dataIso, cur);
    }

    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 11, 31));
    const startWeekday = start.getUTCDay(); // 0=Sun..6=Sat
    const cells: Array<{
      iso: string;
      dateBr: string;
      week: number;
      day: number;
      atas: number;
      acoes: number;
      participantes: number;
      score: number;
    }> = [];
    const monthTicks: Array<{ week: number; label: string }> = [];
    let lastMonth = -1;
    let maxScore = 1;

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const diffDays = Math.round((d.getTime() - start.getTime()) / 86400000);
      const week = Math.floor((diffDays + startWeekday) / 7);
      const day = d.getUTCDay();
      const iso = d.toISOString().slice(0, 10);
      const m = d.getUTCMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        const mm = String(m + 1).padStart(2, '0');
        monthTicks.push({ week, label: MONTH_LABELS[mm] ?? mm });
      }
      const stats = dailyMap.get(iso) ?? { atas: 0, acoes: 0, participantes: 0 };
      const score =
        heatmapFilter === 'atas'
          ? stats.atas
          : heatmapFilter === 'acoes'
            ? stats.acoes
            : stats.atas + stats.acoes;
      if (score > maxScore) maxScore = score;
      cells.push({
        iso,
        dateBr: `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
        week,
        day,
        atas: stats.atas,
        acoes: stats.acoes,
        participantes: stats.participantes,
        score,
      });
    }

    return { cells, monthTicks, maxScore };
  }, [atas, acoes, heatmapFilter]);

  const ataModelData = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of atas) {
      const label = a.modeloNormalizado;
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([modelo, quantidade]) => ({
        modelo: modelo.length > 36 ? `${modelo.slice(0, 34)}…` : modelo,
        modeloCompleto: modelo,
        quantidade,
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 8);
  }, [atas]);

  const acaoThemeRadarData = useMemo(() => {
    const map = new Map<string, { tema: string; acoes: number; participantes: number }>();
    for (const ac of acoes) {
      const t = ac.tema || 'Outros';
      const current = map.get(t) ?? { tema: t, acoes: 0, participantes: 0 };
      current.acoes += 1;
      current.participantes += ac.participantes;
      map.set(t, current);
    }
    const maxAcoes = Math.max(...[...map.values()].map((v) => v.acoes), 1);
    const maxPart = Math.max(...[...map.values()].map((v) => v.participantes), 1);
    return [...map.values()]
      .sort((a, b) => b.acoes - a.acoes)
      .slice(0, 8)
      .map((item) => ({
        temaCurto: item.tema.length > 20 ? `${item.tema.slice(0, 18)}…` : item.tema,
        temaCompleto: item.tema,
        acoes: item.acoes,
        participantes: item.participantes,
        indiceAcoes: Math.round((item.acoes / maxAcoes) * 100),
        indiceAlcance: Math.round((item.participantes / maxPart) * 100),
      }));
  }, [acoes]);

  const subthemeTreemapData = useMemo(() => {
    const themeIndexMap = new Map<string, number>();
    const map = new Map<string, { name: string; tema: string; size: number; participantes: number; colorIndex: number }>();
    for (const ac of acoes) {
      const tema = ac.tema || 'Geral';
      if (!themeIndexMap.has(tema)) themeIndexMap.set(tema, themeIndexMap.size);
      const sub = ac.subtema || tema;
      const key = `${tema}::${sub}`;
      const existing = map.get(key) ?? {
        name: sub,
        tema,
        size: 0,
        participantes: 0,
        colorIndex: themeIndexMap.get(tema) ?? 0,
      };
      existing.size += 1;
      existing.participantes += ac.participantes;
      map.set(key, existing);
    }
    return [...map.values()].sort((a, b) => b.size - a.size).slice(0, 18);
  }, [acoes]);

  const topSchoolsData = useMemo(() => {
    const schoolStats = new Map<
      string,
      {
        escola: string;
        escolaCurta: string;
        atas: number;
        acoes: number;
        registros: number;
        participantes: number;
      }
    >();

    for (const a of atas) {
      const k = normalizeSchoolKey(a.escola);
      const cur = schoolStats.get(k) ?? {
        escola: a.escola,
        escolaCurta: a.escola.length > 28 ? `${a.escola.slice(0, 26)}…` : a.escola,
        atas: 0,
        acoes: 0,
        registros: 0,
        participantes: 0,
      };
      cur.atas += 1;
      cur.registros += 1;
      cur.participantes += a.participantes;
      schoolStats.set(k, cur);
    }
    for (const ac of acoes) {
      const k = normalizeSchoolKey(ac.escola);
      const cur = schoolStats.get(k) ?? {
        escola: ac.escola,
        escolaCurta: ac.escola.length > 28 ? `${ac.escola.slice(0, 26)}…` : ac.escola,
        atas: 0,
        acoes: 0,
        registros: 0,
        participantes: 0,
      };
      cur.acoes += 1;
      cur.registros += 1;
      cur.participantes += ac.participantes;
      schoolStats.set(k, cur);
    }

    return [...schoolStats.values()]
      .sort((a, b) =>
        topSchoolsMetric === 'participantes'
          ? b.participantes - a.participantes
          : b.registros - a.registros
      )
      .slice(0, 10);
  }, [atas, acoes, topSchoolsMetric]);

  const ureComparisonData = useMemo(() => {
    const map = new Map<string, { ure: string; escolas: number; atas: number; acoes: number }>();
    for (const s of schools) {
      const u = s.ure || 'SEM URE';
      const entry = map.get(u) ?? { ure: u, escolas: 0, atas: 0, acoes: 0 };
      entry.escolas += 1;
      map.set(u, entry);
    }
    for (const a of atas) {
      const u = a.diretoria || 'SEM URE';
      const entry = map.get(u) ?? { ure: u, escolas: 0, atas: 0, acoes: 0 };
      entry.atas += 1;
      map.set(u, entry);
    }
    for (const ac of acoes) {
      const u = ac.diretoria || 'SEM URE';
      const entry = map.get(u) ?? { ure: u, escolas: 0, atas: 0, acoes: 0 };
      entry.acoes += 1;
      map.set(u, entry);
    }
    return [...map.values()].sort((a, b) => b.atas + b.acoes - (a.atas + a.acoes)).slice(0, 15);
  }, [schools, atas, acoes]);

  const axisColor = isDark ? '#CBD5E1' : '#1E293B';
  const gridColor = isDark ? '#334155' : '#CBD5E1';
  const tooltipStyle = {
    backgroundColor: isDark ? '#020617' : '#FFFFFF',
    borderColor: isDark ? '#475569' : '#94A3B8',
    borderWidth: 1,
    borderRadius: '10px',
    color: isDark ? '#F8FAFC' : '#0F172A',
    fontSize: '13px',
    boxShadow: '0 12px 28px -6px rgba(2, 6, 23, 0.45)',
  };
  const tooltipItemStyle = {
    color: isDark ? '#F8FAFC' : '#0F172A',
    fontWeight: 500,
    paddingTop: '2px',
    paddingBottom: '2px',
  };
  const tooltipLabelStyle = {
    color: isDark ? '#93C5FD' : '#1E3A8A',
    fontWeight: 700,
    marginBottom: '4px',
  };
  const legendStyle = {
    fontSize: '13px',
    paddingTop: '6px',
    color: isDark ? '#E2E8F0' : '#1E293B',
  };

  function getHeatmapCellColor(score: number): string {
    if (score === 0) return isDark ? '#1E293B' : '#E2E8F0';
    const ratio = score / Math.max(1, heatmapCalendar.maxScore);
    if (ratio <= 0.25) return isDark ? '#1E3A8A' : '#93C5FD';
    if (ratio <= 0.5) return isDark ? '#1D4ED8' : '#3B82F6';
    if (ratio <= 0.75) return isDark ? '#2563EB' : '#1D4ED8';
    return isDark ? '#60A5FA' : '#1E3A8A';
  }

  return (
    <div className="space-y-6">
      {/* 4 Animated KPI Cards with Mini SVG Visualizations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onJumpToSection('schools')}
          className="text-left rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-blue-500 dark:hover:border-blue-500 transition-colors shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Escolas na Rede
            </span>
            <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatNumberBr(animSchools)}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {selectedUre === 'all'
                  ? `${summary.totalUres} diretoria(s) ativa(s)`
                  : `Diretoria ${selectedUre}`}
              </div>
            </div>
            <MiniSparkline
              values={monthlyData.map((m) => m.atas + m.acoes)}
              color="#2563EB"
            />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onJumpToSection('schools')}
          className="text-left rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Escolas com Registros
            </span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatNumberBr(animActiveSchools)}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                  de {summary.totalEscolas}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                {summary.schoolsWithAtas} com ATAs · {summary.schoolsWithAcoes} com Ações
              </p>
            </div>
            {/* SVG Coverage Ring */}
            <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0" aria-hidden="true">
              <circle
                cx="24"
                cy="24"
                r="19"
                fill="none"
                stroke={isDark ? '#1E293B' : '#E2E8F0'}
                strokeWidth="5"
              />
              <circle
                cx="24"
                cy="24"
                r="19"
                fill="none"
                stroke="#059669"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${(summary.coveragePct / 100) * 119.4} 119.4`}
                transform="rotate(-90 24 24)"
              />
              <text
                x="24"
                y="27.5"
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill={isDark ? '#E2E8F0' : '#0F172A'}
              >
                {summary.coveragePct}%
              </text>
            </svg>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onJumpToSection('atas')}
          className="text-left rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-blue-500 dark:hover:border-blue-500 transition-colors shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              ATAs Registradas
            </span>
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatNumberBr(animAtas)}
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                {formatNumberBr(summary.totalPartAtas)} participações somadas
              </p>
            </div>
            <MiniSparkline values={monthlyData.map((m) => m.atas)} color="#2563EB" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onJumpToSection('acoes')}
          className="text-left rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-teal-500 dark:hover:border-teal-500 transition-colors shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Ações Realizadas
            </span>
            <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatNumberBr(animAcoes)}
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                {formatNumberBr(summary.totalPartAcoes)} estudantes participantes
              </p>
            </div>
            <MiniSparkline values={monthlyData.map((m) => m.acoes)} color="#0D9488" />
          </div>
        </button>
      </div>

      {/* Chart 1: Dual-Axis ComposedChart with Interactive Brush Zoom */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Evolução Mensal, Volume de Ações e Participação Estudantil (2026)
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Arraste as alças na barra inferior para dar zoom em meses específicos. Datas conforme lançadas pelas escolas na planilha (inclui atividades programadas até dezembro).
            </p>
          </div>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 18, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 12 }} stroke={gridColor} />
              <YAxis
                yAxisId="left"
                tick={{ fill: axisColor, fontSize: 12 }}
                stroke={gridColor}
                label={{
                  value: 'Qtd. Registros',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 16,
                  style: { fill: axisColor, fontSize: 11 },
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#D97706', fontSize: 12 }}
                stroke={gridColor}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                formatter={(value: unknown, name: unknown) => [formatNumberBr(Number(value)), String(name)]}
              />
              <Legend wrapperStyle={legendStyle} />
              <Bar yAxisId="left" dataKey="atas" name="ATAs Registradas" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar yAxisId="left" dataKey="acoes" name="Ações Realizadas" fill="#0D9488" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="participantes"
                name="Participantes Somados"
                stroke="#D97706"
                strokeWidth={3}
                dot={{ r: 4, fill: '#D97706', strokeWidth: 2, stroke: isDark ? '#0F172A' : '#FFFFFF' }}
                activeDot={{ r: 6 }}
              />
              <Brush
                dataKey="label"
                height={24}
                stroke={isDark ? '#3B82F6' : '#2563EB'}
                fill={isDark ? '#0F172A' : '#F1F5F9'}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Interactive 2026 Daily Activity Calendar Heatmap */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Mapa de Calor Diário de Engajamento — Calendário 2026
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Passe o cursor sobre qualquer dia do ano para visualizar a concentração exata de reuniões e ações estudantis.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
              {(['all', 'atas', 'acoes'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setHeatmapFilter(mode)}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    heatmapFilter === mode
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {mode === 'all' ? 'Tudo' : mode === 'atas' ? 'Somente ATAs' : 'Somente Ações'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="min-w-[760px]">
            <svg
              viewBox="0 0 820 132"
              className="w-full h-auto"
              role="img"
              aria-label="Calendário anual de atividades dos Grêmios Estudantis em 2026"
            >
              {/* Weekday labels */}
              {[
                { idx: 1, label: 'Seg' },
                { idx: 3, label: 'Qua' },
                { idx: 5, label: 'Sex' },
              ].map((w) => (
                <text
                  key={w.idx}
                  x={4}
                  y={28 + w.idx * 14 + 10}
                  fontSize="10"
                  fill={axisColor}
                  fontWeight={500}
                >
                  {w.label}
                </text>
              ))}

              {/* Month ticks */}
              {heatmapCalendar.monthTicks.map((mt) => (
                <text
                  key={`${mt.week}-${mt.label}`}
                  x={36 + mt.week * 14.5}
                  y={16}
                  fontSize="10.5"
                  fill={axisColor}
                  fontWeight={600}
                >
                  {mt.label}
                </text>
              ))}

              {/* Day cells */}
              {heatmapCalendar.cells.map((cell) => {
                const isHovered = hoveredDay?.iso === cell.iso;
                return (
                  <rect
                    key={cell.iso}
                    x={36 + cell.week * 14.5}
                    y={26 + cell.day * 14}
                    width={11.5}
                    height={11.5}
                    rx={2.5}
                    fill={getHeatmapCellColor(cell.score)}
                    stroke={isHovered ? '#F59E0B' : isDark ? '#0F172A' : '#FFFFFF'}
                    strokeWidth={isHovered ? 1.8 : 0.7}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => setHoveredDay(cell)}
                    onMouseLeave={() => setHoveredDay((prev) => (prev?.iso === cell.iso ? null : prev))}
                  />
                );
              })}
            </svg>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div className="text-slate-700 dark:text-slate-300 font-medium min-h-[1.25rem]">
            {hoveredDay ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <strong className="font-mono text-slate-900 dark:text-slate-100">{hoveredDay.dateBr}</strong>
                <span>· {hoveredDay.atas} ATA(s)</span>
                <span>· {hoveredDay.acoes} Ação(ões)</span>
                <span>· {formatNumberBr(hoveredDay.participantes)} participantes</span>
              </span>
            ) : (
              <span>Passe o mouse sobre os quadrados para inspecionar um dia específico de 2026.</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 shrink-0">
            <span>Menor</span>
            {[0, 0.2, 0.45, 0.7, 1].map((r, i) => (
              <span
                key={i}
                className="inline-block w-3 h-3 rounded-xs border border-slate-300/60 dark:border-slate-700"
                style={{
                  backgroundColor: getHeatmapCellColor(
                    r === 0 ? 0 : Math.ceil(r * heatmapCalendar.maxScore)
                  ),
                }}
              />
            ))}
            <span>Maior</span>
          </div>
        </div>
      </div>

      {/* Chart 3 & 4: Radar of Action Themes + Hierarchical Treemap of Subthemes */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Compass className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Radar Estratégico de Temas
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Equilíbrio relativo entre frequência de ações e alcance estudantil (%)
              </p>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="68%" data={acaoThemeRadarData}>
                <PolarGrid stroke={gridColor} />
                <PolarAngleAxis dataKey="temaCurto" tick={{ fill: axisColor, fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: axisColor, fontSize: 10 }} />
                <Radar
                  name="Frequência de Ações (%)"
                  dataKey="indiceAcoes"
                  stroke="#2563EB"
                  fill="#2563EB"
                  fillOpacity={0.28}
                />
                <Radar
                  name="Alcance de Alunos (%)"
                  dataKey="indiceAlcance"
                  stroke="#0D9488"
                  fill="#0D9488"
                  fillOpacity={0.22}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(_v: unknown, name: unknown, item) => {
                    const p = item?.payload as { acoes?: number; participantes?: number };
                    if (String(name).includes('Frequência')) {
                      return [`${p?.acoes ?? 0} ações`, 'Volume de Ações'];
                    }
                    return [`${formatNumberBr(p?.participantes ?? 0)} alunos`, 'Estudantes Alcançados'];
                  }}
                />
                <Legend wrapperStyle={legendStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-7 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-300/70 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Mosaico de Subtemas (Treemap Interativo)
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                Proporção dos principais subtemas executados pelas escolas
              </p>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={subthemeTreemapData}
                dataKey="size"
                nameKey="name"
                stroke="#FFFFFF"
                content={<CustomTreemapTile />}
              >
                <Tooltip content={<CustomTreemapTooltip isDark={isDark} />} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Chart 5 & 6: Top 10 Schools Toggle Chart + ATA Models Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-6 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Top 10 Unidades Escolares
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Alterne entre alcance de estudantes ou quantidade total de registros
              </p>
            </div>
            <div className="inline-flex p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setTopSchoolsMetric('participantes')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  topSchoolsMetric === 'participantes'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Participantes
              </button>
              <button
                type="button"
                onClick={() => setTopSchoolsMetric('registros')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  topSchoolsMetric === 'registros'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Registros
              </button>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topSchoolsData}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={true} vertical={true} />
                <XAxis
                  type="number"
                  tick={{ fill: axisColor, fontSize: 11 }}
                  stroke={gridColor}
                />
                <YAxis
                  dataKey="escolaCurta"
                  type="category"
                  width={185}
                  tick={{ fill: axisColor, fontSize: 11 }}
                  stroke={gridColor}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: unknown, _name: unknown, item) => {
                    const p = item?.payload as { escola?: string; atas?: number; acoes?: number };
                    return [
                      topSchoolsMetric === 'participantes'
                        ? `${formatNumberBr(Number(value))} participantes (${p?.atas ?? 0} ATAs · ${p?.acoes ?? 0} Ações)`
                        : `${formatNumberBr(Number(value))} registros (${p?.atas ?? 0} ATAs · ${p?.acoes ?? 0} Ações)`,
                      p?.escola ?? 'Escola',
                    ];
                  }}
                />
                <Bar dataKey={topSchoolsMetric} radius={[0, 5, 5, 0]}>
                  {topSchoolsData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        idx === 0
                          ? '#D97706'
                          : idx < 3
                            ? '#2563EB'
                            : '#0284C7'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-6 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-300/70 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Volume por Modelo de ATA
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                Distribuição dos principais formatos de reunião registrados pelas escolas
              </p>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ataModelData}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={true} vertical={true} />
                <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} />
                <YAxis
                  dataKey="modelo"
                  type="category"
                  width={195}
                  tick={{ fill: axisColor, fontSize: 11 }}
                  stroke={gridColor}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: unknown, _name: unknown, item) => {
                    const p = item?.payload as { modeloCompleto?: string };
                    return [`${formatNumberBr(Number(value))} registros`, p?.modeloCompleto ?? 'Modelo'];
                  }}
                />
                <Bar dataKey="quantidade" fill="#2563EB" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Multi-URE Comparative Chart (Automatically rendered when statewide CSV with multiple UREs is active) */}
      {selectedUre === 'all' && ureComparisonData.length > 1 && (
        <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-300/70 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Comparativo Entre Diretorias de Ensino (UREs)
              </h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                Visão comparativa automática das diretorias presentes na planilha carregada
              </p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ureComparisonData} margin={{ top: 8, right: 16, left: -10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="ure" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={legendStyle} />
                <Bar dataKey="atas" name="ATAs" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="acoes" name="Ações" fill="#0D9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="escolas" name="Escolas" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
