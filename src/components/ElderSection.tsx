import { useCallback, useEffect, useState } from 'react';
import {
  ElderGuidelineReaderPage,
  type ElderGuidelineReaderTarget,
} from '@/pages/ElderGuidelineReaderPage';
import { ElderGuidelinesPage } from '@/pages/ElderGuidelinesPage';
import { ElderOutlineDocumentsPage } from '@/pages/ElderOutlineDocumentsPage';
import { ElderOutlineReaderPage } from '@/pages/ElderOutlineReaderPage';
import { ElderOutlinesPage, type ElderOutlinesTab } from '@/pages/ElderOutlinesPage';
import { ElderMeetingEditorPage } from '@/pages/ElderMeetingEditorPage';
import { ElderMeetingsPage } from '@/pages/ElderMeetingsPage';
import { ElderPage } from '@/pages/ElderPage';
import { ELDER_GUIDELINE_SECTIONS, type ElderGuidelineItem } from '@/lib/elder-guidelines';
import { ELDER_OUTLINE_SECTIONS } from '@/lib/elder-outlines';
import type { InstalledElderGuideline, InstalledElderOutline, PreparedElderOutline } from '../../electron/types';

export type ElderOutlineReaderTarget = {
  pub: string;
  documentId: number;
  title: string;
  pubLabel: string;
  preparedId?: string;
  preparedName?: string;
};

type ElderSectionView =
  | { kind: 'hub' }
  | { kind: 'meetings' }
  | { kind: 'meeting-editor'; id: string }
  | { kind: 'outlines'; tab: ElderOutlinesTab }
  | { kind: 'outline-documents'; pub: string; title: string; label: string }
  | { kind: 'outline-reader'; target: ElderOutlineReaderTarget; back: 'outlines' | 'outline-documents' }
  | { kind: 'guidelines' }
  | { kind: 'guideline-documents'; pub: string; title: string; label: string }
  | {
      kind: 'guideline-reader';
      target: ElderGuidelineReaderTarget;
      back: 'guidelines' | 'guideline-documents';
    };

const STATIC_OUTLINE_PUBS = [
  ...new Set(ELDER_OUTLINE_SECTIONS.flatMap((section) => section.items.map((item) => item.pub))),
];

const STATIC_GUIDELINE_PUBS = [
  ...new Set(ELDER_GUIDELINE_SECTIONS.flatMap((section) => section.items.map((item) => item.pub))),
];

export function ElderSection({ onLockElder }: { onLockElder?: () => void }) {
  const [view, setView] = useState<ElderSectionView>({ kind: 'hub' });
  const [availableOutlinePubs, setAvailableOutlinePubs] = useState<Set<string>>(new Set());
  const [installedOutlines, setInstalledOutlines] = useState<InstalledElderOutline[]>([]);
  const [availableGuidelinePubs, setAvailableGuidelinePubs] = useState<Set<string>>(new Set());
  const [installedGuidelines, setInstalledGuidelines] = useState<InstalledElderGuideline[]>([]);

  const refreshOutlineCatalog = useCallback(async () => {
    if (window.jcs?.listInstalledElderOutlines) {
      const result = await window.jcs.listInstalledElderOutlines();
      const items = result.items ?? [];
      setInstalledOutlines(items);
      setAvailableOutlinePubs(new Set(items.map((item) => item.pub.toLowerCase())));
      return;
    }

    if (window.jcs?.getElderOutlineAvailability) {
      const status = await window.jcs.getElderOutlineAvailability({ pubs: STATIC_OUTLINE_PUBS });
      setAvailableOutlinePubs(
        new Set(Object.entries(status).filter(([, ok]) => ok).map(([pub]) => pub.toLowerCase())),
      );
    }
  }, []);

  const refreshGuidelineCatalog = useCallback(async () => {
    if (window.jcs?.listInstalledElderGuidelines) {
      const result = await window.jcs.listInstalledElderGuidelines();
      const items = result.items ?? [];
      setInstalledGuidelines(items);
      setAvailableGuidelinePubs(new Set(items.map((item) => item.pub.toLowerCase())));
      return;
    }

    if (window.jcs?.getElderGuidelineAvailability) {
      const status = await window.jcs.getElderGuidelineAvailability({ pubs: STATIC_GUIDELINE_PUBS });
      setAvailableGuidelinePubs(
        new Set(Object.entries(status).filter(([, ok]) => ok).map(([pub]) => pub.toLowerCase())),
      );
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshOutlineCatalog(), refreshGuidelineCatalog()]);
  }, [refreshGuidelineCatalog, refreshOutlineCatalog]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (view.kind === 'outlines') void refreshOutlineCatalog();
    if (view.kind === 'guidelines') void refreshGuidelineCatalog();
  }, [view.kind, refreshGuidelineCatalog, refreshOutlineCatalog]);

  const handleImportOutlines = useCallback(async () => {
    if (!window.jcs?.importElderOutlineJwpub) {
      return { ok: false, message: 'Importação disponível apenas no app Electron.' };
    }
    const result = await window.jcs.importElderOutlineJwpub();
    await refreshOutlineCatalog();

    if (result.imported?.length) {
      const names = result.imported.map((item) => item.label).join(', ');
      const errPart =
        result.errors?.length ? ` Avisos: ${result.errors.slice(0, 2).join(' ')}` : '';
      return { ok: true, message: `Importado(s): ${names}.${errPart}` };
    }
    if (result.errors?.length) {
      return { ok: false, message: result.errors.join(' ') };
    }
    return { ok: false, message: result.error ?? 'Nenhum esboço importado.' };
  }, [refreshOutlineCatalog]);

  const handleImportGuidelines = useCallback(async () => {
    if (!window.jcs?.importElderGuidelineJwpub) {
      return { ok: false, message: 'Importação disponível apenas no app Electron.' };
    }
    const result = await window.jcs.importElderGuidelineJwpub();
    await refreshGuidelineCatalog();

    if (result.imported?.length) {
      const names = result.imported.map((item) => item.label).join(', ');
      const errPart =
        result.errors?.length ? ` Avisos: ${result.errors.slice(0, 2).join(' ')}` : '';
      return { ok: true, message: `Importado(s): ${names}.${errPart}` };
    }
    if (result.errors?.length) {
      return { ok: false, message: result.errors.join(' ') };
    }
    return { ok: false, message: result.error ?? 'Nenhuma orientação importada.' };
  }, [refreshGuidelineCatalog]);

  const openGuidelineItem = useCallback((item: ElderGuidelineItem) => {
    void (async () => {
      if (item.documentId !== undefined) {
        setView({
          kind: 'guideline-reader',
          target: {
            pub: item.pub,
            documentId: item.documentId,
            title: item.title,
            pubLabel: item.label,
          },
          back: 'guidelines',
        });
        return;
      }

      if (!window.jcs?.listElderOutlineDocuments) {
        setView({
          kind: 'guideline-documents',
          pub: item.pub,
          title: item.title,
          label: item.label,
        });
        return;
      }

      const result = await window.jcs.listElderOutlineDocuments({ pub: item.pub });
      const docs = result.documents ?? [];
      const readable = docs.length > 1 ? docs.filter((doc) => doc.documentId !== 0) : docs;
      const pickFrom = readable.length > 0 ? readable : docs;

      if (result.ok && pickFrom.length === 1) {
        setView({
          kind: 'guideline-reader',
          target: {
            pub: item.pub,
            documentId: pickFrom[0]!.documentId,
            title: pickFrom[0]!.title,
            pubLabel: item.label,
          },
          back: 'guidelines',
        });
        return;
      }

      setView({
        kind: 'guideline-documents',
        pub: item.pub,
        title: item.title,
        label: item.label,
      });
    })();
  }, []);

  if (view.kind === 'hub') {
    return (
      <ElderPage
        onOpenOutlines={() => setView({ kind: 'outlines', tab: 'catalog' })}
        onOpenGuidelines={() => setView({ kind: 'guidelines' })}
        onOpenMeetings={() => setView({ kind: 'meetings' })}
        onLockElder={onLockElder}
      />
    );
  }

  if (view.kind === 'meetings') {
    return (
      <ElderMeetingsPage
        onBack={() => setView({ kind: 'hub' })}
        onOpenMeeting={(id) => setView({ kind: 'meeting-editor', id })}
        onCreateMeeting={async () => {
          if (!window.jcs?.createElderMeeting) return null;
          const result = await window.jcs.createElderMeeting();
          return result.ok && result.item ? result.item.id : null;
        }}
      />
    );
  }

  if (view.kind === 'meeting-editor') {
    return (
      <ElderMeetingEditorPage
        meetingId={view.id}
        onBack={() => setView({ kind: 'meetings' })}
      />
    );
  }

  if (view.kind === 'outlines') {
    return (
      <ElderOutlinesPage
        tab={view.tab}
        availablePubs={availableOutlinePubs}
        installed={installedOutlines}
        onTabChange={(tab) => setView({ kind: 'outlines', tab })}
        onBack={() => setView({ kind: 'hub' })}
        onImportOutlines={handleImportOutlines}
        onOpenItem={(item) => {
          if (item.documentId !== undefined) {
            setView({
              kind: 'outline-reader',
              target: {
                pub: item.pub,
                documentId: item.documentId,
                title: item.title,
                pubLabel: item.label,
              },
              back: 'outlines',
            });
            return;
          }
          setView({
            kind: 'outline-documents',
            pub: item.pub,
            title: item.title,
            label: item.label,
          });
        }}
        onOpenPrepared={(item: PreparedElderOutline) =>
          setView({
            kind: 'outline-reader',
            target: {
              pub: item.pub,
              documentId: item.documentId,
              title: item.sourceTitle,
              pubLabel: item.sourcePubLabel,
              preparedId: item.id,
              preparedName: item.name,
            },
            back: 'outlines',
          })
        }
      />
    );
  }

  if (view.kind === 'guidelines') {
    return (
      <ElderGuidelinesPage
        availablePubs={availableGuidelinePubs}
        installed={installedGuidelines}
        onBack={() => setView({ kind: 'hub' })}
        onImportGuidelines={handleImportGuidelines}
        onOpenItem={openGuidelineItem}
      />
    );
  }

  if (view.kind === 'outline-documents') {
    return (
      <ElderOutlineDocumentsPage
        pub={view.pub}
        title={view.title}
        label={view.label}
        onBack={() => setView({ kind: 'outlines', tab: 'catalog' })}
        onOpenDocument={(documentId, title) =>
          setView({
            kind: 'outline-reader',
            target: {
              pub: view.pub,
              documentId,
              title,
              pubLabel: view.label,
            },
            back: 'outline-documents',
          })
        }
      />
    );
  }

  if (view.kind === 'guideline-documents') {
    return (
      <ElderOutlineDocumentsPage
        pub={view.pub}
        title={view.title}
        label={view.label}
        backLabel="Orientações"
        loadingLabel="Carregando documentos…"
        errorFallback="Não foi possível carregar a orientação."
        skipCoverWhenMulti
        onBack={() => setView({ kind: 'guidelines' })}
        onOpenDocument={(documentId, title) =>
          setView({
            kind: 'guideline-reader',
            target: {
              pub: view.pub,
              documentId,
              title,
              pubLabel: view.label,
            },
            back: 'guideline-documents',
          })
        }
      />
    );
  }

  if (view.kind === 'guideline-reader') {
    return (
      <ElderGuidelineReaderPage
        target={view.target}
        onBack={() => {
          if (view.back === 'guideline-documents') {
            setView({
              kind: 'guideline-documents',
              pub: view.target.pub,
              title: view.target.title,
              label: view.target.pubLabel,
            });
            return;
          }
          setView({ kind: 'guidelines' });
        }}
      />
    );
  }

  const documentsView =
    view.target.pub === 's-34'
      ? {
          kind: 'outline-documents' as const,
          pub: 's-34',
          title: 'Esboços de Discursos Públicos',
          label: 'S-34 · 2025',
        }
      : null;

  const outlinesTab: ElderOutlinesTab = view.target.preparedId ? 'prepared' : 'catalog';

  return (
    <ElderOutlineReaderPage
      target={view.target}
      onBack={() => {
        if (view.back === 'outline-documents' && documentsView) {
          setView(documentsView);
          return;
        }
        setView({ kind: 'outlines', tab: outlinesTab });
      }}
    />
  );
}
