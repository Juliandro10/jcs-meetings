import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { BibleLinkedEditor } from '@/components/BibleLinkedEditor';
import { IconChevronLeft } from '@/components/Icons';
import { readBibleEdition } from '@/lib/bible-edition';
import type { DocumentNote } from '@/lib/note-dom';
import type { MeetingWeek } from '@/lib/meeting-types';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import type { ResolveLinkResult } from '../../electron/types';

type DiscourseScriptEditorPageProps = {
  note: DocumentNote;
  week: MeetingWeek;
  weekLabel: string;
  bibleReading?: string;
  pub: string;
  issue: string;
  documentId: number;
  onBack: () => void;
  onSaved: (note: DocumentNote) => void;
};

export function DiscourseScriptEditorPage({
  note,
  week,
  weekLabel,
  bibleReading,
  pub,
  issue,
  documentId,
  onBack,
  onSaved,
}: DiscourseScriptEditorPageProps) {
  const [value, setValue] = useState(note.body);
  const [title, setTitle] = useState(note.title);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<'doc' | 'pdf' | 'tablet' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('references');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const saveTimer = useRef<number | null>(null);
  const valueRef = useRef(note.body);
  const titleRef = useRef(note.title);
  const loadedNoteId = useRef(note.id);

  valueRef.current = value;
  titleRef.current = title;

  useEffect(() => {
    if (loadedNoteId.current === note.id) return;
    loadedNoteId.current = note.id;
    setValue(note.body);
    setTitle(note.title);
    valueRef.current = note.body;
    titleRef.current = note.title;
  }, [note.body, note.id, note.title]);

  const persist = useCallback(
    async (nextBody: string, nextTitle: string) => {
      if (!window.jcs?.saveNote) return;
      setSaving(true);
      try {
        const updated: DocumentNote = { ...note, title: nextTitle, body: nextBody };
        const saved = await window.jcs.saveNote({ pub, issue, documentId, note: updated });
        const match = saved.find((item) => item.id === note.id) ?? updated;
        onSaved(match);
      } finally {
        setSaving(false);
      }
    },
    [documentId, issue, note, onSaved, pub],
  );

  const handleChange = (nextValue: string) => {
    setValue(nextValue);
    valueRef.current = nextValue;
    setMessage(null);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(valueRef.current, titleRef.current);
    }, 600);
  };

  const handleTitleBlur = () => {
    if (title === note.title) return;
    titleRef.current = title;
    void persist(valueRef.current, title);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

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
        sourcePub: pub,
        sourceIssue: issue,
        bibleEdition: readBibleEdition(),
      });
      setReference(result);
      setReferenceLoading(false);
    },
    [issue, pub],
  );

  const assistantContext = useMemo(
    () => ({
      weekLabel,
      publicationTitle: title,
      bibleReading,
      referenceTitle: reference?.ok ? reference.title : undefined,
      referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
    }),
    [bibleReading, reference, title, weekLabel],
  );

  const handleExportTablet = async () => {
    if (!window.jcs?.exportReadPreparedPart) {
      setMessage('Exportação para tablet disponível apenas no app Electron.');
      return;
    }
    setExporting('tablet');
    setMessage(null);
    try {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        await persist(valueRef.current, titleRef.current);
      }
      const result = await window.jcs.exportReadPreparedPart(week, note.id, {
        preferLastFolder: true,
      });
      if (result.ok) {
        setMessage('Roteiro exportado para o tablet. Envie jcs-read.zip ao JCS Read.');
      } else {
        setMessage(result.error ?? 'Não foi possível exportar para o tablet.');
      }
    } finally {
      setExporting(null);
    }
  };

  const handleExport = async (format: 'doc' | 'pdf') => {
    if (!window.jcs?.exportDiscourseScript) {
      setMessage('Exportação disponível apenas no app Electron.');
      return;
    }
    setExporting(format);
    setMessage(null);
    try {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        await persist(valueRef.current, titleRef.current);
      }
      const result = await window.jcs.exportDiscourseScript({
        title,
        weekLabel,
        format,
        value,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível exportar.');
      }
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-jw-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-jw-border bg-jw-surface px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          ← Matéria
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              titleRef.current = e.target.value;
            }}
            onBlur={handleTitleBlur}
            className="w-full bg-transparent text-sm font-semibold text-jw-text outline-none"
          />
          <p className="text-xs text-jw-muted">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? <span className="text-xs text-jw-muted">Salvando…</span> : null}
          <button
            type="button"
            disabled={!!exporting}
            onClick={() => void handleExportTablet()}
            className="rounded-lg border border-jw-purple/40 bg-jw-purple/5 px-3 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light disabled:opacity-50"
          >
            {exporting === 'tablet' ? 'Exportando…' : 'Exportar pro tablet'}
          </button>
          <button
            type="button"
            disabled={!!exporting}
            onClick={() => void handleExport('doc')}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-50"
          >
            {exporting === 'doc' ? 'Exportando…' : 'Exportar .doc'}
          </button>
          <button
            type="button"
            disabled={!!exporting}
            onClick={() => void handleExport('pdf')}
            className="rounded-lg bg-jw-purple px-3 py-1.5 text-sm text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Exportando…' : 'Exportar .pdf'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 py-4">
          {message ? (
            <p className="mb-3 shrink-0 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
              {message}
            </p>
          ) : null}
          <p className="mb-2 shrink-0 text-xs text-jw-muted">
            Roteiro de tribuna — edite livremente. Citações bíblicas viram links clicáveis.
          </p>
          <BibleLinkedEditor
            fillHeight
            richText
            value={value}
            onChange={handleChange}
            onBibleLinkClick={(href, label) => void openReference(href, label)}
            placeholder="Roteiro para proferir…"
          />
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
          />
        ) : null}
      </div>
    </div>
  );
}
