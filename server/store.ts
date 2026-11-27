import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeSchoolKey } from '../shared/analytics.ts';
import type { StoredUserRecord } from './auth.ts';
import { parseAcoesCsv, parseAtasCsv } from './csvParser.ts';
import { URE_SUL_3_SCHOOLS } from './schoolsSeed.ts';
import {
  detectSupabaseKeyKind,
  pullSnapshotFromSupabase,
  type SupabaseKeyKind,
} from './supabaseSync.ts';
import type {
  AcaoRecord,
  AtaRecord,
  EmailDispatchLog,
  IntegrationStatus,
  MetasConfig,
  School,
  UreContact,
} from '../shared/types.ts';

export interface ServerIntegrationConfig {
  supabaseUrl: string;
  supabaseKey: string;
  lastSupabaseSyncAt: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}

export interface StoreState {
  schools: School[];
  ureContacts: UreContact[];
  atas: AtaRecord[];
  acoes: AcaoRecord[];
  metas: MetasConfig;
  emailLogs: EmailDispatchLog[];
  users: StoredUserRecord[];
  integrations: ServerIntegrationConfig;
  lastAtasUploadAt: string | null;
  lastAcoesUploadAt: string | null;
}

const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION
);
const DATA_DIR = IS_SERVERLESS
  ? path.join(os.tmpdir(), 'gremio-seduc-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const DEFAULT_METAS: MetasConfig = {
  globalMinAtas: null,
  globalMinAcoes: null,
  prazoGlobal: '',
  diasAlertaProximo: 7,
  rules: [],
  alertaAutomaticoAtivo: false,
  templateAssuntoProximo: '[{{ure}}] Lembrete de Registro — Grêmio Estudantil ({{escola}})',
  templateCorpoProximo:
    'Prezada equipe gestora e coordenação do Grêmio Estudantil da {{escola}} (CIE {{cie}}),\n\nEncaminhamos este lembrete referente ao registro de "{{item_foco}}" (prazo: {{prazo}}).\n\nResumo atual:\n- Registro no item em foco: {{total_item}}\n- Total de ATAs registradas: {{total_atas}}\n- Total de Ações registradas: {{total_acoes}}\n- Itens a regularizar: {{pendencias}}\n\nContamos com o apoio da unidade escolar para conclusão do registro.\n\nAtenciosamente,\nEquipe Grêmio Estudantil — {{ure}}',
  templateAssuntoExpirado: '[{{ure}}] Regularização de Registro do Grêmio Estudantil — {{escola}}',
  templateCorpoExpirado:
    'Prezada equipe gestora e Grêmio Estudantil da {{escola}} (CIE {{cie}}),\n\nIdentificamos que os registros referentes a "{{item_foco}}" ainda não foram concluídos conforme o prazo estipulado ({{prazo}}).\n\nSituação atual:\n- ATAs registradas: {{total_atas}}\n- Ações registradas: {{total_acoes}}\n- Pendências identificadas: {{pendencias}}\n\nSolicitamos a gentileza de atualizar o lançamento assim que possível.\n\nAtenciosamente,\nEquipe Grêmio Estudantil — {{ure}}',
  templateAssuntoParabens: '[{{ure}}] Parabéns pelos Registros do Grêmio Estudantil — {{escola}}',
  templateCorpoParabens:
    'Prezada equipe gestora e estudantes do Grêmio Estudantil da {{escola}} (CIE {{cie}}),\n\nParabenizamos a unidade escolar pelo compromisso e pela organização nos registros das atividades do Grêmio Estudantil.\n\nResumo de participação da escola:\n- ATAs registradas: {{total_atas}}\n- Ações realizadas: {{total_acoes}}\n\nAgradecemos o empenho de toda a equipe escolar e dos estudantes protagonistas!\n\nAtenciosamente,\nEquipe Grêmio Estudantil — {{ure}}',
  emailRemetentePadrao: 'gremio.uresul3@educacao.sp.gov.br',
  updatedAt: new Date().toISOString(),
};

const DEFAULT_URE_CONTACTS: UreContact[] = [
  {
    ure: 'SUL 3',
    email: 'gremio.uresul3@educacao.sp.gov.br',
    responsavel: 'Coordenação Grêmio Estudantil — URE Sul 3',
  },
];

function buildBaseSchools(): School[] {
  return URE_SUL_3_SCHOOLS.map((s) => ({
    id: s.id,
    ure: 'SUL 3',
    numeroPdf: s.numeroPdf,
    cie: s.cie,
    ua: s.ua,
    fde: s.fde,
    nomeSed: s.nomeSed,
    nomePdf: s.nomePdf,
    email: s.email,
    endereco: s.endereco,
    cep: s.cep,
    telefones: s.telefones,
  }));
}

export function mergeWithBaseSchools(existing: School[] | undefined): School[] {
  const base = buildBaseSchools();
  if (!existing || existing.length === 0) return base;
  const byId = new Map<string, School>();
  for (const s of base) {
    byId.set(s.id, s);
  }
  for (const s of existing) {
    byId.set(s.id, {
      id: s.id,
      ure: (s.ure || 'SUL 3').toUpperCase().trim(),
      numeroPdf: s.numeroPdf || '',
      cie: s.cie,
      ua: s.ua || '',
      fde: s.fde || '',
      nomeSed: s.nomeSed,
      nomePdf: s.nomePdf || s.nomeSed,
      email: s.email || '',
      endereco: s.endereco || '',
      cep: s.cep || '',
      telefones: s.telefones || '',
    });
  }
  return [...byId.values()];
}

function mergeSchoolsAndUresFromRecords(
  schools: School[],
  ureContacts: UreContact[],
  atas: AtaRecord[],
  acoes: AcaoRecord[]
): { schools: School[]; ureContacts: UreContact[] } {
  const byKey = new Map<string, School>();
  for (const s of schools) {
    byKey.set(normalizeSchoolKey(s.nomeSed), s);
    if (s.nomePdf) byKey.set(normalizeSchoolKey(s.nomePdf), s);
  }

  const nextSchools = [...schools];
  const registerIfMissing = (diretoria: string, escola: string) => {
    const rawName = (escola || '').trim();
    if (!rawName) return;
    const key = normalizeSchoolKey(rawName);
    if (byKey.has(key)) return;
    const dir = (diretoria || 'SUL 3').toUpperCase().trim();
    const slug = key.replace(/\s+/g, '-').slice(0, 48);
    const id = `auto-${dir.replace(/\s+/g, '')}-${slug}`;
    const stub: School = {
      id,
      ure: dir,
      numeroPdf: '',
      cie: id,
      ua: '',
      fde: '',
      nomeSed: rawName.toUpperCase(),
      nomePdf: rawName.toUpperCase(),
      email: '',
      endereco: '',
      cep: '',
      telefones: '',
    };
    byKey.set(key, stub);
    nextSchools.push(stub);
  };

  for (const a of atas) registerIfMissing(a.diretoria, a.escola);
  for (const a of acoes) registerIfMissing(a.diretoria, a.escola);

  const ureSet = new Set(ureContacts.map((u) => u.ure.toUpperCase().trim()));
  const nextContacts = [...ureContacts];
  for (const s of nextSchools) {
    const u = (s.ure || '').toUpperCase().trim();
    if (u && !ureSet.has(u)) {
      ureSet.add(u);
      nextContacts.push({
        ure: u,
        email: '',
        responsavel: `Coordenação URE ${u}`,
      });
    }
  }

  return { schools: nextSchools, ureContacts: nextContacts };
}

function stripSedText(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  return text
    .replace(/\s+na plataforma SED/gi, '')
    .replace(/\s+na SED/gi, '')
    .replace(/plataforma SED/gi, 'sistema oficial');
}

function resolveSeedAssetPath(filename: string): string | null {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'public/assets/aistudio', filename),
    path.resolve(__dirname, '../public/assets/aistudio', filename),
    path.resolve(__dirname, '../../public/assets/aistudio', filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function seedInitialRecords(schools: School[]): { atas: AtaRecord[]; acoes: AcaoRecord[] } {
  const atasPath = resolveSeedAssetPath('SGGE_-_Atas_do_Gr_mio_Estudantil__6__15e10544.csv');
  const acoesPath = resolveSeedAssetPath('A__es_do_Gr_mio_Estudantil__5__cf0a3794.csv');

  let atas: AtaRecord[] = [];
  let acoes: AcaoRecord[] = [];

  if (atasPath) {
    const raw = fs.readFileSync(atasPath, 'utf8');
    atas = parseAtasCsv(raw, schools).records;
  }
  if (acoesPath) {
    const raw = fs.readFileSync(acoesPath, 'utf8');
    acoes = parseAcoesCsv(raw, schools).records;
  }

  return { atas, acoes };
}

export function resolveSupabaseConfig(state?: StoreState): {
  url: string;
  key: string;
  keyKind: SupabaseKeyKind;
} {
  const envUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    '';
  const envKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    '';

  const url = (envUrl || state?.integrations.supabaseUrl || '').trim();
  const key = (envKey || state?.integrations.supabaseKey || '').trim();
  return {
    url,
    key,
    keyKind: detectSupabaseKeyKind(key),
  };
}

let cachedState: StoreState | null = null;
let lastHydratedAttemptMs = 0;
let hydrationInFlight: Promise<StoreState> | null = null;
const HYDRATION_TTL_MS = 60_000;

export function markSupabaseHydratedNow(): void {
  lastHydratedAttemptMs = Date.now();
}

export function loadStore(): StoreState {
  if (cachedState) return cachedState;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Read-only FS safe fallback (keep working in memory)
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as StoreState;
      parsed.schools = mergeWithBaseSchools(parsed.schools);
      if (!Array.isArray(parsed.ureContacts) || parsed.ureContacts.length === 0) {
        parsed.ureContacts = DEFAULT_URE_CONTACTS;
      }
      if (!parsed.metas || !Array.isArray(parsed.metas.rules)) {
        parsed.metas = { ...DEFAULT_METAS, updatedAt: new Date().toISOString() };
      } else {
        parsed.metas.templateAssuntoProximo = stripSedText(
          parsed.metas.templateAssuntoProximo,
          DEFAULT_METAS.templateAssuntoProximo
        );
        parsed.metas.templateCorpoProximo = stripSedText(
          parsed.metas.templateCorpoProximo,
          DEFAULT_METAS.templateCorpoProximo
        );
        parsed.metas.templateAssuntoExpirado = stripSedText(
          parsed.metas.templateAssuntoExpirado,
          DEFAULT_METAS.templateAssuntoExpirado
        );
        parsed.metas.templateCorpoExpirado = stripSedText(
          parsed.metas.templateCorpoExpirado,
          DEFAULT_METAS.templateCorpoExpirado
        );
        parsed.metas.templateAssuntoParabens = stripSedText(
          parsed.metas.templateAssuntoParabens,
          DEFAULT_METAS.templateAssuntoParabens
        );
        parsed.metas.templateCorpoParabens = stripSedText(
          parsed.metas.templateCorpoParabens,
          DEFAULT_METAS.templateCorpoParabens
        );
      }
      if (Array.isArray(parsed.users)) {
        parsed.users = parsed.users.map((u) => ({
          ...u,
          scope: u.role === 'master' ? 'geral' : (u.scope || 'geral'),
        }));
      } else {
        parsed.users = [];
      }
      if (!parsed.integrations) {
        const sb = resolveSupabaseConfig();
        parsed.integrations = {
          supabaseUrl: sb.url,
          supabaseKey: sb.key,
          lastSupabaseSyncAt: null,
          smtpHost: process.env.SMTP_HOST || 'smtp.office365.com',
          smtpPort: Number(process.env.SMTP_PORT || 587),
          smtpUser: process.env.SMTP_USER || '',
          smtpPass: process.env.SMTP_PASS || '',
        };
      }
      cachedState = parsed;
      return cachedState;
    } catch {
      // Fallback to fresh seed if JSON corrupted
    }
  }

  const baseSchools = buildBaseSchools();
  const { atas, acoes } = seedInitialRecords(baseSchools);
  const mergedSeed = mergeSchoolsAndUresFromRecords(baseSchools, DEFAULT_URE_CONTACTS, atas, acoes);
  const now = new Date().toISOString();
  const sb = resolveSupabaseConfig();

  cachedState = {
    schools: mergedSeed.schools,
    ureContacts: mergedSeed.ureContacts,
    atas,
    acoes,
    metas: DEFAULT_METAS,
    emailLogs: [],
    users: [],
    integrations: {
      supabaseUrl: sb.url,
      supabaseKey: sb.key,
      lastSupabaseSyncAt: null,
      smtpHost: process.env.SMTP_HOST || 'smtp.office365.com',
      smtpPort: Number(process.env.SMTP_PORT || 587),
      smtpUser: process.env.SMTP_USER || '',
      smtpPass: process.env.SMTP_PASS || '',
    },
    lastAtasUploadAt: atas.length > 0 ? now : null,
    lastAcoesUploadAt: acoes.length > 0 ? now : null,
  };

  saveStore(cachedState);
  return cachedState;
}

export function saveStore(state: StoreState): void {
  cachedState = state;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    // On ephemeral or read-only serverless containers, keep functioning cleanly in memory
    console.warn('Persistência local em disco ignorada:', err instanceof Error ? err.message : err);
  }
}

export async function ensureStoreHydrated(forceRefresh = false): Promise<StoreState> {
  const state = loadStore();
  const { url, key } = resolveSupabaseConfig(state);
  if (!url || !key) {
    return state;
  }

  const nowMs = Date.now();
  if (!forceRefresh && lastHydratedAttemptMs > 0 && nowMs - lastHydratedAttemptMs < HYDRATION_TTL_MS) {
    return state;
  }

  if (hydrationInFlight) {
    return hydrationInFlight;
  }

  hydrationInFlight = (async () => {
    try {
      const pulled = await pullSnapshotFromSupabase(url, key);
      const nowIso = new Date().toISOString();

      if (pulled.schools.length > 0) {
        state.schools = mergeWithBaseSchools(pulled.schools);
      }
      if (pulled.atas.length > 0) {
        state.atas = pulled.atas;
      }
      if (pulled.acoes.length > 0) {
        state.acoes = pulled.acoes;
      }
      if (pulled.ureContacts.length > 0) {
        state.ureContacts = pulled.ureContacts;
      }
      if (pulled.metas) {
        state.metas = {
          ...DEFAULT_METAS,
          ...pulled.metas,
          templateAssuntoProximo: stripSedText(
            pulled.metas.templateAssuntoProximo,
            DEFAULT_METAS.templateAssuntoProximo
          ),
          templateCorpoProximo: stripSedText(
            pulled.metas.templateCorpoProximo,
            DEFAULT_METAS.templateCorpoProximo
          ),
          templateAssuntoExpirado: stripSedText(
            pulled.metas.templateAssuntoExpirado,
            DEFAULT_METAS.templateAssuntoExpirado
          ),
          templateCorpoExpirado: stripSedText(
            pulled.metas.templateCorpoExpirado,
            DEFAULT_METAS.templateCorpoExpirado
          ),
          templateAssuntoParabens: stripSedText(
            pulled.metas.templateAssuntoParabens,
            DEFAULT_METAS.templateAssuntoParabens
          ),
          templateCorpoParabens: stripSedText(
            pulled.metas.templateCorpoParabens,
            DEFAULT_METAS.templateCorpoParabens
          ),
        };
      }
      if (pulled.emailLogs.length > 0) {
        state.emailLogs = pulled.emailLogs;
      }
      if (pulled.users.length > 0) {
        state.users = pulled.users;
      }

      if (pulled.atas.length > 0 || pulled.acoes.length > 0 || pulled.schools.length > 0) {
        const merged = mergeSchoolsAndUresFromRecords(
          state.schools,
          state.ureContacts,
          state.atas,
          state.acoes
        );
        state.schools = merged.schools;
        state.ureContacts = merged.ureContacts;
        state.integrations.lastSupabaseSyncAt = state.integrations.lastSupabaseSyncAt || nowIso;
        if (pulled.atas.length > 0 && !state.lastAtasUploadAt) {
          state.lastAtasUploadAt = nowIso;
        }
        if (pulled.acoes.length > 0 && !state.lastAcoesUploadAt) {
          state.lastAcoesUploadAt = nowIso;
        }
        saveStore(state);
      }

      lastHydratedAttemptMs = Date.now();
    } catch (err) {
      // Never block dashboard availability if Supabase tables are still empty or initializing
      lastHydratedAttemptMs = Date.now();
      console.warn(
        'Hidratação automática do Supabase não aplicada neste ciclo:',
        err instanceof Error ? err.message : err
      );
    } finally {
      hydrationInFlight = null;
    }
    return state;
  })();

  return hydrationInFlight;
}

export function getPublicIntegrationStatus(state: StoreState): IntegrationStatus {
  const { url: effectiveSupabaseUrl, key: effectiveSupabaseKey } = resolveSupabaseConfig(state);
  const effectiveSmtpHost =
    process.env.SMTP_HOST || state.integrations.smtpHost || 'smtp.office365.com';
  const effectiveSmtpPort = Number(
    process.env.SMTP_PORT || state.integrations.smtpPort || 587
  );
  const effectiveSmtpUser = process.env.SMTP_USER || state.integrations.smtpUser;
  const effectiveSmtpPass = process.env.SMTP_PASS || state.integrations.smtpPass;

  return {
    supabaseConfigured: Boolean(effectiveSupabaseUrl && effectiveSupabaseKey),
    supabaseUrl: effectiveSupabaseUrl || null,
    lastSupabaseSyncAt: state.integrations.lastSupabaseSyncAt,
    smtpConfigured: Boolean(effectiveSmtpUser && effectiveSmtpPass),
    smtpHost: effectiveSmtpHost,
    smtpPort: effectiveSmtpPort,
    smtpUser: effectiveSmtpUser || null,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    lastAtasUploadAt: state.lastAtasUploadAt,
    lastAcoesUploadAt: state.lastAcoesUploadAt,
  };
}
