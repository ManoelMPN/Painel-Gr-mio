import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { computeSchoolCompliance } from '../shared/analytics.ts';
import type {
  AcaoRecord,
  AtaRecord,
  AuthUser,
  DashboardPayload,
  EmailDispatchLog,
  IntegrationStatus,
  MetasConfig,
  School,
  UreContact,
} from '../shared/types.ts';
import { AuthModal } from './components/AuthModal.tsx';
import { CampaignAndGoalsView } from './components/CampaignAndGoalsView.tsx';
import { MasterAdminView } from './components/MasterAdminView.tsx';
import { OverviewDashboard } from './components/OverviewDashboard.tsx';
import { UnifiedExplorerView, type ExplorerViewMode } from './components/UnifiedExplorerView.tsx';
import { formatTimestampBr } from './utils/formatters.ts';

export default function App() {
  // Dual-theme state synced to .dark on <html>
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Dashboard data state
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Unified Multi-URE Filter ('all' or specific URE)
  const [selectedUre, setSelectedUre] = useState<string>('all');

  // Unified Explorer mode ('schools' | 'atas' | 'acoes')
  const [explorerMode, setExplorerMode] = useState<ExplorerViewMode>('schools');

  // Admin workspace sub-tab (when authenticated)
  const [adminView, setAdminView] = useState<'campaigns' | 'master'>('campaigns');

  // Auth state (token kept strictly in React memory)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [masterConfigured, setMasterConfigured] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Section refs for smooth single-page scroll jumps
  const overviewRef = useRef<HTMLElement | null>(null);
  const explorerRef = useRef<HTMLElement | null>(null);
  const adminRef = useRef<HTMLElement | null>(null);

  const loadDashboard = useCallback(async (tokenOverride?: string | null) => {
    setLoading(true);
    setLoadError(null);
    try {
      const headers: Record<string, string> = {};
      if (tokenOverride) {
        headers.Authorization = `Bearer ${tokenOverride}`;
      }
      const [dashRes, authRes] = await Promise.all([
        fetch('/api/dashboard', { headers }),
        fetch('/api/auth/status', { headers }),
      ]);
      if (!dashRes.ok) {
        let serverMsg = 'Não foi possível carregar os dados das planilhas.';
        try {
          const errBody = (await dashRes.json()) as { error?: string };
          if (errBody?.error) serverMsg = errBody.error;
        } catch {
          // ignore non-JSON body
        }
        throw new Error(serverMsg);
      }
      const dashText = await dashRes.text();
      let dashData: DashboardPayload;
      try {
        dashData = JSON.parse(dashText) as DashboardPayload;
      } catch {
        throw new Error('A API do servidor não respondeu em JSON. Verifique o deploy das funções /api no servidor.');
      }
      setDashboard(dashData);

      if (authRes.ok) {
        try {
          const authData = (await authRes.json()) as {
            masterConfigured: boolean;
            user: AuthUser | null;
          };
          setMasterConfigured(authData.masterConfigured);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(null);
  }, [loadDashboard]);

  // Unique URE list derived strictly from loaded schools, ATAs, Ações, and URE contacts
  const availableUres = useMemo(() => {
    if (!dashboard) return [];
    const set = new Set<string>();
    dashboard.schools.forEach((s) => s.ure && set.add(s.ure));
    dashboard.atas.forEach((a) => a.diretoria && set.add(a.diretoria));
    dashboard.acoes.forEach((a) => a.diretoria && set.add(a.diretoria));
    dashboard.ureContacts.forEach((u) => u.ure && set.add(u.ure));
    return [...set].sort();
  }, [dashboard]);

  // URE-filtered datasets for public overview & explorer
  const filteredSchools = useMemo(() => {
    if (!dashboard) return [];
    if (selectedUre === 'all') return dashboard.schools;
    return dashboard.schools.filter((s) => s.ure === selectedUre);
  }, [dashboard, selectedUre]);

  const filteredAtas = useMemo(() => {
    if (!dashboard) return [];
    if (selectedUre === 'all') return dashboard.atas;
    return dashboard.atas.filter((a) => a.diretoria === selectedUre);
  }, [dashboard, selectedUre]);

  const filteredAcoes = useMemo(() => {
    if (!dashboard) return [];
    if (selectedUre === 'all') return dashboard.acoes;
    return dashboard.acoes.filter((a) => a.diretoria === selectedUre);
  }, [dashboard, selectedUre]);

  // Compliance across all schools (used by Admin panel with role/scope filtering)
  const fullCompliance = useMemo(() => {
    if (!dashboard) return [];
    return computeSchoolCompliance(
      dashboard.schools,
      dashboard.atas,
      dashboard.acoes,
      dashboard.metas
    );
  }, [dashboard]);

  // Filtered compliance for public explorer
  const filteredCompliance = useMemo(() => {
    if (selectedUre === 'all') return fullCompliance;
    return fullCompliance.filter((c) => c.school.ure === selectedUre);
  }, [fullCompliance, selectedUre]);

  function scrollToSection(target: 'overview' | 'schools' | 'atas' | 'acoes' | 'admin') {
    if (target === 'schools' || target === 'atas' || target === 'acoes') {
      setExplorerMode(target);
      explorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (target === 'admin') {
      adminRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    overviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleAuthenticated(token: string, user: AuthUser) {
    setAuthToken(token);
    setAuthUser(user);
    setMasterConfigured(true);
    await loadDashboard(token);
    setTimeout(() => {
      adminRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  async function handleLogout() {
    setAuthToken(null);
    setAuthUser(null);
    await loadDashboard(null);
  }

  function handleMetasUpdated(metas: MetasConfig) {
    setDashboard((prev) => (prev ? { ...prev, metas } : prev));
  }

  function handleEmailLogsUpdated(emailLogs: EmailDispatchLog[]) {
    setDashboard((prev) => (prev ? { ...prev, emailLogs } : prev));
  }

  function handleUreContactsUpdated(ureContacts: UreContact[]) {
    setDashboard((prev) => (prev ? { ...prev, ureContacts } : prev));
  }

  function handleDataReplaced(payload: {
    schools?: School[];
    ureContacts?: UreContact[];
    atas?: AtaRecord[];
    acoes?: AcaoRecord[];
    integrations: IntegrationStatus;
  }) {
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            schools: payload.schools ?? prev.schools,
            ureContacts: payload.ureContacts ?? prev.ureContacts,
            atas: payload.atas ?? prev.atas,
            acoes: payload.acoes ?? prev.acoes,
            integrations: payload.integrations,
          }
        : prev
    );
  }

  function handleIntegrationsUpdated(integrations: IntegrationStatus) {
    setDashboard((prev) => (prev ? { ...prev, integrations } : prev));
  }

  return (
    <div className="min-h-screen bg-slate-200/75 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Sticky Single-Page Header (No Left Sidebar) */}
      <header className="sticky top-0 z-30 border-b border-slate-300 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                Grêmio Estudantil SEDUC-SP
              </h1>
              <p className="text-xs text-slate-700 dark:text-slate-400">
                Secretaria da Educação do Estado de São Paulo · Acompanhamento Estadual e Regional
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Top Multi-URE Filter controlling all charts and tables below */}
              {availableUres.length > 0 && (
                <select
                  aria-label="Filtrar painel por Diretoria ou URE"
                  value={selectedUre}
                  onChange={(e) => setSelectedUre(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Todas as UREs</option>
                  {availableUres.map((u) => (
                    <option key={u} value={u}>
                      URE {u}
                    </option>
                  ))}
                </select>
              )}

              {/* Theme Switcher */}
              <button
                type="button"
                onClick={() => setIsDark((prev) => !prev)}
                aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-700" />
                )}
                <span className="hidden sm:inline">{isDark ? 'Claro' : 'Escuro'}</span>
              </button>

              {/* Auth / Admin Access Control: 'Admin' on desktop, Gear icon on mobile */}
              {authUser ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollToSection('admin')}
                    aria-label="Admin"
                    className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    aria-label="Sair"
                    className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Sair</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  aria-label="Admin"
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}
            </div>
          </div>

          {/* Horizontal Single-Page Section Jump Bar (Great on Mobile) */}
          <nav
            aria-label="Atalhos da página"
            className="flex items-center gap-2 overflow-x-auto pb-0.5 text-xs sm:text-sm"
          >
            <button
              type="button"
              onClick={() => scrollToSection('overview')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium whitespace-nowrap shrink-0"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Visão Geral
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('schools')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium whitespace-nowrap shrink-0"
            >
              <Building2 className="w-3.5 h-3.5" />
              Escolas ({filteredSchools.length})
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('atas')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              ATAs ({filteredAtas.length})
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('acoes')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium whitespace-nowrap shrink-0"
            >
              <Activity className="w-3.5 h-3.5" />
              Ações ({filteredAcoes.length})
            </button>
          </nav>
        </div>
      </header>

      {/* Single-Page Continuous Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-10">
        {loading ? (
          <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2 shadow-xs">
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Carregando registros do Grêmio Estudantil...
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Preparando os dados das unidades escolares, diretorias e lançamentos.
            </p>
          </div>
        ) : loadError || !dashboard ? (
          <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-8 text-center space-y-3">
            <div className="text-base font-semibold text-red-800 dark:text-red-300">
              {loadError || 'Erro ao carregar os dados.'}
            </div>
            <button
              type="button"
              onClick={() => loadDashboard(authToken)}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {/* SECTION 1: VISÃO GERAL (Pública, sem metas, sem distrito, sem ensino) */}
            <section ref={overviewRef} aria-label="Visão Geral" className="scroll-mt-32">
              <OverviewDashboard
                schools={filteredSchools}
                atas={filteredAtas}
                acoes={filteredAcoes}
                selectedUre={selectedUre}
                isDark={isDark}
                onJumpToSection={(tab) => scrollToSection(tab)}
              />
            </section>

            {/* SECTION 2: CONSULTA UNIFICADA (Dropdown Tipo -> Escola -> Contexto com ordenação nas colunas) */}
            <section ref={explorerRef} aria-label="Consulta Unificada" className="scroll-mt-32">
              <UnifiedExplorerView
                viewMode={explorerMode}
                onViewModeChange={setExplorerMode}
                selectedUre={selectedUre}
                onSelectUre={setSelectedUre}
                compliance={filteredCompliance}
                atas={filteredAtas}
                acoes={filteredAcoes}
                isAuthenticated={Boolean(authUser)}
              />
            </section>

            {/* SECTION 3: ADMINISTRAÇÃO (Visível apenas quando autenticado) */}
            {authUser && authToken && dashboard.metas && (
              <section
                ref={adminRef}
                aria-label="Admin"
                className="scroll-mt-32 pt-6 border-t-2 border-slate-300 dark:border-slate-800 space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      Administração & Comunicação
                    </h2>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {authUser.name} · Definição individual de metas e prazos, envio de mensagens personalizadas e acompanhamento.
                    </p>
                  </div>
                  {authUser.role === 'master' && (
                    <div className="inline-flex items-center gap-1.5 p-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-200/80 dark:bg-slate-800 self-start">
                      <button
                        type="button"
                        onClick={() => setAdminView('campaigns')}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          adminView === 'campaigns'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Sparkles className="w-4 h-4" />
                        Metas & Mensagens
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminView('master')}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          adminView === 'master'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Planilhas, Supabase & Perfis
                      </button>
                    </div>
                  )}
                </div>

                {adminView === 'campaigns' || authUser.role !== 'master' ? (
                  <CampaignAndGoalsView
                    authUser={authUser}
                    authToken={authToken}
                    compliance={fullCompliance}
                    atas={dashboard.atas}
                    acoes={dashboard.acoes}
                    metas={dashboard.metas}
                    ureContacts={dashboard.ureContacts}
                    availableUres={availableUres}
                    emailLogs={dashboard.emailLogs}
                    integrations={dashboard.integrations}
                    selectedUre={selectedUre}
                    onMetasUpdated={handleMetasUpdated}
                    onEmailLogsUpdated={handleEmailLogsUpdated}
                  />
                ) : (
                  <MasterAdminView
                    authUser={authUser}
                    authToken={authToken}
                    integrations={dashboard.integrations}
                    atasCount={dashboard.atas.length}
                    acoesCount={dashboard.acoes.length}
                    schoolsCount={dashboard.schools.length}
                    ureContacts={dashboard.ureContacts}
                    availableUres={availableUres}
                    onDataReplaced={handleDataReplaced}
                    onIntegrationsUpdated={handleIntegrationsUpdated}
                    onUreContactsUpdated={handleUreContactsUpdated}
                  />
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Clean Institutional Footer */}
      <footer className="border-t border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-700 dark:text-slate-400">
          <div className="font-medium">
            Grêmio Estudantil SEDUC-SP · <span className="font-semibold text-slate-900 dark:text-slate-200">Develop by Manoel Pereira</span>
          </div>
          {dashboard && (
            <div className="tabular-nums">
              {dashboard.integrations.lastSupabaseSyncAt ? (
                <span>
                  Atualização Supabase: {formatTimestampBr(dashboard.integrations.lastSupabaseSyncAt)}
                </span>
              ) : (
                <span>
                  ATAs: {formatTimestampBr(dashboard.integrations.lastAtasUploadAt)} · Ações:{' '}
                  {formatTimestampBr(dashboard.integrations.lastAcoesUploadAt)}
                </span>
              )}
            </div>
          )}
        </div>
      </footer>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        masterConfigured={masterConfigured}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />
    </div>
  );
}
