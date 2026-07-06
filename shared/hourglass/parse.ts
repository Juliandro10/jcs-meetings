import type {
  HourglassExport,
  HourglassExportRaw,
  HourglassMonthlyTotal,
  HourglassReport,
} from './types';

function asArray<T>(value: Record<string, T> | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

export function parseHourglassExport(raw: HourglassExportRaw): HourglassExport {
  const reports = asArray(raw.reports).map(normalizeReport);
  const monthlyTotals = asArray(raw.monthlyTotals)
    .filter((item) => item?.month)
    .map((item) => ({ ...item, month: item.month! }));

  return {
    congregationName: raw.congregation?.name?.trim() || 'Congregação',
    congregationNumber: raw.congregation?.number ?? null,
    publishers: raw.publishers ?? [],
    reports,
    monthlyTotals,
    fsGroups: raw.fsGroups ?? [],
    attendance: raw.attendance?.attendance ?? [],
  };
}

function normalizeReport(report: HourglassReport): HourglassReport {
  return {
    ...report,
    submitted_month:
      report.submitted_month ??
      `${report.year}-${String(report.month).padStart(2, '0')}`,
    minutes: report.minutes ?? 0,
    studies: report.studies ?? 0,
  };
}

export function publisherDisplayName(
  pub: { descriptor?: string; firstname?: string; lastname?: string; middlename?: string },
): string {
  if (pub.descriptor?.trim()) return pub.descriptor.trim();
  return [pub.firstname, pub.middlename, pub.lastname].filter(Boolean).join(' ').trim() || 'Sem nome';
}

export function isRegularPioneer(status?: string | null, pioneer?: string | null): boolean {
  return pioneer === 'Regular' || status === 'Regular Pioneer';
}

export function isAuxiliaryPioneer(status?: string | null, pioneer?: string | null): boolean {
  return (
    pioneer === 'Auxiliary' ||
    status === 'Continuous Auxiliary Pioneer' ||
    status === 'Auxiliary Pioneer'
  );
}

export function isSpecialPioneer(status?: string | null): boolean {
  return status === 'Special Pioneer';
}

export function isFieldMissionary(status?: string | null): boolean {
  return status === 'Field Missionary' || status === 'Missionary';
}

export function isPublisherReported(report: HourglassReport): boolean {
  return (report.minutes ?? 0) > 0 || (report.studies ?? 0) > 0;
}

/** Horas no S-21: só pioneiros regulares/especiais e auxiliares. Publicador com minutes:1 = só participação. */
export function reportHoursForS21(
  report: HourglassReport,
  pub?: { status?: string | null } | null,
): number {
  if (
    !isRegularPioneer(pub?.status, report.pioneer) &&
    !isAuxiliaryPioneer(pub?.status, report.pioneer)
  ) {
    return 0;
  }
  const minutes = report.minutes ?? 0;
  if (minutes <= 0) return 0;
  return Math.round(minutes / 60);
}

export function indexReportsByMonth(reports: HourglassReport[]): Map<string, HourglassReport[]> {
  const map = new Map<string, HourglassReport[]>();
  for (const report of reports) {
    const key = report.submitted_month!;
    const list = map.get(key) ?? [];
    list.push(report);
    map.set(key, list);
  }
  return map;
}

export function getMonthlyTotal(
  totals: HourglassMonthlyTotal[],
  month: string,
): HourglassMonthlyTotal | undefined {
  return totals.find((item) => item.month === month);
}
