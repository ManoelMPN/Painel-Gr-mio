import type {
  AcaoRecord,
  AtaRecord,
  ComplianceStatus,
  MetasConfig,
  RuleEvaluation,
  School,
  SchoolCompliance,
} from './types.ts';

export function normalizeSchoolKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAtaModel(modelo: string): string {
  const cleaned = modelo.trim();
  if (
    cleaned.toLowerCase().startsWith('00 ata da eleição') ||
    cleaned.toLowerCase().startsWith('ata da eleição')
  ) {
    return 'ATA da Eleição da Coordenação do Grêmio Estudantil - 2026 (resultado das urnas)';
  }
  return cleaned;
}

export function parseBrDateToIso(dateStr: string): { dataIso: string; mesAno: string } {
  const trimmed = (dateStr || '').trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    return { dataIso: '', mesAno: '' };
  }
  const [, day, month, year] = match;
  return {
    dataIso: `${year}-${month}-${day}`,
    mesAno: `${year}-${month}`,
  };
}

export function isDeadlineExpired(prazoLimite: string, referenceDate = new Date()): boolean {
  if (!prazoLimite) return false;
  const deadline = new Date(`${prazoLimite}T23:59:59`);
  if (Number.isNaN(deadline.getTime())) return false;
  return referenceDate.getTime() > deadline.getTime();
}

export function daysUntilDeadline(prazoLimite: string, referenceDate = new Date()): number | null {
  if (!prazoLimite) return null;
  const deadline = new Date(`${prazoLimite}T23:59:59`);
  if (Number.isNaN(deadline.getTime())) return null;
  const diffMs = deadline.getTime() - referenceDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function computeSchoolCompliance(
  schools: School[],
  atas: AtaRecord[],
  acoes: AcaoRecord[],
  metas: MetasConfig | null,
  referenceDate = new Date()
): SchoolCompliance[] {
  const atasBySchool = new Map<string, AtaRecord[]>();
  const acoesBySchool = new Map<string, AcaoRecord[]>();

  for (const ata of atas) {
    const key = normalizeSchoolKey(ata.escola);
    const list = atasBySchool.get(key) ?? [];
    list.push(ata);
    atasBySchool.set(key, list);
  }

  for (const acao of acoes) {
    const key = normalizeSchoolKey(acao.escola);
    const list = acoesBySchool.get(key) ?? [];
    list.push(acao);
    acoesBySchool.set(key, list);
  }

  const activeRules = (metas?.rules ?? []).filter((r) => r.ativo);
  const hasGlobalAtas =
    metas?.globalMinAtas !== null && metas?.globalMinAtas !== undefined && metas.globalMinAtas > 0;
  const hasGlobalAcoes =
    metas?.globalMinAcoes !== null && metas?.globalMinAcoes !== undefined && metas.globalMinAcoes > 0;

  const diasJanela = metas?.diasAlertaProximo ?? 7;

  return schools.map((school) => {
    const key = normalizeSchoolKey(school.nomeSed);
    const schoolAtas = atasBySchool.get(key) ?? [];
    const schoolAcoes = acoesBySchool.get(key) ?? [];

    const totalAtas = schoolAtas.length;
    const totalAcoes = schoolAcoes.length;
    const totalParticipantesAtas = schoolAtas.reduce((acc, item) => acc + (item.participantes || 0), 0);
    const totalParticipantesAcoes = schoolAcoes.reduce((acc, item) => acc + (item.participantes || 0), 0);

    const modelosSet = new Set(schoolAtas.map((a) => normalizeAtaModel(a.modeloAta)));
    const temasSet = new Set(schoolAcoes.map((a) => a.tema.trim()).filter(Boolean));
    const subtemasSet = new Set(
      schoolAcoes
        .filter((a) => a.tema.trim() && a.subtema.trim())
        .map((a) => `${a.tema.trim()}::${a.subtema.trim()}`)
    );

    const sortedAtasDates = schoolAtas
      .map((a) => a.dataIso)
      .filter(Boolean)
      .sort()
      .reverse();
    const sortedAcoesDates = schoolAcoes
      .map((a) => a.dataIso)
      .filter(Boolean)
      .sort()
      .reverse();

    const applicableRules = activeRules.filter(
      (r) => !r.ureScope || r.ureScope === 'ALL' || r.ureScope === school.ure
    );
    const hasConfiguredMetas = Boolean(
      metas && (applicableRules.length > 0 || hasGlobalAtas || hasGlobalAcoes)
    );

    if (!hasConfiguredMetas || !metas) {
      return {
        school,
        totalAtas,
        totalParticipantesAtas,
        totalAcoes,
        totalParticipantesAcoes,
        modelosPresentes: [...modelosSet],
        temasPresentes: [...temasSet],
        subtemasPresentes: [...subtemasSet],
        ultimaAtaData: sortedAtasDates[0] ?? null,
        ultimaAcaoData: sortedAcoesDates[0] ?? null,
        hasConfiguredMetas: false,
        ruleEvaluations: [],
        status: 'sem_meta',
        motivosPendencia: [],
        percentualCumprimento: 0,
      };
    }

    const ruleEvaluations: RuleEvaluation[] = [];
    const motivosPendencia: string[] = [];
    let anyExpiredUnmet = false;
    let anyApproachingUnmet = false;

    if (hasGlobalAtas && metas.globalMinAtas !== null) {
      const prazo = metas.prazoGlobal || '';
      const expired = isDeadlineExpired(prazo, referenceDate);
      const daysLeft = daysUntilDeadline(prazo, referenceDate);
      const approaching = daysLeft !== null && daysLeft >= 0 && daysLeft <= diasJanela;
      const atendido = totalAtas >= metas.globalMinAtas;

      if (!atendido) {
        motivosPendencia.push(`Total de ATAs: ${totalAtas}/${metas.globalMinAtas}`);
        if (expired) anyExpiredUnmet = true;
        else if (approaching) anyApproachingUnmet = true;
      }
      ruleEvaluations.push({
        ruleId: 'global-atas',
        tipo: 'modelo_ata',
        label: 'Total Geral de ATAs',
        atual: totalAtas,
        meta: metas.globalMinAtas,
        prazoLimite: prazo,
        atendido,
        vencido: !atendido && expired,
        proximoVencimento: !atendido && approaching,
      });
    }

    if (hasGlobalAcoes && metas.globalMinAcoes !== null) {
      const prazo = metas.prazoGlobal || '';
      const expired = isDeadlineExpired(prazo, referenceDate);
      const daysLeft = daysUntilDeadline(prazo, referenceDate);
      const approaching = daysLeft !== null && daysLeft >= 0 && daysLeft <= diasJanela;
      const atendido = totalAcoes >= metas.globalMinAcoes;

      if (!atendido) {
        motivosPendencia.push(`Total de Ações: ${totalAcoes}/${metas.globalMinAcoes}`);
        if (expired) anyExpiredUnmet = true;
        else if (approaching) anyApproachingUnmet = true;
      }
      ruleEvaluations.push({
        ruleId: 'global-acoes',
        tipo: 'tema_acao',
        label: 'Total Geral de Ações',
        atual: totalAcoes,
        meta: metas.globalMinAcoes,
        prazoLimite: prazo,
        atendido,
        vencido: !atendido && expired,
        proximoVencimento: !atendido && approaching,
      });
    }

    for (const rule of applicableRules) {
      let atual = 0;
      let label = rule.targetName;

      if (rule.tipo === 'modelo_ata') {
        const targetNorm = normalizeAtaModel(rule.targetName);
        atual = schoolAtas.filter((a) => normalizeAtaModel(a.modeloAta) === targetNorm).length;
        label = `ATA: ${rule.targetName}`;
      } else if (rule.tipo === 'tema_acao') {
        atual = schoolAcoes.filter((a) => a.tema.trim() === rule.targetName.trim()).length;
        label = `Tema: ${rule.targetName}`;
      } else if (rule.tipo === 'subtema_acao') {
        atual = schoolAcoes.filter(
          (a) =>
            (!rule.parentTema || a.tema.trim() === rule.parentTema.trim()) &&
            a.subtema.trim() === rule.targetName.trim()
        ).length;
        label = rule.parentTema
          ? `${rule.parentTema} › ${rule.targetName}`
          : `Subtema: ${rule.targetName}`;
      }

      const prazo = rule.prazoLimite || metas.prazoGlobal || '';
      const expired = isDeadlineExpired(prazo, referenceDate);
      const daysLeft = daysUntilDeadline(prazo, referenceDate);
      const approaching = daysLeft !== null && daysLeft >= 0 && daysLeft <= diasJanela;
      const atendido = atual >= rule.minQuantidade;

      if (!atendido) {
        motivosPendencia.push(`${label} (${atual}/${rule.minQuantidade})`);
        if (expired) anyExpiredUnmet = true;
        else if (approaching) anyApproachingUnmet = true;
      }

      ruleEvaluations.push({
        ruleId: rule.id,
        tipo: rule.tipo,
        label,
        atual,
        meta: rule.minQuantidade,
        prazoLimite: prazo,
        atendido,
        vencido: !atendido && expired,
        proximoVencimento: !atendido && approaching,
      });
    }

    const totalRules = ruleEvaluations.length;
    const metRatioSum = ruleEvaluations.reduce(
      (acc, ev) => acc + (ev.meta > 0 ? Math.min(1, ev.atual / ev.meta) : 1),
      0
    );
    const percentualCumprimento = totalRules > 0 ? Math.round((metRatioSum / totalRules) * 100) : 100;

    let status: ComplianceStatus = 'em_dia';
    if (motivosPendencia.length === 0) {
      status = 'em_dia';
    } else if (anyExpiredUnmet || percentualCumprimento < 50) {
      status = 'pendente';
    } else if (anyApproachingUnmet || motivosPendencia.length > 0) {
      status = 'atencao';
    }

    return {
      school,
      totalAtas,
      totalParticipantesAtas,
      totalAcoes,
      totalParticipantesAcoes,
      modelosPresentes: [...modelosSet],
      temasPresentes: [...temasSet],
      subtemasPresentes: [...subtemasSet],
      ultimaAtaData: sortedAtasDates[0] ?? null,
      ultimaAcaoData: sortedAcoesDates[0] ?? null,
      hasConfiguredMetas: true,
      ruleEvaluations,
      status,
      motivosPendencia,
      percentualCumprimento,
    };
  });
}
