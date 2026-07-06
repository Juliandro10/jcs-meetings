import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const manifest = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const gz = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${manifest.current}/catalog.db.gz`);
const dbBuf = gunzipSync(Buffer.from(await gz.arrayBuffer()));
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

for (const listType of [0, 1, 2]) {
  const rows =
    db.exec(`
    SELECT p.KeySymbol, p.Year, p.Title, ca.SortOrder
    FROM CuratedAsset ca
    JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
    JOIN Publication p ON p.Id = pa.PublicationId
    WHERE ca.ListType = ${listType} AND p.MepsLanguageId=5 AND p.PublicationTypeId=2
    ORDER BY ca.SortOrder
    LIMIT 15
  `)[0]?.values ?? [];
  console.log('\nListType', listType, 'books first 15:', rows.length);
  for (const r of rows) console.log(' ', r);
}

const ybInMain =
  db.exec(`
  SELECT COUNT(*) FROM Publication p
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2 AND p.KeySymbol LIKE 'yb%'
`)[0]?.values?.[0];
console.log('\nyb count in books type:', ybInMain);

const ybYears =
  db.exec(`
  SELECT MIN(Year), MAX(Year), COUNT(*) FROM Publication p
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2 AND p.KeySymbol LIKE 'yb%'
`)[0]?.values?.[0];
console.log('yb min/max/count:', ybYears);

// publications without cover fragment
const noCover =
  db.exec(`
  SELECT p.KeySymbol, p.Year, p.Title
  FROM Publication p
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2
  AND NOT EXISTS (
    SELECT 1 FROM PublicationAsset pa
    JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE pa.PublicationId = p.Id AND ia.NameFragment LIKE '%600x600%'
  )
  LIMIT 10
`)[0]?.values ?? [];
console.log('\nbooks without 600x600 cover:', noCover.length);
for (const r of noCover) console.log(' ', r);
