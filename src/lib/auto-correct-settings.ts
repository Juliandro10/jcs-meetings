import type { AutoCorrectMode } from '../../electron/types';

const STORAGE_KEY = 'jcs-auto-correct-mode';
export const AUTO_CORRECT_MODE_EVENT = 'jcs-auto-correct-mode';

export const AUTO_CORRECT_MODE_OPTIONS: Array<{ id: AutoCorrectMode; label: string; hint: string }> = [
  { id: 'off', label: 'Desligado', hint: 'Não altera o que você digita.' },
  {
    id: 'accents',
    label: 'Só acentos',
    hint: 'Corrige nao → não só quando a palavra acentuada é a única opção.',
  },
  {
    id: 'careful',
    label: 'Acentos e erros óbvios',
    hint: 'Também corrige 1 letra errada se o dicionário tiver um único candidato.',
  },
];

export function readAutoCorrectMode(): AutoCorrectMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'off' || value === 'accents' || value === 'careful') return value;
  } catch {
    /* ignore */
  }
  return 'accents';
}

export function writeAutoCorrectMode(mode: AutoCorrectMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(AUTO_CORRECT_MODE_EVENT));
}
