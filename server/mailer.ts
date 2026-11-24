import nodemailer from 'nodemailer';
import type { ServerIntegrationConfig } from './store.ts';

const ALLOWED_SMTP_HOSTS = new Set([
  'smtp.office365.com',
  'smtp-mail.outlook.com',
  'smtp.live.com',
  'smtp.gmail.com',
]);

export function validateSmtpHost(host: string): string {
  const normalized = (host || 'smtp.office365.com').trim().toLowerCase();
  if (!ALLOWED_SMTP_HOSTS.has(normalized)) {
    throw new Error(
      'Host SMTP não permitido. Utilize smtp.office365.com ou smtp-mail.outlook.com (Microsoft 365).'
    );
  }
  return normalized;
}

function createSmtpTransport(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
}) {
  return nodemailer.createTransport({
    host: params.host,
    port: params.port,
    secure: params.port === 465,
    auth: {
      user: params.user,
      pass: params.pass,
    },
    tls: {
      rejectUnauthorized: true,
    },
  });
}

export async function testSmtpConnection(params: {
  integrations: ServerIntegrationConfig;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}): Promise<{ ok: boolean; detail: string }> {
  const smtpUser = (params.smtpUser || process.env.SMTP_USER || params.integrations.smtpUser || '').trim();
  const smtpPass = (params.smtpPass || process.env.SMTP_PASS || params.integrations.smtpPass || '').trim();
  const smtpHost = validateSmtpHost(
    params.smtpHost || process.env.SMTP_HOST || params.integrations.smtpHost || 'smtp.office365.com'
  );
  const smtpPort = Number(params.smtpPort || process.env.SMTP_PORT || params.integrations.smtpPort || 587);

  if (!smtpUser || !smtpPass) {
    throw new Error('Informe o e-mail Microsoft e a senha (ou senha de aplicativo) para testar o SMTP.');
  }

  const transporter = createSmtpTransport({
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    pass: smtpPass,
  });

  await transporter.verify();
  return {
    ok: true,
    detail: `Conexão SMTP validada com sucesso em ${smtpHost}:${smtpPort} (${smtpUser}).`,
  };
}

export async function sendSchoolEmail(params: {
  integrations: ServerIntegrationConfig;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{ deliveredViaSmtp: boolean; errorMessage?: string }> {
  const smtpUser = process.env.SMTP_USER || params.integrations.smtpUser;
  const smtpPass = process.env.SMTP_PASS || params.integrations.smtpPass;
  const smtpHost = validateSmtpHost(process.env.SMTP_HOST || params.integrations.smtpHost);
  const smtpPort = Number(process.env.SMTP_PORT || params.integrations.smtpPort || 587);

  if (!smtpUser || !smtpPass) {
    return { deliveredViaSmtp: false };
  }

  const transporter = createSmtpTransport({
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    pass: smtpPass,
  });

  await transporter.sendMail({
    from: params.fromEmail || smtpUser,
    replyTo: params.fromEmail || smtpUser,
    to: params.toEmail,
    subject: params.subject,
    text: params.body,
  });

  return { deliveredViaSmtp: true };
}
