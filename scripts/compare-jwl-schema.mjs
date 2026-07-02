import fs from 'node:fs';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });

const files = {
  jcs: 'C:/Users/Tricot&Cia/Downloads/2026-07-02.jwlibrary',
  jwl: 'C:/Users/Tricot&Cia/Downloads/UserdataBackup_2026-07-02_DESKTOP-SCA8F8M.jwlibrary',
};

async function openDb(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const dbName = manifest.userDataBackup?.databaseName ?? 'userData.db';
  return new SQL.Database(await zip.file(dbName).async('nodebuffer'));
}

function schema(db) {
  const tables = db.exec("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name")[0].values;
  const indexes = db.exec("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql NOT NULL ORDER BY name")[0]?.values ?? [];
  const triggers = db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name")[0]?.values ?? [];
  return { tables: Object.fromEntries(tables.map(([n, s]) => [n, s])), indexes, triggers };
}

const jcs = await openDb(files.jcs);
const jwl = await openDb(files.jwl);

console.log('user_version JCS:', jcs.exec('PRAGMA user_version')[0].values[0][0]);
console.log('user_version JWL:', jwl.exec('PRAGMA user_version')[0].values[0][0]);

const sJcs = schema(jcs);
const sJwl = schema(jwl);

const jcsTables = new Set(Object.keys(sJcs.tables));
const jwlTables = new Set(Object.keys(sJwl.tables));
console.log('\nTables only in JWL:', [...jwlTables].filter((t) => !jcsTables.has(t)));
console.log('Tables only in JCS:', [...jcsTables].filter((t) => !jwlTables.has(t)));

for (const table of [...jwlTables].sort()) {
  if (!jcsTables.has(table)) continue;
  if (sJcs.tables[table] !== sJwl.tables[table]) {
    console.log(`\n--- TABLE DIFF: ${table} ---`);
    console.log('JCS:', sJcs.tables[table]?.slice(0, 500));
    console.log('JWL:', sJwl.tables[table]?.slice(0, 500));
  }
}

console.log('\nJWL index count:', sJwl.indexes.length, 'JCS:', sJcs.indexes.length);
console.log('JWL trigger count:', sJwl.triggers.length, 'JCS:', sJcs.triggers.length);

const jcsIdx = new Set(sJwl.indexes.map((i) => i[0]));
for (const [name, sql] of sJwl.indexes) {
  if (!sJcs.indexes.find((i) => i[0] === name)) console.log('Index only JWL:', name);
}

for (const [name, sql] of sJwl.triggers) {
  if (!sJcs.triggers.find((t) => t[0] === name)) console.log('Trigger only JWL:', name);
}

// Location 2 and 3 purpose
console.log('\n--- JWL Location 3 linked data ---');
for (const table of ['InputField', 'UserMark', 'Note', 'Bookmark']) {
  try {
    const r = jwl.exec(`SELECT * FROM ${table} WHERE LocationId=3`)[0];
    console.log(table, r?.values?.length ?? 0, r?.values?.slice(0, 3));
  } catch (e) {
    console.log(table, 'err');
  }
}

jcs.close();
jwl.close();

// Dump full v16 DDL
const jwl2 = await openDb(files.jwl);
for (const t of ['Location', 'InputField', 'UserMark', 'Note', 'BlockRange']) {
  const sql = jwl2.exec(`SELECT sql FROM sqlite_master WHERE name='${t}'`)[0].values[0][0];
  console.log(`\n===== ${t} (JWL v16) =====\n${sql}`);
}
const mediaIdx = jwl2.exec("SELECT sql FROM sqlite_master WHERE name='IX_Location_Media'")[0]?.values?.[0]?.[0];
console.log('\n===== IX_Location_Media =====\n', mediaIdx);
jwl2.close();
