import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const m = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const db = new (await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) })).Database(
  gunzipSync(Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${m.current}/catalog.db.gz`)).arrayBuffer())),
);

const coverSub = `
  (SELECT ia2.NameFragment
   FROM PublicationAsset pa2
   JOIN PublicationAssetImageMap m2 ON m2.PublicationAssetId = pa2.Id
   JOIN ImageAsset ia2 ON ia2.Id = m2.ImageAssetId
   WHERE pa2.PublicationId = p.Id
     AND (ia2.NameFragment LIKE '%600x600%'
       OR ia2.NameFragment LIKE '%1200x%'
       OR ia2.NameFragment LIKE '%400.jpg%'
       OR ia2.NameFragment LIKE '%280.jpg%'
       OR ia2.NameFragment LIKE '%_sqr-%'
       OR ia2.NameFragment LIKE '%_lsr-%'
       OR ia2.NameFragment LIKE '%_tile-%')
   ORDER BY
     CASE
       WHEN ia2.NameFragment LIKE '%600x600%' THEN 0
       WHEN ia2.NameFragment LIKE '%1200x%' THEN 1
       WHEN ia2.NameFragment LIKE '%400.jpg%' THEN 2
       WHEN ia2.NameFragment LIKE '%280.jpg%' THEN 3
       WHEN ia2.NameFragment LIKE '%270x270%' THEN 4
       ELSE 5
     END,
     LENGTH(ia2.NameFragment) DESC
   LIMIT 1)`;

const rows =
  db.exec(`
  SELECT p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, ${coverSub}
  FROM Publication p
  WHERE p.MepsLanguageId = 5 AND p.KeySymbol IN ('w', 'wp') AND p.PublicationTypeId = 14
  ORDER BY p.IssueTagNumber DESC
`)[0]?.values ?? [];

console.log('Total w/wp rows:', rows.length);

const byFrag = new Map();
const byTitle = new Map();
for (const r of rows) {
  const frag = String(r[4] ?? 'NULL');
  byFrag.set(frag, (byFrag.get(frag) ?? 0) + 1);
  const title = String(r[3] ?? '');
  byTitle.set(title, (byTitle.get(title) ?? 0) + 1);
}

console.log('Unique cover fragments:', byFrag.size);
console.log('Top fragment counts:', [...byFrag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5));
console.log('Unique titles:', byTitle.size);
console.log('Top titles:', [...byTitle.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5));

console.log('\nRecent 10 study (w):');
for (const r of rows.filter((x) => x[0] === 'w').slice(0, 10)) {
  console.log(r[1], String(r[2]).slice(0, 40), '| frag:', String(r[4]).slice(-40));
}

console.log('\nAll image fragments for one issue (20250100):');
const oneId = rows.find((r) => r[0] === 'w' && String(r[1]).startsWith('202501'))?.[1];
if (oneId) {
  const pubId = db.exec(`SELECT Id FROM Publication WHERE MepsLanguageId=5 AND KeySymbol='w' AND IssueTagNumber=${oneId}`)[0]?.values?.[0]?.[0];
  const imgs = db.exec(`
    SELECT ia.NameFragment FROM PublicationAsset pa
    JOIN PublicationAssetImageMap m ON m.PublicationAssetId=pa.Id
    JOIN ImageAsset ia ON ia.Id=m.ImageAssetId
    WHERE pa.PublicationId=${pubId}
  `)[0]?.values?.map((r) => r[0]) ?? [];
  console.log('pubId', pubId, 'images:', imgs.length);
  for (const img of imgs.slice(0, 15)) console.log(' ', img);
}

const archiveBefore = (new Date().getFullYear() - 2) * 10000 + 100;
const currentRows =
  db.exec(`
  SELECT p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, ${coverSub}
  FROM Publication p
  WHERE p.MepsLanguageId = 5 AND p.KeySymbol IN ('w', 'wp') AND p.PublicationTypeId = 14
    AND p.IssueTagNumber >= ${archiveBefore}
  ORDER BY p.IssueTagNumber DESC
`)[0]?.values ?? [];
const archiveRows =
  db.exec(`
  SELECT p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, ${coverSub}
  FROM Publication p
  WHERE p.MepsLanguageId = 5 AND p.KeySymbol IN ('w', 'wp') AND p.PublicationTypeId = 14
    AND p.IssueTagNumber < ${archiveBefore}
  ORDER BY p.IssueTagNumber DESC LIMIT 120
`)[0]?.values ?? [];

function stats(label, list) {
  const frags = new Map();
  const titles = new Map();
  for (const r of list) {
    const f = String(r[4] ?? 'NULL');
    frags.set(f, (frags.get(f) ?? 0) + 1);
    titles.set(String(r[3]), (titles.get(String(r[3])) ?? 0) + 1);
  }
  console.log(`\n${label}: ${list.length} issues`);
  console.log('  unique covers:', frags.size, '| generic_tile:', frags.get('images/10/generic_tile-600x600.jpg') ?? 0, '| null:', frags.get('NULL') ?? 0);
  console.log('  unique titles:', titles.size);
  console.log('  sample:', list.slice(0, 3).map((r) => [r[0], r[1], r[2], String(r[3]).slice(0, 50), String(r[4]).slice(-35)]));
}
stats('CURRENT (app query)', currentRows);
stats('ARCHIVE (app query, max 120)', archiveRows);

const allAppRows = [...currentRows, ...archiveRows];
const wStudy = allAppRows.filter((r) => r[0] === 'w');
const fragCount = new Map();
for (const r of wStudy) {
  const f = String(r[4] ?? 'NULL');
  fragCount.set(f, (fragCount.get(f) ?? 0) + 1);
}
console.log('\nStudy (w) in app list:', wStudy.length, 'unique frags:', fragCount.size);
console.log('Duplicate frags:', [...fragCount.entries()].filter(([, c]) => c > 1));

function akamaiUrl(fragment) {
  const normalized = String(fragment).replace(/^\//, '');
  const m = normalized.match(/(\d+)_([a-z]+)_(sqr|lsr)-/i);
  if (m) return `https://assetsnffrgf-a.akamaihd.net/assets/m/${m[1]}/${m[2]}/art/${m[1]}_${m[2]}_${m[3].toLowerCase()}_xl.jpg`;
  if (normalized.startsWith('images/')) return `https://b.jw-cdn.org/${normalized}`;
  return null;
}
console.log('\nFirst 5 w URLs:', wStudy.slice(0, 5).map((r) => akamaiUrl(r[4])));

const dups =
  db.exec(`
  SELECT KeySymbol, IssueTagNumber, COUNT(*) AS c
  FROM Publication
  WHERE MepsLanguageId = 5 AND KeySymbol IN ('w', 'wp')
  GROUP BY KeySymbol, IssueTagNumber
  HAVING c > 1
`)[0]?.values ?? [];
console.log('\nDuplicate pub+issue rows:', dups.length);
const genericInList = allAppRows.filter((r) => r[4] === 'images/10/generic_tile-600x600.jpg').length;
console.log('generic_tile in app list (156 items):', genericInList);
