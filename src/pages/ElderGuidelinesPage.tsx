import { useMemo, useState } from 'react';
import { IconChevronLeft, IconGuidelineList } from '@/components/Icons';
import {
  buildVisibleGuidelineSections,
  type ElderGuidelineItem,
} from '@/lib/elder-guidelines';
import type { InstalledElderGuideline } from '../../electron/types';

type ElderGuidelinesPageProps = {
  availablePubs: Set<string>;
  installed: InstalledElderGuideline[];
  onBack: () => void;
  onOpenItem: (item: ElderGuidelineItem) => void;
  onImportGuidelines: () => Promise<{ ok: boolean; message?: string }>;
};

export function ElderGuidelinesPage({
  availablePubs,
  installed,
  onBack,
  onOpenItem,
  onImportGuidelines,
}: ElderGuidelinesPageProps) {
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const visibleSections = useMemo(
    () => buildVisibleGuidelineSections(availablePubs, installed),
    [availablePubs, installed],
  );

  const handleImport = async () => {
    setImporting(true);
    setImportMessage(null);
    try {
      const result = await onImportGuidelines();
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

        <header className="mb-6 border-b border-jw-border pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-jw-text">Orientações</h2>
              <p className="mt-1 text-sm text-jw-muted">Português (Brasil)</p>
            </div>
            <button
              type="button"
              disabled={importing}
              onClick={() => void handleImport()}
              className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
            >
              {importing ? 'Importando…' : 'Adicionar orientações'}
            </button>
          </div>
        </header>

        {importMessage ? (
          <p className="mb-4 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
            {importMessage}
          </p>
        ) : null}

        {visibleSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-jw-border bg-jw-surface/60 px-6 py-10 text-center">
            <p className="text-sm text-jw-muted">
              Nenhuma orientação instalada. Use <strong>Adicionar orientações</strong> para importar arquivos{' '}
              <strong>.jwpub</strong> baixados do JW Library (ex.: S-38_T.jwpub, CO-160_T.jwpub).
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {visibleSections.map((section) => (
              <section key={section.id}>
                {section.title ? (
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-jw-muted">{section.title}</h3>
                ) : null}
                <ul className="overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-sm">
                  {section.items.map((item, index) => (
                    <li key={item.id}>
                      <GuidelineRow item={item} onOpen={() => onOpenItem(item)} />
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

function GuidelineRow({ item, onOpen }: { item: ElderGuidelineItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-jw-purple-light/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-jw-purple">
        <IconGuidelineList className="h-8 w-8" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug text-jw-text">{item.title}</span>
        <span className="mt-0.5 block text-sm text-jw-muted">{item.label}</span>
      </span>
    </button>
  );
}
