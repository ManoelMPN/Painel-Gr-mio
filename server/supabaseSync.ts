import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AcaoRecord,
  AtaRecord,
  EmailDispatchLog,
  MetasConfig,
  School,
  UreContact,
} from '../shared/types.ts';

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

-- Segurança Row-Level Security (Leitura pública restrita a registros agregados; e-mails e metas gerenciados pelo servidor)
alter table public.escolas enable row level security;
alter table public.ure_contatos enable row level security;
alter table public.atas_gremio enable row level security;
alter table public.acoes_gremio enable row level security;
alter table public.metas_config enable row level security;
alter table public.historico_emails enable row level security;

drop policy if exists "Public read atas" on public.atas_gremio;
create policy "Public read atas" on public.atas_gremio for select using (true);

drop policy if exists "Public read acoes" on public.acoes_gremio;
create policy "Public read acoes" on public.acoes_gremio for select using (true);
`;

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
    !hostname.endsWith('.supabase.co')
  ) {
    throw new Error('Informe uma URL oficial do projeto Supabase (ex: https://xyz.supabase.co).');
  }
  return parsed;
}

export async function testSupabaseConnection(url: string, key: string): Promise<{ ok: boolean; detail: string }> {
  const validated = validateSupabaseUrl(url);
  if (!key || key.trim().length < 20) {
    throw new Error('Chave Service Role do Supabase inválida.');
  }
  const client = createClient(validated.toString(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.from('escolas').select('id', { count: 'exact', head: true });
  if (error) {
    if (error.message.includes('relation') || error.code === '42P01') {
      return {
        ok: true,
        detail: 'Conectado ao Supabase, mas as tabelas ainda não existem. Copie o SQL Schema acima e execute no SQL Editor do Supabase.',
      };
    }
    throw new Error(`Erro ao consultar Supabase: ${error.message}`);
  }
  return { ok: true, detail: 'Conexão validada e tabelas encontradas no Supabase.' };
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
  }
): Promise<{ syncedAt: string }> {
  const validated = validateSupabaseUrl(url);
  const client = createClient(validated.toString(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Upsert schools (multi-URE ready)
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

  const { error: schoolErr } = await client.from('escolas').upsert(schoolRows, { onConflict: 'id' });
  if (schoolErr) {
    throw new Error(`Erro ao atualizar tabela escolas: ${schoolErr.message}`);
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
    if (ureErr && !ureErr.message.includes('relation')) {
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

  return { syncedAt: new Date().toISOString() };
}

export async function pullSnapshotFromSupabase(
  url: string,
  key: string
): Promise<{ atas: AtaRecord[]; acoes: AcaoRecord[] }> {
  const validated = validateSupabaseUrl(url);
  const client = createClient(validated.toString(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: atasRows, error: atasErr } = await client.from('atas_gremio').select('*').limit(20000);
  if (atasErr) {
    throw new Error(`Erro ao ler atas_gremio: ${atasErr.message}`);
  }

  const { data: acoesRows, error: acoesErr } = await client.from('acoes_gremio').select('*').limit(20000);
  if (acoesErr) {
    throw new Error(`Erro ao ler acoes_gremio: ${acoesErr.message}`);
  }

  const atas: AtaRecord[] = (atasRows ?? []).map((r: Record<string, unknown>) => ({
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

  const acoes: AcaoRecord[] = (acoesRows ?? []).map((r: Record<string, unknown>) => ({
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

  return { atas, acoes };
}
