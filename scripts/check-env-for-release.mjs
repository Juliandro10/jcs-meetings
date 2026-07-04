import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBundledElderAuth } from './generate-bundled-elder-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const buildDir = path.join(root, 'build');
const releaseEnvPath = path.join(buildDir, 'app.release.env');
const bundledAuthPath = path.join(buildDir, 'bundled-elder-auth.json');

if (!fs.existsSync(envPath)) {
  console.error('Build cancelado: crie .env na raiz do projeto (copie de .env.example).');
  process.exit(1);
}

const raw = fs.readFileSync(envPath, 'utf8');

const openAiMatch = raw.match(/^OPENAI_API_KEY=(.+)$/m);
const openAiValue = openAiMatch?.[1]?.trim() ?? '';
if (!openAiValue || openAiValue === 'sk-...') {
  console.error('Build cancelado: defina OPENAI_API_KEY válida no .env antes de empacotar.');
  process.exit(1);
}

const pinMatch = raw.match(/^JCS_ELDER_PIN=(.+)$/m);
const pinValue = pinMatch?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
if (!pinValue) {
  console.error('Build cancelado: defina JCS_ELDER_PIN no .env local (PIN Elder do instalador).');
  process.exit(1);
}

try {
  generateBundledElderAuth(pinValue);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Build cancelado: ${message}`);
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });

const releaseEnvLines = raw
  .split('\n')
  .filter((line) => !/^JCS_ELDER_PIN=/m.test(line.trim()))
  .join('\n')
  .trimEnd();

fs.writeFileSync(releaseEnvPath, `${releaseEnvLines}\n`, 'utf8');
fs.writeFileSync(bundledAuthPath, `${JSON.stringify(generateBundledElderAuth(pinValue), null, 2)}\n`, 'utf8');

console.log('OK: .env de release e PIN Elder (hash) prontos para o instalador.');
