import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });

const jcsPath = 'C:/Users/Tricot&Cia/Downloads/2026-07-02.jwlibrary';
const jwlPath = 'C:/Users/Tricot&Cia/Downloads/UserdataBackup_2026-07-02_DESKTOP-SCA8F8M.jwlibrary';
const tmpExport = path.join(require('node:os').tmpdir(), 'jcs-test-export.jwlibrary');

async function load(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const manifestRaw = await zip.file('manifest.json').async('string');
  const manifest = JSON.parse(manifestRaw);
  const dbName = manifest.userDataBackup?.databaseName ?? 'userData.db';
  const dbBytes = await zip.file(dbName).async('nodebuffer');
  return { manifest, manifestRaw, db: new SQL.Database(dbBytes), name: path.basename(filePath) };
}

function allTables(db) {
  return db
    .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]
    .values.map((v) => v[0]);
}

function countAll(db) {
  const out = {};
  for (const t of allTables(db)) {
    out[t] = db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0];
  }
  return out;
}

function dump(db, label) {
  console.log(`\n######## ${label} ########`);
  const locs = db.exec('SELECT * FROM Location ORDER BY LocationId')[0];
  console.log('Locations:');
  for (const row of locs.values) {
    console.log(Object.fromEntries(locs.columns.map((c, i) => [c, row[i]])));
  }
  for (const q of [
    'SELECT * FROM InputField ORDER BY LocationId, TextTag',
    'SELECT um.*, br.Identifier, br.StartToken, br.EndToken FROM UserMark um JOIN BlockRange br ON br.UserMarkId=um.UserMarkId ORDER BY um.UserMarkId',
    'SELECT NoteId, LocationId, BlockType, BlockIdentifier, Title FROM Note ORDER BY NoteId',
    'SELECT * FROM LastModified',
    'SELECT * FROM android_metadata',
  ]) {
    const r = db.exec(q)[0];
    console.log('\n', q.split(' FROM ')[0], `(${r?.values?.length ?? 0})`);
    for (const row of r?.values ?? []) console.log(row);
  }
}

const files = [
  ['JWL real', jwlPath],
  ['JCS old download', jcsPath],
];
if (fs.existsSync(tmpExport)) files.push(['JCS v16 test', tmpExport]);

for (const [label, fp] of files) {
  if (!fs.existsSync(fp)) continue;
  const { manifest, manifestRaw, db, name } = await load(fp);
  console.log(`\n===== ${label}: ${name} =====`);
  console.log('manifest:', manifestRaw.slice(0, 400));
  console.log('table counts:', countAll(db));
  dump(db, label);
  db.close();
}

// Generate fresh v16 export
const cache = path.join(require('node:os').homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub');
const prep = path.join(require('node:os').homedir(), 'AppData/Roaming/JCS Meetings/prep');
if (fs.existsSync(path.join(cache, 'mwb_T_202605.jwpub')) && fs.existsSync(path.join(prep, 'prep-data.json'))) {
  const { exportJwlibrary } = await import('../electron/jwlibrary-export.ts');
  const out = path.join(require('node:os').tmpdir(), 'jcs-v16-compare.jwlibrary');
  const r = await exportJwlibrary(cache, prep, out);
  if (r.ok) {
    const { db, manifest } = await load(out);
    console.log('\n===== FRESH v16 EXPORT =====');
    console.log('schemaVersion', manifest.userDataBackup.schemaVersion);
    console.log('user_version', db.exec('PRAGMA user_version')[0].values[0][0]);
    dump(db, 'FRESH');
    db.close();
  }
}
