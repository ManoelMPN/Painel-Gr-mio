import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { ComplianceStatus } from '../../shared/types.ts';

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
