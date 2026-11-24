import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  computeSchoolCompliance,
  daysUntilDeadline,
  isDeadlineExpired,
  normalizeSchoolKey,
} from './shared/analytics.ts';
import type { AuthUser, MetaRule, MetasConfig, School, UreContact, UserScope } from './shared/types.ts';
import { hashPassword, signAuthToken, toPublicUser, verifyAuthToken, verifyPassword } from './server/auth.ts';
import { parseAcoesCsv, parseAdditionalSchoolsCsv, parseAtasCsv } from './server/csvParser.ts';
import {
  generatePersonalizedSchoolMessages,
  generateUreSummaryMessages,
  type FocusContext,
} from './server/geminiService.ts';
import { sendSchoolEmail, testSmtpConnection, validateSmtpHost } from './server/mailer.ts';
import { getPublicIntegrationStatus, loadStore, saveStore } from './server/store.ts';
import {
  pullSnapshotFromSupabase,
  pushSnapshotToSupabase,
  SUPABASE_SCHEMA_SQL,
  testSupabaseConnection,
  validateSupabaseUrl,
} from './server/supabaseSync.ts';

dotenv.config();

const app = express();
app.use(express.json({ limit: '25mb' }));

function getRequestUser(req: express.Request): AuthUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const payload = verifyAuthToken(token);
  if (!payload) return null;
  return {
    id: payload.sub,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    scope: payload.role === 'master' ? 'geral' : (payload.scope || 'geral'),
    assignedUre: payload.role === 'master' ? undefined : payload.assignedUre,
    createdAt: '',
  };
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: 'Autenticação necessária para esta operação.' });
    return;
  }
  (req as express.Request & { authUser: AuthUser }).authUser = user;
  next();
}

function requireMaster(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }
  if (user.role !== 'master') {
    res.status(403).json({ error: 'Acesso restrito ao Administrador Master.' });
    return;
  }
  (req as express.Request & { authUser: AuthUser }).authUser = user;
  next();
}

function isMasterConfigured(): boolean {
  const envEmail = process.env.ADMIN_MASTER_EMAIL?.trim();
  const envPass = process.env.ADMIN_MASTER_PASSWORD?.trim();
  if (envEmail && envPass) return true;
  const store = loadStore();
  return store.users.some((u) => u.role === 'master');
}

function mergeDiscoveredSchoolsAndUres(
  existingSchools: School[],
  discovered: School[],
  existingUreContacts: UreContact[]
): { schools: School[]; ureContacts: UreContact[] } {
  const byKey = new Map<string, School>();
  for (const s of existingSchools) {
    byKey.set(normalizeSchoolKey(s.nomeSed), s);
  }
  for (const d of discovered) {
    const key = normalizeSchoolKey(d.nomeSed);
    if (!byKey.has(key)) {
      byKey.set(key, d);
    }
  }
  const mergedSchools = [...byKey.values()];

  const ureSet = new Set(existingUreContacts.map((u) => u.ure.toUpperCase().trim()));
  const nextContacts = [...existingUreContacts];
  for (const s of mergedSchools) {
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

  return { schools: mergedSchools, ureContacts: nextContacts };
}

// ---------- DASHBOARD DATA ----------

app.get('/api/dashboard', (req, res) => {
  const user = getRequestUser(req);
  const store = loadStore();

  if (!user) {
    const publicSchools = store.schools.map((s) => ({
      ...s,
      email: '',
      endereco: '',
      cep: '',
      telefones: '',
    }));

    res.json({
      schools: publicSchools,
      atas: store.atas,
      acoes: store.acoes,
      metas: null,
      ureContacts: [],
      emailLogs: [],
      integrations: getPublicIntegrationStatus(store),
    });
    return;
  }

  res.json({
    schools: store.schools,
    atas: store.atas,
    acoes: store.acoes,
    metas: store.metas,
    ureContacts: store.ureContacts,
    emailLogs: store.emailLogs,
    integrations: getPublicIntegrationStatus(store),
  });
});

app.get('/api/auth/status', (req, res) => {
  const user = getRequestUser(req);
  res.json({
    masterConfigured: isMasterConfigured(),
    user,
  });
});

app.post('/api/auth/setup-master', (req, res) => {
  if (isMasterConfigured()) {
    res.status(409).json({ error: 'O Administrador Master já está configurado.' });
    return;
  }
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };
  if (!email || !email.includes('@') || !password || password.length < 6) {
    res.status(400).json({ error: 'Informe um e-mail válido e uma senha com pelo menos 6 caracteres.' });
    return;
  }

  const store = loadStore();
  const { hash, salt } = hashPassword(password);
  const newUser = {
    id: `usr-${crypto.randomUUID()}`,
    name: (name || 'Admin Master').trim(),
    email: email.trim().toLowerCase(),
    role: 'master' as const,
    scope: 'geral' as const,
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
  };
  store.users.push(newUser);
  saveStore(store);

  const publicUser = toPublicUser(newUser);
  const token = signAuthToken(publicUser);
  res.json({ token, user: publicUser });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Informe e-mail e senha.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const envMasterEmail = process.env.ADMIN_MASTER_EMAIL?.trim().toLowerCase();
  const envMasterPass = process.env.ADMIN_MASTER_PASSWORD;
  if (envMasterEmail && envMasterPass && normalizedEmail === envMasterEmail) {
    const a = Buffer.from(password);
    const b = Buffer.from(envMasterPass);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      const masterUser: AuthUser = {
        id: 'env-master',
        name: 'Administrador Master',
        email: envMasterEmail,
        role: 'master',
        scope: 'geral',
        createdAt: new Date().toISOString(),
      };
      const token = signAuthToken(masterUser);
      res.json({ token, user: masterUser });
      return;
    }
    res.status(401).json({ error: 'Credenciais inválidas.' });
    return;
  }

  const store = loadStore();
  const found = store.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!found || !verifyPassword(password, found.passwordHash, found.salt)) {
    res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    return;
  }

  const publicUser = toPublicUser(found);
  const token = signAuthToken(publicUser);
  res.json({ token, user: publicUser });
});

// ---------- ADMIN + MASTER ROUTES (Enforcing scope: 'geral' vs 'ure') ----------

app.put('/api/metas', requireAdmin, (req, res) => {
  const authUser = (req as express.Request & { authUser: AuthUser }).authUser;
  const body = req.body as Partial<MetasConfig>;
  const store = loadStore();

  const isUreScoped = authUser.role !== 'master' && authUser.scope === 'ure' && authUser.assignedUre;
  const assignedUre = authUser.assignedUre?.toUpperCase().trim() || '';

  const incomingRules: MetaRule[] = Array.isArray(body.rules)
    ? body.rules
        .filter((r) => r && r.targetName && r.tipo)
        .map((r) => ({
          id: String(r.id || `rule-${crypto.randomUUID()}`),
          ureScope: isUreScoped
            ? assignedUre
            : String(r.ureScope || 'ALL').toUpperCase().trim(),
          tipo: r.tipo,
          targetName: String(r.targetName).trim(),
          parentTema: r.parentTema ? String(r.parentTema).trim() : undefined,
          minQuantidade: Math.max(1, Number(r.minQuantidade || 1)),
          prazoLimite: String(r.prazoLimite || '').trim(),
          ativo: r.ativo !== false,
        }))
    : store.metas.rules;

  let mergedRules = incomingRules;
  if (isUreScoped) {
    // Preserve rules belonging to ALL or other UREs untouched; only replace rules of assignedUre
    const preservedOtherRules = store.metas.rules.filter(
      (r) => (r.ureScope || 'ALL').toUpperCase().trim() !== assignedUre
    );
    const ownRules = incomingRules.filter((r) => r.ureScope === assignedUre);
    mergedRules = [...preservedOtherRules, ...ownRules];
  }

  const parseOptionalInt = (val: unknown): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };

  const updated: MetasConfig = isUreScoped
    ? {
        ...store.metas,
        rules: mergedRules,
        updatedAt: new Date().toISOString(),
      }
    : {
        globalMinAtas:
          body.globalMinAtas !== undefined ? parseOptionalInt(body.globalMinAtas) : store.metas.globalMinAtas,
        globalMinAcoes:
          body.globalMinAcoes !== undefined ? parseOptionalInt(body.globalMinAcoes) : store.metas.globalMinAcoes,
        prazoGlobal: body.prazoGlobal !== undefined ? String(body.prazoGlobal) : store.metas.prazoGlobal,
        diasAlertaProximo: Math.max(1, Number(body.diasAlertaProximo ?? store.metas.diasAlertaProximo)),
        rules: mergedRules,
        alertaAutomaticoAtivo: Boolean(body.alertaAutomaticoAtivo ?? store.metas.alertaAutomaticoAtivo),
        templateAssuntoProximo: String(body.templateAssuntoProximo ?? store.metas.templateAssuntoProximo),
        templateCorpoProximo: String(body.templateCorpoProximo ?? store.metas.templateCorpoProximo),
        templateAssuntoExpirado: String(body.templateAssuntoExpirado ?? store.metas.templateAssuntoExpirado),
        templateCorpoExpirado: String(body.templateCorpoExpirado ?? store.metas.templateCorpoExpirado),
        templateAssuntoParabens: String(body.templateAssuntoParabens ?? store.metas.templateAssuntoParabens),
        templateCorpoParabens: String(body.templateCorpoParabens ?? store.metas.templateCorpoParabens),
        emailRemetentePadrao: String(body.emailRemetentePadrao ?? store.metas.emailRemetentePadrao),
        updatedAt: new Date().toISOString(),
      };

  store.metas = updated;
  saveStore(store);
  res.json({ metas: updated });
});

app.post('/api/ai/generate-messages', requireAdmin, async (req, res) => {
  try {
    const authUser = (req as express.Request & { authUser: AuthUser }).authUser;
    const isUreScoped = authUser.role !== 'master' && authUser.scope === 'ure' && authUser.assignedUre;
    const {
      recipientScope = 'schools',
      schoolCies = [],
      ureNames = [],
      senderEmail,
      customContext,
      tone = 'cortes',
      focus,
    } = req.body as {
      recipientScope?: 'schools' | 'ures';
      schoolCies?: string[];
      ureNames?: string[];
      senderEmail?: string;
      customContext?: string;
      tone?: 'cortes' | 'urgente' | 'parabenizacao';
      focus?: FocusContext;
    };

    if (isUreScoped && recipientScope === 'ures') {
      res.status(403).json({
        error: 'Perfis restritos a uma diretoria não podem disparar mensagens para os e-mails das diretorias.',
      });
      return;
    }

    const store = loadStore();
    const compliance = computeSchoolCompliance(store.schools, store.atas, store.acoes, store.metas);
    const effectiveSender = senderEmail || authUser.email || store.metas.emailRemetentePadrao;

    if (recipientScope === 'ures') {
      const targetUres = store.ureContacts.filter(
        (u) => Boolean(u.email) && (ureNames.length > 0 ? ureNames.includes(u.ure) : true)
      );
      if (targetUres.length === 0) {
        res.status(400).json({ error: 'Nenhuma URE com e-mail cadastrado foi selecionada.' });
        return;
      }

      const statsByUre: Record<
        string,
        { totalEscolas: number; totalAtas: number; totalAcoes: number; pendentes: number; emDia: number }
      > = {};
      for (const c of compliance) {
        const u = c.school.ure || 'SUL 3';
        statsByUre[u] ??= { totalEscolas: 0, totalAtas: 0, totalAcoes: 0, pendentes: 0, emDia: 0 };
        statsByUre[u].totalEscolas += 1;
        statsByUre[u].totalAtas += c.totalAtas;
        statsByUre[u].totalAcoes += c.totalAcoes;
        if (c.status === 'pendente') statsByUre[u].pendentes += 1;
        if (c.status === 'em_dia') statsByUre[u].emDia += 1;
      }

      const drafts = await generateUreSummaryMessages({
        ureContacts: targetUres,
        complianceByUre: statsByUre,
        senderName: authUser.name,
        senderEmail: effectiveSender,
        customContext,
        tone,
        focus,
      });
      res.json({ drafts });
      return;
    }

    if (!Array.isArray(schoolCies) || schoolCies.length === 0) {
      res.status(400).json({ error: 'Selecione ao menos uma escola destinatária.' });
      return;
    }

    if (schoolCies.length > 150) {
      res.status(400).json({ error: 'Selecione no máximo 150 escolas por geração de IA.' });
      return;
    }

    const cieSet = new Set(schoolCies.map(String));
    const selected = compliance.filter(
      (c) =>
        cieSet.has(c.school.cie) &&
        Boolean(c.school.email) &&
        (!isUreScoped || c.school.ure === authUser.assignedUre)
    );

    if (selected.length === 0) {
      res.status(404).json({ error: 'Nenhuma escola autorizada com e-mail cadastrado foi localizada.' });
      return;
    }

    const drafts = await generatePersonalizedSchoolMessages({
      items: selected,
      metas: store.metas,
      senderName: authUser.name,
      senderEmail: effectiveSender,
      customContext,
      tone,
      focus,
    });

    res.json({ drafts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar mensagens com Gemini.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/emails/send', requireAdmin, async (req, res) => {
  try {
    const authUser = (req as express.Request & { authUser: AuthUser }).authUser;
    const isUreScoped = authUser.role !== 'master' && authUser.scope === 'ure' && authUser.assignedUre;
    const { senderEmail, triggerType, messages } = req.body as {
      senderEmail?: string;
      triggerType?: 'manual_ia' | 'manual_template' | 'alerta_automatico' | 'parabenizacao';
      messages?: Array<{
        schoolCie: string;
        schoolName: string;
        ure?: string;
        recipientEmail: string;
        subject: string;
        body: string;
      }>;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Nenhuma mensagem pronta para envio.' });
      return;
    }

    if (isUreScoped) {
      const unauthorized = messages.some((m) => (m.ure || '').toUpperCase().trim() !== authUser.assignedUre);
      if (unauthorized) {
        res.status(403).json({
          error: `Seu perfil está restrito à URE ${authUser.assignedUre}.`,
        });
        return;
      }
    }

    const store = loadStore();
    const compliance = computeSchoolCompliance(store.schools, store.atas, store.acoes, store.metas);
    const statusByCie = new Map(compliance.map((c) => [c.school.cie, c.status]));
    const effectiveSender = (senderEmail || authUser.email || store.metas.emailRemetentePadrao).trim();

    let smtpSentCount = 0;
    let exportCount = 0;
    const newLogs = [];

    for (const msg of messages) {
      let deliveredViaSmtp = false;
      try {
        const result = await sendSchoolEmail({
          integrations: store.integrations,
          fromEmail: effectiveSender,
          toEmail: msg.recipientEmail,
          subject: msg.subject,
          body: msg.body,
        });
        deliveredViaSmtp = result.deliveredViaSmtp;
      } catch (smtpErr) {
        res.status(502).json({
          error:
            smtpErr instanceof Error
              ? `Falha no envio SMTP Microsoft 365: ${smtpErr.message}`
              : 'Falha no envio SMTP Microsoft 365.',
        });
        return;
      }

      if (deliveredViaSmtp) {
        smtpSentCount += 1;
      } else {
        exportCount += 1;
      }

      newLogs.push({
        id: `mail-${crypto.randomUUID()}`,
        sentAt: new Date().toISOString(),
        senderEmail: effectiveSender,
        sentByUser: authUser.email,
        recipientEmail: msg.recipientEmail,
        schoolName: msg.schoolName,
        schoolCie: msg.schoolCie,
        ure: msg.ure || 'SUL 3',
        subject: msg.subject,
        body: msg.body,
        deliveryMode: deliveredViaSmtp ? ('smtp_microsoft365' as const) : ('outlook_export' as const),
        triggerType: triggerType || 'manual_ia',
        statusSnapshot: statusByCie.get(msg.schoolCie) ?? 'sem_meta',
      });
    }

    store.emailLogs = [...newLogs, ...store.emailLogs].slice(0, 1000);
    saveStore(store);

    res.json({
      logs: newLogs,
      smtpSentCount,
      exportCount,
      allLogs: store.emailLogs,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao processar envio.' });
  }
});

app.post('/api/emails/run-auto-alerts', requireAdmin, (req, res) => {
  const authUser = (req as express.Request & { authUser: AuthUser }).authUser;
  const isUreScoped = authUser.role !== 'master' && authUser.scope === 'ure' && authUser.assignedUre;
  const requestedUre = ((req.body || {}) as { ureFilter?: string }).ureFilter || 'all';
  const effectiveUreFilter = isUreScoped ? authUser.assignedUre! : requestedUre;

  const store = loadStore();
  const compliance = computeSchoolCompliance(store.schools, store.atas, store.acoes, store.metas);

  const activeRules = store.metas.rules.filter((r) => r.ativo);
  const hasAnyGlobal =
    (store.metas.globalMinAtas !== null && store.metas.globalMinAtas > 0) ||
    (store.metas.globalMinAcoes !== null && store.metas.globalMinAcoes > 0);

  if (activeRules.length === 0 && !hasAnyGlobal) {
    res.json({
      generated: [],
      message: 'Nenhuma meta ou prazo foi configurado ainda. Adicione pelo menos uma regra para gerar alertas.',
    });
    return;
  }

  const scoped = compliance.filter(
    (c) => (effectiveUreFilter === 'all' || c.school.ure === effectiveUreFilter) && c.school.email
  );

  const anyExpired = scoped.some((c) => c.ruleEvaluations.some((r) => !r.atendido && r.vencido));
  const anyApproaching = scoped.some((c) =>
    c.ruleEvaluations.some((r) => !r.atendido && r.proximoVencimento)
  );
  const globalExpired = isDeadlineExpired(store.metas.prazoGlobal);
  const globalDays = daysUntilDeadline(store.metas.prazoGlobal);
  const globalApproaching =
    globalDays !== null && globalDays >= 0 && globalDays <= store.metas.diasAlertaProximo;

  const pendingSchools = scoped.filter((c) => c.status !== 'em_dia' && c.status !== 'sem_meta');
  if (pendingSchools.length === 0) {
    res.json({
      generated: [],
      message: 'Todas as escolas avaliadas estão em dia com as metas configuradas.',
    });
    return;
  }

  const useExpired = anyExpired || globalExpired;
  const modeLabel = useExpired
    ? 'prazo_expirado'
    : anyApproaching || globalApproaching
      ? 'prazo_proximo'
      : 'pendencia_ativa';

  const subjectTpl = useExpired
    ? store.metas.templateAssuntoExpirado
    : store.metas.templateAssuntoProximo;
  const bodyTpl = useExpired
    ? store.metas.templateCorpoExpirado
    : store.metas.templateCorpoProximo;

  const replaceVars = (tpl: string, c: (typeof pendingSchools)[number]) =>
    tpl
      .replace(/\{\{escola\}\}/g, c.school.nomeSed)
      .replace(/\{\{cie\}\}/g, c.school.cie)
      .replace(/\{\{ure\}\}/g, c.school.ure)
      .replace(/\{\{prazo\}\}/g, store.metas.prazoGlobal || 'Conforme calendário definido')
      .replace(/\{\{item_foco\}\}/g, 'Metas Configuradas')
      .replace(
        /\{\{total_item\}\}/g,
        `${c.ruleEvaluations.filter((r) => r.atendido).length}/${c.ruleEvaluations.length} regras atendidas`
      )
      .replace(/\{\{total_atas\}\}/g, String(c.totalAtas))
      .replace(/\{\{total_acoes\}\}/g, String(c.totalAcoes))
      .replace(/\{\{pendencias\}\}/g, c.motivosPendencia.join('; ') || 'Nenhuma');

  const generated = pendingSchools.map((c) => ({
    schoolCie: c.school.cie,
    schoolName: c.school.nomeSed,
    ure: c.school.ure,
    recipientEmail: c.school.email,
    subject: replaceVars(subjectTpl, c),
    body: replaceVars(bodyTpl, c),
  }));

  res.json({ generated, mode: modeLabel });
});

// ---------- MASTER ADMIN ONLY ROUTES ----------

app.get('/api/master/users', requireMaster, (_req, res) => {
  const store = loadStore();
  res.json({ users: store.users.map(toPublicUser) });
});

app.post('/api/master/users', requireMaster, (req, res) => {
  const { name, email, password, role, scope, assignedUre } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: 'admin' | 'master';
    scope?: UserScope;
    assignedUre?: string;
  };

  if (!name || !email || !email.includes('@') || !password || password.length < 6) {
    res.status(400).json({ error: 'Informe nome, e-mail válido e senha com mínimo de 6 caracteres.' });
    return;
  }

  const effectiveRole = role === 'master' ? ('master' as const) : ('admin' as const);
  const effectiveScope: UserScope = effectiveRole === 'master' ? 'geral' : (scope === 'ure' ? 'ure' : 'geral');
  const effectiveUre = effectiveScope === 'ure' ? (assignedUre || '').toUpperCase().trim() : undefined;

  if (effectiveScope === 'ure' && !effectiveUre) {
    res.status(400).json({ error: 'Selecione a Diretoria/URE vinculada ao perfil regional.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const store = loadStore();
  if (store.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    res.status(409).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    return;
  }

  const { hash, salt } = hashPassword(password);
  const created = {
    id: `usr-${crypto.randomUUID()}`,
    name: name.trim(),
    email: normalizedEmail,
    role: effectiveRole,
    scope: effectiveScope,
    assignedUre: effectiveUre,
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
  };

  store.users.push(created);
  saveStore(store);
  res.json({ user: toPublicUser(created) });
});

app.delete('/api/master/users/:id', requireMaster, (req, res) => {
  const authUser = (req as express.Request & { authUser: AuthUser }).authUser;
  const targetId = req.params.id;
  if (targetId === authUser.id) {
    res.status(400).json({ error: 'Não é possível remover o próprio perfil logado.' });
    return;
  }
  const store = loadStore();
  store.users = store.users.filter((u) => u.id !== targetId);
  saveStore(store);
  res.json({ ok: true });
});

app.put('/api/master/ure-contacts', requireMaster, (req, res) => {
  const { ureContacts } = req.body as { ureContacts?: UreContact[] };
  if (!Array.isArray(ureContacts)) {
    res.status(400).json({ error: 'Lista de contatos das UREs inválida.' });
    return;
  }
  const store = loadStore();
  store.ureContacts = ureContacts
    .filter((u) => u && u.ure)
    .map((u) => ({
      ure: u.ure.toUpperCase().trim(),
      email: (u.email || '').trim().toLowerCase(),
      responsavel: (u.responsavel || '').trim(),
    }));
  saveStore(store);
  res.json({ ureContacts: store.ureContacts });
});

app.post('/api/master/upload-schools', requireMaster, async (req, res) => {
  try {
    const { csvContent } = req.body as { csvContent?: string };
    if (!csvContent) {
      res.status(400).json({ error: 'Envie o arquivo CSV com as escolas.' });
      return;
    }
    const imported = parseAdditionalSchoolsCsv(csvContent);
    const store = loadStore();
    const byKey = new Map<string, School>();
    for (const s of store.schools) {
      byKey.set(normalizeSchoolKey(s.nomeSed), s);
    }
    for (const item of imported) {
      byKey.set(normalizeSchoolKey(item.nomeSed), item);
    }
    const merged = mergeDiscoveredSchoolsAndUres([...byKey.values()], [], store.ureContacts);
    store.schools = merged.schools;
    store.ureContacts = merged.ureContacts;
    saveStore(store);

    let supabaseSynced = false;
    const sbUrl = process.env.SUPABASE_URL || store.integrations.supabaseUrl;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || store.integrations.supabaseKey;
    if (sbUrl && sbKey) {
      const result = await pushSnapshotToSupabase(sbUrl, sbKey, store);
      store.integrations.lastSupabaseSyncAt = result.syncedAt;
      saveStore(store);
      supabaseSynced = true;
    }

    res.json({
      importedCount: imported.length,
      totalSchools: store.schools.length,
      schools: store.schools,
      ureContacts: store.ureContacts,
      supabaseSynced,
      integrations: getPublicIntegrationStatus(store),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao importar escolas.' });
  }
});

app.post('/api/master/upload-csv', requireMaster, async (req, res) => {
  try {
    const { type, csvContent } = req.body as { type?: 'atas' | 'acoes'; csvContent?: string };
    if (!type || !csvContent) {
      res.status(400).json({ error: 'Informe o tipo da planilha (atas ou acoes) e o conteúdo CSV.' });
      return;
    }

    const store = loadStore();
    const now = new Date().toISOString();

    if (type === 'atas') {
      const parsed = parseAtasCsv(csvContent, store.schools);
      const merged = mergeDiscoveredSchoolsAndUres(
        store.schools,
        parsed.discoveredSchools,
        store.ureContacts
      );
      store.schools = merged.schools;
      store.ureContacts = merged.ureContacts;
      store.atas = parsed.records;
      store.lastAtasUploadAt = now;
      saveStore(store);

      let supabaseSynced = false;
      const sbUrl = process.env.SUPABASE_URL || store.integrations.supabaseUrl;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || store.integrations.supabaseKey;
      if (sbUrl && sbKey) {
        const result = await pushSnapshotToSupabase(sbUrl, sbKey, store);
        store.integrations.lastSupabaseSyncAt = result.syncedAt;
        store.lastAtasUploadAt = result.syncedAt;
        saveStore(store);
        supabaseSynced = true;
      }

      res.json({
        type: 'atas',
        count: parsed.records.length,
        unmatchedSchools: parsed.unmatchedSchools,
        discoveredCount: parsed.discoveredSchools.length,
        supabaseSynced,
        schools: store.schools,
        ureContacts: store.ureContacts,
        atas: store.atas,
        integrations: getPublicIntegrationStatus(store),
      });
      return;
    }

    if (type === 'acoes') {
      const parsed = parseAcoesCsv(csvContent, store.schools);
      const merged = mergeDiscoveredSchoolsAndUres(
        store.schools,
        parsed.discoveredSchools,
        store.ureContacts
      );
      store.schools = merged.schools;
      store.ureContacts = merged.ureContacts;
      store.acoes = parsed.records;
      store.lastAcoesUploadAt = now;
      saveStore(store);

      let supabaseSynced = false;
      const sbUrl = process.env.SUPABASE_URL || store.integrations.supabaseUrl;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || store.integrations.supabaseKey;
      if (sbUrl && sbKey) {
        const result = await pushSnapshotToSupabase(sbUrl, sbKey, store);
        store.integrations.lastSupabaseSyncAt = result.syncedAt;
        store.lastAcoesUploadAt = result.syncedAt;
        saveStore(store);
        supabaseSynced = true;
      }

      res.json({
        type: 'acoes',
        count: parsed.records.length,
        unmatchedSchools: parsed.unmatchedSchools,
        discoveredCount: parsed.discoveredSchools.length,
        supabaseSynced,
        schools: store.schools,
        ureContacts: store.ureContacts,
        acoes: store.acoes,
        integrations: getPublicIntegrationStatus(store),
      });
      return;
    }

    res.status(400).json({ error: 'Tipo de planilha inválido.' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao processar CSV.' });
  }
});

app.get('/api/master/supabase-schema', requireMaster, (_req, res) => {
  res.json({ sql: SUPABASE_SCHEMA_SQL });
});

app.post('/api/master/integrations', requireMaster, async (req, res) => {
  try {
    const { supabaseUrl, supabaseKey, smtpHost, smtpPort, smtpUser, smtpPass } = req.body as {
      supabaseUrl?: string;
      supabaseKey?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPass?: string;
    };

    const store = loadStore();

    if (supabaseUrl !== undefined) {
      if (supabaseUrl.trim()) {
        validateSupabaseUrl(supabaseUrl);
      }
      store.integrations.supabaseUrl = supabaseUrl.trim();
    }
    if (supabaseKey !== undefined && supabaseKey.trim()) {
      store.integrations.supabaseKey = supabaseKey.trim();
    }
    if (smtpHost !== undefined && smtpHost.trim()) {
      store.integrations.smtpHost = validateSmtpHost(smtpHost);
    }
    if (smtpPort !== undefined) {
      store.integrations.smtpPort = Number(smtpPort) || 587;
    }
    if (smtpUser !== undefined) {
      store.integrations.smtpUser = smtpUser.trim();
    }
    if (smtpPass !== undefined && smtpPass.trim()) {
      store.integrations.smtpPass = smtpPass.trim();
    }

    saveStore(store);
    res.json({ integrations: getPublicIntegrationStatus(store) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Configuração inválida.' });
  }
});

app.post('/api/master/smtp/test', requireMaster, async (req, res) => {
  try {
    const store = loadStore();
    const { smtpHost, smtpPort, smtpUser, smtpPass } = req.body as {
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPass?: string;
    };
    const result = await testSmtpConnection({
      integrations: store.integrations,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Falha na validação SMTP.' });
  }
});

app.post('/api/master/supabase/test', requireMaster, async (req, res) => {
  try {
    const store = loadStore();
    const { supabaseUrl, supabaseKey } = req.body as { supabaseUrl?: string; supabaseKey?: string };
    const url = supabaseUrl?.trim() || process.env.SUPABASE_URL || store.integrations.supabaseUrl;
    const key =
      supabaseKey?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY || store.integrations.supabaseKey;

    const result = await testSupabaseConnection(url, key);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Falha ao conectar ao Supabase.' });
  }
});

app.post('/api/master/supabase/push', requireMaster, async (_req, res) => {
  try {
    const store = loadStore();
    const url = process.env.SUPABASE_URL || store.integrations.supabaseUrl;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || store.integrations.supabaseKey;
    if (!url || !key) {
      res.status(400).json({ error: 'Configure a URL e a chave Service Role do Supabase primeiro.' });
      return;
    }
    const result = await pushSnapshotToSupabase(url, key, store);
    store.integrations.lastSupabaseSyncAt = result.syncedAt;
    store.lastAtasUploadAt = result.syncedAt;
    store.lastAcoesUploadAt = result.syncedAt;
    saveStore(store);
    res.json({
      syncedAt: result.syncedAt,
      integrations: getPublicIntegrationStatus(store),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro na sincronização com Supabase.' });
  }
});

app.post('/api/master/supabase/pull', requireMaster, async (_req, res) => {
  try {
    const store = loadStore();
    const url = process.env.SUPABASE_URL || store.integrations.supabaseUrl;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || store.integrations.supabaseKey;
    if (!url || !key) {
      res.status(400).json({ error: 'Configure a URL e a chave do Supabase primeiro.' });
      return;
    }
    const pulled = await pullSnapshotFromSupabase(url, key);
    const now = new Date().toISOString();
    store.atas = pulled.atas;
    store.acoes = pulled.acoes;
    store.integrations.lastSupabaseSyncAt = now;
    store.lastAtasUploadAt = now;
    store.lastAcoesUploadAt = now;
    saveStore(store);
    res.json({
      atasCount: pulled.atas.length,
      acoesCount: pulled.acoes.length,
      atas: store.atas,
      acoes: store.acoes,
      integrations: getPublicIntegrationStatus(store),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao importar dados do Supabase.' });
  }
});

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist/index.html'));

async function startServer() {
  loadStore();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Grêmio Estudantil SEDUC-SP server running at http://localhost:${PORT}`);
  });
}

startServer();
