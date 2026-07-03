import fs from 'node:fs';
import { listDocuments, getPreparedDocumentHtml } from '../electron/jwpub-reader.ts';

const jwpubPath = 'C:/Users/Tricot&Cia/AppData/Roaming/JCS Meetings/publications/s-34_T_.jwpub';
const stat = fs.statSync(jwpubPath);
console.log('Size:', stat.size, 'bytes');

const docs = await listDocuments(jwpubPath);
console.log('Documents:', docs.length);
for (const doc of docs.slice(0, 20)) {
  console.log(`${doc.documentId}: ${doc.title}`);
}

if (docs[0]) {
  const prep = await getPreparedDocumentHtml(jwpubPath, docs[0].documentId);
  console.log('Sample HTML:', prep.html.slice(0, 300));
}
