import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@/components/Icons';
import { computeVisitSummary } from '../../shared/hourglass/metrics';
import { monthLabelPt, addMonths } from '../../shared/hourglass/month-utils';
import {
  inferPeriodStartFromData,
  periodLengthFromRange,
  resolveVisitPeriod,
} from '../../shared/hourglass/period';
import { listMonthsWithIssues } from '../../shared/hourglass/validate';
import type { VisitSummaryMetrics } from '../../shared/hourglass/types';
import type { CircuitVisitRecord } from '../../electron/types';

type Tab = 'dados' | 'revisao' | 'resumo' | 'exportar';

type SummaryRowDef = {
  id: string;
  label: string;
  value: number | string;
  names?: string[];
};

function buildSummaryRows(summary: VisitSummaryMetrics): SummaryRowDef[] {
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
  ];
}

function SummaryMetricRow({
  row,
  expanded,
  onToggle,
}: {
  row: SummaryRowDef;
  expanded: boolean;
  onToggle: () => void;
}) {
  const canExpand = Boolean(row.names && row.names.length > 0);

  return (
    <>
      <tr className="border-b border-jw-border last:border-0">
        <td className="px-4 py-2.5 text-jw-text">
          {canExpand ? (
            <button
              type="button"
              onClick={onToggle}
              className="flex w-full items-center gap-2 text-left hover:text-jw-purple"
              aria-expanded={expanded}
            >
              <IconChevronRight
                className={`h-4 w-4 shrink-0 text-jw-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
                aria-hidden
              />
              <span>{row.label}</span>
            </button>
          ) : (
            <span className="block pl-6">{row.label}</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right font-semibold text-jw-text">{row.value}</td>
      </tr>
      {canExpand && expanded ? (
        <tr className="border-b border-jw-border bg-jw-surface/60 last:border-0">
          <td colSpan={2} className="px-4 pb-3 pt-0">
            <ul className="ml-6 max-h-48 space-y-1 overflow-y-auto border-l border-jw-border pl-3 text-sm text-jw-muted">
              {row.names!.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}

type ElderCircuitVisitEditorPageProps = {
  visitId: string;
  onBack: () => void;
};

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-jw-surface text-jw-text shadow-sm' : 'text-jw-muted hover:text-jw-text'
      }`}
    >
      {children}
    </button>
  );
}

function defaultPeriodStart(record: CircuitVisitRecord | null): string {
  if (record?.periodStartMonth) return record.periodStartMonth;
  const now = new Date();
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return end;
}

export function ElderCircuitVisitEditorPage({ visitId, onBack }: ElderCircuitVisitEditorPageProps) {
  const [record, setRecord] = useState<CircuitVisitRecord | null>(null);
  const [tab, setTab] = useState<Tab>('dados');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selectedFixMonths, setSelectedFixMonths] = useState<Set<string>>(new Set());
  const [expandedSummaryRows, setExpandedSummaryRows] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    if (!window.jcs?.getCircuitVisit) {
      setLoading(false);
      return;
    }
    const result = await window.jcs.getCircuitVisit(visitId);
    if (result.ok && result.item) {
      setRecord(result.item);
      const length = result.item.periodLengthMonths || 6;
      const start =
        result.item.periodStartMonth ||
        (result.item.hourglassData
          ? inferPeriodStartFromData(result.item.hourglassData, length)
          : defaultPeriodStart(result.item));
      setPeriodStart(start);
      setPeriodEnd(addMonths(start, length - 1));
    } else {
      setMessage(result.error ?? 'Visita não encontrada.');
    }
    setLoading(false);
  }, [visitId]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLength = useMemo(
    () => (periodStart && periodEnd ? periodLengthFromRange(periodStart, periodEnd) : 0),
    [periodStart, periodEnd],
  );

  const period = useMemo(
    () =>
      resolveVisitPeriod(record?.hourglassData ?? null, {
        periodStartMonth: periodStart,
        periodLengthMonths: periodLength || 6,
      }),
    [record?.hourglassData, periodStart, periodLength],
  );

  const monthIssues = useMemo(
    () => (record?.hourglassData ? listMonthsWithIssues(record.hourglassData, period) : []),
    [record?.hourglassData, period],
  );

  const summary = useMemo(
    () => (record?.hourglassData ? computeVisitSummary(record.hourglassData, period) : null),
    [record?.hourglassData, period],
  );

  const summaryRows = useMemo(() => (summary ? buildSummaryRows(summary) : []), [summary]);

  const toggleSummaryRow = (id: string) => {
    setExpandedSummaryRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const errorMonths = monthIssues.filter((m) => m.errorCount > 0).map((m) => m.month);
    setSelectedFixMonths(new Set(errorMonths));
  }, [monthIssues]);

  const saveRecord = async (next: CircuitVisitRecord) => {
    if (!window.jcs?.saveCircuitVisit) return;
    const result = await window.jcs.saveCircuitVisit(next);
    if (result.ok && result.item) setRecord(result.item);
    else setMessage(result.error ?? 'Não foi possível salvar.');
  };

  const handleSavePeriod = async () => {
    if (!record || !periodStart || !periodEnd || periodLength < 1) return;
    const next = {
      ...record,
      periodStartMonth: periodStart,
      periodLengthMonths: periodLength,
    };
    await saveRecord(next);
    setMessage(
      `Período atualizado: ${monthLabelPt(periodStart)}/${periodStart.slice(0, 4)} → ${monthLabelPt(periodEnd)}/${periodEnd.slice(0, 4)} (${periodLength} meses).`,
    );
  };

  const handleImport = async () => {
    if (!window.jcs?.importHourglassJson) return;
    setBusy('import');
    setMessage(null);
    try {
      const result = await window.jcs.importHourglassJson(visitId, {
        periodStartMonth: periodStart,
        periodLengthMonths: periodLength,
      });
      if (!result.ok || !result.item) {
        setMessage(result.error ?? 'Falha na importação.');
        return;
      }
      setRecord(result.item);
      const length = result.item.periodLengthMonths || periodLength;
      setPeriodStart(result.item.periodStartMonth);
      setPeriodEnd(addMonths(result.item.periodStartMonth, length - 1));
      setMessage(
        `Importado: ${result.item.importFileName}. ${result.issueCount ?? 0} alerta(s) no período — revise antes de corrigir.`,
      );
      setTab('revisao');
    } finally {
      setBusy(null);
    }
  };

  const handleFixSelected = async () => {
    if (!window.jcs?.fixCircuitVisitMonths) return;
    if (selectedFixMonths.size === 0) {
      setMessage('Selecione ao menos um mês para corrigir.');
      return;
    }
    setBusy('fix');
    setMessage(null);
    try {
      const result = await window.jcs.fixCircuitVisitMonths(visitId, {
        months: [...selectedFixMonths],
      });
      if (!result.ok || !result.item) {
        setMessage(result.error ?? 'Não foi possível corrigir.');
        return;
      }
      setRecord(result.item);
      setMessage(`Corrigido(s): ${result.fixedMonths?.join(', ') ?? 'nenhum'}.`);
    } finally {
      setBusy(null);
    }
  };

  const toggleFixMonth = (month: string) => {
    setSelectedFixMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  const handlePickTemplate = async (kind: 's21' | 's88') => {
    if (!window.jcs?.pickCircuitVisitTemplate || !record) return;
    const result = await window.jcs.pickCircuitVisitTemplate(kind);
    if (!result.ok || !result.filePath) {
      if (result.error && result.error !== 'Seleção cancelada.') setMessage(result.error);
      return;
    }
    const next = {
      ...record,
      templateS21Path: kind === 's21' ? result.filePath : record.templateS21Path,
      templateS88Path: kind === 's88' ? result.filePath : record.templateS88Path,
    };
    await saveRecord(next);
  };

  const handleExport = async () => {
    if (!window.jcs?.exportCircuitVisit) return;
    setBusy('export');
    setMessage(null);
    try {
      await handleSavePeriod();
      const result = await window.jcs.exportCircuitVisit(visitId);
      if (!result.ok) {
        setMessage(result.error ?? 'Exportação falhou.');
        return;
      }
      const warn = result.warnings?.length ? ` Avisos: ${result.warnings.join(' ')}` : '';
      setMessage(`Exportado em ${result.outputDir}. ${result.files?.length ?? 0} arquivo(s).${warn}`);
    } finally {
      setBusy(null);
    }
  };

  const periodLabel =
    periodStart && periodEnd && periodLength > 0
      ? `${monthLabelPt(periodStart)}/${periodStart.slice(0, 4)} – ${monthLabelPt(periodEnd)}/${periodEnd.slice(0, 4)}`
      : '';

  if (loading) {
    return <p className="px-6 py-8 text-sm text-jw-muted">Carregando visita…</p>;
  }

  if (!record) {
    return (
      <div className="px-6 py-4">
        <button type="button" onClick={onBack} className="text-sm text-jw-purple">
          ← Voltar
        </button>
        <p className="mt-4 text-sm text-jw-muted">{message ?? 'Visita não encontrada.'}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          <IconChevronLeft className="h-4 w-4" />
          Visitas
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-jw-text">{record.title}</h1>
            <p className="mt-1 text-sm text-jw-muted">
              {record.congregation || 'Congregação não definida'}
              {record.importFileName ? ` · ${record.importFileName}` : ''}
            </p>
            {periodLabel ? (
              <p className="mt-0.5 text-xs text-jw-muted">Período: {periodLabel} ({periodLength} meses)</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-lg bg-jw-bg p-1">
          <TabButton active={tab === 'dados'} onClick={() => setTab('dados')}>
            Dados
          </TabButton>
          <TabButton active={tab === 'revisao'} onClick={() => setTab('revisao')}>
            Revisão
          </TabButton>
          <TabButton active={tab === 'resumo'} onClick={() => setTab('resumo')}>
            Resumo
          </TabButton>
          <TabButton active={tab === 'exportar'} onClick={() => setTab('exportar')}>
            Exportar
          </TabButton>
        </div>

        {message ? (
          <p className="mt-4 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
            {message}
          </p>
        ) : null}

        {tab === 'dados' ? (
          <section className="mt-6 space-y-4">
            <div className="rounded-xl border border-jw-border bg-jw-surface p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-jw-text">Período de análise</h2>
                <p className="mt-1 text-sm text-jw-muted">
                  O JSON completo é importado; aqui você define qual janela de meses usar no resumo, revisão e exportação do resumo.
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="block text-sm">
                  <span className="text-jw-muted">Mês inicial</span>
                  <input
                    type="month"
                    value={periodStart}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPeriodStart(value);
                      setPeriodEnd((prev) => (prev && prev < value ? value : prev));
                    }}
                    className="mt-1 block rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-jw-text"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-jw-muted">Mês final</span>
                  <input
                    type="month"
                    value={periodEnd}
                    min={periodStart || undefined}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPeriodEnd(value);
                      setPeriodStart((prev) => (prev && value < prev ? value : prev));
                    }}
                    className="mt-1 block rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-jw-text"
                  />
                </label>
                <div className="block text-sm">
                  <span className="text-jw-muted">Quantidade de meses</span>
                  <p
                    className="mt-1 min-w-[7rem] rounded-lg border border-jw-border bg-jw-bg/60 px-3 py-2 font-semibold tabular-nums text-jw-text"
                    aria-live="polite"
                  >
                    {periodLength > 0 ? periodLength : '—'}
                  </p>
                </div>
              </div>
              {periodLabel ? (
                <p className="text-xs text-jw-muted">Intervalo: {periodLabel}</p>
              ) : null}
              <button
                type="button"
                disabled={!periodStart || !periodEnd || periodLength < 1}
                onClick={() => void handleSavePeriod()}
                className="rounded-lg border border-jw-border px-3 py-1.5 text-sm hover:border-jw-purple disabled:opacity-50"
              >
                Aplicar período
              </button>
            </div>

            <div className="rounded-xl border border-jw-border bg-jw-surface p-4">
              <h2 className="text-sm font-semibold text-jw-text">Importação Hourglass</h2>
              <p className="mt-1 text-sm text-jw-muted">
                Define o período acima, depois importe o hourglass-export.json.
              </p>
              <button
                type="button"
                disabled={busy === 'import' || !periodStart || !periodEnd || periodLength < 1}
                onClick={() => void handleImport()}
                className="mt-3 rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
              >
                {busy === 'import' ? 'Importando…' : 'Importar JSON'}
              </button>
            </div>

            {record.hourglassData ? (
              <div className="rounded-xl border border-jw-border bg-jw-surface p-4 text-sm text-jw-muted">
                <p>
                  <strong className="text-jw-text">{record.hourglassData.publishers.length}</strong> publicadores ·{' '}
                  <strong className="text-jw-text">{record.hourglassData.reports.length}</strong> relatórios no arquivo ·{' '}
                  <strong className="text-jw-text">{record.hourglassData.fsGroups.length}</strong> grupos
                </p>
                {record.fixedMonths.length ? (
                  <p className="mt-2">Meses corrigidos: {record.fixedMonths.join(', ')}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === 'revisao' ? (
          <section className="mt-6 space-y-4">
            {!record.hourglassData ? (
              <p className="text-sm text-jw-muted">Importe o JSON na aba Dados.</p>
            ) : (
              <>
                <div className="rounded-xl border border-jw-border bg-jw-surface p-4 text-sm text-jw-muted">
                  <p>
                    Revise os alertas abaixo. Marque os meses que deseja corrigir e clique em{' '}
                    <strong className="text-jw-text">Aplicar correções selecionadas</strong> — nada é alterado automaticamente na importação.
                  </p>
                  <p className="mt-2">
                    ⛔ Erro = totais agregados inconsistentes · ⚠️ Aviso = possível dado incompleto no relatório individual
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === 'fix'}
                    onClick={() => void handleFixSelected()}
                    className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
                  >
                    {busy === 'fix' ? 'Corrigindo…' : `Aplicar correções (${selectedFixMonths.size})`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedFixMonths(new Set(monthIssues.filter((m) => m.errorCount > 0).map((m) => m.month)))
                    }
                    className="rounded-lg border border-jw-border px-3 py-2 text-sm hover:border-jw-purple"
                  >
                    Selecionar erros
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFixMonths(new Set())}
                    className="rounded-lg border border-jw-border px-3 py-2 text-sm hover:border-jw-purple"
                  >
                    Limpar seleção
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-jw-border bg-jw-surface">
                  {monthIssues.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-jw-muted">Nenhuma inconsistência no período selecionado.</p>
                  ) : (
                    <ul className="divide-y divide-jw-border">
                      {monthIssues.map((entry) => (
                        <li key={entry.month} className="px-4 py-3">
                          <div className="flex flex-wrap items-start gap-3">
                            <label className="mt-1 flex shrink-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedFixMonths.has(entry.month)}
                                onChange={() => toggleFixMonth(entry.month)}
                                className="rounded border-jw-border"
                              />
                              <span className="sr-only">Corrigir {entry.month}</span>
                            </label>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-jw-text">
                                  {monthLabelPt(entry.month)}/{entry.month.slice(0, 4)}
                                </span>
                                {entry.errorCount ? (
                                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                    {entry.errorCount} erro(s)
                                  </span>
                                ) : null}
                                {entry.warningCount ? (
                                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                    {entry.warningCount} aviso(s)
                                  </span>
                                ) : null}
                                {record.fixedMonths.includes(entry.month) ? (
                                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                    corrigido
                                  </span>
                                ) : null}
                              </div>
                              <ul className="mt-2 space-y-1 text-sm text-jw-muted">
                                {entry.issues.map((issue, idx) => (
                                  <li key={`${issue.code}-${idx}`}>
                                    {issue.severity === 'error' ? '⛔' : '⚠️'} {issue.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        ) : null}

        {tab === 'resumo' && summary ? (
          <section className="mt-6 space-y-3">
            <h2 className="text-base font-semibold text-jw-text">Últimos 6 meses</h2>
            <div className="overflow-hidden rounded-xl border border-jw-border bg-jw-surface">
              <table className="w-full text-sm">
                <tbody>
                  {summaryRows.map((row) => (
                    <SummaryMetricRow
                      key={row.id}
                      row={row}
                      expanded={expandedSummaryRows.has(row.id)}
                      onToggle={() => toggleSummaryRow(row.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === 'exportar' ? (
          <section className="mt-6 space-y-4">
            <div className="rounded-xl border border-jw-border bg-jw-surface p-4 space-y-3">
              <h2 className="text-sm font-semibold text-jw-text">Modelos JW (PDF)</h2>
              <p className="text-sm text-jw-muted">
                Modelos padrão em <code className="text-xs">assets/forms/</code>. Você pode substituir por outro PDF.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handlePickTemplate('s21')}
                  className="rounded-lg border border-jw-border px-3 py-2 text-sm hover:border-jw-purple"
                >
                  Modelo S-21…
                </button>
                <button
                  type="button"
                  onClick={() => void handlePickTemplate('s88')}
                  className="rounded-lg border border-jw-border px-3 py-2 text-sm hover:border-jw-purple"
                >
                  Modelo S-88…
                </button>
              </div>
              {record.templateS21Path ? (
                <p className="text-xs text-jw-muted truncate">S-21: {record.templateS21Path}</p>
              ) : null}
              {record.templateS88Path ? (
                <p className="text-xs text-jw-muted truncate">S-88: {record.templateS88Path}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-jw-border bg-jw-surface p-4">
              <h2 className="text-sm font-semibold text-jw-text">Exportar pacote</h2>
              <p className="mt-1 text-sm text-jw-muted">
                S-21 por grupo, totais, S-88 e resumo ({periodLength} meses).
              </p>
              <button
                type="button"
                disabled={!record.hourglassData || busy === 'export'}
                onClick={() => void handleExport()}
                className="mt-3 rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
              >
                {busy === 'export' ? 'Exportando…' : 'Exportar para pasta…'}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
