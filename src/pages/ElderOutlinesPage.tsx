import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconChevronLeft, IconOutlineDocument, IconOutlinePodium } from '@/components/Icons';
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
}: ElderOutlinesPageProps) {
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

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

  return (
    <div className="px-6 py-4">
      <div className="mx-auto max-w-3xl">
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
              <button
                type="button"
                disabled={importing}
                onClick={() => void handleImport()}
                className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
              >
                {importing ? 'Importando…' : 'Adicionar esboços'}
              </button>
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
              Nenhum esboço instalado. Use <strong>Adicionar esboços</strong> para importar arquivos{' '}
              <strong>.jwpub</strong> baixados do JW Library (ex.: S-34_T.jwpub).
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {visibleSections.map((section) => (
              <section key={section.id}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-jw-muted">{section.title}</h3>
                <ul className="overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-sm">
                  {section.items.map((item, index) => (
                    <li key={item.id}>
                      <OutlineRow item={item} onOpen={() => onOpenItem(item)} />
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

function OutlineRow({ item, onOpen }: { item: ElderOutlineItem; onOpen: () => void }) {
  const Icon = item.icon === 'podium' ? IconOutlinePodium : IconOutlineDocument;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-jw-purple-light/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-jw-purple">
        <Icon className="h-8 w-8" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug text-jw-text">{item.title}</span>
        <span className="mt-0.5 block text-sm text-jw-muted">{item.label}</span>
      </span>
    </button>
  );
}
