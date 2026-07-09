export type HourglassPublisher = {
  id: number;
  uuid?: string;
  firstname?: string;
  lastname?: string;
  middlename?: string;
  descriptor?: string;
  sex?: string;
  birth?: string | null;
  baptism?: string | null;
  pioneerid?: string | null;
  appt?: string | null;
  status?: string;
  group_id?: number | null;
  firstmonth?: string | null;
  anointed?: boolean;
  comments?: string | null;
};

export type HourglassReport = {
  id?: number;
  user: { id: number };
  month: number;
  year: number;
  submitted_month?: string;
  placements?: number | null;
  videoshowings?: number | null;
  minutes_as_hours?: string | null;
  minutes?: number | null;
  pioneer?: string | null;
  returnvisits?: number | null;
  studies?: number | null;
  credithours?: number | null;
  remarks?: string | null;
  reported_at?: string | null;
  reported_by?: number | null;
};

export type HourglassMonthlyBucket = {
  active?: number;
  count?: number;
  hours?: number;
  minutes?: number;
  studies?: number;
  lateReports?: number;
  placements?: number;
  returnvisits?: number;
  videoshowings?: number;
  rolloverMinutes?: number;
  createdAt?: string | null;
};

export type HourglassMonthlyTotal = {
  month: string;
  pub?: HourglassMonthlyBucket;
  reg?: HourglassMonthlyBucket;
  aux?: HourglassMonthlyBucket;
};

export type HourglassFsGroup = {
  id: number;
  name: string;
  overseer_id?: number | null;
  assistant_id?: number | null;
};

export type HourglassAttendanceRow = {
  id?: number;
  month: string;
  attendanceGroupId?: number;
  mw1?: number;
  mw2?: number;
  mw3?: number;
  mw4?: number;
  mw5?: number;
  mwAvg?: number;
  mwCount?: number;
  mwTotal?: number;
  we1?: number;
  we2?: number;
  we3?: number;
  we4?: number;
  we5?: number;
  weAvg?: number;
  weCount?: number;
  weTotal?: number;
};

export type HourglassExportRaw = {
  congregation?: { name?: string; number?: number };
  publishers?: HourglassPublisher[];
  reports?: Record<string, HourglassReport> | HourglassReport[];
  monthlyTotals?: Record<string, HourglassMonthlyTotal> | HourglassMonthlyTotal[];
  fsGroups?: HourglassFsGroup[];
  attendance?: { attendance?: HourglassAttendanceRow[] };
};

export type HourglassExport = {
  congregationName: string;
  congregationNumber: number | null;
  publishers: HourglassPublisher[];
  reports: HourglassReport[];
  monthlyTotals: HourglassMonthlyTotal[];
  fsGroups: HourglassFsGroup[];
  attendance: HourglassAttendanceRow[];
};

export type MonthIssueSeverity = 'error' | 'warning';

export type MonthIssue = {
  month: string;
  severity: MonthIssueSeverity;
  code: string;
  message: string;
};

export type MonthComputedTotals = {
  month: string;
  pubCount: number;
  pubMinutes: number;
  pubStudies: number;
  regCount: number;
  regMinutes: number;
  regStudies: number;
  auxCount: number;
  auxMinutes: number;
  auxStudies: number;
  reportCount: number;
};

export type VisitSummaryPublisherLists = {
  totalPublishers: string[];
  irregularPublishers: string[];
  totalInactive: string[];
  reactivated: string[];
  newUnbaptized: string[];
  newBaptized: string[];
  regularPioneers: string[];
  auxiliaryPioneers: string[];
};

export type VisitSummaryMetrics = {
  /** Meses efetivamente usados nas métricas (sem futuros vazios). */
  periodMonths: string[];
  totalPublishers: number;
  averagePublishersPerMonth: number;
  irregularPublishers: number;
  totalInactive: number;
  reactivated: number;
  newUnbaptized: number;
  newBaptized: number;
  regularPioneers: number;
  auxiliaryPioneers: number;
  averageStudiesPerMonth: number;
  /** Média de estudos bíblicos por publicador (últimos 6 meses). */
  averageStudiesPerPublisher: number;
  /** Média de assistência — reunião do meio de semana (últimos 6 meses). */
  averageMidweekAttendance: number;
  /** Média de assistência — reunião do fim de semana (últimos 6 meses). */
  averageWeekendAttendance: number;
  /** Meses usados nas médias (até 6, só meses já com relatórios). */
  averageMonthsCounted: number;
  serviceYearLabel: string;
  periodStartMonth: string;
  periodLengthMonths: number;
  /** Nomes por categoria — resumo dos últimos 6 meses utilizáveis. */
  publisherLists: VisitSummaryPublisherLists;
};
