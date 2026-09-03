import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { BibleLinkedEditor } from '@/components/BibleLinkedEditor';
import { BibleLinkedReader } from '@/components/BibleLinkedReader';
import { IconChevronLeft } from '@/components/Icons';
import { SavePreparedOutlineModal } from '@/components/SavePreparedOutlineModal';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import { OutlineAdditionalResearch } from '@/components/OutlineResearchList';
import { readBibleEdition } from '@/lib/bible-edition';
import { collectMissingOutlinePrepDownloads, type OutlinePrepDownload } from '@/lib/outline-prep-downloads';
import { outlineHtmlToPlainText } from '@/lib/outline-html-to-text';
import { jwpubOutlineHtmlToEditorHtml, outlineHasResearchLinks } from '@/lib/outline-source-html';
import { stripOutlineHtml } from '@/lib/rich-outline-html';
import type { ElderOutlineReaderTarget } from '@/components/ElderSection';
import type { DownloadPubResult, OutlineResearchItem, OutlineSupportPub, ResolveLinkResult } from '../../electron/types';
import type { PreparedElderOutline } from '../../electron/types';

type ElderOutlineReaderPageProps = {
  target: ElderOutlineReaderTarget;
  onBack: () => void;
};

type ViewMode = 'edit' | 'present';

function getSelectedTextFromEditor() {
  try {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return undefined;
    const root =
      document.querySelector<HTMLElement>('.elder-outline-editor .jcs-rich-editor') ??
      document.querySelector<HTMLElement>('.elder-outline-editor textarea');
    if (!root) return undefined;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    if (!anchor || !focus || !root.contains(anchor) || !root.contains(focus)) return undefined;
    const text = selection.toString().replace(/\s+/g, ' ').trim();
    return text.length >= 3 ? text : undefined;
  } catch {
    return undefined;
  }
}

async function loadOutlineSourceText(pub: string, documentId: number): Promise<string | null> {
  if (!window.jcs?.getDocumentHtml) return null;
  const result = await window.jcs.getDocumentHtml({ pub, documentId, issue: '' });
  if (!result.ok || !result.html) return null;
  return jwpubOutlineHtmlToEditorHtml(result.html);
}

async function downloadOutlinePub(target: OutlinePrepDownload): Promise<DownloadPubResult> {
  if (!window.jcs?.downloadPub) {
    return { ok: false, error: 'Download disponível apenas no app Electron.' };
  }
  const first = await window.jcs.downloadPub({ pub: target.pub, issue: target.issue });
  if (first.ok) return first;
  if (target.fallbackPub && target.fallbackPub !== target.pub) {
    const withIssue = await window.jcs.downloadPub({ pub: target.fallbackPub, issue: target.issue });
    if (withIssue.ok) return withIssue;
    const withoutIssue = await window.jcs.downloadPub({ pub: target.fallbackPub, issue: '' });
    if (withoutIssue.ok) return withoutIssue;
  }
  return first;
}

export function ElderOutlineReaderPage({ target, onBack }: ElderOutlineReaderPageProps) {
  const [editorValue, setEditorValue] = useState('');
  const [editorRevision, setEditorRevision] = useState(0);
  const [preparedId, setPreparedId] = useState<string | undefined>(target.preparedId);
  const [preparedName, setPreparedName] = useState<string | undefined>(target.preparedName);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrepared, setSavingPrepared] = useState(false);
  const [saveConflict, setSaveConflict] = useState<PreparedElderOutline | null>(null);
  const [exportWithFormatting, setExportWithFormatting] = useState(true);
  const [exporting, setExporting] = useState<'doc' | 'pdf' | 'tablet' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('assistant');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const [selectedText, setSelectedText] = useState<string | undefined>();
  const [outlineResearch, setOutlineResearch] = useState<OutlineResearchItem[]>([]);
  const [supportPubs, setSupportPubs] = useState<OutlineSupportPub[]>([]);
  const [speakerGuidelinesAvailable, setSpeakerGuidelinesAvailable] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [downloadJob, setDownloadJob] = useState<{ index: number; total: number; label: string } | null>(
    null,
  );
  const [downloadFailures, setDownloadFailures] = useState<string[]>([]);
  const [prepDownloadNonce, setPrepDownloadNonce] = useState(0);
  const saveTimer = useRef<number | null>(null);
  const lastOpenedRef = useRef<{ href: string; label: string } | null>(null);
  const autoDownloadKeyRef = useRef<string | null>(null);

  const persist = useCallback(
    async (nextValue: string) => {
      if (!window.jcs?.setElderOutlineNote) return;
      setSaving(true);
      try {
        await window.jcs.setElderOutlineNote({
          pub: target.pub,
          documentId: target.documentId,
          value: nextValue,
        });
      } finally {
        setSaving(false);
      }
    },
    [target.documentId, target.pub],
  );

  useEffect(() => {
    setPreparedId(target.preparedId);
    setPreparedName(target.preparedName);
  }, [target.documentId, target.preparedId, target.preparedName, target.pub]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setMessage(null);

      let saved = '';

      if (target.preparedId && window.jcs?.getPreparedElderOutline) {
        const prepared = await window.jcs.getPreparedElderOutline(target.preparedId);
        if (prepared.ok && prepared.item) {
          saved = prepared.item.value;
        }
      }

      if (!saved && window.jcs?.getElderOutlineNote) {
        const result = await window.jcs.getElderOutlineNote({
          pub: target.pub,
          documentId: target.documentId,
        });
        saved = result.value?.trim() ?? '';
      }

      if (!stripOutlineHtml(saved) && !target.preparedId) {
        saved = '';
      }

      if (!saved) {
        const source = await loadOutlineSourceText(target.pub, target.documentId);
        if (source) {
          saved = source;
          if (!target.preparedId && window.jcs?.setElderOutlineNote) {
            await window.jcs.setElderOutlineNote({
              pub: target.pub,
              documentId: target.documentId,
              value: source,
            });
          }
        }
      }

      if (!cancelled) {
        setEditorValue(saved);
        setLoading(false);
        if (!saved) {
          setMessage('Não foi possível carregar o esboço.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.documentId, target.preparedId, target.pub]);

  useEffect(() => {
    let cancelled = false;
    autoDownloadKeyRef.current = null;
    setDownloadFailures([]);
    setDownloadJob(null);
    setOutlineResearch([]);
    setSupportPubs([]);
    setSpeakerGuidelinesAvailable(false);
    void (async () => {
      if (!window.jcs?.listOutlinePrepSources) return;
      const result = await window.jcs.listOutlinePrepSources({
        pub: target.pub,
        documentId: target.documentId,
      });
      if (cancelled || !result.ok) return;
      setOutlineResearch(result.research ?? []);
      setSupportPubs(result.supportPubs ?? []);
      setSpeakerGuidelinesAvailable(Boolean(result.speakerGuidelines?.available));
    })();
    return () => {
      cancelled = true;
    };
  }, [target.documentId, target.pub]);

  const reloadPrepSources = useCallback(async () => {
    if (!window.jcs?.listOutlinePrepSources) return;
    const result = await window.jcs.listOutlinePrepSources({
      pub: target.pub,
      documentId: target.documentId,
    });
    if (!result.ok) return;
    setOutlineResearch(result.research ?? []);
    setSupportPubs(result.supportPubs ?? []);
    setSpeakerGuidelinesAvailable(Boolean(result.speakerGuidelines?.available));
  }, [target.documentId, target.pub]);

  useEffect(() => {
    if (!window.jcs?.onDownloadProgress) return;
    return window.jcs.onDownloadProgress(({ percent }) => {
      setDownloadPercent(percent);
    });
  }, []);

  const flushDraft = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await persist(editorValue);
    }
  }, [editorValue, persist]);

  const commitPreparedSave = useCallback(
    async (name: string, overwriteId?: string) => {
      if (!window.jcs?.savePreparedElderOutline) return false;
      setSavingPrepared(true);
      try {
        const result = await window.jcs.savePreparedElderOutline({
          id: overwriteId,
          name,
          pub: target.pub,
          documentId: target.documentId,
          sourceTitle: target.title,
          sourcePubLabel: target.pubLabel,
          value: editorValue,
        });
        if (!result.ok || !result.item) {
          setMessage(result.error ?? 'Não foi possível salvar o esboço preparado.');
          return false;
        }
        setPreparedId(result.item.id);
        setPreparedName(result.item.name);
        setMessage(`Salvo como "${result.item.name}".`);
        setSaveConflict(null);
        return true;
      } finally {
        setSavingPrepared(false);
      }
    },
    [editorValue, target.documentId, target.pub, target.pubLabel, target.title],
  );

  const handleSavePrepared = useCallback(async () => {
    if (!editorValue.trim()) {
      setMessage('Não há conteúdo para salvar.');
      return;
    }
    await flushDraft();

    const name = (preparedName ?? target.title).trim();
    const existing = window.jcs?.findPreparedElderOutlineByName
      ? (await window.jcs.findPreparedElderOutlineByName({
          pub: target.pub,
          documentId: target.documentId,
          name,
        })).item
      : null;

    if (existing && existing.id !== preparedId) {
      setSaveConflict(existing);
      return;
    }

    await commitPreparedSave(name, preparedId ?? existing?.id ?? undefined);
  }, [commitPreparedSave, editorValue, flushDraft, preparedId, preparedName, target.documentId, target.pub, target.title]);

  const suggestCopyName = useCallback((baseName: string) => {
    const base = baseName.replace(/\s*\(\d+\)$/, '').trim();
    for (let n = 2; n < 50; n += 1) {
      const candidate = `${base} (${n})`;
      if (candidate.toLowerCase() === baseName.toLowerCase()) continue;
      return candidate;
    }
    return `${base} (cópia)`;
  }, []);

  const handleApplyOutlineFromAssistant = useCallback(
    (html: string) => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      setSelectedText(undefined);
      setEditorValue(html);
      setEditorRevision((current) => current + 1);
      setMessage('Assistente aplicou o texto no esboço preparado.');
      void persist(html);
    },
    [persist],
  );

  const handleEditorChange = (nextValue: string) => {
    setEditorValue(nextValue);
    setMessage(null);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(nextValue);
    }, 600);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (viewMode !== 'edit') return;
    const syncSelection = () => setSelectedText(getSelectedTextFromEditor());
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [viewMode]);

  const openReference = useCallback(
    async (href: string, linkLabel: string) => {
      if (!window.jcs?.resolveLink) return;

      lastOpenedRef.current = { href, label: linkLabel };
      setPanelOpen(true);
      setPanelTab('references');
      setReferenceLoading(true);
      setReference(null);

      const result = await window.jcs.resolveLink({
        href,
        linkLabel,
        sourcePub: target.pub,
        sourceIssue: '',
        bibleEdition: readBibleEdition(),
      });

      setReference(result);
      setReferenceLoading(false);
    },
    [target.pub],
  );

  const handleDownloadPublication = useCallback(
    async (pub?: string, issue?: string) => {
      const downloadPub = pub ?? reference?.download?.pub;
      const downloadIssue = issue ?? reference?.download?.issue ?? '';
      if (!downloadPub || !window.jcs?.downloadPub) return;

      setDownloading(true);
      setDownloadPercent(0);
      try {
        const result = await downloadOutlinePub({
          pub: downloadPub,
          issue: downloadIssue,
          label: downloadPub,
          fallbackPub: reference?.download?.pub !== downloadPub ? reference?.download?.pub : undefined,
        });
        if (!result.ok) {
          setMessage(result.error ?? 'Não foi possível baixar a publicação.');
          return;
        }

        await reloadPrepSources();
        if (lastOpenedRef.current) {
          await openReference(lastOpenedRef.current.href, lastOpenedRef.current.label);
        }
      } finally {
        setDownloading(false);
        setDownloadPercent(null);
      }
    },
    [openReference, reference?.download?.pub, reference?.download?.issue, reloadPrepSources],
  );

  useEffect(() => {
    const outlineKey = `${target.pub}:${target.documentId}`;
    if (autoDownloadKeyRef.current === outlineKey) return;
    if (!window.jcs?.downloadPub) return;

    const missing = collectMissingOutlinePrepDownloads(outlineResearch, supportPubs);
    if (missing.length === 0) return;

    autoDownloadKeyRef.current = outlineKey;
    let cancelled = false;
    let finished = false;

    void (async () => {
      setDownloading(true);
      setDownloadPercent(0);
      setDownloadFailures([]);
      const failures: string[] = [];

      for (let index = 0; index < missing.length; index += 1) {
        if (cancelled) return;
        const item = missing[index]!;
        setDownloadJob({ index: index + 1, total: missing.length, label: item.label });
        const result = await downloadOutlinePub(item);
        if (!result.ok) {
          failures.push(`${item.label}: ${result.error ?? 'indisponível no jw.org'}`);
        }
      }

      finished = true;
      if (cancelled) return;
      await reloadPrepSources();
      setDownloading(false);
      setDownloadPercent(null);
      setDownloadJob(null);
      setDownloadFailures(failures);

      if (failures.length === 0) {
        setMessage(
          missing.length === 1
            ? 'Publicação deste esboço baixada.'
            : `${missing.length} publicações deste esboço baixadas.`,
        );
      } else if (failures.length < missing.length) {
        setMessage(
          `Parte das publicações deste esboço foi baixada. ${failures.length} não estavam disponíveis no jw.org.`,
        );
      } else {
        setMessage('Não foi possível baixar as publicações deste esboço no jw.org.');
      }

      if (lastOpenedRef.current) {
        await openReference(lastOpenedRef.current.href, lastOpenedRef.current.label);
      }
    })();

    return () => {
      cancelled = true;
      if (!finished) autoDownloadKeyRef.current = null;
    };
  }, [openReference, outlineResearch, prepDownloadNonce, reloadPrepSources, supportPubs, target.documentId, target.pub]);

  const openResearch = useCallback(
    (href: string, caption: string) => {
      setPanelOpen(true);
      setPanelTab('references');
      void openReference(href, caption);
    },
    [openReference],
  );

  const assistantContext = useMemo(
    () => ({
      contentKind: 'elder-outline' as const,
      weekLabel: target.pubLabel,
      publicationTitle: `${target.pubLabel} — ${target.title}`,
      selectedText,
      sourcePub: target.pub,
      sourceIssue: '',
      sourceDocumentId: target.documentId,
      preparedOutlineText: outlineHtmlToPlainText(editorValue),
      referenceTitle: reference?.ok ? reference.title : undefined,
      referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
      outlineResearchCount: outlineResearch.length,
      speakerGuidelinesAvailable,
      talkPrepSupportAvailable: supportPubs.some((item) => item.downloaded),
    }),
    [
      editorValue,
      outlineResearch.length,
      reference,
      selectedText,
      speakerGuidelinesAvailable,
      supportPubs,
      target.documentId,
      target.pub,
      target.pubLabel,
      target.title,
    ],
  );

  const handleExportTablet = async () => {
    if (!window.jcs?.exportReadElderOutline) {
      setMessage('Exportação para tablet disponível apenas no app Electron.');
      return;
    }
    if (!editorValue.trim()) {
      setMessage('Não há conteúdo no esboço para exportar.');
      return;
    }
    setExporting('tablet');
    setMessage(null);
    try {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        await persist(editorValue);
      }
      const result = await window.jcs.exportReadElderOutline(
        {
          title: target.title,
          pub: target.pub,
          pubLabel: target.pubLabel,
          documentId: target.documentId,
          preparedName,
          value: editorValue,
        },
        { preferLastFolder: true },
      );
      if (result.ok) {
        setMessage('Esboço exportado para o tablet. Envie jcs-read.zip ao JCS Read.');
      } else {
        setMessage(result.error ?? 'Não foi possível exportar para o tablet.');
      }
    } finally {
      setExporting(null);
    }
  };

  const handleExport = async (format: 'doc' | 'pdf') => {
    if (!window.jcs?.exportElderOutlineNote) {
      setMessage('Exportação disponível apenas no app Electron.');
      return;
    }
    setExporting(format);
    setMessage(null);
    try {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        await persist(editorValue);
      }
      const result = await window.jcs.exportElderOutlineNote({
        title: target.title,
        pubLabel: target.pubLabel,
        format,
        value: editorValue,
        preserveFormatting: exportWithFormatting,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível exportar.');
      }
    } finally {
      setExporting(null);
    }
  };

  const handleRestoreOriginal = async () => {
    setRestoreConfirm(false);
    setLoading(true);
    setMessage(null);
    const source = await loadOutlineSourceText(target.pub, target.documentId);
    if (!source) {
      setMessage('Não foi possível ler o esboço original.');
      setLoading(false);
      return;
    }
    setEditorValue(source);
    setEditorRevision((current) => current + 1);
    await persist(source);
    setLoading(false);
    setMessage('Esboço original restaurado, com os links de pesquisa.');
  };

  const enterPresentation = async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      await persist(editorValue);
    }
    setViewMode('present');
    setPanelOpen(false);
    setReference(null);
  };

  if (viewMode === 'present') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-jw-bg">
        <header className="flex shrink-0 items-center gap-3 border-b border-jw-border bg-jw-surface px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setViewMode('edit');
              setPanelOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
          >
            <IconChevronLeft className="h-4 w-4" />
            Editar
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-jw-text">Proferimento</p>
            <p className="truncate text-xs text-jw-muted">{target.title}</p>
          </div>
          {!panelOpen ? (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple"
            >
              Referências
            </button>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-auto px-6 py-6 sm:px-10 sm:py-8">
            <BibleLinkedReader
              value={editorValue}
              size="large"
              onBibleLinkClick={(href, label) => void openReference(href, label)}
            />
          </div>

          {panelOpen ? (
            <SidePanel
              open={panelOpen}
              tab="references"
              onTabChange={setPanelTab}
              onClose={() => setPanelOpen(false)}
              referenceLoading={referenceLoading}
              reference={reference}
              downloading={downloading}
              downloadPercent={downloadPercent}
              onLinkClick={(href, label) => void openReference(href, label)}
              onDownloadPublication={() => void handleDownloadPublication()}
              assistantContext={assistantContext}
              hideAssistant
              outlineResearch={outlineResearch}
            />
          ) : null}
        </div>
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
          Voltar
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-jw-text">
            {preparedName ?? target.title}
          </p>
          <p className="truncate text-xs text-jw-muted">
            {target.pubLabel}
            {preparedId ? ' · esboço preparado' : ' · rascunho de trabalho'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saving ? <span className="text-xs text-jw-muted">Salvando rascunho…</span> : null}
          <button
            type="button"
            disabled={loading || savingPrepared || !editorValue.trim()}
            onClick={() => void handleSavePrepared()}
            className="rounded-lg bg-jw-purple px-3 py-1.5 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {savingPrepared ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setRestoreConfirm(true)}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-muted hover:border-jw-purple hover:text-jw-text disabled:opacity-50"
          >
            Restaurar original
          </button>
          <button
            type="button"
            disabled={loading || !editorValue.trim()}
            onClick={() => void enterPresentation()}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-50"
          >
            Proferimento
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
            disabled={!!exporting || loading || !editorValue.trim()}
            onClick={() => void handleExportTablet()}
            className="rounded-lg border border-jw-purple px-3 py-1.5 text-sm font-medium text-jw-purple hover:bg-jw-purple hover:text-white disabled:opacity-50"
          >
            {exporting === 'tablet' ? 'Exportando…' : 'Exportar pro tablet'}
          </button>
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
          {!panelOpen ? (
            <button
              type="button"
              onClick={() => {
                setPanelOpen(true);
                setPanelTab('assistant');
              }}
              className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple"
            >
              Referências / IA
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="elder-outline-editor flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-6 pr-4 py-4 sm:pl-8 sm:pr-6">
          {message ? (
            <p className="mb-3 shrink-0 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
              {message}
            </p>
          ) : null}
          {restoreConfirm ? (
            <div className="mb-3 shrink-0 rounded-lg border border-jw-purple/40 bg-jw-purple-light px-3 py-2">
              <p className="text-sm text-jw-text">
                Restaurar o texto do esboço original? As edições neste documento serão substituídas (o .jwpub original
                não muda).
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRestoreConfirm(false)}
                  className="rounded-md border border-jw-border bg-white px-3 py-1 text-sm text-jw-text hover:border-jw-purple"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleRestoreOriginal()}
                  className="rounded-md bg-jw-purple px-3 py-1 text-sm font-medium text-white hover:bg-jw-purple-dark"
                >
                  Restaurar
                </button>
              </div>
            </div>
          ) : null}
          <div className="mb-2 shrink-0">
            <h3 className="text-sm font-semibold text-jw-text">Esboço de trabalho</h3>
            <p className="text-xs text-jw-muted">
              Cópia editável do esboço — o original permanece intacto. Citações bíblicas e matérias de pesquisa viram
              links. Botão direito numa palavra consulta o dicionário.
            </p>
          </div>
          <OutlineAdditionalResearch
            research={outlineResearch}
            supportPubs={supportPubs}
            downloading={downloading}
            downloadJob={downloadJob}
            downloadPercent={downloadPercent}
            downloadFailures={downloadFailures}
            onRetryDownloads={() => {
              autoDownloadKeyRef.current = null;
              setDownloadFailures([]);
              setPrepDownloadNonce((current) => current + 1);
            }}
            speakerGuidelinesAvailable={speakerGuidelinesAvailable}
            missingResearchLinks={
              outlineResearch.length > 0 && Boolean(editorValue.trim()) && !outlineHasResearchLinks(editorValue)
            }
            onOpenResearch={openResearch}
          />
          {loading ? (
            <p className="text-sm text-jw-muted">Carregando esboço…</p>
          ) : (
            <BibleLinkedEditor
              key={`${target.pub}-${target.documentId}-${target.preparedId ?? 'draft'}`}
              fillHeight
              richText
              revision={editorRevision}
              value={editorValue}
              onChange={handleEditorChange}
              onBibleLinkClick={(href, label) => void openReference(href, label)}
              placeholder="O esboço aparecerá aqui para você editar…"
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
            downloading={downloading}
            downloadPercent={downloadPercent}
            onLinkClick={(href, label) => void openReference(href, label)}
            onDownloadPublication={() => void handleDownloadPublication()}
            assistantContext={assistantContext}
            onApplyOutline={handleApplyOutlineFromAssistant}
            outlineResearch={outlineResearch}
          />
        ) : null}
      </div>

      <SavePreparedOutlineModal
        open={Boolean(saveConflict)}
        existingName={saveConflict?.name ?? ''}
        defaultNewName={suggestCopyName(saveConflict?.name ?? target.title)}
        saving={savingPrepared}
        onOverwrite={() => {
          if (saveConflict) void commitPreparedSave(saveConflict.name, saveConflict.id);
        }}
        onSaveAsNew={(name) => void commitPreparedSave(name)}
        onCancel={() => setSaveConflict(null)}
      />
    </div>
  );
}
