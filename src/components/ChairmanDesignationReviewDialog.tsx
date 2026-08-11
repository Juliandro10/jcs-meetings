import { useId, useMemo, useRef, useState } from 'react';
import type { ChairmanAssignment, ParsedChairmanDesignation } from '../../shared/chairman-prep-types';
import { formatAssigneesText, parseAssigneesText } from '@/components/EditableTextField';

type ChairmanDesignationReviewDialogProps = {
  fileName: string;
  document: ParsedChairmanDesignation;
  parseMethodLabel?: string;
  usedVision?: boolean;
  weekMismatch?: {
    expectedBibleReading: string;
    importedBibleReading?: string;
    expectedWeekLabel: string;
    importedMeetingDate?: string;
  };
  weeksFound?: number;
  titlesAlignedFromMwb?: boolean;
  mwbAlignSkippedReason?: string;
  onConfirm: (document: ParsedChairmanDesignation) => void;
  onCancel: () => void;
};

type ReviewRow = ParsedChairmanDesignation['assignments'][number] & { rowId: string };

function sectionLabel(section: ChairmanAssignment['section']) {
  switch (section) {
    case 'tesouros':
      return 'Tesouros';
    case 'ministerio':
      return 'Ministério';
    case 'vida':
      return 'Vida cristã';
    case 'abertura':
      return 'Abertura';
    case 'encerramento':
      return 'Encerramento';
    case 'musica':
      return 'Cântico';
    default:
      return section;
  }
}

function inputClassName() {
  return 'rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-text';
}

export function ChairmanDesignationReviewDialog({
  fileName,
  document: initial,
  parseMethodLabel,
  usedVision,
  weekMismatch,
  weeksFound,
  titlesAlignedFromMwb,
  mwbAlignSkippedReason,
  onConfirm,
  onCancel,
}: ChairmanDesignationReviewDialogProps) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [rows] = useState<ReviewRow[]>(() =>
    initial.assignments.map((item) => ({ ...item, rowId: crypto.randomUUID() })),
  );
  const [meta] = useState(() => ({
    chairmanName: initial.chairmanName ?? '',
    meetingDate: initial.meetingDate ?? '',
    bibleReading: initial.bibleReading ?? '',
  }));

  const assigneesDefaults = useMemo(
    () => rows.map((item) => formatAssigneesText(item.assignees)),
    [rows],
  );

  const confirm = () => {
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    const chairmanName = String(data.get('chairmanName') ?? '').trim();
    const meetingDate = String(data.get('meetingDate') ?? '').trim();
    const bibleReading = String(data.get('bibleReading') ?? '').trim();

    const assignments = rows.map((item, index) => {
      const partTitle = String(data.get(`partTitle-${item.rowId}`) ?? '').trim();
      const assigneesRaw = String(data.get(`assignees-${item.rowId}`) ?? assigneesDefaults[index] ?? '');
      return {
        section: item.section,
        partTitle,
        durationMin: item.durationMin,
        assignees: parseAssigneesText(assigneesRaw),
        partTitleManual: item.partTitleManual,
      };
    });

    if (!assignments.some((item) => item.partTitle)) return;

    onConfirm({
      ...initial,
      chairmanName: chairmanName || undefined,
      meetingDate: meetingDate || undefined,
      bibleReading: bibleReading || undefined,
      assignments,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-labelledby="designation-review-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-xl"
      >
        <div className="border-b border-jw-border px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="designation-review-title" className="text-base font-semibold text-jw-text">
                Revisar designações
              </h2>
              <p className="mt-1 text-sm text-jw-muted">{fileName}</p>
            </div>
            {parseMethodLabel ? (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  usedVision
                    ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
                    : 'bg-jw-bg text-jw-muted'
                }`}
              >
                {parseMethodLabel}
              </span>
            ) : null}
          </div>

          {weekMismatch ? (
            <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
              A leitura bíblica da folha (
              <strong>{weekMismatch.importedBibleReading ?? '?'}</strong>) não coincide com a semana
              selecionada (<strong>{weekMismatch.expectedBibleReading}</strong>). Confirme só se for
              a semana correta.
            </div>
          ) : weeksFound && weeksFound > 1 ? (
            <div className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-100">
              Folha com {weeksFound} semanas — extraído o bloco de{' '}
              <strong>{meta.meetingDate || meta.bibleReading || 'semana selecionada'}</strong>.
            </div>
          ) : null}

          {titlesAlignedFromMwb ? (
            <div className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-100">
              Títulos das partes corrigidos pela <strong>apostila da semana</strong>. Confira
              designados e durações; ajuste se necessário.
            </div>
          ) : mwbAlignSkippedReason ? (
            <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
              {mwbAlignSkippedReason}
            </div>
          ) : null}
        </div>

        <form
          id={formId}
          ref={formRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-jw-muted">
              Presidente
              <input
                type="text"
                name="chairmanName"
                defaultValue={meta.chairmanName}
                className={inputClassName()}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-jw-muted">
              Data da reunião
              <input
                type="text"
                name="meetingDate"
                defaultValue={meta.meetingDate}
                className={inputClassName()}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-jw-muted sm:col-span-2">
              Leitura bíblica
              <input
                type="text"
                name="bibleReading"
                defaultValue={meta.bibleReading}
                className={inputClassName()}
                autoComplete="off"
              />
            </label>
          </div>

          <ul className="space-y-3">
            {rows.map((item, index) => (
              <li key={item.rowId} className="rounded-lg border border-jw-border bg-jw-bg/50 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-jw-purple/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-jw-purple">
                    {sectionLabel(item.section)}
                  </span>
                  {item.durationMin ? (
                    <span className="text-xs text-jw-muted">{item.durationMin} min</span>
                  ) : null}
                </div>
                <label className="mb-2 flex flex-col gap-1 text-xs text-jw-muted">
                  Parte
                  <input
                    type="text"
                    name={`partTitle-${item.rowId}`}
                    defaultValue={item.partTitle}
                    className={inputClassName()}
                    autoComplete="off"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-jw-muted">
                  Designado(s)
                  <input
                    type="text"
                    name={`assignees-${item.rowId}`}
                    defaultValue={assigneesDefaults[index]}
                    placeholder="Nome ou par no ministério"
                    className={inputClassName()}
                    autoComplete="off"
                  />
                </label>
              </li>
            ))}
          </ul>
        </form>

        <div className="flex justify-end gap-2 border-t border-jw-border px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-muted hover:bg-jw-bg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            className="rounded-lg bg-jw-purple px-4 py-2 text-sm text-white hover:bg-jw-purple-dark"
          >
            Confirmar designações
          </button>
        </div>
      </div>
    </div>
  );
}
