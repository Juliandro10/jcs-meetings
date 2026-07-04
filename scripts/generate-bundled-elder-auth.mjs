import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'build');
const outPath = path.join(buildDir, 'bundled-elder-auth.json');

const MIN_PIN_LENGTH = 4;
const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function readPinFromEnvFile() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.match(/^JCS_ELDER_PIN=(.+)$/m);
  const value = match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  return value || null;
}

function validatePin(pin) {
  const trimmed = pin.trim();
  if (trimmed.length < MIN_PIN_LENGTH) {
    return `JCS_ELDER_PIN deve ter pelo menos ${MIN_PIN_LENGTH} dígitos.`;
  }
  if (!/^\d+$/.test(trimmed)) {
    return 'JCS_ELDER_PIN deve conter apenas números.';
  }
  return null;
}

function hashPin(pin, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return scryptSync(pin.trim(), salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

export function generateBundledElderAuth(pin) {
  const pinError = validatePin(pin);
  if (pinError) throw new Error(pinError);

  const salt = randomBytes(16).toString('hex');
  const pinHash = hashPin(pin, salt).toString('hex');
  return {
    pinHash,
    salt,
    configuredAt: new Date().toISOString(),
  };
}

function main() {
  const pin = process.env.JCS_ELDER_PIN?.trim() || readPinFromEnvFile();
  if (!pin) {
    console.error('Defina JCS_ELDER_PIN no .env local (não vai para o Git).');
    process.exit(1);
  }

  const payload = generateBundledElderAuth(pin);
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`OK: ${path.relative(root, outPath)} gerado (somente hash, sem PIN em texto).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
