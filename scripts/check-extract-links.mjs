import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const file = path.join(os.tmpdir(), 'jcs-img-test', 'mwb_T_202605.jwpub');
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));

for (const link of ['p/T:2004803/17-17', 'p/T:1102016906/', 'p/T:1102016906']) {
  const r = db.exec(
    `SELECT Link, Caption FROM Extract WHERE Link = '${link}' OR Link LIKE '${link.replace(/\/$/, '')}%' LIMIT 3`,
  )[0]?.values;
  console.log(link, r);
}
