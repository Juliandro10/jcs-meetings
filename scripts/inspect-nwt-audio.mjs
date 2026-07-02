import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const file = path.join(os.tmpdir(), 'jcs-nwt', 'nwt_T_.jwpub');

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));

const tables = db
  .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]
  ?.values.map((v) => v[0]);
console.log('tables:', tables?.join(', '));

console.log('Multimedia cols:', db.exec('SELECT * FROM Multimedia LIMIT 1')[0]?.columns);
console.log(
  'sample:',
  db.exec(
    'SELECT MultimediaId, MajorType, MinorType, Label, FilePath, MimeType, KeySymbol, Track FROM Multimedia LIMIT 8',
  )[0]?.values,
);
console.log(
  'audio count:',
  db.exec("SELECT COUNT(*) FROM Multimedia WHERE MimeType LIKE 'audio/%'")[0]?.values,
);
console.log(
  'audio sample:',
  db.exec("SELECT Label, FilePath, MajorType, MinorType, Track FROM Multimedia WHERE MimeType LIKE 'audio/%' LIMIT 8")[0]
    ?.values,
);

const bibleBookCols = db.exec('SELECT * FROM BibleBook LIMIT 1')[0]?.columns;
console.log('BibleBook cols:', bibleBookCols);
console.log(
  'BibleBook sample:',
  db.exec('SELECT BibleBookId, BookDisplayTitle, BookDocumentId FROM BibleBook LIMIT 5')[0]?.values,
);
console.log(
  'DocumentMultimedia sample:',
  db.exec('SELECT * FROM DocumentMultimedia LIMIT 3')[0]?.values,
);
console.log(
  'VerseMultimediaMap sample:',
  db.exec('SELECT * FROM VerseMultimediaMap LIMIT 3')[0]?.values,
);
