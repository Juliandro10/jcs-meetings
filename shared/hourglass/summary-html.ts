import { buildVisitSummaryRows } from './summary-rows';
import type { VisitSummaryMetrics } from './types';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatVisitSummaryHeader(congregationName: string): string {
  const trimmed = congregationName.trim();
  const label = trimmed
    ? /^congregaç/i.test(trimmed)
      ? trimmed
      : `Congregação ${trimmed}`
    : 'Congregação';
  return `${label} - Últimos 6 meses`;
}

/** HTML plano para conversão em PDF (sem nomes, sem expandir). */
export function buildVisitSummaryHtml(
  congregationName: string,
  metrics: VisitSummaryMetrics,
): string {
  const rows = [
    ['Publicadores totais (≥1 relatório)', metrics.totalPublishers],
    [`Média de publicadores por mês (${metrics.averageMonthsCounted} meses)`, metrics.averagePublishersPerMonth],
    ['Irregulares', metrics.irregularPublishers],
    ['Inativos totais', metrics.totalInactive],
    ['Reativados', metrics.reactivated],
    ['Novos publicadores não batizados', metrics.newUnbaptized],
    ['Novos batizados (6 meses)', metrics.newBaptized],
    ['Pioneiros regulares (6 meses)', metrics.regularPioneers],
    ['Pioneiros auxiliares (6 meses)', metrics.auxiliaryPioneers],
    [`Média de estudos por mês (${metrics.averageMonthsCounted} meses)`, metrics.averageStudiesPerMonth],
    [`Média de estudos bíblicos por publicador (${metrics.averageMonthsCounted} meses)`, metrics.averageStudiesPerPublisher],
    [`Média de assistência — meio de semana (${metrics.averageMonthsCounted} meses)`, metrics.averageMidweekAttendance],
    [`Média de assistência — fim de semana (${metrics.averageMonthsCounted} meses)`, metrics.averageWeekendAttendance],
  ];

  const bodyRows = rows
    .map(
      ([label, value]) =>
        `<tr><td>${escapeHtml(String(label))}</td><td class="num">${escapeHtml(String(value))}</td></tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Resumo da visita — ${escapeHtml(congregationName)}</title>
  <style>
    body { font-family: 'Segoe UI', Calibri, sans-serif; margin: 2cm; color: #222; }
    h1 { font-size: 18pt; margin: 0 0 1.5em; }
    h2 { font-size: 11pt; font-weight: normal; color: #555; margin: 0 0 1.5em; }
    table { width: 100%; border-collapse: collapse; font-size: 12pt; }
    td { border-bottom: 1px solid #ddd; padding: 0.55em 0.25em; vertical-align: top; }
    td.num { text-align: right; font-weight: 600; width: 5rem; }
    .foot { margin-top: 1.5em; font-size: 10pt; color: #666; }
  </style>
</head>
<body>
  <h1>${escapeHtml(formatVisitSummaryHeader(congregationName))}</h1>
  <table>${bodyRows}</table>
  <p class="foot">Gerado pelo JCS Meetings · Editor Visita SC</p>
</body>
</html>`;
}

function buildInteractiveRow(row: ReturnType<typeof buildVisitSummaryRows>[number]): string {
  const value = escapeHtml(String(row.value));
  const canExpand = Boolean(row.names && row.names.length > 0);

  if (!canExpand) {
    return `<div class="summary-row plain">
  <span class="summary-label">${escapeHtml(row.label)}</span>
  <span class="summary-value">${value}</span>
</div>`;
  }

  const names = row.names!
    .map((name) => `<li>${escapeHtml(name)}</li>`)
    .join('\n');

  return `<details class="summary-row expandable">
  <summary>
    <span class="summary-leading"><span class="chevron" aria-hidden="true"></span><span class="summary-label">${escapeHtml(row.label)}</span></span>
    <span class="summary-value">${value}</span>
  </summary>
  <ul class="summary-names">${names}</ul>
</details>`;
}

/** HTML interativo com linhas expansíveis (como na aba Resumo do JCS). */
export function buildVisitSummaryInteractiveHtml(
  congregationName: string,
  metrics: VisitSummaryMetrics,
): string {
  const rows = buildVisitSummaryRows(metrics)
    .map((row) => buildInteractiveRow(row))
    .join('\n');

  const header = formatVisitSummaryHeader(congregationName);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resumo da visita — ${escapeHtml(congregationName)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #e5e7eb;
      --surface: #f9fafb;
      --accent: #6d28d9;
      --accent-soft: #ede9fe;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --text: #f3f4f6;
        --muted: #9ca3af;
        --border: #374151;
        --surface: #111827;
        --accent: #a78bfa;
        --accent-soft: #2e1065;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Calibri, sans-serif;
      margin: 0;
      padding: 1.5rem;
      color: var(--text);
      background: #fff;
      line-height: 1.45;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0b0f17; }
    }
    .shell {
      max-width: 42rem;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.35rem;
      margin: 0 0 1.25rem;
    }
    .panel {
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      overflow: hidden;
      background: var(--surface);
    }
    .summary-row {
      border-bottom: 1px solid var(--border);
    }
    .summary-row:last-child { border-bottom: 0; }
    .summary-row.plain {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
    }
    details.summary-row > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      cursor: pointer;
      list-style: none;
      user-select: none;
    }
    details.summary-row > summary::-webkit-details-marker { display: none; }
    .summary-leading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .chevron {
      width: 0.55rem;
      height: 0.55rem;
      border-right: 2px solid var(--muted);
      border-bottom: 2px solid var(--muted);
      transform: rotate(-45deg);
      transition: transform 0.15s ease;
      flex-shrink: 0;
      margin-top: -0.15rem;
    }
    details[open] .chevron {
      transform: rotate(45deg);
      margin-top: 0.1rem;
    }
    details.summary-row > summary:hover .summary-label {
      color: var(--accent);
    }
    .summary-label {
      font-size: 0.95rem;
    }
    .summary-value {
      font-weight: 600;
      font-size: 0.95rem;
      flex-shrink: 0;
    }
    .summary-names {
      margin: 0;
      padding: 0 1rem 0.85rem 2.35rem;
      list-style: none;
      border-left: 2px solid var(--border);
      margin-left: 1.35rem;
      max-height: 14rem;
      overflow-y: auto;
    }
    .summary-names li {
      font-size: 0.88rem;
      color: var(--muted);
      padding: 0.15rem 0;
    }
    .hint {
      margin-top: 1rem;
      font-size: 0.82rem;
      color: var(--muted);
    }
    .foot {
      margin-top: 1.5rem;
      font-size: 0.82rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="shell">
    <h1>${escapeHtml(header)}</h1>
    <div class="panel">${rows}</div>
    <p class="hint">Toque nas linhas com seta para ver os nomes.</p>
    <p class="foot">Gerado pelo JCS Meetings · Editor Visita SC</p>
  </div>
</body>
</html>`;
}
