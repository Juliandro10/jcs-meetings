import { useEffect, useState } from 'react';
import type { CbsStudyReviewGroup, CbsStudyReviewQuestion } from '../../electron/types';

type CbsStudyExportDialogProps = {
  open: boolean;
  weekLabel: string;
  chapterTitle?: string;
  groups: CbsStudyReviewGroup[];
  exporting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (questions: CbsStudyReviewQuestion[]) => void;
};

function isQuadroSection(title: string) {
  return /quadro completo/i.test(title);
}

export function CbsStudyExportDialog({
  open,
  weekLabel,
  chapterTitle,
  groups,
  exporting,
  error,
  onCancel,
  onConfirm,
}: CbsStudyExportDialogProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const group of groups) {
      for (const question of group.questions) {
        next[question.id] = question.body;
      }
    }
    setDrafts(next);
  }, [open, groups]);

  if (!open) return null;

  const questions = groups.flatMap((group) => group.questions);
  const emptyCount = questions.filter(
    (question) => question.id !== 'wcg-conductor' && !(drafts[question.id] ?? '').trim(),
  ).length;
  const quadro = groups.find((group) => isQuadroSection(group.sectionTitle));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cbs-study-export-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-jw-border bg-white p-6 shadow-xl"
      >
        <h2 id="cbs-study-export-title" className="text-lg font-semibold text-jw-text">
          Revisar estudo bíblico
        </h2>
        <p className="mt-2 text-sm text-jw-muted">
          Ajuste as respostas antes de enviar {weekLabel}
          {chapterTitle ? ` · ${chapterTitle}` : ''} ao tablet. Inclui{' '}
          <strong>Pense no quadro completo</strong>
          {quadro ? ` (${quadro.questions.length} perguntas)` : ''}.
        </p>
        {!quadro ? (
          <p className="mt-2 text-xs text-amber-800">
            Não encontramos a seção Pense no quadro completo neste capítulo.
          </p>
        ) : emptyCount > 0 ? (
          <p className="mt-2 text-xs text-amber-800">
            Há {emptyCount} pergunta(s) sem resposta. Preencha aqui ou prepare o estudo de novo antes
            de enviar ao tablet.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

        <div className="mt-4 min-h-0 flex-1 space-y-6 overflow-auto pr-1">
          {groups.map((group) => {
            const quadroGroup = isQuadroSection(group.sectionTitle);
            return (
              <section
                key={group.sectionTitle}
                className={
                  quadroGroup
                    ? 'rounded-xl border border-jw-purple/30 bg-jw-purple/5 p-4'
                    : undefined
                }
              >
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-jw-purple">
                  {group.sectionTitle}
                  {quadroGroup ? ` · ${group.questions.length} perguntas` : ''}
                </h3>
                <div className="space-y-4">
                  {group.questions.map((question) => (
                    <label key={question.id} className="block">
                      <span className="text-sm font-medium text-jw-text">{question.title}</span>
                      <textarea
                        value={drafts[question.id] ?? ''}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [question.id]: event.target.value }))
                        }
                        rows={
                          question.id === 'wcg-conductor' ? 8 : question.id === 'wcg-bible-reading' ? 2 : 4
                        }
                        placeholder={
                          question.id === 'wcg-bible-reading'
                            ? 'Ex.: Gên. 32:6-12; 33:1-4'
                            : 'Resposta que vai para o tablet'
                        }
                        className="mt-1.5 w-full rounded-lg border border-jw-border bg-white px-3 py-2 text-sm leading-relaxed text-jw-text outline-none focus:border-jw-purple"
                      />
                    </label>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={onCancel}
            className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-text hover:border-jw-purple/40 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() =>
              onConfirm(
                questions.map((question) => ({
                  ...question,
                  body: (drafts[question.id] ?? '').trim(),
                })),
              )
            }
            className="rounded-lg bg-jw-purple px-4 py-2 text-sm text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {exporting ? 'Salvando…' : 'Salvar e continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
