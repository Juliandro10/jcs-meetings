import { useState } from 'react';
import { PlaylistPanel } from '@/components/PlaylistPanel';

export function PersonalStudyPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [playlistsOpen, setPlaylistsOpen] = useState(true);

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
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!window.jcs?.importJwlibrary) {
      alert('Importação disponível apenas no app Electron.');
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
      setStatus(
        stats
          ? `Importado: ${stats.fields} campos, ${stats.highlights} grifos, ${stats.notes} notas.`
          : 'Backup importado com sucesso.',
      );
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
          <p className="mt-3 rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text">
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
