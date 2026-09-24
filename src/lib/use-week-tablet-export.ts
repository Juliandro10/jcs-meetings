import { useCallback, useState } from 'react';
import type { MeetingWeek } from '@/lib/meeting-types';
import { isDiscourseScriptNote } from '../../shared/discourse-script';
import type { CbsStudyReviewGroup, CbsStudyReviewQuestion } from '../../electron/types';

export function useWeekTabletExport(week: MeetingWeek | null) {
  const [exporting, setExporting] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preparedExportOpen, setPreparedExportOpen] = useState(false);
  const [preparedExportNotes, setPreparedExportNotes] = useState<
    Awaited<ReturnType<NonNullable<typeof window.jcs>['getNotes']>>
  >([]);
  const [cbsExportOpen, setCbsExportOpen] = useState(false);
  const [cbsReview, setCbsReview] = useState<{
    documentId: number;
    title?: string;
    groups: CbsStudyReviewGroup[];
  } | null>(null);

  const runTabletExport = useCallback(
    (preparedPartNoteIds?: string[]) => {
      if (!window.jcs?.exportReadWeek || !week) return;
      setMessage(null);
      setExporting(true);
      void window.jcs
        .exportReadWeek(week, { preparedPartNoteIds })
        .then((result) => {
          if (result.ok) {
            const warning = result.warnings?.length ? ` ${result.warnings.join(' ')}` : '';
            setMessage(
              `Exportado (${result.documentCount ?? 0} documento(s)). Envie jcs-read.zip ao tablet.${warning}`,
            );
          } else {
            setMessage(result.error ?? 'Não foi possível exportar.');
          }
        })
        .catch((err) => {
          setMessage(err instanceof Error ? err.message : 'Erro ao exportar.');
        })
        .finally(() => {
          setExporting(false);
          setPreparedExportOpen(false);
          setCbsExportOpen(false);
        });
    },
    [week],
  );

  const continueAfterCbsReview = useCallback(async () => {
    if (!window.jcs?.exportReadWeek || !week) return;

    if (week.mwbDownloaded && week.mwbDocumentId && week.mwbIssue && window.jcs.getNotes) {
      try {
        const notes = await window.jcs.getNotes({
          pub: 'mwb',
          issue: week.mwbIssue,
          documentId: week.mwbDocumentId,
        });
        const prepared = notes.filter((note) => isDiscourseScriptNote(note));
        if (prepared.length > 0) {
          setPreparedExportNotes(notes);
          setPreparedExportOpen(true);
          return;
        }
      } catch {
        /* exporta semana inteira */
      }
    }

    runTabletExport();
  }, [runTabletExport, week]);

  const handleCbsConfirm = useCallback(
    async (questions: CbsStudyReviewQuestion[]) => {
      if (!cbsReview?.documentId || !window.jcs?.saveWeekCbsStudyPrep) {
        setCbsExportOpen(false);
        await continueAfterCbsReview();
        return;
      }

      setSavingReview(true);
      setMessage(null);
      try {
        const result = await window.jcs.saveWeekCbsStudyPrep({
          documentId: cbsReview.documentId,
          questions,
        });
        if (!result.ok) {
          setMessage(result.error ?? 'Não foi possível salvar as respostas do estudo.');
          return;
        }
        setCbsExportOpen(false);
        await continueAfterCbsReview();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Não foi possível salvar as respostas do estudo.');
      } finally {
        setSavingReview(false);
      }
    },
    [cbsReview?.documentId, continueAfterCbsReview],
  );

  const startExport = useCallback(async () => {
    if (!window.jcs?.exportReadWeek || !week) return;
    setMessage(null);

    if (window.jcs.getWeekCbsStudyPrep) {
      setExporting(true);
      try {
        const prep = await window.jcs.getWeekCbsStudyPrep(week);
        if (prep.ok && prep.documentId && prep.groups?.some((group) => group.questions.length > 0)) {
          setCbsReview({
            documentId: prep.documentId,
            title: prep.title,
            groups: prep.groups,
          });
          setCbsExportOpen(true);
          return;
        }
      } catch {
        /* exporta sem revisão do estudo */
      } finally {
        setExporting(false);
      }
    }

    await continueAfterCbsReview();
  }, [continueAfterCbsReview, week]);

  return {
    exporting,
    savingReview,
    message,
    setMessage,
    preparedExportOpen,
    setPreparedExportOpen,
    preparedExportNotes,
    cbsExportOpen,
    setCbsExportOpen,
    cbsReview,
    startExport,
    handleCbsConfirm,
    confirmPreparedParts: runTabletExport,
  };
}
