import fs from 'node:fs/promises';
import path from 'node:path';
import { getDocumentHtml } from '../electron/jwpub-reader';

const cacheDir = path.join(process.env.APPDATA ?? '', 'JCS Meetings', 'publications');

async function main() {
  const html = await getDocumentHtml(path.join(cacheDir, 'wcg_T_.jwpub'), 9);
  const out = path.join(process.env.TEMP ?? '.', 'wcg-ch3.html');
  await fs.writeFile(out, html, 'utf8');
  console.log('Wrote', out, html.length);

  const blockRe = /<(h[1-6]|p|li)[^>]*data-pid="(\d+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html))) {
    const text = match[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    console.log(match[2], text.slice(0, 120));
  }
}

main().catch(console.error);
