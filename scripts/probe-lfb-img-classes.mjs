import { listDocuments, getPreparedDocumentHtml } from '../electron/jwpub-reader.ts';

const jwpubPath =
  'C:/Users/Tricot&Cia/AppData/Roaming/JCS Meetings/publications/lfb_T_.jwpub';

const docs = await listDocuments(jwpubPath);
const classes = new Set();

for (const doc of docs.slice(0, 80)) {
  const prep = await getPreparedDocumentHtml(jwpubPath, doc.documentId);
  for (const m of prep.html.matchAll(/class="([^"]+)"/gi)) {
    for (const cls of m[1].split(/\s+/)) {
      if (/north|south|east|west|half|center|left|right|figure|thumb|bleed|spread|page/i.test(cls)) {
        classes.add(cls);
      }
    }
  }
}

console.log([...classes].sort().join('\n'));
