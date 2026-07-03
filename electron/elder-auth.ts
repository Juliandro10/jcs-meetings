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

type ElderAuthFile = {
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

export async function getElderAuthStatus(userDataDir: string) {
  const auth = await readAuthFile(userDataDir);
  return {
    pinConfigured: Boolean(auth),
    unlocked: sessionUnlocked,
  };
}

export async function setupElderPin(userDataDir: string, pin: string) {
  const pinError = validatePin(pin);
  if (pinError) return { ok: false as const, error: pinError };

  const existing = await readAuthFile(userDataDir);
  if (existing) {
    return { ok: false as const, error: 'PIN já configurado. Use desbloqueio com o PIN atual.' };
  }

  const salt = randomBytes(16).toString('hex');
  const pinHash = hashPin(pin.trim(), salt).toString('hex');
  const payload: ElderAuthFile = {
    pinHash,
    salt,
    configuredAt: new Date().toISOString(),
  };

  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(authFilePath(userDataDir), JSON.stringify(payload, null, 2), 'utf8');
  unlockElderSession();
  return { ok: true as const };
}

export async function unlockElderWithPin(userDataDir: string, pin: string) {
  const auth = await readAuthFile(userDataDir);
  if (!auth) {
    return { ok: false as const, error: 'PIN ainda não configurado.' };
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
