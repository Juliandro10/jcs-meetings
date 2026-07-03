import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

async function probeCatalog() {
  const man = await (await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json')).json();
  const gz = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${man.current}/catalog.db.gz`);
  const dbBuf = gunzipSync(Buffer.from(await gz.arrayBuffer()));

  const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
  const db = new SQL.Database(dbBuf);

  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map((v) => v[0]);
  console.log('tables:', tables.join(', '));

  for (const table of tables) {
    if (/category|tool|teach|tract|feature/i.test(table)) {
      console.log('table', table);
    }
  }

  const queries = [
    "SELECT name FROM sqlite_master WHERE type='table'",
    "SELECT * FROM sqlite_master WHERE sql LIKE '%Teaching%'",
    "SELECT * FROM sqlite_master WHERE sql LIKE '%Toolbox%'",
  ];

  for (const q of queries) {
    try {
      const r = db.exec(q);
      console.log('\nQ:', q);
      console.log(JSON.stringify(r[0]?.values?.slice(0, 10), null, 2));
    } catch (e) {
      console.log('fail', q, e.message);
    }
  }

  // Try common column names
  for (const table of ['Publication', 'PublicationCategory', 'Category', 'Feature']) {
    if (!tables.includes(table)) continue;
    const cols = db.exec(`PRAGMA table_info(${table})`)[0].values.map((v) => v[1]);
    console.log(`\n${table} cols:`, cols.join(', '));
  }

  if (tables.includes('PublicationCategory')) {
    const r = db.exec(
      "SELECT PublicationCategoryId, Name FROM PublicationCategory WHERE Name LIKE '%Ensino%' OR Name LIKE '%Teaching%' OR Name LIKE '%Kit%'",
    );
    console.log('\nTeaching categories:', JSON.stringify(r[0]?.values, null, 2));
  }

  if (tables.includes('PublicationCategoryPublication')) {
    const r = db.exec(`
      SELECT p.Symbol, p.IssueTagNumber, p.Title, pc.Name
      FROM PublicationCategoryPublication pcp
      JOIN Publication p ON p.PublicationId = pcp.PublicationId
      JOIN PublicationCategory pc ON pc.PublicationCategoryId = pcp.PublicationCategoryId
      WHERE pc.Name LIKE '%Ensino%' OR pc.Name LIKE '%Kit%'
      LIMIT 30
    `);
    console.log('\nPublications in teaching category:', JSON.stringify(r[0]?.values, null, 2));
  }

  const searchTerms = ['Futuro', 'Família', 'lff', 'Despertai', 'Folheto', 'tract', 'Seja Feliz'];
  for (const term of searchTerms) {
    const r = db.exec(
      `SELECT KeySymbol, IssueTagNumber, Title, ShortTitle FROM Publication WHERE Title LIKE '%${term}%' OR ShortTitle LIKE '%${term}%' OR KeySymbol LIKE '%${term}%' LIMIT 15`,
    );
    if (r[0]?.values?.length) {
      console.log(`\nPublication search "${term}":`, JSON.stringify(r[0].values, null, 2));
    }
  }

  if (tables.includes('PublicationAsset')) {
    const r = db.exec(`
      SELECT p.KeySymbol, p.IssueTagNumber, p.Title, ia.FilePath
      FROM Publication p
      JOIN PublicationAsset pa ON pa.PublicationId = p.Id
      JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
      JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
      WHERE p.KeySymbol IN ('lff', 'll', 'lmd')
      LIMIT 20
    `);
    console.log('\nCover assets:', JSON.stringify(r[0]?.values, null, 2));
  }

  if (tables.includes('CuratedAsset')) {
    const cols = db.exec('PRAGMA table_info(CuratedAsset)')[0].values.map((v) => v[1]);
    console.log('\nCuratedAsset cols:', cols.join(', '));
    const r = db.exec('SELECT * FROM CuratedAsset LIMIT 5');
    console.log('CuratedAsset sample:', JSON.stringify(r[0]?.values, null, 2));
  }
}

async function probePubImages() {
  const pubs = [
    ['lff', ''],
    ['ll', ''],
    ['lffi', ''],
    ['lff', '20240100'],
    ['g', '201802'],
    ['g18', '2'],
    ['g18', '201802'],
    ['sfg', ''],
    ['fg', ''],
    ['th', ''],
    ['t', ''],
    ['tr', ''],
    ['pc', ''],
    ['inv', ''],
  ];

  for (const [pub, issue] of pubs) {
    const url = new URL('https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS');
    url.searchParams.set('pub', pub);
    url.searchParams.set('issue', issue);
    url.searchParams.set('fileformat', 'JWPUB');
    url.searchParams.set('output', 'json');
    url.searchParams.set('langwritten', 'T');
    url.searchParams.set('txtCMSLang', 'T');
    url.searchParams.set('alllangs', '0');
    const r = await fetch(url);
    if (!r.ok) {
      console.log(pub, issue, 'HTTP', r.status);
      continue;
    }
    const d = await r.json();
    const img = d.pubImage?.url || d.files?.T?.JWPUB?.[0]?.trackImage?.url || '';
    console.log(pub, issue, '|', (d.pubName || '').slice(0, 50), '| img:', img.slice(0, 80));
  }
}

console.log('=== Catalog ===');
await probeCatalog();
console.log('\n=== Pub images ===');
await probePubImages();
