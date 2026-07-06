const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function reportMonthKey(report: { year: number; month: number; submitted_month?: string }): string {
  return report.submitted_month ?? monthKey(report.year, report.month);
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y!, month: m! };
}

export function compareMonthKeys(a: string, b: string): number {
  const pa = parseMonthKey(a);
  const pb = parseMonthKey(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.month - pb.month;
}

export function monthLabelPt(key: string): string {
  const { month } = parseMonthKey(key);
  return MONTH_NAMES[month - 1] ?? key;
}

/** Ano de serviço: 1/set → 31/ago */
export function serviceYearStart(reference: Date = new Date()): Date {
  const year = reference.getMonth() >= 8 ? reference.getFullYear() : reference.getFullYear() - 1;
  return new Date(year, 8, 1);
}

export function serviceYearEnd(start: Date): Date {
  return new Date(start.getFullYear() + 1, 7, 31);
}

export function serviceYearLabel(reference: Date = new Date()): string {
  const start = serviceYearStart(reference);
  const endYear = start.getFullYear() + 1;
  return `${start.getFullYear()}/${String(endYear).slice(-2)}`;
}

export function lastNMonthKeys(n: number, reference: Date = new Date()): string[] {
  const keys: string[] = [];
  const cursor = new Date(reference.getFullYear(), reference.getMonth(), 1);
  for (let i = 0; i < n; i += 1) {
    keys.unshift(monthKey(cursor.getFullYear(), cursor.getMonth() + 1));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return keys;
}

export function addMonths(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const d = new Date(year, month - 1 + delta, 1);
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

/** Mês civil atual (YYYY-MM). */
export function currentMonthKey(reference: Date = new Date()): string {
  return monthKey(reference.getFullYear(), reference.getMonth() + 1);
}

export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
