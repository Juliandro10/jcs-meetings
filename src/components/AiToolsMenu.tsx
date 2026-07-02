import type { MeetingWeek } from '@/lib/meeting-types';

type AiToolsMenuProps = {
  open: boolean;
  onClose: () => void;
  week: MeetingWeek;
};

const MODES = [
  {
    id: 'auto',
    title: 'Preparar reunião (automático)',
    desc: 'Preenche campos usando só publicações baixadas e referências JW — vocabulário das publicações.',
  },
  {
    id: 'summary',
    title: 'Resumo da semana',
    desc: 'Resumo com base na apostila/Sentinela baixadas (não usa fontes externas).',
  },
  {
    id: 'talk',
    title: 'Preparar discurso',
    desc: 'Esboço alinhado à matéria oficial (Tesouros, Joias, Viver, EBC).',
  },
  {
    id: 'chairman',
    title: 'Presidir — meio de semana',
    desc: 'Comentários introdutórios/finais com linguagem das publicações JW.',
  },
  {
    id: 'conductor',
    title: 'Dirigir — Sentinela',
    desc: 'Introdução e orientação com base na edição de estudo baixada.',
  },
] as const;

export function AiToolsMenu({ open, onClose, week }: AiToolsMenuProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-jw-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-jw-text">Ferramentas IA</h3>
        <p className="mt-1 text-sm text-jw-muted">Semana: {week.label}</p>

        <ul className="mt-4 space-y-2">
          {MODES.map((mode) => (
            <li key={mode.id}>
              <button
                type="button"
                className="w-full rounded-lg border border-jw-border px-4 py-3 text-left hover:border-jw-purple hover:bg-jw-purple-light/40"
                onClick={onClose}
              >
                <p className="font-medium text-jw-text">{mode.title}</p>
                <p className="mt-1 text-xs text-jw-muted">{mode.desc}</p>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-jw-border py-2 text-sm text-jw-muted hover:bg-jw-bg"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
