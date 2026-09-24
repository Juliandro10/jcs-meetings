import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { BibleLinkedEditor } from '@/components/BibleLinkedEditor';
import { IconChevronLeft } from '@/components/Icons';
import { readBibleEdition } from '@/lib/bible-edition';
import { outlineHtmlToPlainText } from '@/lib/outline-html-to-text';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import type { MeetingWeek } from '@/lib/meeting-types';
import type {
  ExtraMeetingPart,
  ExtraMeetingPartContextItem,
  ResolveLinkResult,
} from '../../electron/types';

type ExtraMeetingPartPageProps = {
  week: MeetingWeek;
  partId: string;
  onBack: () => void;
};

function questionsToHtml(questions: string[]) {
  const items = questions
    .map((question, index) => `<li>${escapeHtml(question) || `Pergunta ${index + 1}`}</li>`)
    .join('');
  return `<p><strong>Perguntas para a assistência</strong></p><ol>${items}</ol>`;
}

function questionsToText(questions: string[]) {
  return ['Perguntas para a assistência', ...questions.map((question, index) => `${index + 1}. ${question}`)].join(
    '\n',
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appendHtml(current: string, extra: string) {
  const base = current.replace(/<p><br><\/p>\s*$/i, '').trim();
  if (!base) return extra;
  return `${base}${extra}`;
}

export function ExtraMeetingPartPage({ week, partId, onBack }: ExtraMeetingPartPageProps) {
  const [part, setPart] = useState<ExtraMeetingPart | null>(null);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [editorRevision, setEditorRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('assistant');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [questions, setQuestions] = useState(['', '', '']);
  const saveTimer = useRef<number | null>(null);
  const titleRef = useRef('');
  const valueRef = useRef('');
  const partRef = useRef<ExtraMeetingPart | null>(null);

  titleRef.current = title;
  valueRef.current = value;
  partRef.current = part;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!window.jcs?.getExtraMeetingPart) {
        setMessage('Partes extras disponíveis apenas no app.');
        setLoading(false);
        return;
      }
      const result = await window.jcs.getExtraMeetingPart(partId);
      if (cancelled) return;
      if (!result.ok || !result.item) {
        setMessage(result.error ?? 'Não foi possível abrir a parte extra.');
        setLoading(false);
        return;
      }
      setPart(result.item);
      setTitle(result.item.title);
      setValue(result.item.body);
      setEditorRevision((current) => current + 1);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [partId]);

  const persist = useCallback(
    async (patch: { title?: string; body?: string; contextItems?: ExtraMeetingPartContextItem[] }) => {
      if (!window.jcs?.saveExtraMeetingPart) return;
      setSaving(true);
      try {
        const result = await window.jcs.saveExtraMeetingPart({ id: partId, ...patch });
        if (!result.ok || !result.item) {
          setMessage(result.error ?? 'Não foi possível salvar.');
          return;
        }
        setPart(result.item);
      } finally {
        setSaving(false);
      }
    },
    [partId],
  );

  const schedulePersist = useCallback(
    (patch: { title?: string; body?: string }) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(patch);
      }, 600);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        void window.jcs?.saveExtraMeetingPart?.({
          id: partId,
          title: titleRef.current,
          body: valueRef.current,
          contextItems: partRef.current?.contextItems,
        });
      }
    };
  }, [partId]);

  const handleChange = (nextValue: string) => {
    setValue(nextValue);
    setMessage(null);
    schedulePersist({ body: nextValue, title: titleRef.current });
  };

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    schedulePersist({ title: nextTitle, body: valueRef.current });
  };

  const openReference = useCallback(
    async (href: string, linkLabel: string) => {
      if (!window.jcs?.resolveLink) return;
      setPanelOpen(true);
      setPanelTab('references');
      setReferenceLoading(true);
      setReference(null);
      const result = await window.jcs.resolveLink({
        href,
        linkLabel,
        sourcePub: 'mwb',
        sourceIssue: week.mwbIssue ?? '',
        bibleEdition: readBibleEdition(),
      });
      setReference(result);
      setReferenceLoading(false);
    },
    [week.mwbIssue],
  );

  const handleImportContext = async () => {
    if (!window.jcs?.extractExtraPartContext) {
      setMessage('Importação disponível apenas no app.');
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const result = await window.jcs.extractExtraPartContext();
      if (result.cancelled) return;
      if (!result.ok || !result.item) {
        setMessage(result.error ?? 'Não foi possível importar o arquivo.');
        return;
      }
      const nextItems = [...(part?.contextItems ?? []), result.item];
      await persist({ contextItems: nextItems, title, body: value });
      setMessage(`Contexto importado: ${result.item.title}.`);
    } finally {
      setImporting(false);
    }
  };

  const handleAddQuestions = async () => {
    const filled = questions.map((item) => item.trim()).filter(Boolean);
    if (filled.length === 0) {
      setMessage('Escreva pelo menos uma pergunta.');
      return;
    }
    const html = questionsToHtml(filled);
    const item: ExtraMeetingPartContextItem = {
      id: crypto.randomUUID(),
      kind: 'questions',
      title: 'Perguntas para a assistência',
      text: questionsToText(filled),
      html,
      addedAt: new Date().toISOString(),
    };
    const nextValue = appendHtml(value, html);
    const nextItems = [...(part?.contextItems ?? []), item];
    setValue(nextValue);
    setEditorRevision((current) => current + 1);
    setQuestionsOpen(false);
    setQuestions(['', '', '']);
    await persist({ body: nextValue, title, contextItems: nextItems });
    setMessage('Perguntas adicionadas ao texto e ao contexto da IA.');
  };

  const insertContext = (item: ExtraMeetingPartContextItem) => {
    const nextValue = appendHtml(value, item.html);
    setValue(nextValue);
    setEditorRevision((current) => current + 1);
    schedulePersist({ body: nextValue, title });
  };

  const removeContext = async (id: string) => {
    const nextItems = (part?.contextItems ?? []).filter((item) => item.id !== id);
    await persist({ contextItems: nextItems, title, body: value });
  };

  const handleApplyFromAssistant = useCallback(
    (html: string) => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      setValue(html);
      setEditorRevision((current) => current + 1);
      setMessage('Assistente aplicou o texto no editor.');
      void persist({ body: html, title: titleRef.current });
    },
    [persist],
  );

  const importedContextText = useMemo(() => {
    const items = part?.contextItems ?? [];
    if (items.length === 0) return undefined;
    return items.map((item) => `### ${item.title}\n${item.text}`).join('\n\n');
  }, [part?.contextItems]);

  const assistantContext = useMemo(
    () => ({
      weekLabel: week.label,
      publicationTitle: title || 'Parte extra da reunião',
      bibleReading: week.bibleReading,
      sourcePub: 'extra-part',
      sourceIssue: week.id,
      documentText: outlineHtmlToPlainText(value).slice(0, 8000) || undefined,
      importedContextText,
      referenceTitle: reference?.ok ? reference.title : undefined,
      referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
    }),
    [importedContextText, reference, title, value, week.bibleReading, week.id, week.label],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-jw-border px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full p-2 text-jw-muted hover:bg-jw-surface hover:text-jw-purple"
          aria-label="Voltar às reuniões"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            className="w-full bg-transparent text-lg font-semibold text-jw-text outline-none"
            aria-label="Título da parte extra"
          />
          <p className="text-sm text-jw-muted">{week.label} · Parte extra da reunião</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {saving ? <span className="text-xs text-jw-muted">Salvando…</span> : null}
          <button
            type="button"
            disabled={importing || loading}
            onClick={() => void handleImportContext()}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-50"
          >
            {importing ? 'Importando…' : 'Importar contexto'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setQuestionsOpen(true)}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-50"
          >
            Perguntas da assistência
          </button>
          {!panelOpen ? (
            <button
              type="button"
              onClick={() => {
                setPanelOpen(true);
                setPanelTab('assistant');
              }}
              className="rounded-lg bg-jw-purple px-3 py-1.5 text-sm text-white hover:bg-jw-purple-dark"
            >
              Assistente IA
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-6 py-4">
          {message ? (
            <p className="mb-3 shrink-0 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
              {message}
            </p>
          ) : null}

          <p className="mb-3 shrink-0 text-sm text-jw-muted">
            Importe o programa do congresso (PDF ou Word) e as três perguntas. Cole ou use{' '}
            <strong>Imagem</strong> para fotos. O material importado fica no contexto da IA; use{' '}
            <strong>Inserir no texto</strong> só no que você vai usar na parte. Tudo isso vai no
            export para o tablet.
          </p>

          {(part?.contextItems.length ?? 0) > 0 ? (
            <div className="mb-3 flex shrink-0 flex-col gap-2">
              {part?.contextItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border border-jw-border bg-jw-surface px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-jw-text">{item.title}</p>
                    <p className="truncate text-xs text-jw-muted">
                      {item.kind === 'questions' ? 'Perguntas' : item.fileName || 'Arquivo'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => insertContext(item)}
                    className="rounded-lg border border-jw-border px-2 py-1 text-xs text-jw-text hover:border-jw-purple"
                  >
                    Inserir no texto
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeContext(item.id)}
                    className="rounded-lg px-2 py-1 text-xs text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-jw-muted">Carregando parte extra…</p>
          ) : (
            <BibleLinkedEditor
              fillHeight
              richText
              revision={editorRevision}
              value={value}
              onChange={handleChange}
              onBibleLinkClick={(href, label) => void openReference(href, label)}
              onSaveImage={async (file) => {
                if (!window.jcs?.saveExtraPartImage) {
                  setMessage('Inserir imagem disponível apenas no app.');
                  return null;
                }
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                const chunk = 0x8000;
                for (let i = 0; i < bytes.length; i += chunk) {
                  binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
                }
                const result = await window.jcs.saveExtraPartImage({
                  partId,
                  mimeType: file.type || 'image/jpeg',
                  dataBase64: btoa(binary),
                });
                if (!result.ok || !result.src) {
                  setMessage(result.error ?? 'Não foi possível inserir a imagem.');
                  return null;
                }
                setMessage(null);
                return { src: result.src, alt: file.name };
              }}
              placeholder="Escreva aqui os pontos da recapitulação, anúncios ou o que for apresentar nesta parte…"
            />
          )}
        </div>

        {panelOpen ? (
          <SidePanel
            open={panelOpen}
            tab={panelTab}
            onTabChange={setPanelTab}
            onClose={() => setPanelOpen(false)}
            referenceLoading={referenceLoading}
            reference={reference}
            downloading={false}
            onLinkClick={(href, label) => void openReference(href, label)}
            onDownloadPublication={() => undefined}
            assistantContext={assistantContext}
            onApplyOutline={handleApplyFromAssistant}
          />
        ) : null}
      </div>

      {questionsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-2xl border border-jw-border bg-white p-6 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddQuestions();
            }}
          >
            <h2 className="text-lg font-semibold text-jw-text">Perguntas para a assistência</h2>
            <p className="mt-2 text-sm text-jw-muted">
              As perguntas entram no editor e também no contexto da IA, junto com o programa importado.
            </p>
            <div className="mt-4 space-y-3">
              {questions.map((question, index) => (
                <label key={index} className="block">
                  <span className="text-xs font-medium text-jw-muted">Pergunta {index + 1}</span>
                  <textarea
                    value={question}
                    onChange={(event) =>
                      setQuestions((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                      )
                    }
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-jw-border px-3 py-2 text-sm text-jw-text outline-none focus:border-jw-purple"
                  />
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuestionsOpen(false)}
                className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-text hover:border-jw-purple/40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-jw-purple px-4 py-2 text-sm text-white hover:bg-jw-purple-dark"
              >
                Adicionar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
