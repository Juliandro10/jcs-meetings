import { useCallback, useEffect, useState } from 'react';
import { PlaylistPresenter } from '@/components/PlaylistPresenter';

type PlaylistItem = {
  id: string;
  type: 'image' | 'audio' | 'song';
  title: string;
  filePath?: string;
  audioPath?: string;
  audioUrl?: string;
  songNumber?: number;
  songTitle?: string;
  lang?: string;
};

type Playlist = {
  id: string;
  label: string;
  items: PlaylistItem[];
  updatedAt: string;
};

export function PlaylistPanel() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [songNumberInput, setSongNumberInput] = useState('');

  const selected = playlists.find((item) => item.id === selectedId) ?? playlists[0] ?? null;

  const reload = useCallback(async () => {
    if (!window.jcs?.listPlaylists) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await window.jcs.listPlaylists();
      setPlaylists(result);
      setSelectedId((prev) => prev ?? result[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar playlists.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate() {
    if (!window.jcs?.createPlaylist) return;
    const label = window.prompt('Nome da playlist', 'Reunião')?.trim();
    if (!label) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.jcs.createPlaylist(label);
      setPlaylists(result);
      setSelectedId(result[0]?.id ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!selected || !window.jcs?.renamePlaylist) return;
    const label = window.prompt('Renomear playlist', selected.label)?.trim();
    if (!label || label === selected.label) return;
    setBusy(true);
    try {
      const result = await window.jcs.renamePlaylist({ playlistId: selected.id, label });
      setPlaylists(result);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected || !window.jcs?.deletePlaylist) return;
    if (!window.confirm(`Excluir playlist "${selected.label}"?`)) return;
    setBusy(true);
    try {
      const result = await window.jcs.deletePlaylist(selected.id);
      setPlaylists(result);
      setSelectedId(result[0]?.id ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddImage() {
    if (!selected || !window.jcs?.pickPlaylistImage || !window.jcs?.addPlaylistItem) return;
    const picked = await window.jcs.pickPlaylistImage();
    if (!picked.ok || !picked.filePath) return;
    setBusy(true);
    try {
      const result = await window.jcs.addPlaylistItem({
        playlistId: selected.id,
        item: { type: 'image', title: picked.title ?? 'Imagem', filePath: picked.filePath },
      });
      setPlaylists(result);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAudio() {
    if (!selected || !window.jcs?.pickPlaylistAudio || !window.jcs?.addPlaylistItem) return;
    const picked = await window.jcs.pickPlaylistAudio();
    if (!picked.ok || !picked.audioPath) return;
    setBusy(true);
    try {
      const result = await window.jcs.addPlaylistItem({
        playlistId: selected.id,
        item: { type: 'audio', title: picked.title ?? 'Áudio', audioPath: picked.audioPath },
      });
      setPlaylists(result);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSong() {
    if (!selected || !window.jcs?.getSongAudio || !window.jcs?.addPlaylistItem) return;
    const number = Number(songNumberInput.trim());
    if (!Number.isFinite(number) || number < 1) {
      setError('Informe o número do cântico.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const track = await window.jcs.getSongAudio({ songNumber: number, lang: 'T' });
      if (!track) {
        setError(`Cântico ${number} não encontrado.`);
        return;
      }
      const result = await window.jcs.addPlaylistItem({
        playlistId: selected.id,
        item: {
          type: 'song',
          title: track.title,
          songNumber: track.songNumber,
          songTitle: track.title,
          audioUrl: track.url,
          lang: 'T',
        },
      });
      setPlaylists(result);
      setSongNumberInput('');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!selected || !window.jcs?.removePlaylistItem) return;
    setBusy(true);
    try {
      const result = await window.jcs.removePlaylistItem({ playlistId: selected.id, itemId });
      setPlaylists(result);
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveItem(itemId: string, direction: 'up' | 'down') {
    if (!selected || !window.jcs?.movePlaylistItem) return;
    setBusy(true);
    try {
      const result = await window.jcs.movePlaylistItem({ playlistId: selected.id, itemId, direction });
      setPlaylists(result);
    } finally {
      setBusy(false);
    }
  }

  if (!window.jcs?.listPlaylists) {
    return (
      <p className="py-4 text-sm text-jw-muted">Playlists disponíveis apenas no app Electron.</p>
    );
  }

  if (loading) {
    return <p className="py-4 text-sm text-jw-muted">Carregando playlists…</p>;
  }

  return (
    <>
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-jw-border bg-jw-surface">
          <div className="flex items-center justify-between border-b border-jw-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-jw-muted">Playlists</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCreate()}
              className="rounded px-2 py-1 text-xs text-jw-purple hover:bg-jw-bg disabled:opacity-50"
            >
              + Nova
            </button>
          </div>
          {playlists.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-jw-muted">Nenhuma playlist ainda.</p>
          ) : (
            <ul className="max-h-64 overflow-auto py-1">
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(playlist.id)}
                    className={[
                      'block w-full px-3 py-2 text-left text-sm',
                      selected?.id === playlist.id
                        ? 'bg-jw-purple/10 font-medium text-jw-purple-dark'
                        : 'text-jw-text hover:bg-jw-bg',
                    ].join(' ')}
                  >
                    {playlist.label}
                    <span className="mt-0.5 block text-xs text-jw-muted">
                      {playlist.items.length} item{playlist.items.length === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-xl border border-jw-border bg-jw-surface">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-jw-border px-4 py-3">
                <h3 className="text-sm font-semibold text-jw-text">{selected.label}</h3>
                <div className="flex flex-wrap gap-2">
                  <SmallButton disabled={busy} onClick={() => void handleRename()}>
                    Renomear
                  </SmallButton>
                  <SmallButton disabled={busy} onClick={() => void handleDelete()}>
                    Excluir
                  </SmallButton>
                  <SmallButton
                    disabled={busy || selected.items.length === 0}
                    onClick={() => setPresenting(true)}
                    primary
                  >
                    Apresentar
                  </SmallButton>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-jw-border px-4 py-3">
                <SmallButton disabled={busy} onClick={() => void handleAddImage()}>
                  + Imagem
                </SmallButton>
                <SmallButton disabled={busy} onClick={() => void handleAddAudio()}>
                  + Áudio
                </SmallButton>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    placeholder="Nº cântico"
                    value={songNumberInput}
                    onChange={(event) => setSongNumberInput(event.target.value)}
                    className="w-24 rounded border border-jw-border px-2 py-1.5 text-sm"
                  />
                  <SmallButton disabled={busy} onClick={() => void handleAddSong()}>
                    + Cântico
                  </SmallButton>
                </div>
              </div>

              {selected.items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-jw-muted">
                  Adicione imagens, áudios ou cânticos na ordem da reunião.
                </p>
              ) : (
                <ol className="divide-y divide-jw-border">
                  {selected.items.map((item, itemIndex) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-6 shrink-0 text-xs text-jw-muted">{itemIndex + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-jw-text">{item.title}</p>
                        <p className="text-xs text-jw-muted">
                          {item.type === 'image' ? 'Imagem' : item.type === 'song' ? 'Cântico' : 'Áudio'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <IconButton
                          disabled={busy || itemIndex === 0}
                          label="Subir"
                          onClick={() => void handleMoveItem(item.id, 'up')}
                        >
                          ↑
                        </IconButton>
                        <IconButton
                          disabled={busy || itemIndex === selected.items.length - 1}
                          label="Descer"
                          onClick={() => void handleMoveItem(item.id, 'down')}
                        >
                          ↓
                        </IconButton>
                        <IconButton
                          disabled={busy}
                          label="Remover"
                          onClick={() => void handleRemoveItem(item.id)}
                        >
                          ×
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-jw-muted">
              Crie uma playlist para montar a sequência da reunião.
            </p>
          )}
        </section>
      </div>

      {presenting && selected ? (
        <PlaylistPresenter
          playlistLabel={selected.label}
          items={selected.items}
          onClose={() => setPresenting(false)}
        />
      ) : null}
    </>
  );
}

function SmallButton({
  children,
  disabled,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50',
        primary
          ? 'bg-jw-purple-dark text-white hover:bg-jw-purple'
          : 'border border-jw-border text-jw-text hover:bg-jw-bg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded border border-jw-border px-2 py-1 text-sm hover:bg-jw-bg disabled:opacity-40"
    >
      {children}
    </button>
  );
}
