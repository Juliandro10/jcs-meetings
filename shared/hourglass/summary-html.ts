import type { VisitSummaryMetrics } from './types';
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
    h1 { font-size: 18pt; margin: 0 0 0.25em; }
    h2 { font-size: 11pt; font-weight: normal; color: #555; margin: 0 0 1.5em; }
    table { width: 100%; border-collapse: collapse; font-size: 12pt; }
    td { border-bottom: 1px solid #ddd; padding: 0.55em 0.25em; vertical-align: top; }
    td.num { text-align: right; font-weight: 600; width: 5rem; }
    .foot { margin-top: 1.5em; font-size: 10pt; color: #666; }
  </style>
</head>
<body>
  <h1>Últimos 6 meses</h1>
  <h2>${escapeHtml(congregationName)}</h2>
  <table>${bodyRows}</table>
  <p class="foot">Gerado pelo JCS Meetings · Editor Visita SC</p>
</body>
</html>`;
}
