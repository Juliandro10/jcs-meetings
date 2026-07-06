import { addMonths, compareMonthKeys, currentMonthKey, monthKey, parseMonthKey } from './month-utils';
import type { HourglassExport } from './types';
import { indexReportsByMonth, isPublisherReported } from './parse';

export type VisitPeriodOptions = {
  periodStartMonth: string;
  periodLengthMonths: number;
};

export const PERIOD_LENGTH_PRESETS = [3, 6, 12, 24] as const;

/** Meses consecutivos a partir do mês inicial (inclusive). */
export function periodMonthKeys(startMonth: string, length: number): string[] {
  const keys: string[] = [];
  let cursor = startMonth;
  for (let i = 0; i < length; i += 1) {
    keys.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return keys;
}

export function inferPeriodStartFromData(data: HourglassExport, length: number): string {
  const months = [
    ...new Set(
      data.reports.map((r) => r.submitted_month!).filter(Boolean),
    ),
  ].sort(compareMonthKeys);

  if (months.length === 0) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const end = months[months.length - 1]!;
  let start = end;
  for (let i = 0; i < length - 1; i += 1) {
    start = addMonths(start, -1);
  }
  return start;
}

export function resolveVisitPeriod(
  data: HourglassExport | null,
  settings?: Partial<VisitPeriodOptions>,
): VisitPeriodOptions {
  const length = settings?.periodLengthMonths ?? 6;
  const start =
    settings?.periodStartMonth ??
    (data ? inferPeriodStartFromData(data, length) : inferPeriodStartFromData({ congregationName: '', congregationNumber: null, publishers: [], reports: [], monthlyTotals: [], fsGroups: [], attendance: [] }, length));

  return { periodStartMonth: start, periodLengthMonths: length };
}

export function periodEndMonth(options: VisitPeriodOptions): string {
  return addMonths(options.periodStartMonth, options.periodLengthMonths - 1);
}

/** Inclusive month count from start through end (0 if end is before start). */
export function periodLengthFromRange(startMonth: string, endMonth: string): number {
  if (!startMonth || !endMonth || compareMonthKeys(endMonth, startMonth) < 0) return 0;
  let count = 0;
  for (let cursor = startMonth; compareMonthKeys(cursor, endMonth) <= 0; cursor = addMonths(cursor, 1)) {
    count += 1;
  }
  return count;
}

export function visitPeriodFromRange(startMonth: string, endMonth: string): VisitPeriodOptions {
  return {
    periodStartMonth: startMonth,
    periodLengthMonths: periodLengthFromRange(startMonth, endMonth),
  };
}

/**
 * Mês utilizável em métricas/validação:
 * - passado → sim;
 * - mês atual → nunca (em andamento);
 * - futuro → nunca.
 */
export function isMonthUsableForMetrics(month: string, _hasReportData: boolean, now = currentMonthKey()): boolean {
  return compareMonthKeys(month, now) < 0;
}

/** Meses do período configurado que podem entrar em cálculos (sem futuros vazios). */
export function monthsUsableForMetrics(
  periodMonths: string[],
  monthlyActiveCounts: number[],
  now = currentMonthKey(),
): string[] {
  return periodMonths.filter((month, i) =>
    isMonthUsableForMetrics(month, monthlyActiveCounts[i]! > 0, now),
  );
}

export function monthlyActiveCountsForPeriod(
  data: HourglassExport,
  periodMonths: string[],
): number[] {
  const byMonth = indexReportsByMonth(data.reports);
  return periodMonths.map((month) => {
    let count = 0;
    for (const report of byMonth.get(month) ?? []) {
      if (isPublisherReported(report)) count += 1;
    }
    return count;
  });
}

export function resolveUsablePeriodMonths(
  data: HourglassExport,
  period: VisitPeriodOptions,
  now = currentMonthKey(),
): string[] {
  const configured = periodMonthKeys(period.periodStartMonth, period.periodLengthMonths);
  const counts = monthlyActiveCountsForPeriod(data, configured);
  return monthsUsableForMetrics(configured, counts, now);
}

export function referenceDateFromPeriod(
  options: VisitPeriodOptions,
  effectiveEndMonth?: string,
): Date {
  const end = effectiveEndMonth ?? periodEndMonth(options);
  const { year, month } = parseMonthKey(end);
  return new Date(year, month - 1, 1);
}

export function referenceDateFromVisit(
  data: HourglassExport,
  period: VisitPeriodOptions,
  now = currentMonthKey(),
): Date {
  const usable = resolveUsablePeriodMonths(data, period, now);
  const end = usable[usable.length - 1] ?? periodEndMonth(period);
  return referenceDateFromPeriod(period, end);
}

export function isMonthInPeriod(month: string, options: VisitPeriodOptions): boolean {
  return (
    compareMonthKeys(month, options.periodStartMonth) >= 0 &&
    compareMonthKeys(month, periodEndMonth(options)) <= 0
  );
}

export function isMonthInUsablePeriod(
  month: string,
  data: HourglassExport,
  period: VisitPeriodOptions,
  now = currentMonthKey(),
): boolean {
  if (!isMonthInPeriod(month, period)) return false;
  const configured = periodMonthKeys(period.periodStartMonth, period.periodLengthMonths);
  const counts = monthlyActiveCountsForPeriod(data, configured);
  const idx = configured.indexOf(month);
  return idx >= 0 && isMonthUsableForMetrics(month, counts[idx]! > 0, now);
}

/** Verifica se algum mês do ano de serviço (set–ago) cai dentro do período da visita. */
export function serviceYearOverlapsPeriod(sy: number, period: VisitPeriodOptions): boolean {
  for (let m = 9; m <= 12; m += 1) {
    if (isMonthInPeriod(monthKey(sy, m), period)) return true;
  }
  for (let m = 1; m <= 8; m += 1) {
    if (isMonthInPeriod(monthKey(sy + 1, m), period)) return true;
  }
  return false;
}
