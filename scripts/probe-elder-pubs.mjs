import fs from 'node:fs';
import { listDocuments } from '../electron/jwpub-reader.ts';

const dest = 'C:/Users/Tricot&Cia/AppData/Roaming/JCS Meetings/publications';
for (const pub of ['s-34', 's-31', 's-32', 's-41']) {
  const path = `${dest}/${pub}_T_.jwpub`;
  if (!fs.existsSync(path)) {
    console.log(pub, 'MISSING');
    continue;
  }
  const docs = await listDocuments(path);
  console.log(`\n=== ${pub} (${docs.length} docs) ===`);
  for (const doc of docs.slice(0, 5)) console.log(`  ${doc.documentId}: ${doc.title}`);
  if (docs.length > 5) console.log(`  ... +${docs.length - 5} more`);
  if (docs.length === 1) console.log('  SINGLE:', docs[0].title);
  const talk60 = docs.find((d) => /60\.|N\.°\s*60/i.test(d.title));
  if (talk60) console.log('  TALK60:', talk60.documentId, talk60.title);
}
