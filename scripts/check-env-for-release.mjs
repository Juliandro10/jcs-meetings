import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.error('Build cancelado: crie .env na raiz do projeto (copie de .env.example).');
  process.exit(1);
}

const raw = fs.readFileSync(envPath, 'utf8');
const match = raw.match(/^OPENAI_API_KEY=(.+)$/m);
const value = match?.[1]?.trim() ?? '';

if (!value || value === 'sk-...') {
  console.error('Build cancelado: defina OPENAI_API_KEY válida no .env antes de empacotar.');
  process.exit(1);
}

console.log('OK: .env pronto para embutir no instalador.');
