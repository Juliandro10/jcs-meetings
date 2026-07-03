const STORAGE_SESSION_MODE = 'jcs-session-mode';

export type AppSessionMode = 'common' | 'elder';

/** Modo da sessão atual (preparação vs Elder desbloqueado). */
export function getStoredSessionMode(): AppSessionMode | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_SESSION_MODE);
    if (raw === 'common' || raw === 'elder') return raw;
    return null;
  } catch {
    return null;
  }
}

export function setStoredSessionMode(mode: AppSessionMode) {
  sessionStorage.setItem(STORAGE_SESSION_MODE, mode);
}

export function clearStoredSessionMode() {
  sessionStorage.removeItem(STORAGE_SESSION_MODE);
}

export function canShowElderTab(mode: AppSessionMode) {
  return mode === 'elder';
}
