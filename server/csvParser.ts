import { normalizeAtaModel, normalizeSchoolKey, parseBrDateToIso } from '../shared/analytics.ts';
import type { AcaoRecord, AtaRecord, School } from '../shared/types.ts';

function splitSemicolonLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function buildSchoolLookup(schools: School[]): Map<string, School> {
  const map = new Map<string, School>();
  for (const s of schools) {
    map.set(normalizeSchoolKey(s.nomeSed), s);
    map.set(normalizeSchoolKey(s.nomePdf), s);
  }
  return map;
}

export interface ParsedCsvResult<T> {
  records: T[];
  totalRows: number;
  unmatchedSchools: string[];
  discoveredSchools: School[];
}

function makeDiscoveredSchool(diretoria: string, rawSchool: string): School {
  const normKey = normalizeSchoolKey(rawSchool);
  const slug = normKey.replace(/\s+/g, '-').slice(0, 48);
  const id = `auto-${diretoria.replace(/\s+/g, '')}-${slug}`;
  return {
    id,
    ure: diretoria,
    numeroPdf: '',
    cie: id,
    ua: '',
    fde: '',
    nomeSed: rawSchool.trim().toUpperCase(),
    nomePdf: rawSchool.trim().toUpperCase(),
    email: '',
    endereco: '',
    cep: '',
    telefones: '',
  };
}

export function parseAtasCsv(csvText: string, schools: School[]): ParsedCsvResult<AtaRecord> {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Planilha de ATAs vazia ou sem cabeçalho válido.');
  }

  const header = splitSemicolonLine(lines[0]).map((h) => h.toLowerCase());
  const idxDir = header.findIndex((h) => h.includes('diretoria') || h === 'ure');
  const idxEsc = header.findIndex((h) => h === 'escola' || h.includes('escola'));
  const idxMod = header.findIndex((h) => h.includes('modelo'));
  const idxPart = header.findIndex((h) => h.includes('quantidade'));
  const idxConv = header.findIndex((h) => h.includes('convoca'));
  const idxData = header.findIndex((h) => h.includes('data'));

  if (idxEsc === -1 || idxMod === -1 || idxData === -1) {
    throw new Error(
      'Cabeçalho inválido para planilha de ATAs. Esperado: Diretoria;Escola;Modelo de ATA;Quantidade Participantes;Convocação de Reunião;Data da Reunião'
    );
  }

  const lookup = buildSchoolLookup(schools);
  const discoveredMap = new Map<string, School>();
  const records: AtaRecord[] = [];
  const unmatched = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitSemicolonLine(lines[i]);
    const rawSchool = cols[idxEsc] ?? '';
    if (!rawSchool) continue;

    const normKey = normalizeSchoolKey(rawSchool);
    const matched = lookup.get(normKey);
    const diretoria = idxDir !== -1 && cols[idxDir] ? cols[idxDir].toUpperCase().trim() : (matched?.ure || 'SUL 3');

    if (!matched) {
      unmatched.add(rawSchool);
      if (!discoveredMap.has(normKey)) {
        const stub = makeDiscoveredSchool(diretoria, rawSchool);
        discoveredMap.set(normKey, stub);
        lookup.set(normKey, stub);
      }
    }

    const schoolObj = matched ?? discoveredMap.get(normKey);
    const modeloAta = cols[idxMod] ?? 'Não informado';
    const dataReuniao = cols[idxData] ?? '';
    const { dataIso, mesAno } = parseBrDateToIso(dataReuniao);
    const participantesRaw = parseInt(cols[idxPart] ?? '0', 10);

    records.push({
      id: `ata-${i}-${schoolObj?.cie ?? 'ext'}`,
      diretoria,
      escola: schoolObj ? schoolObj.nomeSed : rawSchool,
      modeloAta,
      modeloNormalizado: normalizeAtaModel(modeloAta),
      participantes: Number.isFinite(participantesRaw) && participantesRaw >= 0 ? participantesRaw : 0,
      convocacao: idxConv !== -1 ? (cols[idxConv] || '') : '',
      dataReuniao,
      dataIso,
      mesAno,
    });
  }

  return {
    records,
    totalRows: lines.length - 1,
    unmatchedSchools: [...unmatched],
    discoveredSchools: [...discoveredMap.values()],
  };
}

export function parseAcoesCsv(csvText: string, schools: School[]): ParsedCsvResult<AcaoRecord> {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Planilha de Ações vazia ou sem cabeçalho válido.');
  }

  const header = splitSemicolonLine(lines[0]).map((h) => h.toLowerCase());
  const idxDir = header.findIndex((h) => h.includes('diretoria') || h === 'ure');
  const idxEsc = header.findIndex((h) => h === 'escola' || h.includes('escola'));
  const idxTema = header.findIndex((h) => h === 'tema');
  const idxSub = header.findIndex((h) => h.includes('subtema'));
  const idxNome = header.findIndex((h) => h.includes('nome'));
  const idxPart = header.findIndex((h) => h.includes('quantidade'));
  const idxData = header.findIndex((h) => h.includes('data'));
  const idxProp = header.findIndex((h) => h.includes('proposta'));

  if (idxEsc === -1 || idxTema === -1 || idxNome === -1 || idxData === -1) {
    throw new Error(
      'Cabeçalho inválido para planilha de Ações. Esperado: Diretoria;Escola;Tema;Subtema;Nome da Ação;Quantidade Alunos Participantes;Data Ação;Proposta Ação'
    );
  }

  const lookup = buildSchoolLookup(schools);
  const discoveredMap = new Map<string, School>();
  const records: AcaoRecord[] = [];
  const unmatched = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitSemicolonLine(lines[i]);
    const rawSchool = cols[idxEsc] ?? '';
    if (!rawSchool) continue;

    const normKey = normalizeSchoolKey(rawSchool);
    const matched = lookup.get(normKey);
    const diretoria = idxDir !== -1 && cols[idxDir] ? cols[idxDir].toUpperCase().trim() : (matched?.ure || 'SUL 3');

    if (!matched) {
      unmatched.add(rawSchool);
      if (!discoveredMap.has(normKey)) {
        const stub = makeDiscoveredSchool(diretoria, rawSchool);
        discoveredMap.set(normKey, stub);
        lookup.set(normKey, stub);
      }
    }

    const schoolObj = matched ?? discoveredMap.get(normKey);
    const dataAcao = cols[idxData] ?? '';
    const { dataIso, mesAno } = parseBrDateToIso(dataAcao);
    const participantesRaw = parseInt(cols[idxPart] ?? '0', 10);

    records.push({
      id: `acao-${i}-${schoolObj?.cie ?? 'ext'}`,
      diretoria,
      escola: schoolObj ? schoolObj.nomeSed : rawSchool,
      tema: cols[idxTema] ?? 'Outros',
      subtema: idxSub !== -1 ? (cols[idxSub] || '') : '',
      nomeAcao: cols[idxNome] ?? '',
      participantes: Number.isFinite(participantesRaw) && participantesRaw >= 0 ? participantesRaw : 0,
      dataAcao,
      dataIso,
      mesAno,
      proposta: idxProp !== -1 ? (cols[idxProp] || '') : '',
    });
  }

  return {
    records,
    totalRows: lines.length - 1,
    unmatchedSchools: [...unmatched],
    discoveredSchools: [...discoveredMap.values()],
  };
}

export function parseAdditionalSchoolsCsv(csvText: string): School[] {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Planilha de escolas vazia ou sem cabeçalho válido.');
  }

  const header = splitSemicolonLine(lines[0]).map((h) => h.toLowerCase());
  const idxUre = header.findIndex((h) => h.includes('ure') || h.includes('diretoria'));
  const idxCie = header.findIndex((h) => h.includes('cie'));
  const idxEsc = header.findIndex((h) => h.includes('escola') || h.includes('nome'));
  const idxEmail = header.findIndex((h) => h.includes('email') || h.includes('e-mail'));

  if (idxEsc === -1) {
    throw new Error('Cabeçalho inválido. Esperado: URE;CIE;Escola;Email');
  }

  const imported: School[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitSemicolonLine(lines[i]);
    const nome = (cols[idxEsc] || '').trim();
    if (!nome) continue;
    const cieRaw = idxCie !== -1 && cols[idxCie] ? cols[idxCie].trim() : `EXT-${i}`;
    const ure = idxUre !== -1 && cols[idxUre] ? cols[idxUre].toUpperCase().trim() : 'SUL 3';
    const email =
      idxEmail !== -1 && cols[idxEmail]
        ? cols[idxEmail].trim().toLowerCase()
        : cieRaw.match(/^\d+$/)
          ? `e${cieRaw}a@educacao.sp.gov.br`
          : '';

    imported.push({
      id: cieRaw,
      ure,
      numeroPdf: String(i).padStart(3, '0'),
      cie: cieRaw,
      ua: '',
      fde: '',
      nomeSed: nome.toUpperCase(),
      nomePdf: nome.toUpperCase(),
      email,
      endereco: '',
      cep: '',
      telefones: '',
    });
  }

  return imported;
}
