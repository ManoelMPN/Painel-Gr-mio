import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  CloudUpload,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
  AcaoRecord,
  AtaRecord,
  AuthUser,
  IntegrationStatus,
  School,
  UreContact,
  UserScope,
} from '../../shared/types.ts';
import { downloadTextFile, formatTimestampBr } from '../utils/formatters.ts';

interface MasterAdminViewProps {
  authUser: AuthUser;
  authToken: string;
  integrations: IntegrationStatus;
  atasCount: number;
  acoesCount: number;
  schoolsCount: number;
  ureContacts: UreContact[];
  availableUres: string[];
  onDataReplaced: (payload: {
    schools?: School[];
    ureContacts?: UreContact[];
    atas?: AtaRecord[];
    acoes?: AcaoRecord[];
    integrations: IntegrationStatus;
  }) => void;
  onIntegrationsUpdated: (integrations: IntegrationStatus) => void;
  onUreContactsUpdated: (ureContacts: UreContact[]) => void;
}

export const MasterAdminView: React.FC<MasterAdminViewProps> = ({
  authUser,
  authToken,
  integrations,
  atasCount,
  acoesCount,
  schoolsCount,
  ureContacts,
  availableUres,
  onDataReplaced,
  onIntegrationsUpdated,
  onUreContactsUpdated,
}) => {
  // Users state
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'master'>('admin');
  const [newScope, setNewScope] = useState<UserScope>('ure');
  const [newAssignedUre, setNewAssignedUre] = useState<string>(availableUres[0] || 'SUL 3');
  const [customUreInput, setCustomUreInput] = useState('');
  const [userFeedback, setUserFeedback] = useState<string | null>(null);

  // URE contacts state
  const [ureList, setUreList] = useState<UreContact[]>(ureContacts);
  const [newUreName, setNewUreName] = useState('');
  const [newUreEmail, setNewUreEmail] = useState('');
  const [newUreResp, setNewUreResp] = useState('');
  const [ureFeedback, setUreFeedback] = useState<string | null>(null);

  // CSV upload state
  const [uploadingType, setUploadingType] = useState<'atas' | 'acoes' | 'schools' | null>(null);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  // Supabase & SMTP config state
  const [supabaseUrl, setSupabaseUrl] = useState(integrations.supabaseUrl || '');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [smtpHost, setSmtpHost] = useState(integrations.smtpHost || 'smtp.office365.com');
  const [smtpPort, setSmtpPort] = useState(integrations.smtpPort || 587);
  const [smtpUser, setSmtpUser] = useState(integrations.smtpUser || '');
  const [smtpPass, setSmtpPass] = useState('');
  const [schemaSql, setSchemaSql] = useState('');
  const [showSql, setShowSql] = useState(false);
  const [integrationFeedback, setIntegrationFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    setUreList(ureContacts);
  }, [ureContacts]);

  useEffect(() => {
    if (authUser.role === 'master' && authToken) {
      fetchUsers();
      fetchSchema();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, authToken]);

  async function fetchUsers() {
    const res = await fetch('/api/master/users', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { users: AuthUser[] };
      setUsers(data.users);
    }
  }

  async function fetchSchema() {
    const res = await fetch('/api/master/supabase-schema', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { sql: string };
      setSchemaSql(data.sql);
    }
  }

  if (authUser.role !== 'master') {
    return (
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 max-w-xl mx-auto text-center space-y-3 shadow-xs">
        <Shield className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Área Exclusiva do Administrador Master
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Você está conectado como Administrador ({authUser.scope === 'ure' ? `Gestor Regional URE ${authUser.assignedUre}` : 'Gestor Geral'}). Para subir novas planilhas, configurar o Supabase/SMTP, cadastrar e-mails de diretorias ou gerenciar perfis, entre com o perfil Master.
        </p>
      </div>
    );
  }

  async function extractCsvContent(file: File): Promise<string> {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('Planilha Excel sem abas legíveis.');
      }
      const sheet = workbook.Sheets[firstSheetName];
      return XLSX.utils.sheet_to_csv(sheet, { FS: ';', dateNF: 'dd/mm/yyyy' });
    }
    return file.text();
  }

  async function handleCsvFile(type: 'atas' | 'acoes' | 'schools', file: File | undefined) {
    if (!file) return;
    setUploadingType(type);
    setUploadResult(null);
    try {
      const text = await extractCsvContent(file);
      if (type === 'schools') {
        const res = await fetch('/api/master/upload-schools', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ csvContent: text }),
        });
        const data = (await res.json()) as {
          importedCount?: number;
          totalSchools?: number;
          schools?: School[];
          ureContacts?: UreContact[];
          supabaseSynced?: boolean;
          integrations?: IntegrationStatus;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Falha ao importar escolas.');
        if (data.integrations) {
          onDataReplaced({
            schools: data.schools,
            ureContacts: data.ureContacts,
            integrations: data.integrations,
          });
        }
        setUploadResult(
          `${data.importedCount} escola(s) importada(s)/atualizada(s). Base total: ${data.totalSchools} unidades.${data.supabaseSynced ? ' Replicado no Supabase.' : ''}`
        );
        return;
      }

      const res = await fetch('/api/master/upload-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ type, csvContent: text }),
      });
      const data = (await res.json()) as {
        count?: number;
        unmatchedSchools?: string[];
        discoveredCount?: number;
        supabaseSynced?: boolean;
        schools?: School[];
        ureContacts?: UreContact[];
        atas?: AtaRecord[];
        acoes?: AcaoRecord[];
        integrations?: IntegrationStatus;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Falha ao importar planilha.');

      if (data.integrations) {
        onDataReplaced({
          schools: data.schools,
          ureContacts: data.ureContacts,
          atas: data.atas,
          acoes: data.acoes,
          integrations: data.integrations,
        });
      }

      const discoveredMsg =
        (data.discoveredCount ?? 0) > 0
          ? ` ${data.discoveredCount} nova(s) escola(s)/diretoria(s) integrada(s) automaticamente.`
          : '';
      const sbMsg = data.supabaseSynced ? ' Sincronizado automaticamente no Supabase.' : '';
      setUploadResult(
        `Planilha de ${type === 'atas' ? 'ATAs' : 'Ações'} atualizada com ${data.count} registros.${discoveredMsg}${sbMsg}`
      );
    } catch (err) {
      setUploadResult(err instanceof Error ? err.message : 'Erro ao processar arquivo de planilha.');
    } finally {
      setUploadingType(null);
    }
  }

  async function handleSaveIntegrations(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('save_int');
    setIntegrationFeedback(null);
    try {
      const res = await fetch('/api/master/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          supabaseUrl,
          supabaseKey: supabaseKey || undefined,
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass: smtpPass || undefined,
        }),
      });
      const data = (await res.json()) as {
        integrations?: IntegrationStatus;
        error?: string;
      };
      if (!res.ok || !data.integrations) {
        throw new Error(data.error || 'Erro ao salvar configurações.');
      }
      onIntegrationsUpdated(data.integrations);
      setSupabaseKey('');
      setSmtpPass('');
      setIntegrationFeedback({
        type: 'success',
        text: 'Credenciais salvas com segurança no servidor.',
      });
    } catch (err) {
      setIntegrationFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao salvar.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTestSupabase() {
    setBusyAction('test_sb');
    setIntegrationFeedback(null);
    try {
      const res = await fetch('/api/master/supabase/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ supabaseUrl, supabaseKey: supabaseKey || undefined }),
      });
      const data = (await res.json()) as { detail?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Falha na conexão.');
      setIntegrationFeedback({ type: 'success', text: data.detail || 'Conexão validada.' });
    } catch (err) {
      setIntegrationFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro de conexão com Supabase.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTestSmtp() {
    setBusyAction('test_smtp');
    setIntegrationFeedback(null);
    try {
      const res = await fetch('/api/master/smtp/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass: smtpPass || undefined,
        }),
      });
      const data = (await res.json()) as { detail?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Falha na conexão SMTP.');
      setIntegrationFeedback({ type: 'success', text: data.detail || 'SMTP validado!' });
    } catch (err) {
      setIntegrationFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao validar SMTP Microsoft 365.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePushSupabase() {
    setBusyAction('push_sb');
    setIntegrationFeedback(null);
    try {
      const res = await fetch('/api/master/supabase/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = (await res.json()) as {
        syncedAt?: string;
        integrations?: IntegrationStatus;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar para Supabase.');
      if (data.integrations) onIntegrationsUpdated(data.integrations);
      setIntegrationFeedback({
        type: 'success',
        text: `Base completa (${schoolsCount} escolas, ${atasCount} ATAs, ${acoesCount} Ações e metas) sincronizada no Supabase em ${formatTimestampBr(data.syncedAt ?? null)}.`,
      });
    } catch (err) {
      setIntegrationFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao sincronizar com Supabase.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePullSupabase() {
    setBusyAction('pull_sb');
    setIntegrationFeedback(null);
    try {
      const res = await fetch('/api/master/supabase/pull', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = (await res.json()) as {
        atasCount?: number;
        acoesCount?: number;
        atas?: AtaRecord[];
        acoes?: AcaoRecord[];
        integrations?: IntegrationStatus;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Falha ao importar do Supabase.');
      if (data.integrations) {
        onDataReplaced({
          atas: data.atas,
          acoes: data.acoes,
          integrations: data.integrations,
        });
      }
      setIntegrationFeedback({
        type: 'success',
        text: `Dados importados do Supabase: ${data.atasCount} ATAs e ${data.acoesCount} Ações.`,
      });
    } catch (err) {
      setIntegrationFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao ler Supabase.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveUreContacts(nextList: UreContact[]) {
    setUreFeedback(null);
    const res = await fetch('/api/master/ure-contacts', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ ureContacts: nextList }),
    });
    const data = (await res.json()) as { ureContacts?: UreContact[]; error?: string };
    if (res.ok && data.ureContacts) {
      setUreList(data.ureContacts);
      onUreContactsUpdated(data.ureContacts);
      setUreFeedback('Diretório de e-mails das UREs atualizado.');
    } else {
      setUreFeedback(data.error || 'Erro ao salvar contatos.');
    }
  }

  async function handleAddUreContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newUreName.trim() || !newUreEmail.trim()) return;
    const normalized = newUreName.toUpperCase().trim();
    const updated = [
      ...ureList.filter((u) => u.ure !== normalized),
      { ure: normalized, email: newUreEmail.trim().toLowerCase(), responsavel: newUreResp.trim() },
    ];
    await handleSaveUreContacts(updated);
    setNewUreName('');
    setNewUreEmail('');
    setNewUreResp('');
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setUserFeedback(null);
    const effectiveScope: UserScope = newRole === 'master' ? 'geral' : newScope;
    const resolvedUre =
      newAssignedUre === '__CUSTOM__' ? customUreInput.trim().toUpperCase() : newAssignedUre;

    try {
      const res = await fetch('/api/master/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          scope: effectiveScope,
          assignedUre: effectiveScope === 'ure' ? resolvedUre : undefined,
        }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error || 'Erro ao criar administrador.');
      setUsers((prev) => [...prev, data.user!]);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setCustomUreInput('');
      setUserFeedback(
        `Perfil ${data.user.email} (${
          data.user.role === 'master'
            ? 'Master'
            : data.user.scope === 'ure'
              ? `Gestor Regional · URE ${data.user.assignedUre}`
              : 'Gestor Geral'
        }) criado com sucesso.`
      );
    } catch (err) {
      setUserFeedback(err instanceof Error ? err.message : 'Falha ao criar usuário.');
    }
  }

  async function handleDeleteUser(id: string) {
    const res = await fetch(`/api/master/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Upload CSV / Excel Estadual ou Regional */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            1. Atualização das Planilhas (CSV ou Excel .xlsx · Compatível com Todas as UREs)
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
            Suba aqui os arquivos <strong>CSV</strong> ou <strong>Excel (.xlsx / .xls)</strong> de ATAs e Ações diretamente pela sua área Master. Ao enviar, o painel atualiza na hora, organiza novas UREs/escolas e replica os dados automaticamente no Supabase.
          </p>
        </div>

        {uploadResult && (
          <div
            role="status"
            className="rounded-lg border border-blue-300 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-900 dark:text-blue-200"
          >
            {uploadResult}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                Planilha de ATAs ({atasCount})
              </h3>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-400">
              Atualizada: {formatTimestampBr(integrations.lastAtasUploadAt)}
            </p>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors">
              <CloudUpload className="w-4 h-4" />
              {uploadingType === 'atas' ? 'Processando...' : 'Subir ATAs (CSV / Excel)'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                disabled={uploadingType !== null}
                onChange={(e) => {
                  handleCsvFile('atas', e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                Planilha de Ações ({acoesCount})
              </h3>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-400">
              Atualizada: {formatTimestampBr(integrations.lastAcoesUploadAt)}
            </p>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors">
              <CloudUpload className="w-4 h-4" />
              {uploadingType === 'acoes' ? 'Processando...' : 'Subir Ações (CSV / Excel)'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                disabled={uploadingType !== null}
                onChange={(e) => {
                  handleCsvFile('acoes', e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                Cadastro de Escolas e E-mails ({schoolsCount})
              </h3>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-400">
              CSV ou Excel com colunas: <code className="font-mono">URE;CIE;Escola;Email</code>
            </p>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors">
              <CloudUpload className="w-4 h-4" />
              {uploadingType === 'schools' ? 'Importando...' : 'Importar Escolas'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                disabled={uploadingType !== null}
                onChange={(e) => {
                  handleCsvFile('schools', e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 2. Supabase, IA Gemini Centralizada e Envio de E-mail Microsoft */}
      <form
        onSubmit={handleSaveIntegrations}
        className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-6 shadow-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              2. Integrações: Supabase, Inteligência Artificial e E-mail Microsoft
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Todas as credenciais ficam protegidas no servidor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSql((s) => !s)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Database className="w-3.5 h-3.5" />
              {showSql ? 'Ocultar SQL Supabase' : 'Ver SQL Schema Supabase'}
            </button>
            {schemaSql && (
              <button
                type="button"
                onClick={() => downloadTextFile('supabase_schema_gremio.sql', schemaSql)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar .SQL
              </button>
            )}
          </div>
        </div>

        {/* Gemini Centralized AI Explanation (Clear, zero per-user API key needed) */}
        <div className="rounded-xl border border-blue-300 dark:border-blue-900/70 bg-blue-50/80 dark:bg-blue-950/30 p-4 space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-blue-950 dark:text-blue-200">
              <KeyRound className="w-4 h-4" />
              IA Gemini Centralizada para Todos os Administradores
            </div>
            <span
              className={`text-xs font-semibold ${
                integrations.geminiConfigured
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {integrations.geminiConfigured ? 'Ativa no servidor' : 'Aguardando variável GEMINI_API_KEY'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-blue-900/90 dark:text-blue-200/90 leading-relaxed">
            <strong>Os administradores não precisam cadastrar chave individual:</strong> a IA funciona de forma centralizada e segura através do segredo <code className="font-mono font-semibold">GEMINI_API_KEY</code> (configurado em <strong>Settings &gt; Secrets</strong>). Qualquer administrador autenticado já gera mensagens personalizadas automaticamente com base nos requisitos selecionados.
          </p>
        </div>

        {showSql && schemaSql && (
          <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-950 text-slate-100 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Cole e execute este script no SQL Editor do projeto Supabase:</span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(schemaSql)}
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar SQL
              </button>
            </div>
            <pre className="text-xs font-mono overflow-x-auto max-h-64 leading-relaxed">{schemaSql}</pre>
          </div>
        )}

        {integrationFeedback && (
          <div
            role="alert"
            className={`rounded-lg border px-4 py-3 text-sm ${
              integrationFeedback.type === 'error'
                ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            {integrationFeedback.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Supabase Column */}
          <div className="space-y-4 rounded-xl border border-slate-300 dark:border-slate-800 p-4 bg-slate-50/40 dark:bg-slate-950/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Supabase PostgreSQL
              </div>
              {integrations.supabaseConfigured && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Conectado
                </span>
              )}
            </div>

            <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-1 list-decimal list-inside bg-white dark:bg-slate-950/60 border border-slate-300/80 dark:border-slate-800 p-3 rounded-lg">
              <li>Execute o <strong>SQL Schema</strong> acima no SQL Editor do Supabase.</li>
              <li>Em <strong>Project Settings &gt; API</strong>, informe a <strong>Project URL</strong> e a chave <strong>service_role</strong> abaixo (ou configure <code className="font-mono">SUPABASE_URL</code> e <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> nas variáveis de ambiente da Vercel / Secrets).</li>
            </ol>

            <div>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                Project URL
              </label>
              <input
                type="url"
                placeholder="https://seu-projeto.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                Service Role Key
              </label>
              <input
                type="password"
                placeholder={
                  integrations.supabaseConfigured
                    ? '•••••••••••••••• (salva no servidor; preencha só para trocar)'
                    : 'eyJhbGciOiJIUzI1NiIs...'
                }
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleTestSupabase}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {busyAction === 'test_sb' ? 'Testando...' : 'Testar Supabase'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handlePushSupabase}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                {busyAction === 'push_sb' ? 'Enviando...' : 'Enviar Base ao Supabase'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handlePullSupabase}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {busyAction === 'pull_sb' ? 'Importando...' : 'Importar do Supabase'}
              </button>
            </div>
            {integrations.lastSupabaseSyncAt && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Última sincronização: {formatTimestampBr(integrations.lastSupabaseSyncAt)}
              </p>
            )}
          </div>

          {/* Microsoft 365 SMTP Column (Optional Batch Relay with Clear Plain-Language Explanation) */}
          <div className="space-y-4 rounded-xl border border-slate-300 dark:border-slate-800 p-4 bg-slate-50/40 dark:bg-slate-950/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Envio Automático em Lote — SMTP Microsoft (Opcional)
              </div>
              {integrations.smtpConfigured && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ativo
                </span>
              )}
            </div>

            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 bg-white dark:bg-slate-950/60 border border-slate-300/80 dark:border-slate-800 p-3 rounded-lg leading-relaxed">
              <p>
                <strong>Onde conseguir a chave SMTP (Microsoft 365)?</strong> Acesse <code className="font-mono font-semibold">mysignins.microsoft.com/security-info</code> com seu <code className="font-mono">@educacao.sp.gov.br</code>, clique em <strong>Adicionar método de entrada &gt; Senha de aplicativo</strong> e cole a senha gerada abaixo (host <code className="font-mono">smtp.office365.com</code>, porta <code className="font-mono">587</code>).
              </p>
              <p>
                <strong>Importante:</strong> Caso a TI da SEDUC bloqueie o protocolo SMTP na sua conta institucional, a opção de abrir rascunhos prontos no <strong>Outlook Web</strong> continua funcionando normalmente sem exigir chave.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                  Servidor SMTP
                </label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                  Porta
                </label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                Conta Institucional Remetente (para disparo em lote)
              </label>
              <input
                type="email"
                placeholder="conta.institucional@educacao.sp.gov.br"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                Senha / Senha de Aplicativo Microsoft
              </label>
              <input
                type="password"
                placeholder={
                  integrations.smtpConfigured
                    ? '•••••••••••••••• (salva no servidor; preencha só para trocar)'
                    : 'Opcional — preencha apenas para envio automático em lote'
                }
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="pt-1">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleTestSmtp}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {busyAction === 'test_smtp' ? 'Validando SMTP...' : 'Testar Conexão SMTP'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busyAction !== null}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors"
          >
            {busyAction === 'save_int' ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </form>

      {/* 3. Diretório de E-mails das UREs (Multi-URE) */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            3. E-mails das UREs / Diretorias de Ensino (Multi-URE)
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Cadastre os e-mails institucionais de cada Diretoria de Ensino para que perfis Gerais possam enviar comunicados diretamente às UREs.
          </p>
        </div>

        {ureFeedback && (
          <div className="rounded-lg border border-blue-300 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-2.5 text-sm text-blue-900 dark:text-blue-200">
            {ureFeedback}
          </div>
        )}

        <form onSubmit={handleAddUreContact} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Sigla / Nome da URE
            </label>
            <input
              type="text"
              required
              placeholder="Ex.: SUL 3, SUL 1, CENTRO"
              value={newUreName}
              onChange={(e) => setNewUreName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              E-mail da URE
            </label>
            <input
              type="email"
              required
              placeholder="desul3@educacao.sp.gov.br"
              value={newUreEmail}
              onChange={(e) => setNewUreEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ponto Focal (opcional)
            </label>
            <input
              type="text"
              placeholder="PEC / Coordenação"
              value={newUreResp}
              onChange={(e) => setNewUreResp(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Salvar URE
            </button>
          </div>
        </form>

        <div className="border border-slate-300 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
          {ureList.map((u) => (
            <div key={u.ure} className="flex items-center justify-between gap-4 p-3 text-sm">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  URE {u.ure}{' '}
                  {u.responsavel && (
                    <span className="font-normal text-slate-600 dark:text-slate-400">
                      · {u.responsavel}
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  {u.email || 'E-mail ainda não informado'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSaveUreContacts(ureList.filter((item) => item.ure !== u.ure))}
                aria-label={`Remover URE ${u.ure}`}
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Perfis de Administradores (Com Escopo Regional URE vs Geral) */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            4. Perfis de Administradores (Regional por Diretoria ou Geral)
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Defina se o administrador terá acesso <strong>Regional</strong> (metas e e-mails apenas para sua URE) ou <strong>Geral</strong> (metas, escolas e diretorias de todo o estado).
          </p>
        </div>

        {userFeedback && (
          <div className="rounded-lg border border-blue-300 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-2.5 text-sm text-blue-900 dark:text-blue-200">
            {userFeedback}
          </div>
        )}

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex.: Maria Silva (PEC)"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              E-mail Microsoft (@educacao.sp.gov.br)
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="admin@educacao.sp.gov.br"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mín. 6 caract."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tipo de Acesso
            </label>
            <select
              value={newRole === 'master' ? 'master' : newScope}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'master') {
                  setNewRole('master');
                  setNewScope('geral');
                } else if (v === 'geral') {
                  setNewRole('admin');
                  setNewScope('geral');
                } else {
                  setNewRole('admin');
                  setNewScope('ure');
                }
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="ure">Gestor de Diretoria (URE)</option>
              <option value="geral">Gestor Geral (Todas UREs)</option>
              <option value="master">Admin Master</option>
            </select>
          </div>

          {newRole === 'admin' && newScope === 'ure' && (
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                URE Vinculada
              </label>
              <select
                value={newAssignedUre}
                onChange={(e) => setNewAssignedUre(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {availableUres.map((u) => (
                  <option key={u} value={u}>
                    URE {u}
                  </option>
                ))}
                <option value="__CUSTOM__">Outra URE...</option>
              </select>
            </div>
          )}

          {newRole === 'admin' && newScope === 'ure' && newAssignedUre === '__CUSTOM__' && (
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nome/Sigla da Nova URE
              </label>
              <input
                type="text"
                required
                placeholder="Ex.: NORTE 1"
                value={customUreInput}
                onChange={(e) => setCustomUreInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          <div className={newRole === 'admin' && newScope === 'ure' ? 'md:col-span-12 flex justify-end' : 'md:col-span-2'}>
            <button
              type="submit"
              className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Cadastrar Perfil
            </button>
          </div>
        </form>

        <div className="border border-slate-300 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
          {users.length === 0 ? (
            <div className="p-4 text-sm text-slate-600 dark:text-slate-400">
              Nenhum administrador secundário cadastrado além do Master atual.
            </div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-4 p-3.5 text-sm">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-2">
                    <span>{u.name}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      {u.role === 'master'
                        ? 'Admin Master (Geral)'
                        : u.scope === 'ure'
                          ? `Gestor Regional · URE ${u.assignedUre}`
                          : 'Gestor Geral · Todas as UREs'}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                    {u.email}
                  </div>
                </div>
                {u.id !== authUser.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(u.id)}
                    aria-label={`Remover ${u.email}`}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
