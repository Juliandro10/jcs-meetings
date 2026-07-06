import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const manifest = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const gz = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${manifest.current}/catalog.db.gz`);
const dbBuf = gunzipSync(Buffer.from(await gz.arrayBuffer()));
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

const allBooks =
  db.exec(`
  SELECT KeySymbol, Year, Title, Reserved, Symbol
  FROM Publication WHERE MepsLanguageId=5 AND PublicationTypeId=2
  ORDER BY Title COLLATE NOCASE ASC
`)[0]?.values ?? [];

const isYearbook = (pub) => /^yb/i.test(pub) || /^syr/i.test(pub);

const regular = allBooks.filter(([pub]) => !isYearbook(String(pub)));
const yearbooks = allBooks.filter(([pub]) => isYearbook(String(pub)));

console.log('total', allBooks.length, 'regular', regular.length, 'yearbooks', yearbooks.length);

// Check Reserved values
const reservedCounts = {};
for (const [pub, year, title, reserved] of allBooks) {
  const k = String(reserved ?? 'null');
  reservedCounts[k] = (reservedCounts[k] ?? 0) + 1;
}
console.log('Reserved counts:', reservedCounts);

// List regular books with Reserved
console.log('\nRegular books Reserved sample:');
for (const r of regular.slice(0, 15)) console.log(r[0], r[3], r[1], String(r[2]).slice(0, 50));

console.log('\nRegular books with Reserved=1 or non-zero:');
for (const r of regular.filter((x) => x[3] && x[3] !== 0)) console.log(r);

// Try PublicationAsset ListType via join all ListTypes for books
const listTypes = db.exec(`
  SELECT ca.ListType, p.KeySymbol, p.Year, p.Title
  FROM CuratedAsset ca
  JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
  JOIN Publication p ON p.Id = pa.PublicationId
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2
  ORDER BY ca.ListType, ca.SortOrder
`)[0]?.values ?? [];
console.log('\nAll CuratedAsset books:', listTypes.length);
for (const r of listTypes) console.log(r);

// Search for ListType values across all publication types for library books list
for (let lt = 0; lt <= 10; lt++) {
  const c = db.exec(`
    SELECT COUNT(DISTINCT p.Id) FROM CuratedAsset ca
    JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
    JOIN Publication p ON p.Id = pa.PublicationId
    WHERE ca.ListType=${lt} AND p.MepsLanguageId=5 AND p.PublicationTypeId=2
  `)[0]?.values?.[0]?.[0];
  if (c > 0) console.log('ListType', lt, 'distinct books', c);
}

// Maybe ListType 3 = archive? probe all list types with book titles
const lt3 = db.exec(`
  SELECT ca.ListType, ca.SortOrder, p.KeySymbol, p.Year, p.Title
  FROM CuratedAsset ca
  JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
  JOIN Publication p ON p.Id = pa.PublicationId
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2 AND ca.ListType NOT IN (0,1,2)
  ORDER BY ca.ListType, ca.SortOrder
  LIMIT 50
`)[0]?.values ?? [];
console.log('\nNon 0/1/2 curated books:', lt3.length);
for (const r of lt3) console.log(r);
