import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { AcaoRecord, AtaRecord, ComplianceStatus, SchoolCompliance } from '../../shared/types.ts';

export function formatIsoDateBr(iso: string | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatTimestampBr(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatNumberBr(num: number): string {
  return new Intl.NumberFormat('pt-BR').format(num);
}

export function getStatusLabel(status: ComplianceStatus): string {
  switch (status) {
    case 'sem_meta':
      return 'Sem meta definida';
    case 'em_dia':
      return 'Em dia';
    case 'atencao':
      return 'Em atenção';
    case 'pendente':
      return 'Pendente';
  }
}

export function downloadSemicolonCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadExcelXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const colWidths = headers.map((h, colIdx) => {
    const maxLen = Math.max(
      h.length,
      ...rows.slice(0, 200).map((r) => String(r[colIdx] ?? '').length)
    );
    return { wch: Math.min(48, Math.max(12, maxLen + 3)) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename);
}

export function downloadPdfReport(params: {
  filename: string;
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  const doc = new jsPDF({
    orientation: params.headers.length > 5 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(params.title, 40, 42);

  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(params.subtitle, 40, 58);

  autoTable(doc, {
    startY: 72,
    head: [params.headers],
    body: params.rows.map((r) => r.map((cell) => String(cell ?? ''))),
    styles: {
      fontSize: 8.5,
      cellPadding: 5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 40, right: 40, bottom: 36 },
    didDrawPage: (hookData) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Grêmio Estudantil SEDUC-SP · Página ${hookData.pageNumber} de ${pageCount}`,
        40,
        doc.internal.pageSize.getHeight() - 18
      );
    },
  });

  doc.save(params.filename);
}

export function downloadSchoolDetailPdf(params: {
  compliance: SchoolCompliance;
  atas: AtaRecord[];
  acoes: AcaoRecord[];
  includeMetas: boolean;
}) {
  const { compliance, atas, acoes, includeMetas } = params;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const generatedAt = formatTimestampBr(new Date().toISOString());

  // Clean Institutional Header
  doc.setFontSize(13.5);
  doc.setTextColor(15, 23, 42);
  doc.text(compliance.school.nomeSed, 40, 40);

  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `URE ${compliance.school.ure} · CIE ${compliance.school.cie} · Gerado em ${generatedAt}`,
    40,
    56
  );

  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  const summaryParts = [
    `ATAs: ${atas.length} (${formatNumberBr(compliance.totalParticipantesAtas)} participantes)`,
    `Ações: ${acoes.length} (${formatNumberBr(compliance.totalParticipantesAcoes)} estudantes)`,
  ];
  if (includeMetas && compliance.hasConfiguredMetas) {
    const metCount = compliance.ruleEvaluations.filter((r) => r.atendido).length;
    summaryParts.push(`Metas cumpridas: ${metCount}/${compliance.ruleEvaluations.length}`);
  }
  doc.text(summaryParts.join('   |   '), 40, 74);

  let cursorY = 92;

  // Section 1: Metas e Prazos (with calm, understated colors)
  if (includeMetas) {
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Metas e Prazos', 40, cursorY);
    cursorY += 8;

    if (!compliance.hasConfiguredMetas || compliance.ruleEvaluations.length === 0) {
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Nenhuma meta estipulada para esta unidade até o momento.', 40, cursorY + 12);
      cursorY += 28;
    } else {
      const metaRows = compliance.ruleEvaluations.map((ev) => {
        const statusText = ev.atendido
          ? 'Cumprida'
          : ev.vencido
            ? 'Não cumprida (prazo encerrado)'
            : 'Em andamento';
        return [
          ev.label,
          String(ev.atual),
          String(ev.meta),
          ev.prazoLimite ? formatIsoDateBr(ev.prazoLimite) : 'Sem prazo',
          statusText,
        ];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [['Item / Meta', 'Realizado', 'Mínimo', 'Prazo', 'Situação']],
        body: metaRows,
        styles: {
          fontSize: 8.5,
          cellPadding: 5,
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
        },
        didParseCell: (hook) => {
          if (hook.section === 'body' && hook.column.index === 4) {
            const ev = compliance.ruleEvaluations[hook.row.index];
            if (!ev) return;
            if (ev.atendido) {
              // Soft calm sage green
              hook.cell.styles.fillColor = [236, 253, 245];
              hook.cell.styles.textColor = [6, 95, 70];
              hook.cell.styles.fontStyle = 'bold';
            } else if (ev.vencido) {
              // Soft muted warm sand/amber (avoids harsh bright red)
              hook.cell.styles.fillColor = [254, 243, 199];
              hook.cell.styles.textColor = [146, 64, 14];
              hook.cell.styles.fontStyle = 'bold';
            } else {
              // Soft neutral slate
              hook.cell.styles.fillColor = [241, 245, 249];
              hook.cell.styles.textColor = [71, 85, 105];
            }
          }
        },
        margin: { left: 40, right: 40 },
      });

      const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      cursorY = (lastTable?.finalY ?? cursorY) + 22;
    }
  }

  // Section 2: ATAs Registradas
  if (cursorY > 700) {
    doc.addPage();
    cursorY = 44;
  }
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`ATAs Registradas (${atas.length})`, 40, cursorY);

  autoTable(doc, {
    startY: cursorY + 8,
    head: [['Data', 'Modelo de ATA', 'Convocação', 'Participantes']],
    body:
      atas.length > 0
        ? atas.map((a) => [a.dataReuniao || '—', a.modeloAta, a.convocacao || '—', String(a.participantes)])
        : [['—', 'Nenhuma ATA registrada até o momento.', '—', '0']],
    styles: {
      fontSize: 8.5,
      cellPadding: 5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      3: { halign: 'right' },
    },
    margin: { left: 40, right: 40 },
  });

  const afterAtasTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  cursorY = (afterAtasTable?.finalY ?? cursorY) + 22;

  // Section 3: Ações Realizadas
  if (cursorY > 700) {
    doc.addPage();
    cursorY = 44;
  }
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Ações Realizadas (${acoes.length})`, 40, cursorY);

  autoTable(doc, {
    startY: cursorY + 8,
    head: [['Data', 'Nome da Ação', 'Tema', 'Subtema', 'Proposta', 'Alunos']],
    body:
      acoes.length > 0
        ? acoes.map((ac) => [
            ac.dataAcao || '—',
            ac.nomeAcao,
            ac.tema || '—',
            ac.subtema || '—',
            ac.proposta || '—',
            String(ac.participantes),
          ])
        : [['—', 'Nenhuma ação registrada até o momento.', '—', '—', '—', '0']],
    styles: {
      fontSize: 8,
      cellPadding: 4.5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      5: { halign: 'right' },
    },
    margin: { left: 40, right: 40, bottom: 36 },
    didDrawPage: (hookData) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Grêmio Estudantil SEDUC-SP · Develop by Manoel Pereira · Página ${hookData.pageNumber} de ${pageCount}`,
        40,
        doc.internal.pageSize.getHeight() - 18
      );
    },
  });

  const safeSlug = compliance.school.cie || 'escola';
  doc.save(`ficha-gremio-${safeSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildEmlContent(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  return [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'X-Unsent: 1',
    '',
    params.body,
  ].join('\r\n');
}
