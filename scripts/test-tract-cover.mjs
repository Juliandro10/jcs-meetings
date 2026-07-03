import path from 'node:path';
import os from 'node:os';
import { readJwpubMedia, getJwpubCoverUrl } from '../electron/jwpub-bundle.ts';
import { resolveCachedPubPath } from '../electron/jwpub-reader.ts';

const cacheDir = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/publications');

for (const pub of ['T-ftr', 'T-fam', 'lff']) {
  const jwpubPath = await resolveCachedPubPath(cacheDir, pub, '');
  console.log(pub, 'cached', Boolean(jwpubPath));
  if (!jwpubPath) continue;
  const url = await getJwpubCoverUrl(jwpubPath, pub, '', 'T');
  console.log('  url', url);
  if (!url) continue;
  const fileName = decodeURIComponent(url.split('/').pop());
  const media = await readJwpubMedia(jwpubPath, fileName);
  console.log('  media', media?.buffer.length ?? 'MISSING', media?.mimeType);
}
