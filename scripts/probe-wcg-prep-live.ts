import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../electron/env';
import { runWcgPrep } from '../electron/wcg-prep';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile({ appRoot: root });

const cacheDir = path.join(process.env.APPDATA ?? '', 'JCS Meetings', 'publications');
const userDataDir = path.join(process.env.APPDATA ?? '', 'JCS Meetings');

async function main() {
  console.log('API key set:', Boolean(process.env.OPENAI_API_KEY?.trim()));
  const result = await runWcgPrep(cacheDir, userDataDir, {
    documentIds: [9],
    weekLabel: '10-16 de agosto',
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
