import { computeMonthTotals } from './validate';
import type { HourglassExport, HourglassMonthlyTotal } from './types';

function bucketFromComputed(
  count: number,
  minutes: number,
  studies: number,
  active = 0,
): NonNullable<HourglassMonthlyTotal['pub']> {
  return {
    active,
    count,
    hours: Math.round(minutes / 60),
    minutes,
    studies,
    lateReports: 0,
    placements: 0,
    returnvisits: 0,
    videoshowings: 0,
    rolloverMinutes: 0,
    createdAt: new Date().toISOString(),
  };
}

export function rebuildMonthlyTotal(data: HourglassExport, month: string): HourglassMonthlyTotal {
  const computed = computeMonthTotals(data, month);
  const existing = data.monthlyTotals.find((m) => m.month === month);

  return {
    month,
    pub: bucketFromComputed(
      computed.pubCount,
      computed.pubMinutes,
      computed.pubStudies,
      existing?.pub?.active ?? computed.pubCount,
    ),
    reg: bucketFromComputed(computed.regCount, computed.regMinutes, computed.regStudies),
    aux: bucketFromComputed(computed.auxCount, computed.auxMinutes, computed.auxStudies),
  };
}

export function applyMonthlyTotalFixes(
  data: HourglassExport,
  months?: string[],
): { data: HourglassExport; fixedMonths: string[] } {
  const targetMonths =
    months ??
    data.monthlyTotals.map((m) => m.month).filter((month) => {
      const computed = computeMonthTotals(data, month);
      const stored = data.monthlyTotals.find((m) => m.month === month);
      const regZero =
        computed.regCount > 0 &&
        (stored?.reg?.count ?? 0) === 0 &&
        (stored?.reg?.hours ?? 0) === 0;
      const auxZero =
        computed.auxCount > 0 &&
        (stored?.aux?.count ?? 0) === 0 &&
        (stored?.aux?.hours ?? 0) === 0;
      return regZero || auxZero;
    });

  const fixedMonths: string[] = [];
  const monthlyTotals = [...data.monthlyTotals];

  for (const month of targetMonths) {
    const rebuilt = rebuildMonthlyTotal(data, month);
    const idx = monthlyTotals.findIndex((m) => m.month === month);
    if (idx >= 0) monthlyTotals[idx] = rebuilt;
    else monthlyTotals.push(rebuilt);
    fixedMonths.push(month);
  }

  monthlyTotals.sort((a, b) => a.month.localeCompare(b.month));

  return {
    data: { ...data, monthlyTotals },
    fixedMonths,
  };
}
