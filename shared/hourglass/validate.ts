import { compareMonthKeys } from './month-utils';
import { isMonthInPeriod, isMonthInUsablePeriod, type VisitPeriodOptions } from './period';
import {
  indexReportsByMonth,
  isAuxiliaryPioneer,
  isPublisherReported,
  isRegularPioneer,
  publisherDisplayName,
} from './parse';
import type {
  HourglassExport,
  HourglassPublisher,
  HourglassReport,
  MonthComputedTotals,
  MonthIssue,
} from './types';

function publisherMap(publishers: HourglassPublisher[]): Map<number, HourglassPublisher> {
  return new Map(publishers.map((p) => [p.id, p]));
}

export function computeMonthTotals(data: HourglassExport, month: string): MonthComputedTotals {
  const byMonth = indexReportsByMonth(data.reports);
  const list = byMonth.get(month) ?? [];
  const pubs = publisherMap(data.publishers);

  let pubCount = 0;
  let pubMinutes = 0;
  let pubStudies = 0;
  let regCount = 0;
  let regMinutes = 0;
  let regStudies = 0;
  let auxCount = 0;
  let auxMinutes = 0;
  let auxStudies = 0;

  for (const report of list) {
    const pub = pubs.get(report.user.id);
    const minutes = report.minutes ?? 0;
    const studies = report.studies ?? 0;
    const reported = isPublisherReported(report);

    if (isRegularPioneer(pub?.status, report.pioneer)) {
      if (reported || minutes > 0) regCount += 1;
      regMinutes += minutes;
      regStudies += studies;
    } else if (isAuxiliaryPioneer(pub?.status, report.pioneer)) {
      if (reported || report.pioneer === 'Auxiliary') auxCount += 1;
      auxMinutes += minutes;
      auxStudies += studies;
    } else if (reported) {
      pubCount += 1;
      pubMinutes += minutes;
      pubStudies += studies;
    }
  }

  return {
    month,
    pubCount,
    pubMinutes,
    pubStudies,
    regCount,
    regMinutes,
    regStudies,
    auxCount,
    auxMinutes,
    auxStudies,
    reportCount: list.length,
  };
}

function hoursFromMinutes(minutes: number): number {
  return Math.round(minutes / 60);
}

export function validateHourglassExport(data: HourglassExport): MonthIssue[] {
  const issues: MonthIssue[] = [];
  const byMonth = indexReportsByMonth(data.reports);
  const months = [...new Set([...byMonth.keys(), ...data.monthlyTotals.map((m) => m.month)])].sort(
    compareMonthKeys,
  );
  const pubs = publisherMap(data.publishers);

  for (const month of months) {
    const computed = computeMonthTotals(data, month);
    const stored = data.monthlyTotals.find((m) => m.month === month);

    if (!stored) {
      issues.push({
        month,
        severity: 'warning',
        code: 'MISSING_MONTHLY_TOTALS',
        message: 'Sem totais agregados (monthlyTotals) para este mês.',
      });
    } else {
      const regHours = stored.reg?.hours ?? hoursFromMinutes(stored.reg?.minutes ?? 0);
      const auxHours = stored.aux?.hours ?? hoursFromMinutes(stored.aux?.minutes ?? 0);
      const computedRegHours = hoursFromMinutes(computed.regMinutes);
      const computedAuxHours = hoursFromMinutes(computed.auxMinutes);

      if (computed.regCount > 0 && (stored.reg?.count ?? 0) === 0 && regHours === 0) {
        issues.push({
          month,
          severity: 'error',
          code: 'REG_TOTALS_ZERO',
          message: `Totais de pioneiros regulares zerados, mas há ${computed.regCount} relatório(s) com ${computedRegHours}h nos registros individuais.`,
        });
      }

      if (computed.auxCount > 0 && (stored.aux?.count ?? 0) === 0 && auxHours === 0) {
        issues.push({
          month,
          severity: 'error',
          code: 'AUX_TOTALS_ZERO',
          message: `Totais de pioneiros auxiliares zerados, mas há ${computed.auxCount} relatório(s) com ${computedAuxHours}h nos registros individuais.`,
        });
      }

      if (
        computed.regCount > 0 &&
        Math.abs(computedRegHours - regHours) > 1 &&
        (stored.reg?.count ?? 0) > 0
      ) {
        issues.push({
          month,
          severity: 'warning',
          code: 'REG_HOURS_MISMATCH',
          message: `Horas de pioneiros regulares divergem: agregado ${regHours}h vs. calculado ${computedRegHours}h.`,
        });
      }
    }

    const list = byMonth.get(month) ?? [];
    for (const report of list) {
      const pub = pubs.get(report.user.id);
      const name = pub ? publisherDisplayName(pub) : `#${report.user.id}`;

      if (isRegularPioneer(pub?.status, report.pioneer) && (report.minutes ?? 0) === 0) {
        issues.push({
          month,
          severity: 'warning',
          code: 'REG_PIONEER_NO_HOURS',
          message: `${name}: pioneiro regular sem horas registradas.`,
        });
      }

      if (isAuxiliaryPioneer(pub?.status, report.pioneer) && (report.minutes ?? 0) === 0) {
        issues.push({
          month,
          severity: 'warning',
          code: 'AUX_PIONEER_NO_HOURS',
          message: `${name}: pioneiro auxiliar sem horas registradas.`,
        });
      }
    }
  }

  return issues;
}

export function listMonthsWithIssues(
  data: HourglassExport,
  period?: VisitPeriodOptions,
): Array<{
  month: string;
  issues: MonthIssue[];
  errorCount: number;
  warningCount: number;
}> {
  const all = validateHourglassExport(data).filter(
    (issue) =>
      !period ||
      (isMonthInPeriod(issue.month, period) &&
        isMonthInUsablePeriod(issue.month, data, period)),
  );
  const grouped = new Map<string, MonthIssue[]>();
  for (const issue of all) {
    const list = grouped.get(issue.month) ?? [];
    list.push(issue);
    grouped.set(issue.month, list);
  }

  return [...grouped.entries()]
    .map(([month, issues]) => ({
      month,
      issues,
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
    }))
    .sort((a, b) => compareMonthKeys(a.month, b.month));
}

export function reportsForPublisher(data: HourglassExport, publisherId: number): HourglassReport[] {
  return data.reports
    .filter((r) => r.user.id === publisherId)
    .sort((a, b) => compareMonthKeys(a.submitted_month!, b.submitted_month!));
}
