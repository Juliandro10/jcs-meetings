import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingWeek } from '@/lib/meeting-types';
import type {
  ChairmanAssignment,
  ChairmanGeneratedContent,
  ChairmanGeneratedPart,
  ChairmanOpeningPreview,
  ChairmanPrepRecord,
} from '../../shared/chairman-prep-types';
import type { ImportChairmanDesignationResult } from '../../electron/types';
import { ChairmanDesignationReviewDialog } from '@/components/ChairmanDesignationReviewDialog';
import { IconChevronLeft, IconOutlinePodium } from '@/components/Icons';
import { mergeDesignationIntoPrep } from '../../shared/chairman-prep-merge';
import {
  composeOpeningSummary,
  ensureOpeningPreview,
  resolveOpeningPartHints,
} from '../../shared/chairman-opening-preview';
import { isStudentAssignment } from '../../shared/chairman-student-part';

type ChairmanPrepPageProps = {
  week: MeetingWeek;
  onBack: () => void;
};

function sectionBannerClass(section: ChairmanAssignment['section']) {
  switch (section) {
    case 'tesouros':
      return 'bg-blue-600';
    case 'ministerio':
      return 'bg-amber-700';
    case 'vida':
      return 'bg-rose-900';
    default:
      return 'bg-jw-muted';
  }
}

function sectionTitle(section: ChairmanAssignment['section']) {
  switch (section) {
    case 'tesouros':
      return 'Tesouros da Palavra de Deus';
    case 'ministerio':
      return 'Faça seu melhor no ministério';
    case 'vida':
      return 'Nossa vida cristã';
    default:
      return null;
  }
}

function formatAssignees(assignees: string[]) {
  return assignees.join(' · ');
}

function parseAssignees(value: string) {
  return value
    .split(/[·,]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function emptyRecord(week: MeetingWeek): ChairmanPrepRecord {
  return {
    weekId: week.id,
    weekLabel: week.label,
    bibleReading: week.bibleReading,
    assignments: [],
    updatedAt: new Date().toISOString(),
  };
}

export function ChairmanPrepPage({ week, onBack }: ChairmanPrepPageProps) {
  const [record, setRecord] = useState<ChairmanPrepRecord>(() => emptyRecord(week));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState<'file' | 'image' | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportChairmanDesignationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingRead, setExportingRead] = useState(false);
  const [clearing, setClearing] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const scheduleSave = useCallback((next: ChairmanPrepRecord) => {
    if (!window.jcs?.saveChairmanPrep) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void window.jcs!.saveChairmanPrep(next);
    }, 600);
  }, []);

  const patchRecord = useCallback(
    (patch: Partial<ChairmanPrepRecord>) => {
      setRecord((prev) => {
        const next = { ...prev, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const patchContent = useCallback(
    (patch: Partial<ChairmanGeneratedContent>) => {
      setRecord((prev) => {
        if (!prev.content) return prev;
        const next = { ...prev, content: { ...prev.content, ...patch } };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const patchOpeningPreview = useCallback(
    (patch: Partial<ChairmanOpeningPreview>) => {
      setRecord((prev) => {
        if (!prev.content) return prev;
        const preview = ensureOpeningPreview(
          prev.content.openingSummary,
          prev.assignments,
          prev.content.openingPreview,
        );
        const nextPreview = { ...preview, ...patch };
        const nextContent = {
          ...prev.content,
          openingPreview: nextPreview,
          openingSummary: composeOpeningSummary(nextPreview),
        };
        const next = { ...prev, content: nextContent };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const patchPartContent = useCallback(
    (
      assignmentId: string,
      patch: {
        transition?: string;
        highlight?: string;
        lessonRef?: string;
        lessonSummary?: string;
        privateSuggestion?: string;
      },
    ) => {
      setRecord((prev) => {
        if (!prev.content) return prev;
        const parts = prev.content.parts.map((part) =>
          part.assignmentId === assignmentId ? { ...part, ...patch } : part,
        );
        const next = { ...prev, content: { ...prev.content, parts } };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const patchAssignment = useCallback(
    (
      assignmentId: string,
      patch: Partial<Pick<ChairmanAssignment, 'partTitle' | 'durationMin' | 'assignees'>>,
    ) => {
      setRecord((prev) => {
        const assignments = prev.assignments.map((assignment) =>
          assignment.id === assignmentId ? { ...assignment, ...patch } : assignment,
        );
        let next: ChairmanPrepRecord = { ...prev, assignments };

        if (prev.content && patch.partTitle !== undefined) {
          const hints = resolveOpeningPartHints(assignments);
          const preview = ensureOpeningPreview(
            prev.content.openingSummary,
            assignments,
            prev.content.openingPreview,
          );
          const previewPatch: Partial<ChairmanOpeningPreview> = {};
          if (hints.treasuresDiscourse?.id === assignmentId) {
            previewPatch.treasuresPartTitle = patch.partTitle;
          }
          if (hints.lifeChristian?.id === assignmentId) {
            previewPatch.lifeChristianPartTitle = patch.partTitle;
          }
          if (Object.keys(previewPatch).length > 0) {
            const nextPreview = { ...preview, ...previewPatch };
            next = {
              ...next,
              content: {
                ...prev.content,
                openingPreview: nextPreview,
                openingSummary: composeOpeningSummary(nextPreview),
              },
            };
          }
        }

        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.jcs?.getChairmanPrep) {
        setLoading(false);
        setMessage('Abra o app pelo Electron para usar a folha do presidente.');
        return;
      }
      setLoading(true);
      const result = await window.jcs.getChairmanPrep(week.id);
      if (cancelled) return;
      if (result.ok && result.record) {
        setRecord(result.record);
      } else {
        setRecord(emptyRecord(week));
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [week]);

  const handleImport = async (importKind: 'file' | 'image') => {
    if (!window.jcs?.importChairmanDesignation) return;
    setImporting(importKind);
    setMessage(null);
    try {
      const result = await window.jcs.importChairmanDesignation({
        weekId: week.id,
        weekLabel: week.label,
        bibleReading: week.bibleReading,
        dateIso: week.dateIso,
        dateRangeCaps: week.dateRangeCaps,
        importKind,
        mwbDownloaded: week.mwbDownloaded,
        mwbDocumentId: week.mwbDocumentId,
        mwbIssue: week.mwbIssue,
      });
      if (!result.ok || !result.document) {
        setMessage(result.error ?? 'Não foi possível importar a folha.');
        return;
      }
      if (!result.document.assignments.length) {
        setMessage('Nenhuma parte reconhecida na folha.');
        return;
      }
      setPendingImport(result);
    } finally {
      setImporting(null);
    }
  };

  const confirmImport = (document: ImportChairmanDesignationResult['document']) => {
    if (!document) return;
    const merged = mergeDesignationIntoPrep(emptyRecord(week), document, {
      fileName: pendingImport?.fileName,
    });
    setRecord(merged);
    scheduleSave(merged);
    setPendingImport(null);
    setMessage(`Designações importadas: ${merged.assignments.length} parte(s).`);
  };

  const handleClearPrep = async () => {
    if (!window.jcs?.deleteChairmanPrep) return;
    const hasData =
      record.assignments.length > 0 || Boolean(record.content) || Boolean(record.chairmanName);
    if (!hasData) {
      setRecord(emptyRecord(week));
      setMessage('Nada para apagar nesta semana.');
      return;
    }

    const ok = window.confirm(
      'Apagar a folha desta semana?\n\nRemove designações importadas, texto gerado pela IA e anúncios. Você precisará importar de novo.',
    );
    if (!ok) return;

    setClearing(true);
    setMessage(null);
    try {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const result = await window.jcs.deleteChairmanPrep(week.id);
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível apagar a folha.');
        return;
      }
      setRecord(emptyRecord(week));
      setPendingImport(null);
      setMessage('Folha apagada. Importe a folha de designações para começar de novo.');
    } finally {
      setClearing(false);
    }
  };

  const handleGenerate = async () => {
    if (!window.jcs?.generateChairmanPrep) return;
    if (!week.mwbDownloaded) {
      setMessage('Baixe a apostila desta semana antes de gerar.');
      return;
    }
    setGenerating(true);
    setMessage(null);
    try {
      const result = await window.jcs.generateChairmanPrep({ week });
      if (!result.ok || !result.content) {
        setMessage(result.error ?? 'Não foi possível gerar a folha.');
        return;
      }
      patchRecord({ content: result.content });
      setMessage('Folha gerada — revise e edite antes da reunião.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    if (!window.jcs?.exportChairmanPrep || !window.jcs?.saveChairmanPrep) return;
    setExporting(true);
    setMessage(null);
    try {
      await window.jcs.saveChairmanPrep(record);
      const result = await window.jcs.exportChairmanPrep({ weekId: week.id });
      if (!result.ok) setMessage(result.error ?? 'Exportação cancelada.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportRead = async () => {
    if (!window.jcs?.exportReadWeek || !window.jcs?.saveChairmanPrep) return;
    setExportingRead(true);
    setMessage(null);
    try {
      await window.jcs.saveChairmanPrep(record);
      const result = await window.jcs.exportReadWeek(week, { preferLastFolder: true });
      if (result.ok) {
        setMessage(
          `Reunião exportada (${result.documentCount ?? 0} documento(s)). Envie jcs-read.zip ao tablet (Drive ou USB).`,
        );
      } else {
        setMessage(result.error ?? 'Não foi possível exportar para o tablet.');
      }
    } finally {
      setExportingRead(false);
    }
  };

  let currentSection: ChairmanAssignment['section'] | null = null;

  if (loading) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center">
        <p className="text-sm text-jw-muted">Carregando folha do presidente…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 pb-16">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          <IconChevronLeft className="h-4 w-4" />
          Reuniões
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <IconOutlinePodium className="h-5 w-5 shrink-0 text-jw-purple" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-jw-text">Presidir — {week.label}</h1>
            <p className="text-sm text-jw-muted">{week.bibleReading}</p>
          </div>
        </div>
      </div>

      {message ? (
        <div className="mb-4 rounded-lg border border-jw-border bg-jw-surface px-4 py-3 text-sm text-jw-muted">
          {message}
        </div>
      ) : null}

      <section className="mb-8 rounded-xl border border-jw-border bg-jw-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-jw-text">
          Folha de designações
        </h2>
        <p className="mt-1 text-sm text-jw-muted">
          Importe a folha da congregação (PDF, Word ou imagem). A IA extrai quem tem cada parte.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ImportButton
            label="PDF ou Word"
            busy={importing === 'file'}
            onClick={() => void handleImport('file')}
          />
          <ImportButton
            label="Imagem (PNG/JPG)"
            busy={importing === 'image'}
            onClick={() => void handleImport('image')}
          />
          {(record.assignments.length > 0 || record.content || record.chairmanName) && (
            <button
              type="button"
              disabled={clearing || importing != null}
              onClick={() => void handleClearPrep()}
              className="rounded-lg border border-rose-300/70 px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800/60 dark:text-rose-200 dark:hover:bg-rose-950/40"
            >
              {clearing ? 'Apagando…' : 'Apagar folha e recomeçar'}
            </button>
          )}
        </div>
        {record.assignments.length > 0 ? (
          <p className="mt-2 text-xs text-jw-muted">
            {record.assignments.length} parte(s) importada(s)
            {record.importedAt
              ? ` · ${new Date(record.importedAt).toLocaleString('pt-BR')}`
              : ''}
          </p>
        ) : null}
      </section>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!record.assignments.length || generating}
          onClick={() => void handleGenerate()}
          className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
        >
          {generating ? 'Gerando…' : record.content ? 'Regenerar com IA' : 'Gerar folha com IA'}
        </button>
        <button
          type="button"
          disabled={!record.content || exporting}
          onClick={() => void handleExport()}
          className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-text hover:bg-jw-bg disabled:opacity-50"
        >
          {exporting ? 'Exportando…' : 'Exportar PDF'}
        </button>
        <button
          type="button"
          disabled={exportingRead || !window.jcs?.exportReadWeek}
          onClick={() => void handleExportRead()}
          className="rounded-lg border border-jw-purple/40 bg-jw-purple/5 px-4 py-2 text-sm font-medium text-jw-purple hover:bg-jw-purple-light/40 disabled:opacity-50"
        >
          {exportingRead ? 'Exportando…' : 'Exportar reunião para tablet'}
        </button>
      </div>

      {record.assignments.length > 0 ? (
        <MeetingMetaEditor record={record} onPatch={patchRecord} />
      ) : null}

      {record.content ? (
        <div className="space-y-6">
          <OpeningPreviewEditor
            content={record.content}
            assignments={record.assignments}
            onPatch={patchOpeningPreview}
          />

          {record.assignments.map((assignment) => {
            const banner = sectionTitle(assignment.section);
            const showBanner = banner && assignment.section !== currentSection;
            if (showBanner) currentSection = assignment.section;
            const part = record.content?.parts.find((p) => p.assignmentId === assignment.id);
            const studentPart = isStudentAssignment(assignment);

            return (
              <div key={assignment.id}>
                {showBanner && banner ? (
                  <h2
                    className={`mb-3 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white ${sectionBannerClass(assignment.section)}`}
                  >
                    {banner}
                  </h2>
                ) : null}
                <AssignmentPartEditor
                  assignment={assignment}
                  part={part}
                  studentPart={studentPart}
                  onPatchAssignment={patchAssignment}
                  onPatchPartContent={patchPartContent}
                />
              </div>
            );
          })}

          <EditorBlock
            title="Comentários finais — visão geral"
            value={record.content.closingSummary}
            onChange={(value) => patchContent({ closingSummary: value })}
          />

          <section className="rounded-xl border border-jw-border bg-jw-surface p-4">
            <h3 className="text-sm font-semibold text-jw-text">Pergunta final</h3>
            <textarea
              value={record.content.finalQuestion}
              onChange={(e) => patchContent({ finalQuestion: e.target.value })}
              rows={2}
              className="mt-2 w-full rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text"
            />
            <p className="mt-3 text-xs text-jw-muted">Três opções de resposta sugeridas</p>
            <ol className="mt-2 space-y-2">
              {record.content.finalQuestionOptions.map((opt, index) => (
                <li key={index}>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const options = [...record.content!.finalQuestionOptions] as [
                        string,
                        string,
                        string,
                      ];
                      options[index] = e.target.value;
                      patchContent({ finalQuestionOptions: options });
                    }}
                    className="w-full rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text"
                  />
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : record.assignments.length > 0 ? (
        <div className="space-y-6">
          <p className="text-sm text-jw-muted">
            Revise títulos e designações abaixo. Depois toque em &quot;Gerar folha com IA&quot; para
            criar comentários e transições.
          </p>
          {record.assignments.map((assignment) => {
            const banner = sectionTitle(assignment.section);
            const showBanner = banner && assignment.section !== currentSection;
            if (showBanner) currentSection = assignment.section;

            return (
              <div key={assignment.id}>
                {showBanner && banner ? (
                  <h2
                    className={`mb-3 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white ${sectionBannerClass(assignment.section)}`}
                  >
                    {banner}
                  </h2>
                ) : null}
                <AssignmentPartEditor
                  assignment={assignment}
                  onPatchAssignment={patchAssignment}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <section className="mt-8 rounded-xl border border-jw-border bg-jw-surface p-4">
        <h3 className="text-sm font-semibold text-jw-text">Anúncios</h3>
        <label className="mt-2 block text-xs text-jw-muted">
          Escreva os anúncios da reunião
          <textarea
            value={record.announcements ?? ''}
            onChange={(e) => patchRecord({ announcements: e.target.value })}
            rows={4}
            placeholder="Ex.: Campanha especial de pregação, assembleia de circuito, limpeza do Salão…"
            className="mt-1 w-full rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text"
          />
        </label>
        <div className="mt-3 rounded-lg border border-dashed border-jw-border/80 bg-jw-bg px-3 py-3">
          <p className="text-xs text-jw-muted">Espaço em branco para anúncios na hora da reunião (caneta)</p>
          <div className="mt-2 min-h-[6.5rem]" aria-hidden />
        </div>
      </section>

      {pendingImport?.document ? (
        <ChairmanDesignationReviewDialog
          fileName={pendingImport.fileName ?? 'Folha'}
          document={pendingImport.document}
          parseMethodLabel={pendingImport.parseMethodLabel}
          usedVision={pendingImport.usedVision}
          weekMismatch={pendingImport.weekMismatch}
          weeksFound={pendingImport.weeksFound}
          titlesAlignedFromMwb={pendingImport.titlesAlignedFromMwb}
          mwbAlignSkippedReason={pendingImport.mwbAlignSkippedReason}
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      ) : null}
    </div>
  );
}

function ImportButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-text hover:border-jw-purple hover:bg-jw-purple-light/30 disabled:opacity-50"
    >
      {busy ? 'Importando…' : label}
    </button>
  );
}

function OpeningPreviewEditor({
  content,
  assignments,
  onPatch,
}: {
  content: ChairmanGeneratedContent;
  assignments: ChairmanPrepRecord['assignments'];
  onPatch: (patch: Partial<ChairmanOpeningPreview>) => void;
}) {
  const preview = ensureOpeningPreview(content.openingSummary, assignments, content.openingPreview);

  return (
    <section className="rounded-xl border border-jw-border bg-jw-surface p-4">
      <h3 className="text-sm font-semibold text-jw-text">Comentários iniciais (~1 min)</h3>
      <p className="mt-1 text-xs text-jw-muted">
        Visão geral da reunião — identifique a seção de cada assunto.
      </p>

      <label className="mt-4 block text-xs text-jw-muted">
        Saudação breve (opcional)
        <textarea
          value={preview.intro ?? ''}
          onChange={(e) => onPatch({ intro: e.target.value })}
          rows={2}
          placeholder="Ex.: É um prazer dar boas-vindas a todos…"
          className="mt-1 w-full rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text"
        />
      </label>

      <div className="mt-4 rounded-lg border-l-4 border-blue-600 bg-blue-50/80 p-3 dark:bg-blue-950/20">
        <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
          Tesouros da Palavra de Deus — discurso (parte 1)
        </p>
        {preview.treasuresPartTitle ? (
          <label className="mt-2 block text-xs text-jw-muted">
            Título da parte 1
            <input
              type="text"
              value={preview.treasuresPartTitle ?? ''}
              onChange={(e) => onPatch({ treasuresPartTitle: e.target.value })}
              className="mt-1 w-full rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-text"
            />
          </label>
        ) : null}
        <textarea
          value={preview.treasuresHighlight}
          onChange={(e) => onPatch({ treasuresHighlight: e.target.value })}
          rows={3}
          placeholder="Em Tesouros da Palavra de Deus, na parte 1…"
          className="mt-2 w-full rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-text"
        />
      </div>

      <div className="mt-4 rounded-lg border-l-4 border-rose-900 bg-rose-50/80 p-3 dark:bg-rose-950/20">
        <p className="text-[11px] font-bold uppercase tracking-wide text-rose-900 dark:text-rose-300">
          Nossa vida cristã
        </p>
        {preview.lifeChristianPartTitle ? (
          <label className="mt-2 block text-xs text-jw-muted">
            Título em Nossa vida cristã
            <input
              type="text"
              value={preview.lifeChristianPartTitle ?? ''}
              onChange={(e) => onPatch({ lifeChristianPartTitle: e.target.value })}
              className="mt-1 w-full rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-text"
            />
          </label>
        ) : null}
        <textarea
          value={preview.lifeChristianHighlight}
          onChange={(e) => onPatch({ lifeChristianHighlight: e.target.value })}
          rows={3}
          placeholder="Em Nossa vida cristã, consideraremos…"
          className="mt-2 w-full rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-text"
        />
      </div>
    </section>
  );
}

function EditorBlock({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="rounded-xl border border-jw-border bg-jw-surface p-4">
      <h3 className="text-sm font-semibold text-jw-text">{title}</h3>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-2 w-full rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text"
      />
    </section>
  );
}

function fieldClassName() {
  return 'mt-1 w-full rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text';
}

function MeetingMetaEditor({
  record,
  onPatch,
}: {
  record: ChairmanPrepRecord;
  onPatch: (patch: Partial<ChairmanPrepRecord>) => void;
}) {
  return (
    <section className="mb-6 rounded-xl border border-jw-border bg-jw-surface p-4">
      <h3 className="text-sm font-semibold text-jw-text">Dados da reunião</h3>
      <p className="mt-1 text-xs text-jw-muted">
        Ajuste antes de exportar — entram no PDF e na folha do tablet.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-jw-muted sm:col-span-2">
          Presidente
          <input
            type="text"
            value={record.chairmanName ?? ''}
            onChange={(e) => onPatch({ chairmanName: e.target.value })}
            className={fieldClassName()}
          />
        </label>
        <label className="block text-xs text-jw-muted">
          Oração inicial
          <input
            type="text"
            value={record.openingPrayer ?? ''}
            onChange={(e) => onPatch({ openingPrayer: e.target.value })}
            className={fieldClassName()}
          />
        </label>
        <label className="block text-xs text-jw-muted">
          Oração final
          <input
            type="text"
            value={record.closingPrayer ?? ''}
            onChange={(e) => onPatch({ closingPrayer: e.target.value })}
            className={fieldClassName()}
          />
        </label>
        <label className="block text-xs text-jw-muted">
          Cântico inicial
          <input
            type="text"
            value={record.openingSong ?? ''}
            onChange={(e) => onPatch({ openingSong: e.target.value })}
            className={fieldClassName()}
          />
        </label>
        <label className="block text-xs text-jw-muted">
          Cântico final
          <input
            type="text"
            value={record.closingSong ?? ''}
            onChange={(e) => onPatch({ closingSong: e.target.value })}
            className={fieldClassName()}
          />
        </label>
      </div>
    </section>
  );
}

function AssignmentPartEditor({
  assignment,
  part,
  studentPart,
  onPatchAssignment,
  onPatchPartContent,
}: {
  assignment: ChairmanAssignment;
  part?: ChairmanGeneratedPart;
  studentPart?: boolean;
  onPatchAssignment: (
    assignmentId: string,
    patch: Partial<Pick<ChairmanAssignment, 'partTitle' | 'durationMin' | 'assignees'>>,
  ) => void;
  onPatchPartContent?: (
    assignmentId: string,
    patch: {
      transition?: string;
      highlight?: string;
      lessonRef?: string;
      lessonSummary?: string;
      privateSuggestion?: string;
    },
  ) => void;
}) {
  const isStudent = studentPart ?? isStudentAssignment(assignment);
  const hasGeneratedContent = Boolean(onPatchPartContent);

  return (
    <article className="rounded-xl border border-jw-border bg-jw-surface p-4">
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block text-xs text-jw-muted">
          Título da parte
          <input
            type="text"
            value={assignment.partTitle}
            onChange={(e) => onPatchAssignment(assignment.id, { partTitle: e.target.value })}
            className={fieldClassName()}
          />
        </label>
        <label className="block text-xs text-jw-muted sm:w-24">
          Minutos
          <input
            type="number"
            min={1}
            max={60}
            value={assignment.durationMin ?? ''}
            onChange={(e) => {
              const raw = e.target.value.trim();
              onPatchAssignment(assignment.id, {
                durationMin: raw ? Number(raw) : undefined,
              });
            }}
            className={fieldClassName()}
          />
        </label>
      </div>
      <label className="mb-3 block text-xs text-jw-muted">
        Designado(s) — separe com · ou vírgula
        <input
          type="text"
          value={formatAssignees(assignment.assignees)}
          onChange={(e) =>
            onPatchAssignment(assignment.id, { assignees: parseAssignees(e.target.value) })
          }
          placeholder="Nome do irmão ou irmã"
          className={fieldClassName()}
        />
      </label>

      {hasGeneratedContent ? (
        <>
          {isStudent ? (
            <div className="mb-3 rounded-lg border-l-4 border-amber-600 bg-amber-50/80 p-3 dark:bg-amber-950/20">
              <label className="block text-xs text-jw-muted">
                Referência da lição
                <input
                  type="text"
                  value={part?.lessonRef ?? ''}
                  onChange={(e) =>
                    onPatchPartContent!(assignment.id, { lessonRef: e.target.value })
                  }
                  placeholder="Ex.: lmd lição 5 ponto 5"
                  className="mt-1 w-full rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-text"
                />
              </label>
              <label className="mt-2 block text-xs text-jw-muted">
                Pontos principais da lição
                <textarea
                  value={part?.lessonSummary ?? ''}
                  onChange={(e) =>
                    onPatchPartContent!(assignment.id, { lessonSummary: e.target.value })
                  }
                  rows={3}
                  placeholder="Resumo do ponto principal que a apostila pede para considerar…"
                  className="mt-1 w-full rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-text"
                />
              </label>
              {part?.lessonRef && !part?.lessonSummary?.trim() ? (
                <p className="mt-2 text-xs text-amber-900/90 dark:text-amber-100/80">
                  Se o resumo estiver vazio, baixe a publicação em Pregação e regenere com IA.
                </p>
              ) : null}
            </div>
          ) : null}
          {!isStudent && part?.highlight !== undefined ? (
            <label className="mb-3 block text-xs text-jw-muted">
              Destaque
              <textarea
                value={part.highlight ?? ''}
                onChange={(e) =>
                  onPatchPartContent!(assignment.id, { highlight: e.target.value })
                }
                rows={2}
                className={fieldClassName()}
              />
            </label>
          ) : null}
          <label className="block text-xs text-jw-muted">
            {isStudent ? 'Comentário na reunião' : 'Transição'}
            <textarea
              value={part?.transition ?? ''}
              onChange={(e) =>
                onPatchPartContent!(assignment.id, { transition: e.target.value })
              }
              rows={3}
              className={fieldClassName()}
            />
          </label>
          {isStudent ? (
            <label className="mt-3 block text-xs text-jw-muted">
              Conversa particular com o estudante (não ler na tribuna)
              <textarea
                value={part?.privateSuggestion ?? ''}
                onChange={(e) =>
                  onPatchPartContent!(assignment.id, { privateSuggestion: e.target.value })
                }
                rows={2}
                placeholder="Sugestão prática para depois da reunião…"
                className="mt-1 w-full rounded-lg border border-dashed border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text"
              />
            </label>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
