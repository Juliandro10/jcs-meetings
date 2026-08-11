import path from 'node:path';
import { openJwpubBundle } from '../electron/jwpub-bundle';

const cacheDir = path.join(process.env.APPDATA ?? '', 'JCS Meetings', 'publications');
const jwpubPath = path.join(cacheDir, 'wcg_T_.jwpub');

async function main() {
  const bundle = await openJwpubBundle(jwpubPath);
  const rows =
    bundle.db.exec(
      'SELECT DocumentId, MepsDocumentId, Title, SectionNumber FROM Document ORDER BY DocumentId',
    )[0]?.values ?? [];

  console.log('Total docs:', rows.length);
  for (const row of rows) {
    const [docId, meps, title, section] = row;
    if (
      Number(meps) === 1102025903 ||
      /cap[ií]tulo\s*3|^3[\.\)]/i.test(String(title)) ||
      String(title).toLowerCase().includes('fortalecer')
    ) {
      console.log({ docId, meps, section, title: String(title).slice(0, 80) });
    }
  }

  const target = rows.find((row) => Number(row[1]) === 1102025903);
  if (target) {
    console.log('\nTarget chapter:', target);
  }
}

main().catch(console.error);
