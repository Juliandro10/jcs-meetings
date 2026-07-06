import fs from 'node:fs/promises';

import path from 'node:path';

import { applyMonthlyTotalFixes } from '../shared/hourglass/fix';

import { computeVisitSummary, groupPublishers } from '../shared/hourglass/metrics';
import { resolveVisitPeriod } from '../shared/hourglass/period';

import { serviceYearStart } from '../shared/hourglass/month-utils';

import { parseHourglassExport, publisherDisplayName } from '../shared/hourglass/parse';

import { buildVisitSummaryHtml } from '../shared/hourglass/summary-html';

import { sanitizeFileName } from '../shared/hourglass/month-utils';

import type { HourglassExportRaw } from '../shared/hourglass/types';

import { exportFullHtmlToPdf } from './outline-export';

import {

  bundledFormTemplatePath,

  writePublisherS21Pdf,

  writeS88Pdf,

  writeTotalsS21Pdf,

} from './visit-form-pdf';



export type CircuitVisitExportResult = {

  ok: boolean;

  outputDir?: string;

  files?: string[];

  warnings?: string[];

  error?: string;

};



export async function parseHourglassJsonFile(buffer: Buffer) {

  const raw = JSON.parse(buffer.toString('utf8')) as HourglassExportRaw;

  return parseHourglassExport(raw);

}



function resolveTemplate(configured: string | undefined, bundled: string): string {

  return configured?.trim() || bundled;

}



function serviceYearForExport(): number {

  return serviceYearStart().getFullYear();

}



export async function exportCircuitVisitPackage(params: {
  data: import('../shared/hourglass/types').HourglassExport;
  outputDir: string;
  congregationLabel: string;
  templateS21Path?: string;
  templateS88Path?: string;
  appRoot: string;
  periodStartMonth?: string;
  periodLengthMonths?: number;
}): Promise<CircuitVisitExportResult> {
  const warnings: string[] = [];
  const files: string[] = [];
  const { data, outputDir, congregationLabel, appRoot } = params;

  const s21Template = resolveTemplate(
    params.templateS21Path,
    bundledFormTemplatePath('S-21-T.pdf', appRoot),
  );
  const s88Template = resolveTemplate(
    params.templateS88Path,
    bundledFormTemplatePath('S-88-T.pdf', appRoot),
  );

  try {
    await fs.access(s21Template);
  } catch {
    return { ok: false, error: `Modelo S-21 não encontrado: ${s21Template}` };
  }

  try {
    await fs.mkdir(outputDir, { recursive: true });

    const groups = groupPublishers(data);
    for (const group of groups) {
      const groupDir = path.join(outputDir, sanitizeFileName(group.groupName));
      await fs.mkdir(groupDir, { recursive: true });

      for (const pub of group.publishers) {
        const fileName = `${sanitizeFileName(publisherDisplayName(pub))}.pdf`;
        const filePath = path.join(groupDir, fileName);
        await writePublisherS21Pdf({
          templatePath: s21Template,
          outputPath: filePath,
          data,
          publisher: pub,
        });
        files.push(filePath);
      }
    }

    const sy = serviceYearForExport();
    const totalsFiles: Array<{ name: string; kind: 'publishers' | 'regular' | 'auxiliary' }> = [
      { name: 'Total-Publicadores.pdf', kind: 'publishers' },
      { name: 'Total-Pioneiros-Regulares.pdf', kind: 'regular' },
      { name: 'Total-Pioneiros-Auxiliares.pdf', kind: 'auxiliary' },
    ];

    for (const { name, kind } of totalsFiles) {
      const filePath = path.join(outputDir, name);
      await writeTotalsS21Pdf({
        templatePath: s21Template,
        outputPath: filePath,
        data,
        kind,
        serviceYears: [sy, sy - 1],
      });
      files.push(filePath);
    }

    try {
      await fs.access(s88Template);
      const s88Path = path.join(outputDir, 'S-88-Assistencia-Reunioes.pdf');
      const visitPeriod = resolveVisitPeriod(data, {
        periodStartMonth: params.periodStartMonth,
        periodLengthMonths: params.periodLengthMonths,
      });
      await writeS88Pdf({
        templatePath: s88Template,
        outputPath: s88Path,
        data,
        period: visitPeriod,
      });
      files.push(s88Path);
    } catch {
      warnings.push('Modelo S-88 não encontrado — exporte S-88 manualmente ou selecione o PDF modelo.');
    }

    const summary = computeVisitSummary(
      data,
      resolveVisitPeriod(data, {
        periodStartMonth: params.periodStartMonth,
        periodLengthMonths: params.periodLengthMonths,
      }),
    );
    const summaryHtml = buildVisitSummaryHtml(congregationLabel, summary);
    const summaryPath = path.join(outputDir, 'Resumo-Visita.pdf');
    const summaryResult = await exportFullHtmlToPdf(summaryPath, summaryHtml);
    if (!summaryResult.ok) {
      warnings.push(summaryResult.error ?? 'Falha ao gerar Resumo-Visita.pdf');
    } else {
      files.push(summaryPath);
    }

    return { ok: true, outputDir, files, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido ao exportar';
    return { ok: false, error: message, outputDir, files, warnings };
  }
}



export function fixHourglassData(data: import('../shared/hourglass/types').HourglassExport) {

  return applyMonthlyTotalFixes(data);

}



export function defaultTemplatePaths(appRoot: string) {

  return {

    templateS21Path: bundledFormTemplatePath('S-21-T.pdf', appRoot),

    templateS88Path: bundledFormTemplatePath('S-88-T.pdf', appRoot),

  };

}


