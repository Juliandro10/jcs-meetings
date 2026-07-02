import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { createDecipheriv, createHash } from 'node:crypto';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const file = path.join(os.tmpdir(), 'jcs-img-test', 'mwb_T_202605.jwpub');

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const dbBuf = await inner.file(manifest.publication.fileName).async('nodebuffer');
const db = new SQL.Database(dbBuf);

function q(sql) {
  const r = db.exec(sql);
  if (!r[0]) return { cols: [], rows: [] };
  return { cols: r[0].columns, rows: r[0].values };
}

console.log('Multimedia cols:', q('SELECT * FROM Multimedia LIMIT 1').cols);
console.log('Multimedia row:', q('SELECT * FROM Multimedia LIMIT 1').rows[0]);

console.log('\nAsset table exists:', q("SELECT name FROM sqlite_master WHERE name='Asset'").rows);

console.log('\nExtract cols:', q('SELECT * FROM Extract LIMIT 1').cols);
const link = 'p/T:2004803/17-17';
const extractRow = q(`SELECT Link, Caption, Content FROM Extract WHERE Link='${link}' LIMIT 1`);
console.log('Extract w04 caption:', extractRow.rows[0]?.[1]);
console.log('Extract w04 content len:', extractRow.rows[0]?.[2]?.length);
console.log('Extract w04 content preview:', extractRow.rows[0]?.[2]?.slice(0, 400));

console.log('\nDocumentExtract cols:', q('SELECT * FROM DocumentExtract LIMIT 1').cols);

console.log('\nHyperlink cols:', q('SELECT * FROM Hyperlink LIMIT 3').rows);

// Find image file in zip
const zipFiles = Object.keys(inner.files).filter((f) => f.includes('202026169') || f.endsWith('.jpg'));
console.log('\nZip image files:', zipFiles.slice(0, 10));
