import type { VisitSummaryMetrics } from './types';

export type SummaryRowDef = {
  id: string;
  label: string;
  value: number | string;
  names?: string[];
};

export function buildVisitSummaryRows(summary: VisitSummaryMetrics): SummaryRowDef[] {
  const L = summary.publisherLists;
  return [
    { id: 'total', label: 'Publicadores totais', value: summary.totalPublishers, names: L.totalPublishers },
    {
      id: 'avgPub',
      label: `Média de publicadores/mês (${summary.averageMonthsCounted} meses)`,
      value: summary.averagePublishersPerMonth,
    },
    {
      id: 'irregular',
      label: 'Irregulares',
      value: summary.irregularPublishers,
      names: L.irregularPublishers,
    },
    { id: 'inactive', label: 'Inativos totais', value: summary.totalInactive, names: L.totalInactive },
    { id: 'reactivated', label: 'Reativados', value: summary.reactivated, names: L.reactivated },
    {
      id: 'newUnbaptized',
      label: 'Novos não batizados',
      value: summary.newUnbaptized,
      names: L.newUnbaptized,
    },
    { id: 'newBaptized', label: 'Novos batizados (6 meses)', value: summary.newBaptized, names: L.newBaptized },
    {
      id: 'regularPio',
      label: 'Pioneiros regulares (6 meses)',
      value: summary.regularPioneers,
      names: L.regularPioneers,
    },
    {
      id: 'auxPio',
      label: 'Pioneiros auxiliares (6 meses)',
      value: summary.auxiliaryPioneers,
      names: L.auxiliaryPioneers,
    },
    {
      id: 'avgStudies',
      label: `Média de estudos/mês (${summary.averageMonthsCounted} meses)`,
      value: summary.averageStudiesPerMonth,
    },
    {
      id: 'avgStudiesPerPub',
      label: `Média de estudos bíblicos por publicador (${summary.averageMonthsCounted} meses)`,
      value: summary.averageStudiesPerPublisher,
    },
    {
      id: 'avgMwAttendance',
      label: `Média de assistência — meio de semana (${summary.averageMonthsCounted} meses)`,
      value: summary.averageMidweekAttendance,
    },
    {
      id: 'avgWeAttendance',
      label: `Média de assistência — fim de semana (${summary.averageMonthsCounted} meses)`,
      value: summary.averageWeekendAttendance,
    },
  ];
}
