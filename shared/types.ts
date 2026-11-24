export type UserRole = 'master' | 'admin';
export type UserScope = 'geral' | 'ure';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  scope: UserScope;
  assignedUre?: string;
  createdAt: string;
}

export interface School {
  id: string;
  ure: string;
  numeroPdf: string;
  cie: string;
  ua: string;
  fde: string;
  nomeSed: string;
  nomePdf: string;
  email: string;
  endereco: string;
  cep: string;
  telefones: string;
}

export interface UreContact {
  ure: string;
  email: string;
  responsavel: string;
}

export interface AtaRecord {
  id: string;
  diretoria: string;
  escola: string;
  modeloAta: string;
  modeloNormalizado: string;
  participantes: number;
  convocacao: string;
  dataReuniao: string;
  dataIso: string;
  mesAno: string;
}

export interface AcaoRecord {
  id: string;
  diretoria: string;
  escola: string;
  tema: string;
  subtema: string;
  nomeAcao: string;
  participantes: number;
  dataAcao: string;
  dataIso: string;
  mesAno: string;
  proposta: string;
}

export type MetaRuleType = 'modelo_ata' | 'tema_acao' | 'subtema_acao';

export interface MetaRule {
  id: string;
  ureScope: string; // 'ALL' or specific URE like 'SUL 3'
  tipo: MetaRuleType;
  targetName: string;
  parentTema?: string;
  minQuantidade: number;
  prazoLimite: string; // YYYY-MM-DD or ''
  ativo: boolean;
}

export interface MetasConfig {
  globalMinAtas: number | null;
  globalMinAcoes: number | null;
  prazoGlobal: string;
  diasAlertaProximo: number;
  rules: MetaRule[];
  alertaAutomaticoAtivo: boolean;
  templateAssuntoProximo: string;
  templateCorpoProximo: string;
  templateAssuntoExpirado: string;
  templateCorpoExpirado: string;
  templateAssuntoParabens: string;
  templateCorpoParabens: string;
  emailRemetentePadrao: string;
  updatedAt: string;
}

export type ComplianceStatus = 'sem_meta' | 'em_dia' | 'atencao' | 'pendente';

export interface RuleEvaluation {
  ruleId: string;
  tipo: MetaRuleType;
  label: string;
  atual: number;
  meta: number;
  prazoLimite: string;
  atendido: boolean;
  vencido: boolean;
  proximoVencimento: boolean;
}

export interface SchoolCompliance {
  school: School;
  totalAtas: number;
  totalParticipantesAtas: number;
  totalAcoes: number;
  totalParticipantesAcoes: number;
  modelosPresentes: string[];
  temasPresentes: string[];
  subtemasPresentes: string[];
  ultimaAtaData: string | null;
  ultimaAcaoData: string | null;
  hasConfiguredMetas: boolean;
  ruleEvaluations: RuleEvaluation[];
  status: ComplianceStatus;
  motivosPendencia: string[];
  percentualCumprimento: number;
}

export interface EmailDispatchLog {
  id: string;
  sentAt: string;
  senderEmail: string;
  sentByUser: string;
  recipientEmail: string;
  schoolName: string;
  schoolCie: string;
  ure: string;
  subject: string;
  body: string;
  deliveryMode: 'smtp_microsoft365' | 'outlook_export' | 'registrado';
  triggerType: 'manual_ia' | 'manual_template' | 'alerta_automatico' | 'parabenizacao';
  statusSnapshot: ComplianceStatus;
}

export interface IntegrationStatus {
  supabaseConfigured: boolean;
  supabaseUrl: string | null;
  lastSupabaseSyncAt: string | null;
  smtpConfigured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string | null;
  geminiConfigured: boolean;
  lastAtasUploadAt: string | null;
  lastAcoesUploadAt: string | null;
}

export interface DashboardPayload {
  schools: School[];
  atas: AtaRecord[];
  acoes: AcaoRecord[];
  metas: MetasConfig | null;
  ureContacts: UreContact[];
  emailLogs: EmailDispatchLog[];
  integrations: IntegrationStatus;
}
