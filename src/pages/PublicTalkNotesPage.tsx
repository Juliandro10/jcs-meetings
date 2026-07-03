import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { BibleLinkedEditor } from '@/components/BibleLinkedEditor';
import { IconChevronLeft } from '@/components/Icons';
import { readBibleEdition } from '@/lib/bible-edition';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import type { MeetingWeek } from '@/lib/meeting-types';
import type { ResolveLinkResult } from '../../electron/types';

type PublicTalkNotesPageProps = {
  week: MeetingWeek;
  onBack: () => void;
};

export function PublicTalkNotesPage({ week, onBack }: PublicTalkNotesPageProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<'doc' | 'pdf' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('references');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!window.jcs?.getPublicTalkNote) {
        setLoading(false);
        return;
      }
      const result = await window.jcs.getPublicTalkNote(week.id);
      if (!cancelled) {
        setValue(result.value ?? '');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [week.id]);

  const persist = useCallback(
    async (nextValue: string) => {
      if (!window.jcs?.setPublicTalkNote) return;
      setSaving(true);
      try {
        await window.jcs.setPublicTalkNote({ weekId: week.id, value: nextValue });
      } finally {
        setSaving(false);
      }
    },
    [week.id],
  );

  const handleChange = (nextValue: string) => {
    setValue(nextValue);
    setMessage(null);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(nextValue);
    }, 600);
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
        sourcePub: 'mwb',
        sourceIssue: week.mwbIssue ?? '',
        bibleEdition: readBibleEdition(),
      });

      setReference(result);
      setReferenceLoading(false);
    },
    [week.mwbIssue],
  );

  const assistantContext = useMemo(
    () => ({
      weekLabel: week.label,
      publicationTitle: `Discurso público — ${week.label}`,
      bibleReading: week.bibleReading,
      referenceTitle: reference?.ok ? reference.title : undefined,
      referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
    }),
    [reference, week.bibleReading, week.label],
  );

  const handleExport = async (format: 'doc' | 'pdf') => {
    if (!window.jcs?.exportPublicTalkNote) {
      setMessage('Exportação disponível apenas no app Electron.');
      return;
    }
    setExporting(format);
    setMessage(null);
    try {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        await persist(value);
      }
      const result = await window.jcs.exportPublicTalkNote({
        weekId: week.id,
        weekLabel: week.label,
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
          <h1 className="text-lg font-semibold text-jw-text">Anotações do discurso público</h1>
          <p className="text-sm text-jw-muted">{week.label}</p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? <span className="text-xs text-jw-muted">Salvando…</span> : null}
          <button
            type="button"
            disabled={!!exporting || loading}
            onClick={() => void handleExport('doc')}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-50"
          >
            {exporting === 'doc' ? 'Exportando…' : 'Exportar .doc'}
          </button>
          <button
            type="button"
            disabled={!!exporting || loading}
            onClick={() => void handleExport('pdf')}
            className="rounded-lg bg-jw-purple px-3 py-1.5 text-sm text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Exportando…' : 'Exportar .pdf'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-6 py-4">
          {message ? (
            <p className="mb-3 shrink-0 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
              {message}
            </p>
          ) : null}
          {loading ? (
            <p className="text-sm text-jw-muted">Carregando anotações…</p>
          ) : (
            <>
              <p className="mb-2 shrink-0 text-xs text-jw-muted">
                Citações bíblicas (ex.: Mateus 24:14) aparecem como links — clique para abrir a Bíblia ao lado.
              </p>
              <BibleLinkedEditor
                fillHeight
                value={value}
                onChange={handleChange}
                onBibleLinkClick={(href, label) => void openReference(href, label)}
                placeholder="Anote aqui os pontos altos do discurso público desta semana…"
              />
            </>
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
          />
        ) : null}
      </div>
    </div>
  );
}
