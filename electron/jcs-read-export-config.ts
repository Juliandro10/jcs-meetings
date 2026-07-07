import fs from 'node:fs/promises';
import path from 'node:path';

type JcsReadExportConfig = {
  lastExportRoot?: string;
};

function configPath(userDataRoot: string) {
  return path.join(userDataRoot, 'jcs-read-export.json');
}

export async function loadJcsReadExportRoot(userDataRoot: string, fallback: string) {
  try {
    const raw = await fs.readFile(configPath(userDataRoot), 'utf8');
    const parsed = JSON.parse(raw) as JcsReadExportConfig;
    if (parsed.lastExportRoot?.trim()) return parsed.lastExportRoot;
  } catch {
    /* first export */
  }
  return fallback;
}

export async function saveJcsReadExportRoot(userDataRoot: string, exportRoot: string) {
  await fs.mkdir(userDataRoot, { recursive: true });
  await fs.writeFile(
    configPath(userDataRoot),
    JSON.stringify({ lastExportRoot: exportRoot }, null, 2),
    'utf8',
  );
}
