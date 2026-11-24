import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AcaoRecord,
  AtaRecord,
  EmailDispatchLog,
  MetasConfig,
  School,
  UreContact,
  UserRole,
  UserScope,
} from '../shared/types.ts';
import type { StoredUserRecord } from './auth.ts';

export const SUPABASE_SCHEMA_SQL = `-- Schema Oficial Grêmio Estudantil — Multi-URE (Supabase / PostgreSQL)
-- Execute este script no SQL Editor do seu projeto Supabase.

create table if not exists public.escolas (
  id text primary key,
  ure text not null default 'SUL 3',
  numero_pdf text,
  cie text unique not null,
  ua text,
  fde text,
  nome_sed text not null,
  nome_pdf text not null,
  email text not null,
  endereco text,
  cep text,
  telefones text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_escolas_ure on public.escolas (ure);

create table if not exists public.ure_contatos (
  ure text primary key,
  email text not null,
  responsavel text,
  updated_at timestamptz not null default now()
);

create table if not exists public.atas_gremio (
  id text primary key,
  diretoria text not null default 'SUL 3',
  escola text not null,
  modelo_ata text not null,
  modelo_normalizado text not null,
  participantes integer not null default 0,
  convocacao text,
  data_reuniao text not null,
  data_iso text,
  mes_ano text,
  created_at timestamptz not null default now()
);

create index if not exists idx_atas_escola on public.atas_gremio (escola);
create index if not exists idx_atas_ure on public.atas_gremio (diretoria);
create index if not exists idx_atas_mes on public.atas_gremio (mes_ano);

create table if not exists public.acoes_gremio (
  id text primary key,
  diretoria text not null default 'SUL 3',
  escola text not null,
  tema text not null,
  subtema text,
  nome_acao text not null,
  participantes integer not null default 0,
  data_acao text not null,
  data_iso text,
  mes_ano text,
  proposta text,
  created_at timestamptz not null default now()
);

create index if not exists idx_acoes_escola on public.acoes_gremio (escola);
create index if not exists idx_acoes_ure on public.acoes_gremio (diretoria);
create index if not exists idx_acoes_tema on public.acoes_gremio (tema);
create index if not exists idx_acoes_mes on public.acoes_gremio (mes_ano);

create table if not exists public.metas_config (
  id integer primary key default 1,
  global_min_atas integer,
  global_min_acoes integer,
  prazo_global text,
  dias_alerta_proximo integer not null default 7,
  rules jsonb not null default '[]'::jsonb,
  alerta_automatico_ativo boolean not null default false,
  template_assunto_proximo text,
  template_corpo_proximo text,
  template_assunto_expirado text,
  template_corpo_expirado text,
  template_assunto_parabens text,
  template_corpo_parabens text,
  email_remetente_padrao text,
  updated_at timestamptz not null default now()
);

create table if not exists public.historico_emails (
  id text primary key,
  sent_at timestamptz not null default now(),
  sender_email text not null,
  sent_by_user text not null,
  recipient_email text not null,
  school_name text not null,
  school_cie text not null,
  ure text not null default 'SUL 3',
  subject text not null,
  body text not null,
  delivery_mode text not null,
  trigger_type text not null,
  status_snapshot text not null
);

create table if not exists public.admin_users (
  id text primary key,
  name text not null,
  email text unique not null,
  role text not null,
  scope text not null default 'geral',
  assigned_ure text,
  password_hash text not null,
  salt text not null,
  created_at timestamptz not null default now()
);

-- Segurança Row-Level Security (Leitura pública restrita a registros agregados; e-mails, metas e usuários gerenciados pelo servidor)
alter table public.escolas enable row level security;
alter table public.ure_contatos enable row level security;
alter table public.atas_gremio enable row level security;
alter table public.acoes_gremio enable row level security;
alter table public.metas_config enable row level security;
alter table public.historico_emails enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Public read atas" on public.atas_gremio;
create policy "Public read atas" on public.atas_gremio for select using (true);

drop policy if exists "Public read acoes" on public.acoes_gremio;
create policy "Public read acoes" on public.acoes_gremio for select using (true);
`;

export type SupabaseKeyKind = 'service_role' | 'anon' | 'unknown';

export function detectSupabaseKeyKind(key: string): SupabaseKeyKind {
  const trimmed = key.trim();
  if (!trimmed) return 'unknown';
  if (trimmed.startsWith('sb_secret_')) return 'service_role';
  if (trimmed.startsWith('sb_publishable_')) return 'anon';

  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        role?: string;
      };
      if (payload.role === 'service_role') return 'service_role';
      if (payload.role === 'anon') return 'anon';
    } catch {
      // ignore malformed JWT
    }
  }
  return 'unknown';
}

export function validateSupabaseUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('URL do Supabase inválida.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('A URL do Supabase deve utilizar protocolo HTTPS.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.') ||
    (!hostname.endsWith('.supabase.co') && !hostname.endsWith('.supabase.in'))
  ) {
    throw new Error('Informe uma URL oficial do projeto Supabase (ex: https://xyz.supabase.co).');
  }
  return parsed;
}

function createSbClient(url: string, key: string) {
  const validated = validateSupabaseUrl(url);
  return createClient(validated.toString(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isMissingRelationOrRlsError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    err.code === '42501' ||
    msg.includes('relation') ||
    msg.includes('schema cache') ||
    msg.includes('permission denied') ||
    msg.includes('row-level security')
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(client: SupabaseClient<any, any, any>, table: string): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  const allRows: Record<string, unknown>[] = [];
  for (let page = 0; page < 100; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await client.from(table).select('*').range(from, to);
    if (error) {
      throw new Error(`Erro ao ler ${table}: ${error.message}`);
    }
    const batch = (data ?? []) as Record<string, unknown>[];
    allRows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return allRows;
}

export async function testSupabaseConnection(url: string, key: string): Promise<{ ok: boolean; detail: string }> {
  if (!url || !url.trim()) {
    throw new Error('Informe a URL do projeto Supabase.');
  }
  if (!key || key.trim().length < 20) {
    throw new Error('Chave do Supabase inválida.');
  }
  const keyKind = detectSupabaseKeyKind(key);
  const client = createSbClient(url, key);

  const { error: atasErr } = await client.from('atas_gremio').select('id', { count: 'exact', head: true });
  if (atasErr) {
    if (atasErr.message.includes('relation') || atasErr.code === '42P01' || atasErr.code === 'PGRST205') {
      return {
        ok: true,
        detail:
          'Conectado ao Supabase, mas as tabelas ainda não existem. Copie o SQL Schema acima e execute no SQL Editor do Supabase.',
      };
    }
    throw new Error(`Erro ao consultar Supabase: ${atasErr.message}`);
  }

  if (keyKind === 'anon') {
    return {
      ok: true,
      detail:
        'Conectado com chave pública (anon): leitura de ATAs e Ações liberada. Para gravar planilhas, metas, e-mails e perfis pelo painel, informe a chave service_role (SUPABASE_SERVICE_ROLE_KEY).',
    };
  }

  const { error: escErr } = await client.from('escolas').select('id', { count: 'exact', head: true });
  if (escErr) {
    return {
      ok: true,
      detail: `Tabela atas_gremio acessível, mas houve aviso em escolas: ${escErr.message}`,
    };
  }

  return { ok: true, detail: 'Conexão validada (service_role) e tabelas encontradas no Supabase.' };
}

async function batchInsert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  table: string,
  rows: Record<string, unknown>[]
) {
  const chunkSize = 400;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).insert(slice);
    if (error) {
      throw new Error(`Falha ao gravar lote em ${table}: ${error.message}`);
    }
  }
}

async function batchUpsert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  const chunkSize = 400;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).upsert(slice, { onConflict });
    if (error) {
      throw new Error(`Erro ao atualizar tabela ${table}: ${error.message}`);
    }
  }
}

export async function pushSnapshotToSupabase(
  url: string,
  key: string,
  data: {
    schools: School[];
    ureContacts: UreContact[];
    atas: AtaRecord[];
    acoes: AcaoRecord[];
    metas: MetasConfig;
    emailLogs?: EmailDispatchLog[];
    users?: StoredUserRecord[];
  }
): Promise<{ syncedAt: string }> {
  if (detectSupabaseKeyKind(key) === 'anon') {
    throw new Error(
      'A chave configurada é pública (anon). Para enviar/gravar dados no Supabase, configure a chave service_role (SUPABASE_SERVICE_ROLE_KEY).'
    );
  }
  const client = createSbClient(url, key);

  // Upsert schools (multi-URE ready)
  if (data.schools.length > 0) {
    const schoolRows = data.schools.map((s) => ({
      id: s.id,
      ure: s.ure || 'SUL 3',
      numero_pdf: s.numeroPdf,
      cie: s.cie,
      ua: s.ua,
      fde: s.fde,
      nome_sed: s.nomeSed,
      nome_pdf: s.nomePdf,
      email: s.email,
      endereco: s.endereco,
      cep: s.cep,
      telefones: s.telefones,
      updated_at: new Date().toISOString(),
    }));
    await batchUpsert(client, 'escolas', schoolRows, 'id');
  }

  // Upsert URE contacts
  if (data.ureContacts.length > 0) {
    const { error: ureErr } = await client.from('ure_contatos').upsert(
      data.ureContacts.map((u) => ({
        ure: u.ure,
        email: u.email,
        responsavel: u.responsavel,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'ure' }
    );
    if (ureErr && !isMissingRelationOrRlsError(ureErr)) {
      throw new Error(`Erro ao atualizar ure_contatos: ${ureErr.message}`);
    }
  }

  // Full replacement of atas_gremio
  const { error: delAtasErr } = await client.from('atas_gremio').delete().neq('id', '');
  if (delAtasErr) {
    throw new Error(`Erro ao limpar atas_gremio: ${delAtasErr.message}`);
  }
  if (data.atas.length > 0) {
    await batchInsert(
      client,
      'atas_gremio',
      data.atas.map((a) => ({
        id: a.id,
        diretoria: a.diretoria,
        escola: a.escola,
        modelo_ata: a.modeloAta,
        modelo_normalizado: a.modeloNormalizado,
        participantes: a.participantes,
        convocacao: a.convocacao,
        data_reuniao: a.dataReuniao,
        data_iso: a.dataIso,
        mes_ano: a.mesAno,
      }))
    );
  }

  // Full replacement of acoes_gremio
  const { error: delAcoesErr } = await client.from('acoes_gremio').delete().neq('id', '');
  if (delAcoesErr) {
    throw new Error(`Erro ao limpar acoes_gremio: ${delAcoesErr.message}`);
  }
  if (data.acoes.length > 0) {
    await batchInsert(
      client,
      'acoes_gremio',
      data.acoes.map((a) => ({
        id: a.id,
        diretoria: a.diretoria,
        escola: a.escola,
        tema: a.tema,
        subtema: a.subtema,
        nome_acao: a.nomeAcao,
        participantes: a.participantes,
        data_acao: a.dataAcao,
        data_iso: a.dataIso,
        mes_ano: a.mesAno,
        proposta: a.proposta,
      }))
    );
  }

  // Upsert metas_config
  const { error: metasErr } = await client.from('metas_config').upsert(
    {
      id: 1,
      global_min_atas: data.metas.globalMinAtas,
      global_min_acoes: data.metas.globalMinAcoes,
      prazo_global: data.metas.prazoGlobal,
      dias_alerta_proximo: data.metas.diasAlertaProximo,
      rules: data.metas.rules,
      alerta_automatico_ativo: data.metas.alertaAutomaticoAtivo,
      template_assunto_proximo: data.metas.templateAssuntoProximo,
      template_corpo_proximo: data.metas.templateCorpoProximo,
      template_assunto_expirado: data.metas.templateAssuntoExpirado,
      template_corpo_expirado: data.metas.templateCorpoExpirado,
      template_assunto_parabens: data.metas.templateAssuntoParabens,
      template_corpo_parabens: data.metas.templateCorpoParabens,
      email_remetente_padrao: data.metas.emailRemetentePadrao,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (metasErr) {
    throw new Error(`Erro ao atualizar metas_config: ${metasErr.message}`);
  }

  // Upsert recent email logs
  if (data.emailLogs && data.emailLogs.length > 0) {
    const logRows = data.emailLogs.slice(0, 500).map((l) => ({
      id: l.id,
      sent_at: l.sentAt,
      sender_email: l.senderEmail,
      sent_by_user: l.sentByUser,
      recipient_email: l.recipientEmail,
      school_name: l.schoolName,
      school_cie: l.schoolCie,
      ure: l.ure,
      subject: l.subject,
      body: l.body,
      delivery_mode: l.deliveryMode,
      trigger_type: l.triggerType,
      status_snapshot: l.statusSnapshot,
    }));
    await client.from('historico_emails').upsert(logRows, { onConflict: 'id' });
  }

  // Sync admin_users if table exists
  if (data.users && data.users.length > 0) {
    await syncUsersToSupabase(url, key, data.users).catch(() => {});
  }

  return { syncedAt: new Date().toISOString() };
}

export async function syncMetasToSupabase(url: string, key: string, metas: MetasConfig): Promise<void> {
  if (!url || !key || detectSupabaseKeyKind(key) === 'anon') return;
  const client = createSbClient(url, key);
  const { error } = await client.from('metas_config').upsert(
    {
      id: 1,
      global_min_atas: metas.globalMinAtas,
      global_min_acoes: metas.globalMinAcoes,
      prazo_global: metas.prazoGlobal,
      dias_alerta_proximo: metas.diasAlertaProximo,
      rules: metas.rules,
      alerta_automatico_ativo: metas.alertaAutomaticoAtivo,
      template_assunto_proximo: metas.templateAssuntoProximo,
      template_corpo_proximo: metas.templateCorpoProximo,
      template_assunto_expirado: metas.templateAssuntoExpirado,
      template_corpo_expirado: metas.templateCorpoExpirado,
      template_assunto_parabens: metas.templateAssuntoParabens,
      template_corpo_parabens: metas.templateCorpoParabens,
      email_remetente_padrao: metas.emailRemetentePadrao,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error && !isMissingRelationOrRlsError(error)) {
    throw new Error(`Erro ao sincronizar metas_config: ${error.message}`);
  }
}

export async function syncUreContactsToSupabase(
  url: string,
  key: string,
  ureContacts: UreContact[]
): Promise<void> {
  if (!url || !key || detectSupabaseKeyKind(key) === 'anon') return;
  const client = createSbClient(url, key);
  const { error: delErr } = await client.from('ure_contatos').delete().neq('ure', '');
  if (delErr && !isMissingRelationOrRlsError(delErr)) {
    throw new Error(`Erro ao atualizar ure_contatos: ${delErr.message}`);
  }
  if (ureContacts.length > 0) {
    const { error } = await client.from('ure_contatos').upsert(
      ureContacts.map((u) => ({
        ure: u.ure,
        email: u.email,
        responsavel: u.responsavel,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'ure' }
    );
    if (error && !isMissingRelationOrRlsError(error)) {
      throw new Error(`Erro ao salvar ure_contatos: ${error.message}`);
    }
  }
}

export async function syncEmailLogsToSupabase(
  url: string,
  key: string,
  logs: EmailDispatchLog[]
): Promise<void> {
  if (!url || !key || logs.length === 0 || detectSupabaseKeyKind(key) === 'anon') return;
  const client = createSbClient(url, key);
  const rows = logs.slice(0, 200).map((l) => ({
    id: l.id,
    sent_at: l.sentAt,
    sender_email: l.senderEmail,
    sent_by_user: l.sentByUser,
    recipient_email: l.recipientEmail,
    school_name: l.schoolName,
    school_cie: l.schoolCie,
    ure: l.ure,
    subject: l.subject,
    body: l.body,
    delivery_mode: l.deliveryMode,
    trigger_type: l.triggerType,
    status_snapshot: l.statusSnapshot,
  }));
  await client.from('historico_emails').upsert(rows, { onConflict: 'id' });
}

export async function syncUsersToSupabase(
  url: string,
  key: string,
  users: StoredUserRecord[]
): Promise<void> {
  if (!url || !key || detectSupabaseKeyKind(key) === 'anon') return;
  const client = createSbClient(url, key);
  const { error: delErr } = await client.from('admin_users').delete().neq('id', '');
  if (delErr) {
    if (isMissingRelationOrRlsError(delErr)) return;
    throw new Error(`Erro ao sincronizar admin_users: ${delErr.message}`);
  }
  if (users.length > 0) {
    const { error } = await client.from('admin_users').upsert(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        scope: u.scope || 'geral',
        assigned_ure: u.assignedUre || null,
        password_hash: u.passwordHash,
        salt: u.salt,
        created_at: u.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error && !isMissingRelationOrRlsError(error)) {
      throw new Error(`Erro ao salvar admin_users: ${error.message}`);
    }
  }
}

export interface PulledSupabaseSnapshot {
  atas: AtaRecord[];
  acoes: AcaoRecord[];
  schools: School[];
  ureContacts: UreContact[];
  metas: MetasConfig | null;
  emailLogs: EmailDispatchLog[];
  users: StoredUserRecord[];
}

export async function pullSnapshotFromSupabase(
  url: string,
  key: string
): Promise<PulledSupabaseSnapshot> {
  const client = createSbClient(url, key);
  const keyKind = detectSupabaseKeyKind(key);

  const atasRows = await fetchAllRows(client, 'atas_gremio');
  const acoesRows = await fetchAllRows(client, 'acoes_gremio');

  const atas: AtaRecord[] = atasRows.map((r) => ({
    id: String(r.id),
    diretoria: String(r.diretoria ?? 'SUL 3'),
    escola: String(r.escola ?? ''),
    modeloAta: String(r.modelo_ata ?? ''),
    modeloNormalizado: String(r.modelo_normalizado ?? ''),
    participantes: Number(r.participantes ?? 0),
    convocacao: String(r.convocacao ?? ''),
    dataReuniao: String(r.data_reuniao ?? ''),
    dataIso: String(r.data_iso ?? ''),
    mesAno: String(r.mes_ano ?? ''),
  }));

  const acoes: AcaoRecord[] = acoesRows.map((r) => ({
    id: String(r.id),
    diretoria: String(r.diretoria ?? 'SUL 3'),
    escola: String(r.escola ?? ''),
    tema: String(r.tema ?? ''),
    subtema: String(r.subtema ?? ''),
    nomeAcao: String(r.nome_acao ?? ''),
    participantes: Number(r.participantes ?? 0),
    dataAcao: String(r.data_acao ?? ''),
    dataIso: String(r.data_iso ?? ''),
    mesAno: String(r.mes_ano ?? ''),
    proposta: String(r.proposta ?? ''),
  }));

  let schools: School[] = [];
  let ureContacts: UreContact[] = [];
  let metas: MetasConfig | null = null;
  let emailLogs: EmailDispatchLog[] = [];
  let users: StoredUserRecord[] = [];

  if (keyKind !== 'anon') {
    try {
      const schoolRows = await fetchAllRows(client, 'escolas');
      schools = schoolRows.map((r) => ({
        id: String(r.id),
        ure: String(r.ure ?? 'SUL 3').toUpperCase().trim(),
        numeroPdf: String(r.numero_pdf ?? ''),
        cie: String(r.cie ?? r.id),
        ua: String(r.ua ?? ''),
        fde: String(r.fde ?? ''),
        nomeSed: String(r.nome_sed ?? ''),
        nomePdf: String(r.nome_pdf ?? r.nome_sed ?? ''),
        email: String(r.email ?? ''),
        endereco: String(r.endereco ?? ''),
        cep: String(r.cep ?? ''),
        telefones: String(r.telefones ?? ''),
      }));
    } catch {
      // Ignore if RLS or table unavailable
    }

    try {
      const { data: ureRows, error: ureErr } = await client.from('ure_contatos').select('*');
      if (!ureErr && ureRows) {
        ureContacts = (ureRows as Record<string, unknown>[]).map((r) => ({
          ure: String(r.ure ?? '').toUpperCase().trim(),
          email: String(r.email ?? '').trim().toLowerCase(),
          responsavel: String(r.responsavel ?? ''),
        }));
      }
    } catch {
      // ignore
    }

    try {
      const { data: metasRow, error: metasErr } = await client
        .from('metas_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (!metasErr && metasRow) {
        const m = metasRow as Record<string, unknown>;
        metas = {
          globalMinAtas: m.global_min_atas !== null && m.global_min_atas !== undefined ? Number(m.global_min_atas) : null,
          globalMinAcoes: m.global_min_acoes !== null && m.global_min_acoes !== undefined ? Number(m.global_min_acoes) : null,
          prazoGlobal: String(m.prazo_global ?? ''),
          diasAlertaProximo: Number(m.dias_alerta_proximo ?? 7),
          rules: Array.isArray(m.rules) ? (m.rules as MetasConfig['rules']) : [],
          alertaAutomaticoAtivo: Boolean(m.alerta_automatico_ativo),
          templateAssuntoProximo: String(m.template_assunto_proximo ?? ''),
          templateCorpoProximo: String(m.template_corpo_proximo ?? ''),
          templateAssuntoExpirado: String(m.template_assunto_expirado ?? ''),
          templateCorpoExpirado: String(m.template_corpo_expirado ?? ''),
          templateAssuntoParabens: String(m.template_assunto_parabens ?? ''),
          templateCorpoParabens: String(m.template_corpo_parabens ?? ''),
          emailRemetentePadrao: String(m.email_remetente_padrao ?? 'gremio.uresul3@educacao.sp.gov.br'),
          updatedAt: String(m.updated_at ?? new Date().toISOString()),
        };
      }
    } catch {
      // ignore
    }

    try {
      const { data: logRows, error: logErr } = await client
        .from('historico_emails')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(500);
      if (!logErr && logRows) {
        emailLogs = (logRows as Record<string, unknown>[]).map((r) => ({
          id: String(r.id),
          sentAt: String(r.sent_at ?? ''),
          senderEmail: String(r.sender_email ?? ''),
          sentByUser: String(r.sent_by_user ?? ''),
          recipientEmail: String(r.recipient_email ?? ''),
          schoolName: String(r.school_name ?? ''),
          schoolCie: String(r.school_cie ?? ''),
          ure: String(r.ure ?? 'SUL 3'),
          subject: String(r.subject ?? ''),
          body: String(r.body ?? ''),
          deliveryMode: (r.delivery_mode as EmailDispatchLog['deliveryMode']) ?? 'registrado',
          triggerType: (r.trigger_type as EmailDispatchLog['triggerType']) ?? 'manual_ia',
          statusSnapshot: (r.status_snapshot as EmailDispatchLog['statusSnapshot']) ?? 'sem_meta',
        }));
      }
    } catch {
      // ignore
    }

    try {
      const { data: userRows, error: userErr } = await client.from('admin_users').select('*');
      if (!userErr && userRows) {
        users = (userRows as Record<string, unknown>[]).map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ''),
          email: String(r.email ?? ''),
          role: (r.role === 'master' ? 'master' : 'admin') as UserRole,
          scope: (r.scope === 'ure' ? 'ure' : 'geral') as UserScope,
          assignedUre: r.assigned_ure ? String(r.assigned_ure) : undefined,
          passwordHash: String(r.password_hash ?? ''),
          salt: String(r.salt ?? ''),
          createdAt: String(r.created_at ?? new Date().toISOString()),
        }));
      }
    } catch {
      // ignore
    }
  }

  return { atas, acoes, schools, ureContacts, metas, emailLogs, users };
}
