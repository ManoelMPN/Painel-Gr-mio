import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { MetasConfig, SchoolCompliance, UreContact } from '../shared/types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'A chave GEMINI_API_KEY não está configurada nas variáveis de ambiente do servidor.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface GeneratedEmailDraft {
  schoolCie: string;
  schoolName: string;
  ure: string;
  recipientEmail: string;
  subject: string;
  body: string;
}

export interface FocusContext {
  type: 'geral' | 'modelo_ata' | 'tema_acao' | 'subtema_acao';
  label: string;
  parentTema?: string;
}

function getToneInstruction(tone: 'cortes' | 'urgente' | 'parabenizacao'): string {
  if (tone === 'urgente') {
    return 'Tom institucional firme, respeitoso e objetivo, enfatizando a necessidade de regularizar os registros oficiais dentro do prazo definido.';
  }
  if (tone === 'parabenizacao') {
    return 'Tom institucional caloroso de reconhecimento e parabenização pelo protagonismo estudantil e organização dos registros. Caso não falte nada, celebre explicitamente o resultado em dia.';
  }
  return 'Tom institucional cortês, acolhedor, objetivo e orientador, incentivando o Grêmio Estudantil e indicando exatamente o que precisa ser registrado.';
}

async function generateSchoolChunk(params: {
  ai: GoogleGenAI;
  items: SchoolCompliance[];
  metas: MetasConfig;
  senderName: string;
  senderEmail: string;
  customContext?: string;
  tone: 'cortes' | 'urgente' | 'parabenizacao';
  focus: FocusContext;
}): Promise<GeneratedEmailDraft[]> {
  const { ai, items, metas, senderName, senderEmail, customContext, tone, focus } = params;

  const summaryList = items.map((c) => ({
    cie: c.school.cie,
    ure: c.school.ure,
    escola: c.school.nomeSed,
    email: c.school.email,
    totalAtas: c.totalAtas,
    totalAcoes: c.totalAcoes,
    modelosAtasRegistrados: c.modelosPresentes,
    temasAcoesRegistrados: c.temasPresentes,
    status: c.status,
    itensPendentes: c.motivosPendencia,
  }));

  const systemInstruction = `Você representa a equipe da Secretaria da Educação do Estado de São Paulo (SEDUC-SP) responsável pelo acompanhamento dos Grêmios Estudantis.
Redija mensagens individuais de e-mail institucional em português do Brasil.
Regras obrigatórias:
1. ${getToneInstruction(tone)}
2. As escolas lançam suas atas e ações no sistema oficial da SEDUC-SP (nunca neste painel). Deixe claro quando orientar novos lançamentos.
3. Cite com exatidão os números reais fornecidos para cada escola (total de ATAs, total de Ações e eventual foco selecionado). Nunca invente números ou prazos.
4. Assine em nome de "${senderName}" (${senderEmail}) — Equipe Grêmio Estudantil SEDUC-SP.
5. Mantenha cada mensagem clara, cortês e direta (entre 90 e 170 palavras).`;

  const activeRulesDesc = metas.rules
    .filter((r) => r.ativo)
    .map((r) => `${r.ureScope === 'ALL' ? 'Todas UREs' : r.ureScope} · ${r.parentTema ? `${r.parentTema} > ` : ''}${r.targetName}: mín ${r.minQuantidade}${r.prazoLimite ? ` até ${r.prazoLimite}` : ''}`);

  const prompt = `Contexto da campanha de comunicação:
- Foco da mensagem: ${focus.type === 'geral' ? 'Acompanhamento Geral' : `${focus.label}`}
- Regras/Metas ativas no momento: ${activeRulesDesc.length > 0 ? activeRulesDesc.join('; ') : 'Sem metas numéricas fixas — acompanhamento qualitativo por item'}
${customContext ? `- Orientações adicionais do administrador: ${customContext}` : ''}

Gere exatamente 1 objeto JSON de resposta para cada escola abaixo, preservando exatamente cie, ure e recipientEmail:
${JSON.stringify(summaryList, null, 2)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            schoolCie: { type: Type.STRING },
            schoolName: { type: Type.STRING },
            ure: { type: Type.STRING },
            recipientEmail: { type: Type.STRING },
            subject: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ['schoolCie', 'schoolName', 'ure', 'recipientEmail', 'subject', 'body'],
        },
      },
    },
  });

  return JSON.parse((response.text ?? '[]').trim()) as GeneratedEmailDraft[];
}

export async function generatePersonalizedSchoolMessages(params: {
  items: SchoolCompliance[];
  metas: MetasConfig;
  senderName: string;
  senderEmail: string;
  customContext?: string;
  tone?: 'cortes' | 'urgente' | 'parabenizacao';
  focus?: FocusContext;
}): Promise<GeneratedEmailDraft[]> {
  const ai = getAiClient();
  const tone = params.tone ?? 'cortes';
  const focus = params.focus ?? { type: 'geral', label: 'Acompanhamento Geral' };

  const chunkSize = 30;
  const allDrafts: GeneratedEmailDraft[] = [];

  for (let i = 0; i < params.items.length; i += chunkSize) {
    const slice = params.items.slice(i, i + chunkSize);
    const chunkDrafts = await generateSchoolChunk({
      ai,
      items: slice,
      metas: params.metas,
      senderName: params.senderName,
      senderEmail: params.senderEmail,
      customContext: params.customContext,
      tone,
      focus,
    });
    allDrafts.push(...chunkDrafts);
  }

  return allDrafts;
}

export async function generateUreSummaryMessages(params: {
  ureContacts: UreContact[];
  complianceByUre: Record<string, { totalEscolas: number; totalAtas: number; totalAcoes: number; pendentes: number; emDia: number }>;
  senderName: string;
  senderEmail: string;
  customContext?: string;
  tone?: 'cortes' | 'urgente' | 'parabenizacao';
  focus?: FocusContext;
}): Promise<GeneratedEmailDraft[]> {
  const ai = getAiClient();
  const tone = params.tone ?? 'cortes';
  const focus = params.focus ?? { type: 'geral', label: 'Panorama Regional da URE' };

  const payload = params.ureContacts.map((u) => ({
    ure: u.ure,
    email: u.email,
    responsavel: u.responsavel,
    estatisticas: params.complianceByUre[u.ure] ?? {
      totalEscolas: 0,
      totalAtas: 0,
      totalAcoes: 0,
      pendentes: 0,
      emDia: 0,
    },
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Redija 1 comunicado institucional para cada URE / Diretoria de Ensino abaixo sobre "${focus.label}".\nTom: ${getToneInstruction(tone)}\n${params.customContext ? `Observações: ${params.customContext}` : ''}\nAssinatura: ${params.senderName} (${params.senderEmail})\nDados das UREs:\n${JSON.stringify(payload, null, 2)}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            schoolCie: { type: Type.STRING, description: 'Use o nome da URE como identificador.' },
            schoolName: { type: Type.STRING, description: 'Nome completo da URE.' },
            ure: { type: Type.STRING },
            recipientEmail: { type: Type.STRING },
            subject: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ['schoolCie', 'schoolName', 'ure', 'recipientEmail', 'subject', 'body'],
        },
      },
    },
  });

  return JSON.parse((response.text ?? '[]').trim()) as GeneratedEmailDraft[];
}
