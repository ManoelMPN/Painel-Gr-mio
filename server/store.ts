import fs from 'fs';
import path from 'path';
import type { StoredUserRecord } from './auth.ts';
import { parseAcoesCsv, parseAtasCsv } from './csvParser.ts';
import { URE_SUL_3_SCHOOLS } from './schoolsSeed.ts';
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

const DATA_DIR = path.resolve(process.cwd(), 'data');
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

function mergeWithBaseSchools(existing: School[] | undefined): School[] {
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

function stripSedText(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  return text
    .replace(/\s+na plataforma SED/gi, '')
    .replace(/\s+na SED/gi, '')
    .replace(/plataforma SED/gi, 'sistema oficial');
}

function seedInitialRecords(schools: School[]): { atas: AtaRecord[]; acoes: AcaoRecord[] } {
  const atasPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/Atas_do_Gr_mio_Estudantil_0fba7e87.csv'
  );
  const acoesPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/A__es_do_Gr_mio_Estudantil_34c48d07.csv'
  );

  let atas: AtaRecord[] = [];
  let acoes: AcaoRecord[] = [];

  if (fs.existsSync(atasPath)) {
    const raw = fs.readFileSync(atasPath, 'utf8');
    atas = parseAtasCsv(raw, schools).records;
  }
  if (fs.existsSync(acoesPath)) {
    const raw = fs.readFileSync(acoesPath, 'utf8');
    acoes = parseAcoesCsv(raw, schools).records;
  }

  return { atas, acoes };
}

let cachedState: StoreState | null = null;

export function loadStore(): StoreState {
  if (cachedState) return cachedState;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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
      }
      if (!parsed.integrations) {
        parsed.integrations = {
          supabaseUrl: process.env.SUPABASE_URL || '',
          supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
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

  const schools = buildBaseSchools();
  const { atas, acoes } = seedInitialRecords(schools);
  const now = new Date().toISOString();

  cachedState = {
    schools,
    ureContacts: DEFAULT_URE_CONTACTS,
    atas,
    acoes,
    metas: DEFAULT_METAS,
    emailLogs: [],
    users: [],
    integrations: {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
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
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function getPublicIntegrationStatus(state: StoreState): IntegrationStatus {
  const effectiveSupabaseUrl = process.env.SUPABASE_URL || state.integrations.supabaseUrl;
  const effectiveSupabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || state.integrations.supabaseKey;
  const effectiveSmtpHost = process.env.SMTP_HOST || state.integrations.smtpHost || 'smtp.office365.com';
  const effectiveSmtpPort = Number(process.env.SMTP_PORT || state.integrations.smtpPort || 587);
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
