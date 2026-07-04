import { useState } from 'react';
import { DictionaryPanel } from '@/components/DictionaryPanel';
import { PlaylistPanel } from '@/components/PlaylistPanel';
import { ResearchToolsPanel } from '@/components/ResearchToolsPanel';
import type { TeachingKitReaderTarget } from '@/pages/TeachingKitPublicationReaderPage';

type PersonalStudyPageProps = {
  elderLocked?: boolean;
  onRequestElderUnlock?: () => void;
  onOpenResearchPublication?: (target: TeachingKitReaderTarget) => void;
  onOpenDictionary?: (query?: string) => void;
  dictionaryDownloadPercent?: number;
  dictionaryDownloading?: boolean;
};

export function PersonalStudyPage({
  elderLocked,
  onRequestElderUnlock,
  onOpenResearchPublication,
  onOpenDictionary,
  dictionaryDownloadPercent = 0,
  dictionaryDownloading = false,
}: PersonalStudyPageProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [playlistsOpen, setPlaylistsOpen] = useState(true);
  const [researchOpen, setResearchOpen] = useState(true);
  const [dictionaryOpen, setDictionaryOpen] = useState(true);

  async function handleExport() {
    if (!window.jcs?.exportJwlibrary) {
      alert('Exportação disponível apenas no app Electron.');
      return;
    }
    setBusy('export');
    setStatus(null);
    try {
      const result = await window.jcs.exportJwlibrary();
      if (!result.ok) {
        setStatus(result.error ?? 'Não foi possível exportar.');
        return;
      }
      const stats = result.stats;
      setStatus(
        stats
          ? `Backup salvo: ${stats.inputFields} campos, ${stats.userMarks} grifos, ${stats.notes} notas.`
          : 'Backup exportado com sucesso.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao exportar.';
      setStatus(message);
      window.alert(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!window.jcs?.importJwlibrary) {
      alert('Importação disponível apenas no app Electron.');
      return;
    }
    if (
      !window.confirm(
        'Importar um backup .jwlibrary vai mesclar campos, grifos e notas no JCS.\n\nAs publicações da semana precisam estar baixadas aqui. Continuar?',
      )
    ) {
      return;
    }
    setBusy('import');
    setStatus(null);
    try {
      const result = await window.jcs.importJwlibrary();
      if (!result.ok) {
        setStatus(result.error ?? 'Não foi possível importar.');
        return;
      }
      const stats = result.stats;
      const message = stats
        ? `Importado: ${stats.fields} campos, ${stats.highlights} grifos, ${stats.notes} notas. Abra a matéria correspondente para conferir.`
        : 'Backup importado com sucesso.';
      setStatus(message);
      window.alert(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao importar.';
      setStatus(message);
      window.alert(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-8 py-6">
      <StudySection title="Notas e etiquetas" />

      <div className="mt-2 space-y-8 text-center">
        <EmptyHint icon="🏷️" text="Crie etiquetas para organizar suas notas" />
        <EmptyHint icon="📝" text="Crie suas notas para estudo pessoal" />
      </div>

      <StudySection
        title="Pesquisa"
        open={researchOpen}
        onToggle={() => setResearchOpen((value) => !value)}
      />
      {researchOpen && onOpenResearchPublication ? (
        <ResearchToolsPanel onOpenPublication={onOpenResearchPublication} />
      ) : null}

      <StudySection
        title="Dicionário"
        open={dictionaryOpen}
        onToggle={() => setDictionaryOpen((value) => !value)}
      />
      {dictionaryOpen ? (
        <DictionaryPanel
          downloadPercent={dictionaryDownloadPercent}
          downloading={dictionaryDownloading}
          onOpenDictionary={onOpenDictionary}
        />
      ) : null}

      <StudySection
        title="Playlists"
        open={playlistsOpen}
        onToggle={() => setPlaylistsOpen((value) => !value)}
      />
      {playlistsOpen ? (
        <div className="mt-3">
          <PlaylistPanel />
        </div>
      ) : null}

      <div className="mt-10 rounded-xl border border-jw-border bg-jw-surface p-4">
        <h3 className="text-sm font-semibold text-jw-text">Backup JW Library</h3>
        <p className="mt-1 text-sm text-jw-muted">
          Exportar ou importar arquivo `.jwlibrary` com campos, grifos e notas da preparação.
        </p>
        {status ? (
          <p
            className={[
              'mt-3 rounded-lg border px-3 py-2 text-sm',
              status.includes('Não') ||
              status.includes('Erro') ||
              status.includes('cancelada') ||
              status.includes('Nenhum')
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800',
            ].join(' ')}
          >
            {status}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <GhostButton disabled={busy !== null} onClick={() => void handleExport()}>
            {busy === 'export' ? 'Exportando…' : 'Exportar .jwlibrary'}
          </GhostButton>
          <GhostButton disabled={busy !== null} onClick={() => void handleImport()}>
            {busy === 'import' ? 'Importando…' : 'Importar .jwlibrary'}
          </GhostButton>
        </div>
      </div>

      {elderLocked && onRequestElderUnlock ? (
        <div className="mt-6 rounded-xl border border-jw-purple/20 bg-jw-purple-light/30 p-4">
          <h3 className="text-sm font-semibold text-jw-purple-dark">Área Elder</h3>
          <p className="mt-1 text-sm text-jw-muted">
            Orientações confidenciais e esboços de ancião. Requer PIN local.
          </p>
          <button
            type="button"
            onClick={onRequestElderUnlock}
            className="mt-3 rounded-lg bg-jw-purple px-3 py-2 text-sm font-semibold text-white hover:bg-jw-purple-dark"
          >
            Desbloquear com PIN
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StudySection({
  title,
  open,
  onToggle,
}: {
  title: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-2 flex w-full items-center justify-between border-b border-jw-border py-3 text-left"
    >
      <span className="text-sm font-semibold text-jw-purple">{title}</span>
      <span className="text-jw-muted">{onToggle ? (open ? '▾' : '›') : '›'}</span>
    </button>
  );
}

function EmptyHint({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-jw-muted">
      <span className="text-2xl opacity-50">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function GhostButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-jw-border px-3 py-2 text-sm hover:bg-jw-bg disabled:opacity-60"
    >
      {children}
    </button>
  );
}
