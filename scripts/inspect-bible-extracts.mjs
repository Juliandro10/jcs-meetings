import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const file = path.join(os.tmpdir(), 'jcs-img-test', 'mwb_T_202605.jwpub');
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));

const rows = db.exec("SELECT Link, Caption FROM Extract WHERE Link LIKE 'b/%' LIMIT 5")[0]?.values;
console.log('Bible extracts in mwb:', rows);

const all = db.exec('SELECT COUNT(*) FROM Extract')[0]?.values?.[0]?.[0];
console.log('Total extracts:', all);
