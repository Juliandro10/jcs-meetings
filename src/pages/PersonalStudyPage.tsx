export function PersonalStudyPage() {
  return (
    <div className="px-8 py-6">
      <StudySection title="Notas e etiquetas" />
      <StudySection title="Playlists" />

      <div className="mt-16 space-y-8 text-center">
        <EmptyHint icon="🏷️" text="Crie etiquetas para organizar suas notas" />
        <EmptyHint icon="📝" text="Crie suas notas para estudo pessoal" />
        <EmptyHint icon="➕" text="Crie playlists para vídeos, áudios e imagens" />
      </div>

      <div className="mt-10 rounded-xl border border-jw-border bg-jw-surface p-4">
        <h3 className="text-sm font-semibold text-jw-text">Backup JW Library</h3>
        <p className="mt-1 text-sm text-jw-muted">Exportar ou importar arquivo `.jwlibrary`.</p>
        <div className="mt-3 flex gap-2">
          <GhostButton>Exportar .jwlibrary</GhostButton>
          <GhostButton>Importar .jwlibrary</GhostButton>
        </div>
      </div>
    </div>
  );
}

function StudySection({ title }: { title: string }) {
  return (
    <button
      type="button"
      className="mb-2 flex w-full items-center justify-between border-b border-jw-border py-3 text-left"
    >
      <span className="text-sm font-semibold text-jw-purple">{title}</span>
      <span className="text-jw-muted">›</span>
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

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className="rounded-lg border border-jw-border px-3 py-2 text-sm hover:bg-jw-bg">
      {children}
    </button>
  );
}
