import { addMonths, compareMonthKeys, serviceYearLabel } from './month-utils';
import {
  monthlyActiveCountsForPeriod,
  periodMonthKeys,
  referenceDateFromVisit,
  resolveUsablePeriodMonths,
  type VisitPeriodOptions,
} from './period';
import {
  indexReportsByMonth,
  isAuxiliaryPioneer,
  isPublisherReported,
  isRegularPioneer,
  publisherDisplayName,
} from './parse';
import type { HourglassAttendanceRow, HourglassExport, HourglassPublisher, VisitSummaryMetrics } from './types';

/** Resumo SC: métricas do relatório usam os últimos 6 meses utilizáveis (completos), independente do período configurado para S-21/S-88. */
const AVERAGE_SUMMARY_MONTHS = 6;

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthStart(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(y!, m! - 1, 1);
}

function reportedInMonth(reportsByPub: Map<number, Set<string>>, pubId: number, month: string): boolean {
  return reportsByPub.get(pubId)?.has(month) ?? false;
}

function buildReportIndex(data: HourglassExport): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const report of data.reports) {
    if (!isPublisherReported(report)) continue;
    const set = map.get(report.user.id) ?? new Set<string>();
    set.add(report.submitted_month!);
    map.set(report.user.id, set);
  }
  return map;
}

function consecutiveMissedMonths(
  reportsByPub: Map<number, Set<string>>,
  pubId: number,
  endMonth: string,
  streak: number,
): boolean {
  let cursor = endMonth;
  for (let i = 0; i < streak; i += 1) {
    if (reportedInMonth(reportsByPub, pubId, cursor)) return false;
    cursor = addMonths(cursor, -1);
  }
  return true;
}

function firstReportMonth(reportsByPub: Map<number, Set<string>>, pubId: number): string | null {
  const months = [...(reportsByPub.get(pubId) ?? [])].sort(compareMonthKeys);
  return months[0] ?? null;
}

function reportedBeforeMonth(
  reportsByPub: Map<number, Set<string>>,
  pubId: number,
  beforeMonth: string,
): boolean {
  for (const month of reportsByPub.get(pubId) ?? []) {
    if (compareMonthKeys(month, beforeMonth) < 0) return true;
  }
  return false;
}

function sortedPublisherNames(data: HourglassExport, ids: Iterable<number>): string[] {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  return data.publishers
    .filter((p) => idSet.has(p.id))
    .map((p) => publisherDisplayName(p))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function countMeetingSlots(values: Array<number | undefined>): { count: number; total: number } {
  let count = 0;
  let total = 0;
  for (const value of values) {
    if (value != null && value > 0) {
      count += 1;
      total += value;
    }
  }
  return { count, total };
}

function rowMeetingTotals(
  row: HourglassAttendanceRow,
  meeting: 'mw' | 'we',
): { count: number; total: number } {
  if (meeting === 'mw') {
    if ((row.mwCount ?? 0) > 0 && (row.mwTotal ?? 0) > 0) {
      return { count: row.mwCount!, total: row.mwTotal! };
    }
    return countMeetingSlots([row.mw1, row.mw2, row.mw3, row.mw4, row.mw5]);
  }
  if ((row.weCount ?? 0) > 0 && (row.weTotal ?? 0) > 0) {
    return { count: row.weCount!, total: row.weTotal! };
  }
  return countMeetingSlots([row.we1, row.we2, row.we3, row.we4, row.we5]);
}

function averageMeetingAttendance(
  attendance: HourglassAttendanceRow[],
  months: string[],
  meeting: 'mw' | 'we',
): number {
  const monthSet = new Set(months);
  let totalMeetings = 0;
  let totalAttendance = 0;

  for (const row of attendance) {
    if (!row.month || !monthSet.has(row.month)) continue;
    const { count, total } = rowMeetingTotals(row, meeting);
    if (count > 0) {
      totalMeetings += count;
      totalAttendance += total;
    }
  }

  return totalMeetings > 0 ? Math.round(totalAttendance / totalMeetings) : 0;
}

export function computeVisitSummary(
  data: HourglassExport,
  period: VisitPeriodOptions,
): VisitSummaryMetrics {
  const configuredMonths = periodMonthKeys(period.periodStartMonth, period.periodLengthMonths);
  const monthlyActiveCounts = monthlyActiveCountsForPeriod(data, configuredMonths);
  const usableMonths = resolveUsablePeriodMonths(data, period);
  const lastUsableMonth = usableMonths[usableMonths.length - 1] ?? configuredMonths[configuredMonths.length - 1]!;
  const referenceDate = referenceDateFromVisit(data, period);
  const reportsByPub = buildReportIndex(data);
  const byMonth = indexReportsByMonth(data.reports);
  const publisherIds = data.publishers.map((p) => p.id);

  const monthlyStudyCounts = configuredMonths.map((month) => {
    let studies = 0;
    for (const report of byMonth.get(month) ?? []) {
      studies += report.studies ?? 0;
    }
    return studies;
  });

  const lastSixUsableMonths = usableMonths.slice(
    -Math.min(AVERAGE_SUMMARY_MONTHS, usableMonths.length),
  );
  const summaryEndMonth =
    lastSixUsableMonths[lastSixUsableMonths.length - 1] ?? lastUsableMonth;

  const activeInLastSix = new Set<number>();
  for (const month of lastSixUsableMonths) {
    for (const report of byMonth.get(month) ?? []) {
      if (isPublisherReported(report)) activeInLastSix.add(report.user.id);
    }
  }

  const irregularIds = new Set<number>();
  const inactiveIds = new Set<number>();
  const reactivatedIds = new Set<number>();

  for (const pubId of publisherIds) {
    let missedAnyInLastSix = false;
    for (const month of lastSixUsableMonths) {
      if (!reportedInMonth(reportsByPub, pubId, month)) {
        missedAnyInLastSix = true;
        break;
      }
    }
    if (missedAnyInLastSix) irregularIds.add(pubId);

    if (summaryEndMonth && consecutiveMissedMonths(reportsByPub, pubId, summaryEndMonth, 6)) {
      inactiveIds.add(pubId);
    }

    for (const month of lastSixUsableMonths) {
      if (!reportedInMonth(reportsByPub, pubId, month)) continue;
      if (!consecutiveMissedMonths(reportsByPub, pubId, addMonths(month, -1), 6)) continue;
      const gapStart = addMonths(month, -6);
      if (reportedBeforeMonth(reportsByPub, pubId, gapStart)) {
        reactivatedIds.add(pubId);
        break;
      }
    }
  }

  const baptismWindowStart = lastSixUsableMonths[0]
    ? monthStart(lastSixUsableMonths[0])
    : monthStart(configuredMonths[0]!);
  const baptismWindowEnd = summaryEndMonth
    ? new Date(
        monthStart(summaryEndMonth).getFullYear(),
        monthStart(summaryEndMonth).getMonth() + 1,
        0,
      )
    : new Date(
        monthStart(lastUsableMonth).getFullYear(),
        monthStart(lastUsableMonth).getMonth() + 1,
        0,
      );

  const newUnbaptizedIds = new Set<number>();
  const newBaptizedIds = new Set<number>();
  const summaryStartMonth = lastSixUsableMonths[0];

  for (const pub of data.publishers) {
    const baptism = parseIsoDate(pub.baptism);
    if (baptism && baptism >= baptismWindowStart && baptism <= baptismWindowEnd) {
      newBaptizedIds.add(pub.id);
    }

    const firstMonth = pub.firstmonth ?? firstReportMonth(reportsByPub, pub.id);
    if (
      summaryStartMonth &&
      summaryEndMonth &&
      firstMonth &&
      compareMonthKeys(firstMonth, summaryStartMonth) >= 0 &&
      compareMonthKeys(firstMonth, summaryEndMonth) <= 0 &&
      pub.status === 'Unbaptized Publisher'
    ) {
      newUnbaptizedIds.add(pub.id);
    }
  }

  const regularPioneerIds = new Set<number>();
  const auxiliaryPioneerIds = new Set<number>();

  for (const month of lastSixUsableMonths) {
    for (const report of byMonth.get(month) ?? []) {
      if (!isPublisherReported(report)) continue;
      const pub = data.publishers.find((p) => p.id === report.user.id);
      if (isRegularPioneer(pub?.status, report.pioneer)) regularPioneerIds.add(report.user.id);
      if (isAuxiliaryPioneer(pub?.status, report.pioneer)) auxiliaryPioneerIds.add(report.user.id);
    }
  }

  for (const pub of data.publishers) {
    if (!activeInLastSix.has(pub.id)) continue;
    if (pub.status === 'Regular Pioneer') regularPioneerIds.add(pub.id);
    if (pub.status === 'Continuous Auxiliary Pioneer') auxiliaryPioneerIds.add(pub.id);
  }

  const averageWindowMonths = lastSixUsableMonths;
  const averageDivisor = averageWindowMonths.length;

  let activeSum = 0;
  let studiesSum = 0;
  let publisherReportMonths = 0;
  let studiesFromReports = 0;
  for (const month of averageWindowMonths) {
    const i = configuredMonths.indexOf(month);
    activeSum += monthlyActiveCounts[i]!;
    studiesSum += monthlyStudyCounts[i]!;
    for (const report of byMonth.get(month) ?? []) {
      if (!isPublisherReported(report)) continue;
      publisherReportMonths += 1;
      studiesFromReports += report.studies ?? 0;
    }
  }

  const averagePublishersPerMonth =
    averageDivisor > 0 ? Math.round((activeSum / averageDivisor) * 10) / 10 : 0;

  const averageStudiesPerMonth =
    averageDivisor > 0 ? Math.round((studiesSum / averageDivisor) * 10) / 10 : 0;

  const averageStudiesPerPublisher =
    publisherReportMonths > 0
      ? Math.round((studiesFromReports / publisherReportMonths) * 10) / 10
      : 0;

  const averageMidweekAttendance = averageMeetingAttendance(
    data.attendance,
    averageWindowMonths,
    'mw',
  );
  const averageWeekendAttendance = averageMeetingAttendance(
    data.attendance,
    averageWindowMonths,
    'we',
  );

  return {
    periodMonths: usableMonths,
    totalPublishers: activeInLastSix.size,
    averagePublishersPerMonth,
    irregularPublishers: irregularIds.size,
    totalInactive: inactiveIds.size,
    reactivated: reactivatedIds.size,
    newUnbaptized: newUnbaptizedIds.size,
    newBaptized: newBaptizedIds.size,
    regularPioneers: regularPioneerIds.size,
    auxiliaryPioneers: auxiliaryPioneerIds.size,
    averageStudiesPerMonth,
    averageStudiesPerPublisher,
    averageMidweekAttendance,
    averageWeekendAttendance,
    averageMonthsCounted: averageDivisor,
    serviceYearLabel: serviceYearLabel(referenceDate),
    periodStartMonth: period.periodStartMonth,
    periodLengthMonths: period.periodLengthMonths,
    publisherLists: {
      totalPublishers: sortedPublisherNames(data, activeInLastSix),
      irregularPublishers: sortedPublisherNames(data, irregularIds),
      totalInactive: sortedPublisherNames(data, inactiveIds),
      reactivated: sortedPublisherNames(data, reactivatedIds),
      newUnbaptized: sortedPublisherNames(data, newUnbaptizedIds),
      newBaptized: sortedPublisherNames(data, newBaptizedIds),
      regularPioneers: sortedPublisherNames(data, regularPioneerIds),
      auxiliaryPioneers: sortedPublisherNames(data, auxiliaryPioneerIds),
    },
  };
}

export function groupPublishers(data: HourglassExport): Array<{
  groupId: number;
  groupName: string;
  publishers: HourglassPublisher[];
}> {
  const groups = new Map<number, { groupName: string; publishers: HourglassPublisher[] }>();

  for (const pub of data.publishers) {
    const groupId = pub.group_id ?? 0;
    const groupName =
      data.fsGroups.find((g) => g.id === groupId)?.name ?? (groupId ? `Grupo ${groupId}` : 'Sem grupo');
    const entry = groups.get(groupId) ?? { groupName, publishers: [] };
    entry.publishers.push(pub);
    groups.set(groupId, entry);
  }

  return [...groups.entries()]
    .map(([groupId, value]) => ({
      groupId,
      groupName: value.groupName,
      publishers: value.publishers.sort((a, b) =>
        (a.descriptor ?? a.lastname ?? '').localeCompare(b.descriptor ?? b.lastname ?? '', 'pt-BR'),
      ),
    }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName, 'pt-BR'));
}
