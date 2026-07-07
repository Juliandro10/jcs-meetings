import { useMemo, useState } from 'react';

import { IconChevronLeft, IconGuidelineList } from '@/components/Icons';

import { ElderJwBrowserSplit } from '@/components/ElderJwBrowserSplit';

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

  onJwpubInstalled?: () => void;

};



export function ElderGuidelinesPage({

  availablePubs,

  installed,

  onBack,

  onOpenItem,

  onImportGuidelines,

  onJwpubInstalled,

}: ElderGuidelinesPageProps) {

  const [importing, setImporting] = useState(false);

  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [jwBrowserOpen, setJwBrowserOpen] = useState(false);



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



      <header className="mb-6 border-b border-jw-border pb-4">

        <div className="flex flex-wrap items-start justify-between gap-3">

          <div>

            <h2 className="text-2xl font-semibold text-jw-text">Orientações</h2>

            <p className="mt-1 text-sm text-jw-muted">Português (Brasil)</p>

          </div>

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

              {importing ? 'Importando…' : 'Adicionar orientações'}

            </button>

          </div>

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

            Nenhuma orientação instalada. Use <strong>Baixar do JW.ORG</strong> ou{' '}

            <strong>Adicionar orientações</strong> para importar arquivos <strong>.jwpub</strong>.

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

                    <GuidelineRow

                      item={item}

                      compact={jwBrowserOpen}

                      onOpen={() => onOpenItem(item)}

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

      <ElderJwBrowserSplit

        browserOpen={jwBrowserOpen}

        elderCatalog="guidelines"

        onCloseBrowser={() => setJwBrowserOpen(false)}

        onJwpubInstalled={() => {

          onJwpubInstalled?.();

          setImportMessage('Orientação instalada com sucesso.');

        }}

      >

        {catalogContent}

      </ElderJwBrowserSplit>

    </div>

  );

}



function GuidelineRow({

  item,

  onOpen,

  compact,

}: {

  item: ElderGuidelineItem;

  onOpen: () => void;

  compact?: boolean;

}) {

  return (

    <button

      type="button"

      onClick={onOpen}

      className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-jw-purple-light/40 sm:gap-4 sm:px-4 sm:py-3.5"

    >

      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-jw-purple sm:h-10 sm:w-10">

        <IconGuidelineList className="h-7 w-7 sm:h-8 sm:w-8" />

      </span>

      <span className="min-w-0 flex-1">

        <span className={`block leading-snug text-jw-text ${compact ? 'text-sm' : 'text-[15px]'}`}>

          {item.title}

        </span>

        <span className="mt-0.5 block text-sm text-jw-muted">{item.label}</span>

      </span>

    </button>

  );

}


