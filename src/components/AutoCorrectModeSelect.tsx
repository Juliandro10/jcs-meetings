import {
  AUTO_CORRECT_MODE_OPTIONS,
  writeAutoCorrectMode,
} from '@/lib/auto-correct-settings';
import type { AutoCorrectMode } from '../../electron/types';

type AutoCorrectModeSelectProps = {
  value: AutoCorrectMode;
  onChange: (mode: AutoCorrectMode) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function AutoCorrectModeSelect({
  value,
  onChange,
  disabled,
  compact = false,
}: AutoCorrectModeSelectProps) {
  const current = AUTO_CORRECT_MODE_OPTIONS.find((item) => item.id === value) ?? AUTO_CORRECT_MODE_OPTIONS[1];

  return (
    <label className={compact ? 'inline-flex items-center' : 'block'}>
      {compact ? null : <span className="text-xs font-medium text-jw-text">Corretor automático</span>}
      <select
        disabled={disabled}
        value={value}
        title={current?.hint}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          const next = event.target.value as AutoCorrectMode;
          writeAutoCorrectMode(next);
          onChange(next);
        }}
        className={
          compact
            ? 'max-w-[11.5rem] rounded-md border border-jw-border bg-jw-surface px-2 py-1 text-xs text-jw-text outline-none focus:border-jw-purple'
            : 'mt-1 w-full rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text outline-none focus:border-jw-purple'
        }
      >
        {AUTO_CORRECT_MODE_OPTIONS.map((item) => (
          <option key={item.id} value={item.id} title={item.hint}>
            {compact ? `Corretor: ${item.label.toLowerCase()}` : item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
