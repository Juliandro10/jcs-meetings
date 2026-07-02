import { useCallback, useEffect, useRef, useState } from 'react';

type PlaylistItem = {
  id: string;
  type: 'image' | 'audio' | 'song';
  title: string;
  filePath?: string;
  audioPath?: string;
  audioUrl?: string;
  songNumber?: number;
  songTitle?: string;
};

function mediaUrl(fileName: string) {
  return `jcs-playlist:///${encodeURIComponent(fileName)}`;
}

function itemAudioSrc(item: PlaylistItem) {
  if (item.type === 'song' && item.audioUrl) return item.audioUrl;
  if (item.audioPath) return mediaUrl(item.audioPath);
  return null;
}

export function PlaylistPresenter({
  playlistLabel,
  items,
  onClose,
}: {
  playlistLabel: string;
  items: PlaylistItem[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const current = items[index];

  const goNext = useCallback(() => {
    setIndex((prev) => Math.min(prev + 1, items.length - 1));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' || event.key === 'PageDown') goNext();
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') goPrev();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onClose]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().catch(() => undefined);
  }, [index, current?.id]);

  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#111] text-white">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{playlistLabel}</p>
          <p className="text-xs text-white/60">
            {index + 1} de {items.length} · {current.title}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
        >
          Fechar
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {current.type === 'image' && current.filePath ? (
          <img
            src={mediaUrl(current.filePath)}
            alt={current.title}
            className="max-h-full max-w-full object-contain"
          />
        ) : null}

        {(current.type === 'audio' || current.type === 'song') && itemAudioSrc(current) ? (
          <div className="flex max-w-md flex-col items-center gap-6 text-center">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-jw-purple-dark text-4xl">
              {current.type === 'song' ? '♪' : '🔊'}
            </div>
            <div>
              <p className="text-lg font-semibold">{current.title}</p>
              {current.type === 'song' && current.songNumber ? (
                <p className="mt-1 text-sm text-white/60">Cântico {current.songNumber}</p>
              ) : null}
            </div>
            <audio
              ref={audioRef}
              key={current.id}
              src={itemAudioSrc(current)!}
              controls
              autoPlay
              className="w-full max-w-sm"
              onEnded={() => {
                if (index < items.length - 1) goNext();
              }}
            />
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 px-5 py-4">
        <button
          type="button"
          disabled={index === 0}
          onClick={goPrev}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm disabled:opacity-30"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={index >= items.length - 1}
          onClick={goNext}
          className="rounded-lg bg-jw-purple-dark px-4 py-2 text-sm font-medium disabled:opacity-30"
        >
          Próximo
        </button>
      </footer>
    </div>
  );
}
