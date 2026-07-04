import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { isElderGuidelinePubSymbol } from './elder-guideline-catalog';
import { isElderOutlinePubSymbol } from './elder-pub-classify';

const AUTH_FILE = 'elder-auth.json';
const MIN_PIN_LENGTH = 4;
const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export type ElderAuthFile = {
  pinHash: string;
  salt: string;
  configuredAt: string;
};

let sessionUnlocked = false;

export function isElderSessionUnlocked() {
  return sessionUnlocked;
}

export function unlockElderSession() {
  sessionUnlocked = true;
}

export function lockElderSession() {
  sessionUnlocked = false;
}

function authFilePath(userDataDir: string) {
  return path.join(userDataDir, AUTH_FILE);
}

async function readAuthFile(userDataDir: string): Promise<ElderAuthFile | null> {
  try {
    const raw = await fs.readFile(authFilePath(userDataDir), 'utf8');
    const parsed = JSON.parse(raw) as ElderAuthFile;
    if (!parsed.pinHash || !parsed.salt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hashPin(pin: string, saltHex: string) {
  const salt = Buffer.from(saltHex, 'hex');
  return scryptSync(pin, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

function validatePin(pin: string): string | null {
  const trimmed = pin.trim();
  if (trimmed.length < MIN_PIN_LENGTH) {
    return `O PIN deve ter pelo menos ${MIN_PIN_LENGTH} dígitos.`;
  }
  if (!/^\d+$/.test(trimmed)) {
    return 'Use apenas números no PIN.';
  }
  return null;
}

export function createElderAuthPayload(pin: string): { ok: true; payload: ElderAuthFile } | { ok: false; error: string } {
  const pinError = validatePin(pin);
  if (pinError) return { ok: false as const, error: pinError };

  const salt = randomBytes(16).toString('hex');
  const pinHash = hashPin(pin.trim(), salt).toString('hex');
  return {
    ok: true as const,
    payload: {
      pinHash,
      salt,
      configuredAt: new Date().toISOString(),
    },
  };
}

async function writeAuthFile(userDataDir: string, payload: ElderAuthFile) {
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(authFilePath(userDataDir), JSON.stringify(payload, null, 2), 'utf8');
}

/** Instala PIN padrão do build se ainda não existir neste computador. */
export async function seedElderAuthIfMissing(
  userDataDir: string,
  options: { bundledPath?: string | null; envPin?: string | null },
) {
  const existing = await readAuthFile(userDataDir);
  if (existing) return { seeded: false as const };

  let payload: ElderAuthFile | null = null;

  if (options.bundledPath) {
    try {
      const raw = await fs.readFile(options.bundledPath, 'utf8');
      const parsed = JSON.parse(raw) as ElderAuthFile;
      if (parsed.pinHash && parsed.salt) payload = parsed;
    } catch {
      payload = null;
    }
  }

  if (!payload && options.envPin) {
    const created = createElderAuthPayload(options.envPin);
    if (created.ok) payload = created.payload;
  }

  if (!payload) return { seeded: false as const };

  await writeAuthFile(userDataDir, payload);
  return { seeded: true as const };
}

/** Dev: .env é a fonte do PIN — sobrescreve auth local a cada subida do app. */
export async function syncDevElderAuthFromEnv(userDataDir: string, envPin?: string | null) {
  if (!envPin?.trim()) return { synced: false as const, error: 'JCS_ELDER_PIN ausente no .env' };

  const created = createElderAuthPayload(envPin);
  if (!created.ok) return { synced: false as const, error: created.error };

  await writeAuthFile(userDataDir, created.payload);
  lockElderSession();
  return { synced: true as const };
}

export async function getElderAuthStatus(userDataDir: string) {
  const auth = await readAuthFile(userDataDir);
  return {
    pinConfigured: Boolean(auth),
    unlocked: sessionUnlocked,
  };
}

export async function setupElderPin(userDataDir: string, _pin: string) {
  const existing = await readAuthFile(userDataDir);
  if (existing) {
    return { ok: false as const, error: 'PIN Elder já definido no instalador deste app.' };
  }
  return {
    ok: false as const,
    error: 'O PIN Elder é definido na build do instalador. Contate quem distribui o app.',
  };
}

export async function unlockElderWithPin(userDataDir: string, pin: string) {
  lockElderSession();

  const auth = await readAuthFile(userDataDir);
  if (!auth) {
    return { ok: false as const, error: 'PIN Elder não encontrado neste computador.' };
  }

  const pinError = validatePin(pin);
  if (pinError) return { ok: false as const, error: pinError };

  const computed = hashPin(pin.trim(), auth.salt);
  const stored = Buffer.from(auth.pinHash, 'hex');
  if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) {
    return { ok: false as const, error: 'PIN incorreto.' };
  }

  unlockElderSession();
  return { ok: true as const };
}

export function elderAccessDenied() {
  return { ok: false as const, error: 'Área Elder bloqueada. Faça login novamente.' };
}

export function assertElderUnlocked<T extends { ok: boolean; error?: string }>() {
  if (!sessionUnlocked) return elderAccessDenied();
  return null;
}

export function isElderRestrictedPub(pub: string) {
  return isElderGuidelinePubSymbol(pub) || isElderOutlinePubSymbol(pub);
}

export async function resolveBundledElderAuthPath(appRoot: string, resourcesPath?: string) {
  const candidates = [
    resourcesPath ? path.join(resourcesPath, 'bundled-elder-auth.json') : null,
    path.join(appRoot, 'build', 'bundled-elder-auth.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
