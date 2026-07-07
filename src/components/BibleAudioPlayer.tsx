import { useEffect, useRef, useState } from 'react';

export type BibleAudioTrack = {
  bookNumber: number;
  chapterNumber: number;
  title: string;
  url: string;
  filesize: number;
};

type BibleAudioPlayerProps = {
  track: BibleAudioTrack | null;
  bookTitle: string;
  active?: boolean;
  onClose: () => void;
};

export function BibleAudioPlayer({ track, bookTitle, active = true, onClose }: BibleAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    if (track && audioRef.current) {
      void audioRef.current.load();
    }
  }, [track?.url]);

  useEffect(() => {
    if (active !== false) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
  }, [active]);

  if (!track) return null;

  return (
    <div className="border-t border-jw-border bg-jw-surface px-5 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (playing) {
              audio.pause();
              setPlaying(false);
            } else {
              void audio.play();
              setPlaying(true);
            }
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jw-purple text-white"
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-jw-text">
            {bookTitle} · {track.title}
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(event) => {
              const audio = audioRef.current;
              if (!audio || !Number.isFinite(audio.duration)) return;
              const next = Number(event.target.value);
              audio.currentTime = (next / 100) * audio.duration;
              setProgress(next);
            }}
            className="mt-1 w-full accent-jw-purple"
          />
        </div>

        <button
          type="button"
          aria-label="Fechar player"
          onClick={onClose}
          className="rounded p-2 text-jw-muted hover:bg-jw-bg hover:text-jw-text"
        >
          ✕
        </button>
      </div>

      <audio
        ref={audioRef}
        src={track.url}
        preload="metadata"
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
          setProgress((audio.currentTime / audio.duration) * 100);
        }}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </div>
  );
}
