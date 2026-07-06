import { useMemo, useState } from 'react';
import { IconChevronLeft, IconOutlineDocument, IconOutlinePodium } from '@/components/Icons';
import { ElderJwBrowserSplit } from '@/components/ElderJwBrowserSplit';
import { ElderPreparedOutlinesPanel } from '@/components/ElderPreparedOutlinesPanel';
import {
  buildVisibleOutlineSections,
  type ElderOutlineItem,
} from '@/lib/elder-outlines';
import type { InstalledElderOutline, PreparedElderOutline } from '../../electron/types';

export type ElderOutlinesTab = 'catalog' | 'prepared';

type ElderOutlinesPageProps = {
  tab: ElderOutlinesTab;
  availablePubs: Set<string>;
  installed: InstalledElderOutline[];
  onTabChange: (tab: ElderOutlinesTab) => void;
  onBack: () => void;
  onOpenItem: (item: ElderOutlineItem) => void;
  onOpenPrepared: (item: PreparedElderOutline) => void;
  onImportOutlines: () => Promise<{ ok: boolean; message?: string }>;
  onDeleteOutline?: (pub: string) => Promise<{ ok: boolean; message?: string }>;
  onJwpubInstalled?: () => void;
};

export function ElderOutlinesPage({
  tab,
  availablePubs,
  installed,
  onTabChange,
  onBack,
  onOpenItem,
  onOpenPrepared,
  onImportOutlines,
  onDeleteOutline,
  onJwpubInstalled,
}: ElderOutlinesPageProps) {
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [deletingPub, setDeletingPub] = useState<string | null>(null);
  const [jwBrowserOpen, setJwBrowserOpen] = useState(false);

  const visibleSections = useMemo(
    () => buildVisibleOutlineSections(availablePubs, installed),
    [availablePubs, installed],
  );

  const handleImport = async () => {
    setImporting(true);
    setImportMessage(null);
    try {
      const result = await onImportOutlines();
      if (result.message) setImportMessage(result.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (item: ElderOutlineItem) => {
    if (!onDeleteOutline) return;
    const installedEntry = installed.find((entry) => entry.pub.toLowerCase() === item.pub.toLowerCase());
    const confirmLabel = installedEntry?.label ?? item.label;
    const multiHint =
      installedEntry?.multiDocument || item.pub.toLowerCase() === 's-34'
        ? ' Todos os discursos desta publicação serão removidos.'
        : '';
    if (!window.confirm(`Remover ${confirmLabel} deste dispositivo?${multiHint}`)) return;

    setDeletingPub(item.pub);
    setImportMessage(null);
    try {
      const result = await onDeleteOutline(item.pub);
      if (result.message) setImportMessage(result.message);
    } finally {
      setDeletingPub(null);
    }
  };

  const catalogContent = (
    <div className={`px-4 py-4 sm:px-6 ${jwBrowserOpen ? '' : 'mx-auto max-w-3xl'}`}>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
      >
        <IconChevronLeft className="h-4 w-4" />
        Elder
      </button>

      <header className="mb-4 border-b border-jw-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-jw-text">Esboços</h2>
            <p className="mt-1 text-sm text-jw-muted">Português (Brasil)</p>
          </div>
          {tab === 'catalog' ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setJwBrowserOpen((open) => !open)}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-medium transition',
                  jwBrowserOpen
                    ? 'bg-jw-purple text-white hover:bg-jw-purple-dark'
                    : 'border border-jw-purple text-jw-purple hover:bg-jw-purple-light',
                ].join(' ')}
              >
                {jwBrowserOpen ? 'JW.ORG aberto' : 'Baixar do JW.ORG'}
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => void handleImport()}
                className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
              >
                {importing ? 'Importando…' : 'Adicionar esboços'}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mb-6 flex gap-1 rounded-lg bg-jw-bg p-1">
        <TabButton active={tab === 'catalog'} onClick={() => onTabChange('catalog')}>
          Catálogo
        </TabButton>
        <TabButton active={tab === 'prepared'} onClick={() => onTabChange('prepared')}>
          Esboços preparados
        </TabButton>
      </div>

      {importMessage ? (
        <p className="mb-4 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
          {importMessage}
        </p>
      ) : null}

      {tab === 'prepared' ? (
        <ElderPreparedOutlinesPanel onOpenPrepared={onOpenPrepared} />
      ) : visibleSections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-jw-border bg-jw-surface/60 px-6 py-10 text-center">
          <p className="text-sm text-jw-muted">
            Nenhum esboço instalado. Use <strong>Baixar do JW.ORG</strong> ou{' '}
            <strong>Adicionar esboços</strong> para importar arquivos <strong>.jwpub</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleSections.map((section) => (
            <section key={section.id}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-jw-muted">{section.title}</h3>
              <ul className="overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-sm">
                {section.items.map((item, index) => (
                  <li key={item.id}>
                    <OutlineRow
                      item={item}
                      onOpen={() => onOpenItem(item)}
                      onDelete={onDeleteOutline ? () => void handleDelete(item) : undefined}
                      deleting={deletingPub === item.pub}
                      compact={jwBrowserOpen}
                    />
                    {index < section.items.length - 1 ? (
                      <div className="ml-[4.25rem] border-b border-jw-border" />
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {tab === 'catalog' ? (
        <ElderJwBrowserSplit
          browserOpen={jwBrowserOpen}
          elderCatalog="outlines"
          onCloseBrowser={() => setJwBrowserOpen(false)}
          onJwpubInstalled={() => {
            onJwpubInstalled?.();
            setImportMessage('Esboço instalado com sucesso.');
          }}
        >
          {catalogContent}
        </ElderJwBrowserSplit>
      ) : (
        catalogContent
      )}
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
      className={[
        'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
        active ? 'bg-jw-surface text-jw-purple shadow-sm' : 'text-jw-muted hover:text-jw-text',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function OutlineRow({
  item,
  onOpen,
  onDelete,
  deleting,
  compact,
}: {
  item: ElderOutlineItem;
  onOpen: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  compact?: boolean;
}) {
  const Icon = item.icon === 'podium' ? IconOutlinePodium : IconOutlineDocument;

  return (
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition hover:bg-jw-purple-light/40 sm:gap-4 sm:px-4 sm:py-3.5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center text-jw-purple sm:h-10 sm:w-10">
          <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block leading-snug text-jw-text ${compact ? 'text-sm' : 'text-[15px]'}`}>
            {item.title}
          </span>
          <span className="mt-0.5 block text-sm text-jw-muted">{item.label}</span>
        </span>
      </button>
      {onDelete ? (
        <button
          type="button"
          aria-label={`Remover ${item.label}`}
          title="Remover deste dispositivo"
          disabled={deleting}
          onClick={onDelete}
          className="shrink-0 border-l border-jw-border px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 sm:px-4"
        >
          {deleting ? '…' : compact ? '×' : 'Remover'}
        </button>
      ) : null}
    </div>
  );
}
