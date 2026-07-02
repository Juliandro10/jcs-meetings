type DownloadProgressBarProps = {
  percent: number;
  label?: string;
  className?: string;
};

export function DownloadProgressBar({ percent, label, className = '' }: DownloadProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className={['w-full', className].filter(Boolean).join(' ')}>
      {label ? (
        <p className="mb-1 text-xs text-jw-muted">
          {label} · {clamped}%
        </p>
      ) : null}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-jw-border"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-jw-purple transition-[width] duration-200 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function getDownloadPercent(
  progressMap: Record<string, number>,
  key: string | null | undefined,
  active: boolean,
) {
  if (!active || !key) return null;
  const percent = progressMap[key];
  return percent === undefined ? 0 : percent;
}
