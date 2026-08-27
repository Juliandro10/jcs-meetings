import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { BibleLinkedEditor } from '@/components/BibleLinkedEditor';
import { IconChevronLeft } from '@/components/Icons';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import { readBibleEdition } from '@/lib/bible-edition';
import { outlineHtmlToPlainText } from '@/lib/outline-html-to-text';
import type { ImportedDocument, ImportedDocumentKind, ImportedDocumentListItem } from '../../electron/types';
import type { ResolveLinkResult } from '../../electron/types';

function kindLabel(kind: ImportedDocumentKind) {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'docx') return 'Word (.docx)';
  if (kind === 'doc') return 'Word (.doc)';
  if (kind === 'txt') return 'Texto';
  return 'Arquivo';
}

function formatUpdatedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function getSelectedTextFromEditor() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return undefined;
  const root = document.querySelector<HTMLElement>('.imported-doc-editor .jcs-rich-editor');
  if (!root) return undefined;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus || !root.contains(anchor) || !root.contains(focus)) return undefined;
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  return text.length >= 3 ? text : undefined;
}

export function ImportedDocumentsPage() {
  const [items, setItems] = useState<ImportedDocumentListItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [currentDoc, setCurrentDoc] = useState<ImportedDocument | null>(null);
  const [title, setTitle] = useState('');
  const [editorValue, setEditorValue] = useState('');
  const [editorRevision, setEditorRevision] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('assistant');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const [selectedText, setSelectedText] = useState<string | undefined>();
  const saveTimer = useRef<number | null>(null);

  const loadList = useCallback(async () => {
    if (!window.jcs?.listImportedDocuments) {
      setMessage('Abra o app pelo Electron para importar documentos.');
      setItems([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    try {
      const result = await window.jcs.listImportedDocuments();
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível carregar os documentos.');
        setItems([]);
        return;
      }
      setItems(result.items ?? []);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const persist = useCallback(
    async (nextTitle: string, nextBody: string) => {
      if (!window.jcs?.saveImportedDocument || !openId) return;
      setSaving(true);
      try {
        const result = await window.jcs.saveImportedDocument({
          id: openId,
          title: nextTitle,
          body: nextBody,
        });
        if (!result.ok) {
          setMessage(result.error ?? 'Não foi possível salvar.');
        }
      } finally {
        setSaving(false);
      }
    },
    [openId],
  );

  const openDocument = useCallback(async (id: string) => {
    if (!window.jcs?.getImportedDocument) return;
    setDocLoading(true);
    setMessage(null);
    setOpenId(id);
    try {
      const result = await window.jcs.getImportedDocument(id);
      if (!result.ok || !result.item) {
        setMessage(result.error ?? 'Não foi possível abrir o documento.');
        setOpenId(null);
        setCurrentDoc(null);
        return;
      }
      setCurrentDoc(result.item);
      setTitle(result.item.title);
      setEditorValue(result.item.body);
      setEditorRevision((current) => current + 1);
    } finally {
      setDocLoading(false);
    }
  }, []);

  const handleImport = async () => {
    if (!window.jcs?.importDocumentFile) {
      setMessage('Importação disponível apenas no app Electron.');
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const result = await window.jcs.importDocumentFile();
      if (result.cancelled) return;
      if (!result.ok || !result.item) {
        setMessage(result.error ?? 'Não foi possível importar o arquivo.');
        return;
      }
      await loadList();
      await openDocument(result.item.id);
      setMessage(
        result.item.sourceKind === 'pdf'
          ? 'PDF importado com as páginas visíveis e o texto extraído. As imagens vão no tablet ao exportar.'
          : 'Documento importado. Imagens do Word entram no editor e no tablet.',
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (item: ImportedDocumentListItem) => {
    if (!window.jcs?.deleteImportedDocument) return;
    if (!window.confirm(`Excluir “${item.title}”?`)) return;
    const result = await window.jcs.deleteImportedDocument(item.id);
    if (!result.ok) {
      setMessage(result.error ?? 'Não foi possível excluir.');
      return;
    }
    if (openId === item.id) {
      setOpenId(null);
      setCurrentDoc(null);
    }
    await loadList();
  };

  const flushDraft = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await persist(title, editorValue);
    }
  }, [editorValue, persist, title]);

  const handleEditorChange = (nextValue: string) => {
    setEditorValue(nextValue);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(title, nextValue);
    }, 600);
  };

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(nextTitle, editorValue);
    }, 600);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  useEffect(() => {
    const syncSelection = () => setSelectedText(getSelectedTextFromEditor());
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [openId]);

  const openReference = useCallback(async (href: string, linkLabel: string) => {
    if (!window.jcs?.resolveLink) return;
    setPanelOpen(true);
    setPanelTab('references');
    setReferenceLoading(true);
    setReference(null);
    const result = await window.jcs.resolveLink({
      href,
      linkLabel,
      sourcePub: 'imported',
      sourceIssue: '',
      bibleEdition: readBibleEdition(),
    });
    setReference(result);
    setReferenceLoading(false);
  }, []);

  const handleApplyFromAssistant = useCallback(
    (html: string) => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      setEditorValue(html);
      setEditorRevision((current) => current + 1);
      setMessage('Assistente aplicou o texto no documento.');
      void persist(title, html);
    },
    [persist, title],
  );

  const assistantContext = useMemo(
    () => ({
      contentKind: 'elder-outline' as const,
      weekLabel: 'Documentos importados',
      publicationTitle: title || currentDoc?.sourceFileName || 'Documento',
      selectedText,
      sourcePub: 'imported',
      sourceIssue: '',
      preparedOutlineText: outlineHtmlToPlainText(editorValue),
      referenceTitle: reference?.ok ? reference.title : undefined,
      referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
    }),
    [currentDoc?.sourceFileName, editorValue, reference, selectedText, title],
  );

  const handleExportTablet = async () => {
    if (!window.jcs?.exportReadImportedDocument || !currentDoc) {
      setMessage('Exportação para tablet disponível apenas no app Electron.');
      return;
    }
    if (!editorValue.trim()) {
      setMessage('Não há conteúdo no documento para exportar.');
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      await flushDraft();
      const result = await window.jcs.exportReadImportedDocument(
        {
          id: currentDoc.id,
          title: title.trim() || currentDoc.title,
          sourceFileName: currentDoc.sourceFileName,
          value: editorValue,
        },
        { preferLastFolder: true },
      );
      if (result.ok) {
        setMessage('Documento exportado para o tablet. Envie jcs-read.zip ao JCS Read.');
      } else {
        setMessage(result.error ?? 'Não foi possível exportar para o tablet.');
      }
    } finally {
      setExporting(false);
    }
  };

  if (openId && currentDoc) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-jw-bg">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-jw-border bg-jw-surface px-4 py-3">
          <button
            type="button"
            onClick={() => {
              void flushDraft();
              void loadList();
              setOpenId(null);
              setCurrentDoc(null);
              setMessage(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
          >
            <IconChevronLeft className="h-4 w-4" />
            Documentos
          </button>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm font-medium text-jw-text outline-none hover:border-jw-border focus:border-jw-purple"
            />
            <p className="truncate px-1 text-xs text-jw-muted">
              {kindLabel(currentDoc.sourceKind)} · {currentDoc.sourceFileName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saving ? <span className="text-xs text-jw-muted">Salvando…</span> : null}
            <button
              type="button"
              disabled={docLoading || exporting || !editorValue.trim()}
              onClick={() => void handleExportTablet()}
              className="rounded-lg border border-jw-purple px-3 py-1.5 text-sm font-medium text-jw-purple hover:bg-jw-purple hover:text-white disabled:opacity-50"
            >
              {exporting ? 'Exportando…' : 'Exportar pro tablet'}
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
          <div className="imported-doc-editor flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-6 pr-4 py-4 sm:pl-8 sm:pr-6">
            {message ? (
              <p className="mb-3 shrink-0 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
                {message}
              </p>
            ) : null}
            {currentDoc.sourceKind === 'pdf' ? (
              <p className="mb-3 shrink-0 text-xs text-jw-muted">
                As páginas do PDF são o documento. Faixas lilás marcam textos bíblicos e cânticos para tocar no
                tablet. Importe o arquivo de novo se este documento ainda tiver o “texto extraído” antigo.
              </p>
            ) : null}
            {docLoading ? (
              <p className="text-sm text-jw-muted">Carregando documento…</p>
            ) : (
              <BibleLinkedEditor
                key={currentDoc.id}
                fillHeight
                richText
                revision={editorRevision}
                value={editorValue}
                onChange={handleEditorChange}
                onBibleLinkClick={(href, label) => void openReference(href, label)}
                placeholder="O texto importado aparece aqui para você editar…"
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
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-jw-text">Meus documentos</h2>
          <p className="text-sm text-jw-muted">
            Importe PDF, Word ou texto. As páginas/imagens entram no editor e vão no JCS Read ao exportar.
          </p>
        </div>
        <button
          type="button"
          disabled={importing}
          onClick={() => void handleImport()}
          className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
        >
          {importing ? 'Importando…' : 'Importar PDF ou Word'}
        </button>
      </div>

      {message ? (
        <p className="mb-4 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">{message}</p>
      ) : null}

      {listLoading ? (
        <p className="py-10 text-center text-sm text-jw-muted">Carregando documentos…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-jw-border bg-jw-surface px-6 py-10 text-center">
          <p className="text-sm text-jw-text">Nenhum documento importado ainda.</p>
          <p className="mt-1 text-sm text-jw-muted">
            Use o botão acima para abrir um arquivo da área de trabalho, como um TPO em PDF.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-jw-border rounded-xl border border-jw-border bg-jw-surface">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => void openDocument(item.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-jw-text">{item.title}</p>
                <p className="truncate text-xs text-jw-muted">
                  {kindLabel(item.sourceKind)} · {item.sourceFileName}
                  {item.updatedAt ? ` · ${formatUpdatedAt(item.updatedAt)}` : ''}
                </p>
              </button>
              <button
                type="button"
                onClick={() => void openDocument(item.id)}
                className="rounded-lg border border-jw-purple px-3 py-1.5 text-sm text-jw-purple hover:bg-jw-purple hover:text-white"
              >
                Abrir
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(item)}
                className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-muted hover:border-red-300 hover:text-red-700"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
