import { DownloadProgressBar } from '@/components/DownloadProgressBar';

type DownloadPublicationModalProps = {
  open: boolean;
  title: string;
  sizeMb?: number;
  downloading: boolean;
  downloadPercent?: number | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DownloadPublicationModal({
  open,
  title,
  sizeMb,
  downloading,
  downloadPercent,
  onConfirm,
  onCancel,
}: DownloadPublicationModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-pub-title"
        className="w-full max-w-md rounded-xl bg-[#2b2b2b] p-6 text-white shadow-2xl"
      >
        <h2 id="download-pub-title" className="text-center text-lg font-medium leading-snug">
          Baixar {title}
        </h2>
        {sizeMb ? <p className="mt-3 text-center text-sm text-white/70">{sizeMb} MB</p> : null}
        {downloading && downloadPercent !== null && downloadPercent !== undefined ? (
          <DownloadProgressBar percent={downloadPercent} label="Baixando" className="mt-4 [&_p]:text-white/70" />
        ) : null}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={downloading}
            className="flex-1 rounded-lg bg-jw-purple px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {downloading ? 'Baixando…' : 'Baixar'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={downloading}
            className="flex-1 rounded-lg bg-[#4a4a4a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#555] disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
