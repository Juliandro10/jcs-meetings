import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const f = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub', 'mwb_T_202605.jwpub');
const SQL = await initSqlJs({ locateFile: (x) => require.resolve(`sql.js/dist/${x}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(f));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const m = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(m.publication.fileName).async('nodebuffer'));

const link = 'p/T:1102016108/$p/T:1102016109/';
for (const variant of [link, link + '/', `jwpub://${link}`]) {
  const row = db.exec(`SELECT Caption FROM Extract WHERE Link = '${variant.replace(/'/g, "''")}' LIMIT 1`)[0]?.values?.[0];
  console.log(variant, '=>', row ? 'found' : 'missing');
}

const lfbRows = db.exec("SELECT Link, Caption FROM Extract WHERE Link LIKE '%1102016108%' LIMIT 5")[0]?.values;
console.log('\nlfb rows in mwb:', lfbRows);

const cached = fs.readdirSync(path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub'));
console.log('\ncache:', cached.filter((x) => x.includes('lfb') || x.includes('1102')));
