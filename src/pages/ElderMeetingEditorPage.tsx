import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BibleLinkedEditor } from '@/components/BibleLinkedEditor';
import { ElderMeetingPautaPasteDialog } from '@/components/ElderMeetingPautaPasteDialog';
import { ElderMeetingPautaReviewDialog } from '@/components/ElderMeetingPautaReviewDialog';
import { IconChevronLeft } from '@/components/Icons';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import { readBibleEdition } from '@/lib/bible-edition';
import { composeMeetingAtaHtml } from '../../shared/elder-meeting-ata';
import type { ElderMeetingAgendaItem, ElderMeetingRecord, ImportElderMeetingPautaResult, ResolveLinkResult } from '../../electron/types';

type EditorTab = 'pauta' | 'ata';

type ElderMeetingEditorPageProps = {
  meetingId: string;
  onBack: () => void;
};

function newAgendaItem(): ElderMeetingAgendaItem {
  return { id: crypto.randomUUID(), title: '', notes: '' };
}

export function ElderMeetingEditorPage({ meetingId, onBack }: ElderMeetingEditorPageProps) {
  const [record, setRecord] = useState<ElderMeetingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<EditorTab>('pauta');
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState<'doc' | 'pdf' | null>(null);
  const [exportWithFormatting, setExportWithFormatting] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('references');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportElderMeetingPautaResult | null>(null);
  const [importReplaceMode, setImportReplaceMode] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [parsingPaste, setParsingPaste] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const loadMeeting = useCallback(async () => {
    if (!window.jcs?.getElderMeeting) {
      setLoading(false);
      return;
    }
    const result = await window.jcs.getElderMeeting(meetingId);
    if (result.ok && result.item) {
      setRecord({
        ...result.item,
        openingPrayer: result.item.openingPrayer ?? '',
        closingPrayer: result.item.closingPrayer ?? '',
      });
      if (result.item.ataHtml.trim()) setTab('ata');
    } else {
      setMessage(result.error ?? 'Reunião não encontrada.');
    }
    setLoading(false);
  }, [meetingId]);

  useEffect(() => {
    void loadMeeting();
  }, [loadMeeting]);

  const persist = useCallback(async (next: ElderMeetingRecord) => {
    if (!window.jcs?.saveElderMeeting) return;
    setSaving(true);
    try {
      const result = await window.jcs.saveElderMeeting(next);
      if (result.ok && result.item) setRecord(result.item);
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(
    (next: ElderMeetingRecord) => {
      setRecord(next);
      setMessage(null);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next);
      }, 600);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const patchRecord = useCallback(
    (patch: Partial<ElderMeetingRecord>) => {
      setRecord((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const patchItem = useCallback(
    (itemId: string, patch: Partial<ElderMeetingAgendaItem>) => {
      setRecord((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          items: prev.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const openImportPreview = useCallback(
    (result: ImportElderMeetingPautaResult) => {
      if (!result.ok || !result.items?.length) {
        setMessage(result.error ?? 'Não foi possível reconhecer assuntos na pauta.');
        return;
      }
      setImportReplaceMode((record?.items.length ?? 0) === 0);
      setPendingImport(result);
    },
    [record?.items.length],
  );

  const handleImportPauta = async () => {
    if (!window.jcs?.importElderMeetingPauta || !record) return;

    setImporting(true);
    setMessage(null);
    try {
      const result = await window.jcs.importElderMeetingPauta();
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível importar a pauta.');
        return;
      }
      openImportPreview(result);
    } finally {
      setImporting(false);
    }
  };

  const handlePasteAnalyze = async (text: string) => {
    if (!window.jcs?.parseElderMeetingPautaText || !record) return;

    setParsingPaste(true);
    setMessage(null);
    try {
      const result = await window.jcs.parseElderMeetingPautaText({ text });
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível analisar o texto colado.');
        return;
      }
      setPasteOpen(false);
      openImportPreview(result);
    } finally {
      setParsingPaste(false);
    }
  };

  const handleReorganizeWithAi = async (rawText: string): Promise<ImportElderMeetingPautaResult> => {
    if (!window.jcs?.parseElderMeetingPautaText) {
      return { ok: false, error: 'Função de IA indisponível.' };
    }
    return window.jcs.parseElderMeetingPautaText({ text: rawText, forceAi: true });
  };

  const applyPendingImport = (payload: {
    items: ElderMeetingAgendaItem[];
    openingPrayer: string;
    closingPrayer: string;
  }) => {
    if (!record || !payload.items.length) return;

    const nextItems = importReplaceMode ? payload.items : [...record.items, ...payload.items];

    patchRecord({
      items: nextItems,
      openingPrayer: importReplaceMode
        ? payload.openingPrayer
        : payload.openingPrayer || record.openingPrayer,
      closingPrayer: importReplaceMode
        ? payload.closingPrayer
        : payload.closingPrayer || record.closingPrayer,
      ataHtml: '',
    });
    setTab('pauta');
    setMessage(`Pauta importada: ${payload.items.length} assunto(s).`);
    setPendingImport(null);
  };

  const handleCreateAta = () => {
    if (!record) return;
    const ataHtml = composeMeetingAtaHtml({
      meetingDate: record.meetingDate,
      congregation: record.congregation,
      attendees: record.attendees,
      openingPrayer: record.openingPrayer,
      closingPrayer: record.closingPrayer,
      items: record.items,
    });
    patchRecord({ ataHtml });
    setTab('ata');
    setMessage('ATA gerada — revise o texto antes de exportar.');
  };

  const handleExport = async (format: 'doc' | 'pdf') => {
    if (!window.jcs?.exportElderMeetingAta || !record) return;
    setExporting(format);
    setMessage(null);
    try {
      const result = await window.jcs.exportElderMeetingAta({
        record: {
          id: record.id,
          meetingDate: record.meetingDate,
          title: record.title,
          congregation: record.congregation,
          attendees: record.attendees,
          openingPrayer: record.openingPrayer,
          closingPrayer: record.closingPrayer,
          items: record.items,
          ataHtml: record.ataHtml,
        },
        format,
        preserveFormatting: exportWithFormatting,
      });
      if (!result.ok) setMessage(result.error ?? 'Exportação cancelada.');
    } finally {
      setExporting(null);
    }
  };

  const openReference = useCallback(async (href: string, linkLabel: string) => {
    if (!window.jcs?.resolveLink) return;
    setPanelOpen(true);
    setPanelTab('references');
    setReferenceLoading(true);
    setReference(null);
    const result = await window.jcs.resolveLink({
      href,
      linkLabel,
      sourcePub: 'mwb',
      sourceIssue: '',
      bibleEdition: readBibleEdition(),
    });
    setReference(result);
    setReferenceLoading(false);
  }, []);

  const canExport = useMemo(() => {
    if (!record) return false;
    return Boolean(record.ataHtml.trim() || record.items.length > 0);
  }, [record]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10">
        <p className="text-sm text-jw-muted">Carregando reunião…</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="px-6 py-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          <IconChevronLeft className="h-4 w-4" />
          Voltar
        </button>
        <p className="text-sm text-jw-muted">{message ?? 'Reunião não encontrada.'}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-jw-bg">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-jw-border bg-jw-surface px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          <IconChevronLeft className="h-4 w-4" />
          Reuniões
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={record.title}
            onChange={(e) => patchRecord({ title: e.target.value })}
            className="w-full truncate rounded-md border border-transparent bg-transparent px-1 text-sm font-medium text-jw-text hover:border-jw-border focus:border-jw-purple focus:outline-none"
          />
          <p className="truncate px-1 text-xs text-jw-muted">
            {saving ? 'Salvando…' : 'Salvo automaticamente'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={importing}
            onClick={() => void handleImportPauta()}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-50"
          >
            {importing ? 'Importando…' : 'Importar pauta'}
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple"
          >
            Colar pauta
          </button>
          <button
            type="button"
            onClick={() => patchRecord({ items: [...record.items, newAgendaItem()] })}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple"
          >
            Adicionar item
          </button>
          <button
            type="button"
            onClick={handleCreateAta}
            className="rounded-lg bg-jw-purple px-3 py-1.5 text-sm font-medium text-white hover:bg-jw-purple-dark"
          >
            Criar ATA
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-jw-border px-2.5 py-1.5 text-xs text-jw-text">
            <input
              type="checkbox"
              checked={exportWithFormatting}
              onChange={(e) => setExportWithFormatting(e.target.checked)}
              className="rounded border-jw-border text-jw-purple focus:ring-jw-purple"
            />
            Com formatação
          </label>
          <button
            type="button"
            disabled={!!exporting || !canExport}
            onClick={() => void handleExport('doc')}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-50"
          >
            {exporting === 'doc' ? 'Exportando…' : 'Exportar .doc'}
          </button>
          <button
            type="button"
            disabled={!!exporting || !canExport}
            onClick={() => void handleExport('pdf')}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Exportando…' : 'Exportar .pdf'}
          </button>
        </div>
      </header>

      <div className="shrink-0 border-b border-jw-border bg-jw-surface px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap gap-3">
          <label className="flex min-w-[140px] flex-col gap-1 text-xs text-jw-muted">
            Data
            <input
              type="date"
              value={record.meetingDate}
              onChange={(e) => patchRecord({ meetingDate: e.target.value, ataHtml: '' })}
              className="rounded-lg border border-jw-border bg-jw-bg px-2 py-1.5 text-sm text-jw-text"
            />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-jw-muted">
            Congregação
            <input
              type="text"
              value={record.congregation}
              onChange={(e) => patchRecord({ congregation: e.target.value, ataHtml: '' })}
              placeholder="Opcional"
              className="rounded-lg border border-jw-border bg-jw-bg px-2 py-1.5 text-sm text-jw-text"
            />
          </label>
          <label className="flex min-w-[220px] flex-[2] flex-col gap-1 text-xs text-jw-muted">
            Presentes
            <input
              type="text"
              value={record.attendees}
              onChange={(e) => patchRecord({ attendees: e.target.value, ataHtml: '' })}
              placeholder="Nomes ou descrição resumida"
              className="rounded-lg border border-jw-border bg-jw-bg px-2 py-1.5 text-sm text-jw-text"
            />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-jw-muted">
            Oração inicial
            <input
              type="text"
              value={record.openingPrayer}
              onChange={(e) => patchRecord({ openingPrayer: e.target.value, ataHtml: '' })}
              placeholder="Irmão designado"
              className="rounded-lg border border-jw-border bg-jw-bg px-2 py-1.5 text-sm text-jw-text"
            />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-jw-muted">
            Oração final
            <input
              type="text"
              value={record.closingPrayer}
              onChange={(e) => patchRecord({ closingPrayer: e.target.value, ataHtml: '' })}
              placeholder="Irmão designado"
              className="rounded-lg border border-jw-border bg-jw-bg px-2 py-1.5 text-sm text-jw-text"
            />
          </label>
        </div>

        <div className="mx-auto mt-3 flex max-w-4xl gap-2">
          <TabButton active={tab === 'pauta'} onClick={() => setTab('pauta')}>
            Pauta e deliberações
          </TabButton>
          <TabButton active={tab === 'ata'} onClick={() => setTab('ata')}>
            ATA {record.ataHtml.trim() ? '' : '(gerar antes)'}
          </TabButton>
        </div>
      </div>

      {message ? (
        <p className="shrink-0 border-b border-jw-border bg-jw-surface px-4 py-2 text-sm text-jw-muted">
          {message}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {tab === 'pauta' ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <div className="mx-auto max-w-4xl space-y-4">
                {record.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-jw-border bg-jw-surface px-6 py-10 text-center">
                    <p className="text-sm font-medium text-jw-text">Sem itens de pauta</p>
                    <p className="mt-1 text-sm text-jw-muted">
                      Importe um arquivo (.txt, .doc, .docx ou .pdf) ou adicione itens manualmente.
                    </p>
                  </div>
                ) : (
                  record.items.map((item, index) => (
                    <article
                      key={item.id}
                      className="rounded-xl border border-jw-border bg-jw-surface p-4 shadow-sm"
                    >
                      <div className="mb-3 flex items-start gap-2">
                        <span className="mt-2 text-xs font-semibold text-jw-muted">{index + 1}.</span>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => patchItem(item.id, { title: e.target.value })}
                          placeholder="Assunto em pauta"
                          className="min-w-0 flex-1 rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm font-medium text-jw-text"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            patchRecord({
                              items: record.items.filter((entry) => entry.id !== item.id),
                              ataHtml: '',
                            })
                          }
                          className="rounded-lg px-2 py-1 text-xs text-jw-muted hover:bg-red-50 hover:text-red-600"
                        >
                          Remover
                        </button>
                      </div>
                      <div className="pl-5">
                        <p className="mb-2 text-xs text-jw-muted">Deliberações / anotações</p>
                        <BibleLinkedEditor
                          richText
                          value={item.notes}
                          onChange={(notes) => patchItem(item.id, { notes })}
                          onBibleLinkClick={(href, label) => void openReference(href, label)}
                          placeholder="Registre o que foi decidido neste item…"
                        />
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6">
              <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col">
                <p className="mb-2 shrink-0 text-xs text-jw-muted">
                  Revise e ajuste a ATA antes de exportar. Alterações aqui não mudam a pauta original.
                </p>
                <BibleLinkedEditor
                  fillHeight
                  richText
                  value={record.ataHtml}
                  onChange={(ataHtml) => patchRecord({ ataHtml })}
                  onBibleLinkClick={(href, label) => void openReference(href, label)}
                  placeholder='Clique em "Criar ATA" para gerar o documento a partir da pauta…'
                />
              </div>
            </div>
          )}
        </div>

        {panelOpen ? (
          <SidePanel
            open={panelOpen}
            tab={panelTab}
            onTabChange={setPanelTab}
            onClose={() => setPanelOpen(false)}
            reference={reference}
            referenceLoading={referenceLoading}
            downloading={false}
            onLinkClick={(href, label) => void openReference(href, label)}
            onDownloadPublication={() => undefined}
            assistantContext={{
              weekLabel: record.title,
              publicationTitle: `Reunião de anciãos — ${record.title}`,
              sourcePub: 'mwb',
              sourceIssue: '',
              sourceDocumentId: 0,
            }}
            hideAssistant
          />
        ) : null}
      </div>

      {pasteOpen ? (
        <ElderMeetingPautaPasteDialog
          busy={parsingPaste}
          onAnalyze={(text) => void handlePasteAnalyze(text)}
          onCancel={() => setPasteOpen(false)}
        />
      ) : null}

      {pendingImport?.items?.length ? (
        <ElderMeetingPautaReviewDialog
          fileName={pendingImport.fileName ?? 'arquivo'}
          items={pendingImport.items}
          openingPrayer={pendingImport.openingPrayer ?? ''}
          closingPrayer={pendingImport.closingPrayer ?? ''}
          rawText={pendingImport.rawText}
          parseMethodLabel={pendingImport.parseMethodLabel}
          usedAi={pendingImport.usedAi}
          replaceMode={importReplaceMode}
          onReplaceModeChange={setImportReplaceMode}
          onConfirm={applyPendingImport}
          onCancel={() => setPendingImport(null)}
          onReorganizeWithAi={handleReorganizeWithAi}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-jw-purple text-white'
          : 'border border-jw-border text-jw-muted hover:border-jw-purple hover:text-jw-text'
      }`}
    >
      {children}
    </button>
  );
}
