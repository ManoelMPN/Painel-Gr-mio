import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BellRing,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  History,
  Info,
  Mail,
  Plus,
  Send,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AcaoRecord,
  AtaRecord,
  AuthUser,
  EmailDispatchLog,
  IntegrationStatus,
  MetaRule,
  MetaRuleType,
  MetasConfig,
  SchoolCompliance,
  UreContact,
} from '../../shared/types.ts';
import { normalizeAtaModel } from '../../shared/analytics.ts';
import {
  buildEmlContent,
  downloadTextFile,
  formatTimestampBr,
  getStatusLabel,
} from '../utils/formatters.ts';

interface DraftMessage {
  schoolCie: string;
  schoolName: string;
  ure: string;
  recipientEmail: string;
  subject: string;
  body: string;
}

interface CampaignAndGoalsViewProps {
  authUser: AuthUser;
  authToken: string;
  compliance: SchoolCompliance[];
  atas: AtaRecord[];
  acoes: AcaoRecord[];
  metas: MetasConfig;
  ureContacts: UreContact[];
  availableUres: string[];
  emailLogs: EmailDispatchLog[];
  integrations: IntegrationStatus;
  selectedUre: string;
  onMetasUpdated: (metas: MetasConfig) => void;
  onEmailLogsUpdated: (logs: EmailDispatchLog[]) => void;
}

export const CampaignAndGoalsView: React.FC<CampaignAndGoalsViewProps> = ({
  authUser,
  authToken,
  compliance,
  atas,
  acoes,
  metas,
  ureContacts,
  availableUres,
  emailLogs,
  integrations,
  selectedUre,
  onMetasUpdated,
  onEmailLogsUpdated,
}) => {
  const isUreScoped =
    authUser.role !== 'master' && authUser.scope === 'ure' && Boolean(authUser.assignedUre);
  const assignedUre = authUser.assignedUre?.toUpperCase().trim() || '';

  const [subTab, setSubTab] = useState<'compose' | 'metas' | 'history'>('metas');

  // ---------- 1. METAS STATE ----------
  const [globalMinAtas, setGlobalMinAtas] = useState<string>(
    metas.globalMinAtas ? String(metas.globalMinAtas) : ''
  );
  const [globalMinAcoes, setGlobalMinAcoes] = useState<string>(
    metas.globalMinAcoes ? String(metas.globalMinAcoes) : ''
  );
  const [prazoGlobal, setPrazoGlobal] = useState(metas.prazoGlobal);
  const [diasAlertaProximo, setDiasAlertaProximo] = useState(metas.diasAlertaProximo);
  const [rules, setRules] = useState<MetaRule[]>(metas.rules);
  const [alertaAutomaticoAtivo, setAlertaAutomaticoAtivo] = useState(metas.alertaAutomaticoAtivo);
  const [templateAssuntoProximo, setTemplateAssuntoProximo] = useState(metas.templateAssuntoProximo);
  const [templateCorpoProximo, setTemplateCorpoProximo] = useState(metas.templateCorpoProximo);
  const [templateAssuntoExpirado, setTemplateAssuntoExpirado] = useState(metas.templateAssuntoExpirado);
  const [templateCorpoExpirado, setTemplateCorpoExpirado] = useState(metas.templateCorpoExpirado);
  const [templateAssuntoParabens, setTemplateAssuntoParabens] = useState(metas.templateAssuntoParabens);
  const [templateCorpoParabens, setTemplateCorpoParabens] = useState(metas.templateCorpoParabens);
  const [emailRemetentePadrao, setEmailRemetentePadrao] = useState(metas.emailRemetentePadrao);

  // Rule builder inputs
  const [newRuleUreScope, setNewRuleUreScope] = useState<string>(
    isUreScoped ? assignedUre : selectedUre !== 'all' ? selectedUre : 'ALL'
  );
  const [newRuleType, setNewRuleType] = useState<MetaRuleType>('modelo_ata');
  const [newRuleTarget, setNewRuleTarget] = useState('');
  const [newRuleParentTema, setNewRuleParentTema] = useState('');
  const [newRuleQty, setNewRuleQty] = useState(1);
  const [newRuleDeadline, setNewRuleDeadline] = useState('');

  const [savingMetas, setSavingMetas] = useState(false);
  const [metasFeedback, setMetasFeedback] = useState<string | null>(null);
  const [complianceStatusFilter, setComplianceStatusFilter] = useState<
    'all' | 'pendente' | 'atencao' | 'em_dia'
  >('all');

  // ---------- 2. MESSAGE COMPOSER STATE ----------
  const [recipientScope, setRecipientScope] = useState<'schools' | 'ures'>('schools');
  const [composerUreFilter, setComposerUreFilter] = useState<string>(
    isUreScoped ? assignedUre : selectedUre
  );
  const [senderEmail, setSenderEmail] = useState(
    authUser.email || metas.emailRemetentePadrao || integrations.smtpUser || ''
  );
  const [focusType, setFocusType] = useState<'geral' | 'modelo_ata' | 'tema_acao' | 'subtema_acao'>('geral');
  const [focusTarget, setFocusTarget] = useState('');
  const [focusParentTema, setFocusParentTema] = useState('');
  const [tone, setTone] = useState<'cortes' | 'urgente' | 'parabenizacao'>('cortes');
  const [templateKind, setTemplateKind] = useState<'proximo' | 'expirado' | 'parabens'>('proximo');
  const [customContext, setCustomContext] = useState('');
  const [selectedCies, setSelectedCies] = useState<string[]>([]);
  const [selectedUreNames, setSelectedUreNames] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [drafts, setDrafts] = useState<DraftMessage[]>([]);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [campaignFeedback, setCampaignFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [lastDispatchedMode, setLastDispatchedMode] = useState<'smtp' | 'outlook' | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    setGlobalMinAtas(metas.globalMinAtas ? String(metas.globalMinAtas) : '');
    setGlobalMinAcoes(metas.globalMinAcoes ? String(metas.globalMinAcoes) : '');
    setPrazoGlobal(metas.prazoGlobal);
    setDiasAlertaProximo(metas.diasAlertaProximo);
    setRules(metas.rules);
    setAlertaAutomaticoAtivo(metas.alertaAutomaticoAtivo);
    setTemplateAssuntoProximo(metas.templateAssuntoProximo);
    setTemplateCorpoProximo(metas.templateCorpoProximo);
    setTemplateAssuntoExpirado(metas.templateAssuntoExpirado);
    setTemplateCorpoExpirado(metas.templateCorpoExpirado);
    setTemplateAssuntoParabens(metas.templateAssuntoParabens);
    setTemplateCorpoParabens(metas.templateCorpoParabens);
    setEmailRemetentePadrao(metas.emailRemetentePadrao);
  }, [metas]);

  useEffect(() => {
    if (isUreScoped) {
      setRecipientScope('schools');
      setComposerUreFilter(assignedUre);
      setNewRuleUreScope(assignedUre);
    }
  }, [isUreScoped, assignedUre]);

  // Scoped compliance list (enforced strictly for regional admins)
  const scopedCompliance = useMemo(() => {
    if (isUreScoped) {
      return compliance.filter((c) => c.school.ure.toUpperCase() === assignedUre);
    }
    if (selectedUre !== 'all') {
      return compliance.filter((c) => c.school.ure.toUpperCase() === selectedUre.toUpperCase());
    }
    return compliance;
  }, [compliance, isUreScoped, assignedUre, selectedUre]);

  // Extract unique ATA models, Themes, and Subthemes per Theme from live spreadsheets
  const availableAtaModels = useMemo(() => {
    const set = new Set<string>();
    atas.forEach((a) => set.add(normalizeAtaModel(a.modeloAta)));
    return [...set].sort();
  }, [atas]);

  const themeSubthemeMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ac of acoes) {
      if (!ac.tema) continue;
      if (!map.has(ac.tema)) map.set(ac.tema, new Set());
      if (ac.subtema) map.get(ac.tema)!.add(ac.subtema);
    }
    return map;
  }, [acoes]);

  const availableThemes = useMemo(() => [...themeSubthemeMap.keys()].sort(), [themeSubthemeMap]);

  const subthemesForBuilder = useMemo(() => {
    if (!newRuleParentTema) return [];
    return [...(themeSubthemeMap.get(newRuleParentTema) ?? [])].sort();
  }, [themeSubthemeMap, newRuleParentTema]);

  const subthemesForFocus = useMemo(() => {
    if (!focusParentTema) return [];
    return [...(themeSubthemeMap.get(focusParentTema) ?? [])].sort();
  }, [themeSubthemeMap, focusParentTema]);

  useEffect(() => {
    if (newRuleType === 'modelo_ata') {
      setNewRuleTarget((prev) => (availableAtaModels.includes(prev) ? prev : availableAtaModels[0] ?? ''));
    } else if (newRuleType === 'tema_acao') {
      setNewRuleTarget((prev) => (availableThemes.includes(prev) ? prev : availableThemes[0] ?? ''));
    } else {
      const parent = availableThemes.includes(newRuleParentTema)
        ? newRuleParentTema
        : availableThemes[0] ?? '';
      setNewRuleParentTema(parent);
      const subs = [...(themeSubthemeMap.get(parent) ?? [])].sort();
      setNewRuleTarget((prev) => (subs.includes(prev) ? prev : subs[0] ?? ''));
    }
  }, [newRuleType, availableAtaModels, availableThemes, newRuleParentTema, themeSubthemeMap]);

  useEffect(() => {
    if (focusType === 'modelo_ata') {
      setFocusTarget((prev) => (availableAtaModels.includes(prev) ? prev : availableAtaModels[0] ?? ''));
    } else if (focusType === 'tema_acao') {
      setFocusTarget((prev) => (availableThemes.includes(prev) ? prev : availableThemes[0] ?? ''));
    } else if (focusType === 'subtema_acao') {
      const parent = availableThemes.includes(focusParentTema)
        ? focusParentTema
        : availableThemes[0] ?? '';
      setFocusParentTema(parent);
      const subs = [...(themeSubthemeMap.get(parent) ?? [])].sort();
      setFocusTarget((prev) => (subs.includes(prev) ? prev : subs[0] ?? ''));
    } else {
      setFocusTarget('');
    }
  }, [focusType, availableAtaModels, availableThemes, focusParentTema, themeSubthemeMap]);

  function getFocusCountForSchool(c: SchoolCompliance): number {
    if (focusType === 'modelo_ata' && focusTarget) {
      const targetNorm = normalizeAtaModel(focusTarget);
      return atas.filter(
        (a) => a.escola === c.school.nomeSed && normalizeAtaModel(a.modeloAta) === targetNorm
      ).length;
    }
    if (focusType === 'tema_acao' && focusTarget) {
      return acoes.filter((a) => a.escola === c.school.nomeSed && a.tema === focusTarget).length;
    }
    if (focusType === 'subtema_acao' && focusTarget) {
      return acoes.filter(
        (a) =>
          a.escola === c.school.nomeSed &&
          (!focusParentTema || a.tema === focusParentTema) &&
          a.subtema === focusTarget
      ).length;
    }
    return c.totalAtas + c.totalAcoes;
  }

  function getFocusDisplayLabel(): string {
    if (focusType === 'modelo_ata' && focusTarget) return `Modelo de ATA: ${focusTarget}`;
    if (focusType === 'tema_acao' && focusTarget) return `Tema de Ação: ${focusTarget}`;
    if (focusType === 'subtema_acao' && focusTarget) {
      return `${focusParentTema} › ${focusTarget}`;
    }
    return 'Acompanhamento Geral do Grêmio';
  }

  const visibleRules = useMemo(() => {
    if (!isUreScoped) return rules;
    return rules.filter((r) => {
      const scope = (r.ureScope || 'ALL').toUpperCase().trim();
      return scope === assignedUre || scope === 'ALL';
    });
  }, [rules, isUreScoped, assignedUre]);

  const adminComplianceFiltered = useMemo(() => {
    return scopedCompliance
      .filter((c) => {
        if (complianceStatusFilter !== 'all' && c.status !== complianceStatusFilter) return false;
        return true;
      })
      .sort((a, b) => a.percentualCumprimento - b.percentualCumprimento);
  }, [scopedCompliance, complianceStatusFilter]);

  const filteredRecipientSchools = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    const targetUre = isUreScoped ? assignedUre : composerUreFilter;
    return compliance
      .filter((c) => {
        if (targetUre !== 'all' && c.school.ure.toUpperCase() !== targetUre.toUpperCase()) {
          return false;
        }
        if (!q) return true;
        return (
          c.school.nomeSed.toLowerCase().includes(q) ||
          c.school.cie.includes(q) ||
          c.school.email.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.school.nomeSed.localeCompare(b.school.nomeSed));
  }, [compliance, isUreScoped, assignedUre, composerUreFilter, recipientSearch]);

  // ---------- RULE HANDLERS ----------
  function handleAddRule() {
    if (!newRuleTarget) return;
    const rule: MetaRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ureScope: isUreScoped ? assignedUre : (newRuleUreScope || 'ALL').toUpperCase().trim(),
      tipo: newRuleType,
      targetName: newRuleTarget,
      parentTema: newRuleType === 'subtema_acao' ? newRuleParentTema : undefined,
      minQuantidade: Math.max(1, Number(newRuleQty) || 1),
      prazoLimite: newRuleDeadline,
      ativo: true,
    };
    setRules((prev) => [...prev, rule]);
    setMetasFeedback('Regra adicionada à lista abaixo. Clique em "Salvar Metas e Prazos" para aplicar.');
  }

  function handleUpdateRule(id: string, patch: Partial<MetaRule>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function handleRemoveRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSaveMetas(e: React.FormEvent) {
    e.preventDefault();
    setSavingMetas(true);
    setMetasFeedback(null);
    try {
      const res = await fetch('/api/metas', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(
          isUreScoped
            ? {
                rules: rules.filter(
                  (r) => (r.ureScope || 'ALL').toUpperCase().trim() === assignedUre
                ),
              }
            : {
                globalMinAtas: globalMinAtas.trim() ? Number(globalMinAtas) : null,
                globalMinAcoes: globalMinAcoes.trim() ? Number(globalMinAcoes) : null,
                prazoGlobal,
                diasAlertaProximo,
                rules,
                alertaAutomaticoAtivo,
                templateAssuntoProximo,
                templateCorpoProximo,
                templateAssuntoExpirado,
                templateCorpoExpirado,
                templateAssuntoParabens,
                templateCorpoParabens,
                emailRemetentePadrao,
              }
        ),
      });
      const data = (await res.json()) as { metas?: MetasConfig; error?: string };
      if (!res.ok || !data.metas) {
        throw new Error(data.error || 'Erro ao salvar metas.');
      }
      onMetasUpdated(data.metas);
      setMetasFeedback('Metas, prazos individuais e configurações salvos com sucesso.');
    } catch (err) {
      setMetasFeedback(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSavingMetas(false);
    }
  }

  async function handleRunAutoAlerts() {
    setCampaignFeedback(null);
    try {
      const res = await fetch('/api/emails/run-auto-alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ ureFilter: isUreScoped ? assignedUre : selectedUre }),
      });
      const data = (await res.json()) as {
        generated?: DraftMessage[];
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar alertas automáticos.');
      if (!data.generated || data.generated.length === 0) {
        setMetasFeedback(data.message || 'Nenhuma escola pendente para as regras ativas.');
        return;
      }
      setDrafts(data.generated);
      setRecipientScope('schools');
      setSubTab('compose');
      setCampaignFeedback({
        type: 'success',
        text: `${data.generated.length} rascunho(s) preparado(s) pelo modelo automático. Revise e clique em Enviar.`,
      });
    } catch (err) {
      setMetasFeedback(err instanceof Error ? err.message : 'Erro ao executar alertas.');
    }
  }

  // ---------- COMPOSER SELECTION & GENERATION ----------
  function applyPresetSelection(
    preset: 'pendentes_foco' | 'em_dia_parabens' | 'todas' | 'clear'
  ) {
    if (preset === 'clear') {
      setSelectedCies([]);
      return;
    }
    const pool = filteredRecipientSchools.filter((c) => Boolean(c.school.email));

    if (preset === 'todas') {
      setSelectedCies(pool.map((c) => c.school.cie));
      return;
    }

    if (preset === 'em_dia_parabens') {
      const matched =
        focusType === 'geral'
          ? pool.filter((c) =>
              c.hasConfiguredMetas ? c.status === 'em_dia' : c.totalAtas > 0 || c.totalAcoes > 0
            )
          : pool.filter((c) => getFocusCountForSchool(c) > 0);
      setSelectedCies(matched.map((c) => c.school.cie));
      setTone('parabenizacao');
      setTemplateKind('parabens');
      return;
    }

    const matched =
      focusType === 'geral'
        ? pool.filter((c) =>
            c.hasConfiguredMetas ? c.status !== 'em_dia' : c.totalAtas === 0 || c.totalAcoes === 0
          )
        : pool.filter((c) => getFocusCountForSchool(c) === 0);
    setSelectedCies(matched.map((c) => c.school.cie));
    setTone('cortes');
    setTemplateKind('proximo');
  }

  function applyTemplateToSelected() {
    setCampaignFeedback(null);
    const focusLabel = getFocusDisplayLabel();

    if (recipientScope === 'ures' && !isUreScoped) {
      const targets = ureContacts.filter(
        (u) => Boolean(u.email) && (selectedUreNames.length > 0 ? selectedUreNames.includes(u.ure) : true)
      );
      if (targets.length === 0) {
        setCampaignFeedback({
          type: 'error',
          text: 'Selecione ao menos uma URE com e-mail cadastrado.',
        });
        return;
      }
      const generated: DraftMessage[] = targets.map((u) => {
        const schoolsUre = compliance.filter((c) => c.school.ure === u.ure);
        const totalAtas = schoolsUre.reduce((a, b) => a + b.totalAtas, 0);
        const totalAcoes = schoolsUre.reduce((a, b) => a + b.totalAcoes, 0);
        return {
          schoolCie: u.ure,
          schoolName: `URE ${u.ure}`,
          ure: u.ure,
          recipientEmail: u.email,
          subject: `[URE ${u.ure}] Informativo Regional — ${focusLabel}`,
          body: `Prezada equipe da URE ${u.ure} (${u.responsavel || 'Coordenação'}),\n\nCompartilhamos o acompanhamento referente a "${focusLabel}" no Grêmio Estudantil:\n- Unidades escolares na base: ${schoolsUre.length}\n- ATAs registradas: ${totalAtas}\n- Ações registradas: ${totalAcoes}\n\n${customContext ? `${customContext}\n\n` : ''}Atenciosamente,\n${authUser.name} (${senderEmail})`,
        };
      });
      setDrafts(generated);
      setLastDispatchedMode(null);
      setCampaignFeedback({
        type: 'success',
        text: `${generated.length} rascunho(s) preparado(s) para as diretorias selecionadas.`,
      });
      return;
    }

    const targets = filteredRecipientSchools.filter(
      (c) => selectedCies.includes(c.school.cie) && Boolean(c.school.email)
    );
    if (targets.length === 0) {
      setCampaignFeedback({ type: 'error', text: 'Selecione pelo menos uma escola com e-mail.' });
      return;
    }

    const subjTpl =
      templateKind === 'parabens'
        ? templateAssuntoParabens
        : templateKind === 'expirado'
          ? templateAssuntoExpirado
          : templateAssuntoProximo;

    const bodyTpl =
      templateKind === 'parabens'
        ? templateCorpoParabens
        : templateKind === 'expirado'
          ? templateCorpoExpirado
          : templateCorpoProximo;

    const generated: DraftMessage[] = targets.map((c) => {
      const focusCount = getFocusCountForSchool(c);
      const fill = (tpl: string) =>
        tpl
          .replace(/\{\{escola\}\}/g, c.school.nomeSed)
          .replace(/\{\{cie\}\}/g, c.school.cie)
          .replace(/\{\{ure\}\}/g, c.school.ure)
          .replace(/\{\{prazo\}\}/g, prazoGlobal || 'Conforme calendário definido')
          .replace(/\{\{item_foco\}\}/g, focusLabel)
          .replace(/\{\{total_item\}\}/g, String(focusCount))
          .replace(/\{\{total_atas\}\}/g, String(c.totalAtas))
          .replace(/\{\{total_acoes\}\}/g, String(c.totalAcoes))
          .replace(/\{\{pendencias\}\}/g, c.motivosPendencia.join('; ') || 'Nenhuma pendência registrada');

      return {
        schoolCie: c.school.cie,
        schoolName: c.school.nomeSed,
        ure: c.school.ure,
        recipientEmail: c.school.email,
        subject: fill(subjTpl),
        body: fill(bodyTpl) + (customContext ? `\n\nObservação: ${customContext}` : ''),
      };
    });

    setDrafts(generated);
    setLastDispatchedMode(null);
    setCampaignFeedback({
      type: 'success',
      text: `${generated.length} mensagem(ns) preparada(s) com o template escolhido. Revise e clique em Enviar.`,
    });
  }

  async function handleGenerateWithAi() {
    setCampaignFeedback(null);
    if (recipientScope === 'schools' && selectedCies.length === 0) {
      setCampaignFeedback({ type: 'error', text: 'Selecione pelo menos uma escola destinatária.' });
      return;
    }
    if (recipientScope === 'ures' && selectedUreNames.length === 0 && ureContacts.every((u) => !u.email)) {
      setCampaignFeedback({
        type: 'error',
        text: 'Cadastre pelo menos um e-mail de URE no painel Master antes de enviar às diretorias.',
      });
      return;
    }

    setGeneratingAi(true);
    try {
      const res = await fetch('/api/ai/generate-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          recipientScope,
          schoolCies: selectedCies,
          ureNames: selectedUreNames,
          senderEmail,
          customContext,
          tone,
          focus: {
            type: focusType,
            label: getFocusDisplayLabel(),
            parentTema: focusParentTema || undefined,
          },
        }),
      });
      const data = (await res.json()) as { drafts?: DraftMessage[]; error?: string };
      if (!res.ok || !data.drafts) {
        throw new Error(data.error || 'Falha ao gerar mensagens.');
      }
      setDrafts(data.drafts);
      setLastDispatchedMode(null);
      setCampaignFeedback({
        type: 'success',
        text: `${data.drafts.length} mensagem(ns) personalizada(s) redigida(s) pelo Gemini com os registros reais das escolas.`,
      });
    } catch (err) {
      setCampaignFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao consultar IA.',
      });
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleSendEmails() {
    if (drafts.length === 0) return;
    setSendingEmails(true);
    setCampaignFeedback(null);
    const triggerType =
      tone === 'parabenizacao' || templateKind === 'parabens' ? 'parabenizacao' : 'manual_ia';

    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          senderEmail,
          triggerType,
          messages: drafts,
        }),
      });
      const data = (await res.json()) as {
        smtpSentCount?: number;
        exportCount?: number;
        allLogs?: EmailDispatchLog[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar e-mails.');
      if (data.allLogs) onEmailLogsUpdated(data.allLogs);

      if ((data.smtpSentCount ?? 0) > 0) {
        setLastDispatchedMode('smtp');
        setCampaignFeedback({
          type: 'success',
          text: `${data.smtpSentCount} e-mail(s) enviado(s) automaticamente pelo servidor com "${senderEmail}" como resposta e registrado(s) no histórico.`,
        });
      } else {
        setLastDispatchedMode('outlook');
        setCampaignFeedback({
          type: 'success',
          text: `${data.exportCount} envio(s) registrado(s). Como o envio automático em lote (SMTP) ainda não foi ativado pelo Master, clique em "Outlook Web" em cada cartão para abrir pronto na sua conta Microsoft.`,
        });
      }
    } catch (err) {
      setCampaignFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao processar envio.',
      });
    } finally {
      setSendingEmails(false);
    }
  }

  function renderAdminStatusBadge(c: SchoolCompliance) {
    if (!c.hasConfiguredMetas) {
      return (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Sem meta definida
        </span>
      );
    }
    if (c.status === 'em_dia') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Em dia
        </span>
      );
    }
    if (c.status === 'atencao') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5" />
          Em atenção
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
        <AlertTriangle className="w-3.5 h-3.5" />
        Pendente
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scope & Navigation Header */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('metas')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'metas'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Metas & Prazos Individuais
            </button>
            <button
              type="button"
              onClick={() => setSubTab('compose')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'compose'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Mensagens & Envios
            </button>
            <button
              type="button"
              onClick={() => setSubTab('history')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              Histórico ({emailLogs.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              {isUreScoped
                ? `Gestor Regional · URE ${assignedUre}`
                : authUser.role === 'master'
                  ? 'Master · Todas as UREs'
                  : 'Gestor Geral · Todas as UREs'}
            </span>
            {integrations.smtpConfigured ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Envio em lote ativo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Envio individual via Outlook Web / .EML
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SUBTAB 1: METAS INDIVIDUAIS (PRIVADO ADMIN) */}
      {subTab === 'metas' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveMetas}
            className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-6 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Estipular Metas e Prazos Individuais (Painel Restrito Admin)
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                  {isUreScoped
                    ? `Seu perfil permite criar e gerenciar regras exclusivas para as escolas da URE ${assignedUre}.`
                    : 'Por padrão não há nenhuma meta ativa. Adicione regras para todas as UREs ou para uma diretoria específica conforme a necessidade.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunAutoAlerts}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-amber-400 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
              >
                <BellRing className="w-4 h-4" />
                Gerar Alertas das Metas
              </button>
            </div>

            {metasFeedback && (
              <div
                role="status"
                className="rounded-lg border border-blue-300 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-900 dark:text-blue-200"
              >
                {metasFeedback}
              </div>
            )}

            {/* Add New Individual Rule Box */}
            <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-4">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                + Nova Regra por Modelo de ATA, Tema ou Subtema
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Diretoria (URE)
                  </label>
                  {isUreScoped ? (
                    <input
                      type="text"
                      readOnly
                      value={`URE ${assignedUre}`}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200/70 dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200"
                    />
                  ) : (
                    <select
                      value={newRuleUreScope}
                      onChange={(e) => setNewRuleUreScope(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      <option value="ALL">Todas as UREs</option>
                      {availableUres.map((u) => (
                        <option key={u} value={u}>
                          URE {u}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Categoria
                  </label>
                  <select
                    value={newRuleType}
                    onChange={(e) => setNewRuleType(e.target.value as MetaRuleType)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="modelo_ata">Modelo de ATA</option>
                    <option value="tema_acao">Tema da Ação</option>
                    <option value="subtema_acao">Subtema da Ação</option>
                  </select>
                </div>

                {newRuleType === 'subtema_acao' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Tema Principal
                    </label>
                    <select
                      value={newRuleParentTema}
                      onChange={(e) => setNewRuleParentTema(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {availableThemes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={newRuleType === 'subtema_acao' ? 'md:col-span-3' : 'md:col-span-5'}>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {newRuleType === 'modelo_ata'
                      ? 'Modelo de ATA'
                      : newRuleType === 'tema_acao'
                        ? 'Tema da Ação'
                        : 'Subtema'}
                  </label>
                  <select
                    value={newRuleTarget}
                    onChange={(e) => setNewRuleTarget(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {(newRuleType === 'modelo_ata'
                      ? availableAtaModels
                      : newRuleType === 'tema_acao'
                        ? availableThemes
                        : subthemesForBuilder
                    ).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Qtd.
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newRuleQty}
                    onChange={(e) => setNewRuleQty(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Prazo (opcional)
                  </label>
                  <input
                    type="date"
                    value={newRuleDeadline}
                    onChange={(e) => setNewRuleDeadline(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Regra
                </button>
              </div>
            </div>

            {/* Active Rules List */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Regras Configuradas ({visibleRules.length})
              </h4>
              {visibleRules.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-5 text-sm text-slate-600 dark:text-slate-400 text-center">
                  Nenhuma regra estipulada ainda. Adicione acima os modelos de ATA, temas ou subtemas com
                  suas respectivas quantidades e prazos quando desejar acompanhar.
                </div>
              ) : (
                <div className="border border-slate-300 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleRules.map((r) => {
                    const ruleScope = (r.ureScope || 'ALL').toUpperCase().trim();
                    const canEditRule = !isUreScoped || ruleScope === assignedUre;
                    return (
                      <div
                        key={r.id}
                        className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={r.ativo}
                            disabled={!canEditRule}
                            onChange={(e) => handleUpdateRule(r.id, { ativo: e.target.checked })}
                            aria-label="Ativar regra"
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 disabled:opacity-50"
                          />
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {r.parentTema ? `${r.parentTema} › ` : ''}
                              {r.targetName}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                              {r.tipo === 'modelo_ata'
                                ? 'Modelo de ATA'
                                : r.tipo === 'tema_acao'
                                  ? 'Tema da Ação'
                                  : 'Subtema da Ação'}{' '}
                              ·{' '}
                              <span className="font-semibold text-blue-700 dark:text-blue-400">
                                {ruleScope === 'ALL' ? 'Todas as UREs' : `URE ${ruleScope}`}
                              </span>
                              {!canEditRule && ' (Regra Geral — somente leitura)'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                            Mín:
                            <input
                              type="number"
                              min={1}
                              disabled={!canEditRule}
                              value={r.minQuantidade}
                              onChange={(e) =>
                                handleUpdateRule(r.id, {
                                  minQuantidade: Math.max(1, Number(e.target.value)),
                                })
                              }
                              className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs font-mono disabled:opacity-50"
                            />
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                            Prazo:
                            <input
                              type="date"
                              disabled={!canEditRule}
                              value={r.prazoLimite}
                              onChange={(e) => handleUpdateRule(r.id, { prazoLimite: e.target.value })}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs font-mono disabled:opacity-50"
                            />
                          </label>
                          {canEditRule && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRule(r.id)}
                              aria-label="Remover regra"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Optional Global Counts & Templates (Gestor Geral / Master only) */}
            {!isUreScoped && (
              <>
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Mínimo Geral de ATAs (opcional)
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Não definido"
                      value={globalMinAtas}
                      onChange={(e) => setGlobalMinAtas(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Mínimo Geral de Ações (opcional)
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Não definido"
                      value={globalMinAcoes}
                      onChange={(e) => setGlobalMinAcoes(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Prazo Geral (opcional)
                    </label>
                    <input
                      type="date"
                      value={prazoGlobal}
                      onChange={(e) => setPrazoGlobal(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Janela de Alerta (dias antes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={diasAlertaProximo}
                      onChange={(e) => setDiasAlertaProximo(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Templates Section */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Modelos de Mensagem Automática (Cobrança e Parabenização)
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Variáveis: {'{{escola}}'}, {'{{cie}}'}, {'{{ure}}'}, {'{{prazo}}'}, {'{{item_foco}}'},{' '}
                        {'{{total_item}}'}, {'{{total_atas}}'}, {'{{total_acoes}}'}, {'{{pendencias}}'}
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={alertaAutomaticoAtivo}
                        onChange={(e) => setAlertaAutomaticoAtivo(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      Alertas automáticos ativos
                    </label>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="space-y-2 rounded-lg border border-slate-300 dark:border-slate-800 p-3.5 bg-slate-50/60 dark:bg-slate-950/30">
                      <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Template: Lembrete / Prazo Próximo
                      </div>
                      <input
                        type="text"
                        value={templateAssuntoProximo}
                        onChange={(e) => setTemplateAssuntoProximo(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                      <textarea
                        rows={5}
                        value={templateCorpoProximo}
                        onChange={(e) => setTemplateCorpoProximo(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-300 dark:border-slate-800 p-3.5 bg-slate-50/60 dark:bg-slate-950/30">
                      <div className="text-xs font-semibold text-red-700 dark:text-red-400">
                        Template: Prazo Expirado / Regularização
                      </div>
                      <input
                        type="text"
                        value={templateAssuntoExpirado}
                        onChange={(e) => setTemplateAssuntoExpirado(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                      <textarea
                        rows={5}
                        value={templateCorpoExpirado}
                        onChange={(e) => setTemplateCorpoExpirado(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-300 dark:border-slate-800 p-3.5 bg-slate-50/60 dark:bg-slate-950/30">
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Template: Parabenização (Escolas em Dia)
                      </div>
                      <input
                        type="text"
                        value={templateAssuntoParabens}
                        onChange={(e) => setTemplateAssuntoParabens(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                      <textarea
                        rows={5}
                        value={templateCorpoParabens}
                        onChange={(e) => setTemplateCorpoParabens(e.target.value)}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              {!isUreScoped ? (
                <div className="w-full sm:max-w-sm">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail Remetente Padrão
                  </label>
                  <input
                    type="email"
                    value={emailRemetentePadrao}
                    onChange={(e) => setEmailRemetentePadrao(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
              ) : (
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Alterações serão aplicadas exclusivamente às regras da URE {assignedUre}.
                </div>
              )}
              <button
                type="submit"
                disabled={savingMetas}
                className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors whitespace-nowrap"
              >
                {savingMetas ? 'Salvando...' : 'Salvar Metas e Prazos'}
              </button>
            </div>
          </form>

          {/* Private Admin Compliance Table (Emails and Metas Status ONLY inside Admin) */}
          <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Situação por Escola e E-mails Institucionais (Restrito Admin)
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Cruzamento em tempo real considerando apenas as metas configuradas para cada diretoria.
                </p>
              </div>
              <select
                value={complianceStatusFilter}
                onChange={(e) =>
                  setComplianceStatusFilter(e.target.value as typeof complianceStatusFilter)
                }
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="all">Todas ({scopedCompliance.length})</option>
                <option value="pendente">Pendentes</option>
                <option value="atencao">Em atenção</option>
                <option value="em_dia">Em dia</option>
              </select>
            </div>

            <div className="overflow-x-auto max-h-[420px] rounded-lg border border-slate-300 dark:border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 dark:border-slate-700 bg-slate-200/75 dark:bg-slate-950/70 text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-300">
                    <th className="py-3 px-3 border-r border-slate-300 dark:border-slate-800">Escola</th>
                    <th className="py-3 px-3 border-r border-slate-300 dark:border-slate-800">E-mail Microsoft</th>
                    <th className="py-3 px-3 text-right border-r border-slate-300 dark:border-slate-800">ATAs</th>
                    <th className="py-3 px-3 text-right border-r border-slate-300 dark:border-slate-800">Ações</th>
                    <th className="py-3 px-3 border-r border-slate-300 dark:border-slate-800">Status</th>
                    <th className="py-3 px-3 border-r border-slate-300 dark:border-slate-800">Detalhe das Metas</th>
                    <th className="py-3 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300/80 dark:divide-slate-800 text-xs sm:text-sm">
                  {adminComplianceFiltered.map((c) => (
                    <tr
                      key={c.school.cie}
                      className="even:bg-slate-100/70 dark:even:bg-slate-900/40 hover:bg-blue-50/80 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100 border-r border-slate-300/80 dark:border-slate-800">
                        <div>{c.school.nomeSed}</div>
                        <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                          {c.school.ure} · CIE {c.school.cie}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-700 dark:text-slate-300 border-r border-slate-300/80 dark:border-slate-800">
                        {c.school.email || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-slate-300/80 dark:border-slate-800">
                        {c.totalAtas}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums border-r border-slate-300/80 dark:border-slate-800">
                        {c.totalAcoes}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap border-r border-slate-300/80 dark:border-slate-800">
                        {renderAdminStatusBadge(c)}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300 max-w-xs border-r border-slate-300/80 dark:border-slate-800">
                        {!c.hasConfiguredMetas
                          ? 'Aguardando definição de metas'
                          : c.motivosPendencia.join(' · ') || 'Todas as regras cumpridas'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setRecipientScope('schools');
                            setComposerUreFilter(c.school.ure);
                            setSelectedCies([c.school.cie]);
                            setTone(c.status === 'em_dia' ? 'parabenizacao' : 'cortes');
                            setSubTab('compose');
                          }}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                        >
                          Enviar e-mail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: COMPOSER (MODELO ATA / TEMA / SUBTEMA + PARABENIZAR + IA/TEMPLATE) */}
      {subTab === 'compose' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 space-y-4">
            <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                1. Público, Modelo/Tema em Foco e Tom
              </h3>

              {/* Escolas vs E-mails das UREs (URE emails only for Gestor Geral / Master) */}
              {!isUreScoped && (
                <div className="grid grid-cols-2 gap-2 p-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setRecipientScope('schools')}
                    className={`py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors ${
                      recipientScope === 'schools'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    E-mails das Escolas
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientScope('ures')}
                    className={`py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors ${
                      recipientScope === 'ures'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    E-mails das UREs ({ureContacts.length})
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Seu E-mail Microsoft (@educacao.sp.gov.br)
                </label>
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="seu.nome@educacao.sp.gov.br"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 flex items-start gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                  <span>
                    {integrations.smtpConfigured
                      ? 'Envio em lote ativo: os e-mails sairão com seu endereço configurado como resposta (Reply-To).'
                      : 'Sem senha extra: clique em "Outlook Web" em cada rascunho para enviar pela sua própria sessão Microsoft.'}
                  </span>
                </p>
              </div>

              {/* Focus Selector: Modelo de ATA / Tema / Subtema */}
              <div className="space-y-2.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Assunto / Modelo Específico da Mensagem
                </label>
                <select
                  value={focusType}
                  onChange={(e) => setFocusType(e.target.value as typeof focusType)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="geral">Acompanhamento Geral do Grêmio</option>
                  <option value="modelo_ata">Modelo de ATA específico</option>
                  <option value="tema_acao">Tema de Ação específico</option>
                  <option value="subtema_acao">Subtema de Ação específico</option>
                </select>

                {focusType === 'subtema_acao' && (
                  <select
                    value={focusParentTema}
                    onChange={(e) => setFocusParentTema(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {availableThemes.map((t) => (
                      <option key={t} value={t}>
                        Tema: {t}
                      </option>
                    ))}
                  </select>
                )}

                {focusType !== 'geral' && (
                  <select
                    value={focusTarget}
                    onChange={(e) => setFocusTarget(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {(focusType === 'modelo_ata'
                      ? availableAtaModels
                      : focusType === 'tema_acao'
                        ? availableThemes
                        : subthemesForFocus
                    ).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tom (IA Gemini centralizada)
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as typeof tone)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="cortes">Cortês e Orientador</option>
                    <option value="urgente">Prazo / Cobrança Firme</option>
                    <option value="parabenizacao">Parabenização (Em Dia)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Template Direto (sem IA)
                  </label>
                  <select
                    value={templateKind}
                    onChange={(e) => setTemplateKind(e.target.value as typeof templateKind)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="proximo">Lembrete / Prazo Próximo</option>
                    <option value="expirado">Regularização / Expirado</option>
                    <option value="parabens">Parabenização (Em Dia)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Orientações adicionais (opcional)
                </label>
                <textarea
                  rows={2}
                  value={customContext}
                  onChange={(e) => setCustomContext(e.target.value)}
                  placeholder="Ex.: Parabenizar pelo excelente engajamento ou reforçar registro até sexta."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Recipient Selection Card */}
            <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
              {recipientScope === 'ures' && !isUreScoped ? (
                <>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    2. UREs Destinatárias ({selectedUreNames.length || ureContacts.length})
                  </h3>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-300 dark:border-slate-800 rounded-lg">
                    {ureContacts.map((u) => {
                      const checked = selectedUreNames.includes(u.ure);
                      return (
                        <label
                          key={u.ure}
                          className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedUreNames((prev) =>
                                prev.includes(u.ure) ? prev.filter((x) => x !== u.ure) : [...prev, u.ure]
                              )
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                          />
                          <div className="text-sm">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              URE {u.ure}
                            </div>
                            <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                              {u.email || 'Sem e-mail cadastrado'}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      2. Escolas ({selectedCies.length} selecionadas)
                    </h3>
                    {!isUreScoped && (
                      <select
                        aria-label="Filtrar diretoria dos destinatários"
                        value={composerUreFilter}
                        onChange={(e) => {
                          setComposerUreFilter(e.target.value);
                          setSelectedCies([]);
                        }}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                      >
                        <option value="all">Todas as UREs</option>
                        {availableUres.map((u) => (
                          <option key={u} value={u}>
                            URE {u}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPresetSelection('em_dia_parabens')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
                    >
                      <Award className="w-3.5 h-3.5" />
                      Em Dia (Parabenizar)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetSelection('pendentes_foco')}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100"
                    >
                      Sem Registro no Foco
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetSelection('todas')}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-blue-300 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                    >
                      Selecionar Todas ({filteredRecipientSchools.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetSelection('clear')}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      Limpar
                    </button>
                  </div>

                  <input
                    type="search"
                    placeholder="Filtrar lista de escolas ou CIE..."
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  />

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-300 dark:border-slate-800 rounded-lg">
                    {filteredRecipientSchools.map((c) => {
                      const checked = selectedCies.includes(c.school.cie);
                      const focusCount = getFocusCountForSchool(c);
                      return (
                        <label
                          key={c.school.cie}
                          className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedCies((prev) =>
                                prev.includes(c.school.cie)
                                  ? prev.filter((x) => x !== c.school.cie)
                                  : [...prev, c.school.cie]
                              )
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                          />
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {c.school.nomeSed}
                            </div>
                            <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                              URE {c.school.ure} · {c.school.email || 'Sem e-mail'} ·{' '}
                              {focusType === 'geral'
                                ? `ATAs ${c.totalAtas} · Ações ${c.totalAcoes}`
                                : `No foco: ${focusCount}`}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={generatingAi}
                  onClick={handleGenerateWithAi}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>{generatingAi ? 'Redigindo...' : 'Gerar com IA'}</span>
                </button>
                <button
                  type="button"
                  onClick={applyTemplateToSelected}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>Aplicar Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Draft Review & Send */}
          <div className="xl:col-span-7">
            <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    3. Revisão e Disparo ({drafts.length} rascunho(s))
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Revise ou edite os textos antes do envio definitivo.
                  </p>
                </div>
                {drafts.length > 0 && (
                  <button
                    type="button"
                    disabled={sendingEmails}
                    onClick={handleSendEmails}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    {sendingEmails ? 'Enviando...' : `Enviar Todos (${drafts.length})`}
                  </button>
                )}
              </div>

              {campaignFeedback && (
                <div
                  role="alert"
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    campaignFeedback.type === 'error'
                      ? 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                      : 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  {campaignFeedback.text}
                </div>
              )}

              {drafts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center space-y-2">
                  <Mail className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-base font-medium text-slate-800 dark:text-slate-200">
                    Nenhuma mensagem preparada ainda
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    Selecione o modelo de ATA, Tema ou Subtema desejado (ou parabenização para todas as
                    escolas em dia) e clique em “Gerar com IA” ou “Aplicar Template”.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[680px] overflow-y-auto pr-1">
                  {drafts.map((draft, idx) => (
                    <div
                      key={`${draft.schoolCie}-${idx}`}
                      className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {draft.schoolName}
                          </div>
                          <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                            Para: {draft.recipientEmail} · URE {draft.ure}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
                              draft.recipientEmail
                            )}&subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(
                              draft.body
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Outlook Web
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              downloadTextFile(
                                `comunicado-${draft.schoolCie}.eml`,
                                buildEmlContent({
                                  from: senderEmail,
                                  to: draft.recipientEmail,
                                  subject: draft.subject,
                                  body: draft.body,
                                }),
                                'message/rfc822'
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Download className="w-3.5 h-3.5" />
                            .EML
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={draft.subject}
                        onChange={(e) =>
                          setDrafts((prev) =>
                            prev.map((d, i) => (i === idx ? { ...d, subject: e.target.value } : d))
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                      />
                      <textarea
                        rows={5}
                        value={draft.body}
                        onChange={(e) =>
                          setDrafts((prev) =>
                            prev.map((d, i) => (i === idx ? { ...d, body: e.target.value } : d))
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 leading-relaxed"
                      />
                    </div>
                  ))}
                  {lastDispatchedMode === 'outlook' && (
                    <div className="rounded-lg border border-blue-300 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-3.5 text-sm text-blue-900 dark:text-blue-200">
                      Dica: Use “Outlook Web” ou baixe o arquivo “.EML” em cada cartão para disparar diretamente pela sua conta institucional Microsoft.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: HISTÓRICO DE ENVIOS */}
      {subTab === 'history' && (
        <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Histórico de Mensagens Registradas e Enviadas ({emailLogs.length})
            </h3>
          </div>
          {emailLogs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-600 dark:text-slate-400">
              Nenhuma mensagem enviada até o momento.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {emailLogs.map((log) => (
                <div key={log.id} className="p-4 space-y-2 text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {log.schoolName}
                      </span>{' '}
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                        ({log.recipientEmail} · URE {log.ure})
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      {formatTimestampBr(log.sentAt)} ·{' '}
                      {log.deliveryMode === 'smtp_microsoft365' ? 'SMTP Microsoft 365' : 'Outlook / .EML'} ·{' '}
                      {getStatusLabel(log.statusSnapshot)}
                    </div>
                  </div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{log.subject}</div>
                  <button
                    type="button"
                    onClick={() => setExpandedLogId((prev) => (prev === log.id ? null : log.id))}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {expandedLogId === log.id ? 'Ocultar conteúdo' : 'Ver conteúdo enviado'}
                  </button>
                  {expandedLogId === log.id && (
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-800 dark:text-slate-300 font-sans">
                      {log.body}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
