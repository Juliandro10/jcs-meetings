import { openJwpubBundle } from '../electron/jwpub-bundle.ts';
import { decryptContent } from '../electron/jwpub-crypto.ts';

const bundle = await openJwpubBundle(
  'C:/Users/Tricot&Cia/AppData/Roaming/JCS Meetings/publications/lfb_T_.jwpub',
);
const row = bundle.db.exec('SELECT Content FROM Document WHERE DocumentId = 117')[0]?.values?.[0]?.[0];
const raw = decryptContent(bundle.keyIv, row);
for (const img of raw.match(/<img[^>]+>/gi) ?? []) console.log(img);
