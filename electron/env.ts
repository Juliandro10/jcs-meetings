import fs from 'node:fs';
import path from 'node:path';

export type EnvLoadOptions = {
  appRoot: string;
  resourcesPath?: string;
};

function applyEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Dev: `.env` na raiz do projeto. Empacotado: `app.env` em `process.resourcesPath`. */
export function loadEnvFile(options: EnvLoadOptions) {
  if (options.resourcesPath) {
    applyEnvFile(path.join(options.resourcesPath, 'app.env'));
    return;
  }
  applyEnvFile(path.join(options.appRoot, '.env'));
}
