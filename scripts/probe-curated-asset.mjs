import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

const man = await (await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json')).json();
const dbBuf = gunzipSync(
  Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${man.current}/catalog.db.gz`)).arrayBuffer()),
);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

for (const t of ['PublicationAsset', 'ImageAsset', 'PublicationAssetImageMap']) {
  console.log(t, db.exec(`PRAGMA table_info(${t})`)[0].values.map((v) => v[1]).join(', '));
}

const langIds = db.exec(
  "SELECT MepsLanguageId, KeySymbol, ShortTitle FROM Publication WHERE KeySymbol IN ('lff','ll','T-31','T-32') AND ShortTitle LIKE '%Feliz%' OR KeySymbol='T-31' LIMIT 20",
);
console.log('\nlang sample:', JSON.stringify(langIds[0]?.values, null, 2));

const listTypes = db.exec('SELECT DISTINCT ListType, COUNT(*) FROM CuratedAsset GROUP BY ListType');
console.log('\nListTypes:', listTypes[0]?.values);

for (const listType of [2]) {
  const r = db.exec(`
    SELECT ca.SortOrder, p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, ia.NameFragment
    FROM CuratedAsset ca
    JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
    JOIN Publication p ON p.Id = pa.PublicationId
    LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE ca.ListType = ${listType} AND p.MepsLanguageId = 5 AND ca.SortOrder BETWEEN 5 AND 26
      AND (ia.NameFragment IS NULL OR ia.NameFragment LIKE '%600x600%')
    ORDER BY ca.SortOrder, p.KeySymbol
  `);
  console.log(`\n=== Teaching kit candidates (${r[0]?.values?.length ?? 0}) ===`);
  for (const row of r[0]?.values ?? []) console.log(row.join(' | '));
}

const gIssues = db.exec(`
  SELECT IssueTagNumber, ShortTitle, Title
  FROM Publication
  WHERE KeySymbol='g' AND MepsLanguageId=5 AND IssueTagNumber BETWEEN 20180100 AND 20181200
  ORDER BY IssueTagNumber
`);
console.log('\nG 2018 issues:');
for (const row of gIssues[0]?.values ?? []) console.log(row.join(' | '));

  const r = db.exec(`
    SELECT ca.SortOrder, p.KeySymbol, p.IssueTagNumber, p.ShortTitle, ia.NameFragment
    FROM CuratedAsset ca
    JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
    JOIN Publication p ON p.Id = pa.PublicationId
    LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE ca.ListType = ${listType} AND p.MepsLanguageId = 5
    ORDER BY ca.SortOrder
  `);
  console.log(`\n=== ListType ${listType} PT-BR (${r[0]?.values?.length ?? 0} items) ===`);
  for (const row of r[0]?.values ?? []) console.log(row.join(' | '));
}

for (const langId of [5]) {
  const r = db.exec(`
    SELECT ca.ListType, ca.SortOrder, p.MepsLanguageId, p.KeySymbol, p.IssueTagNumber, p.ShortTitle, ia.NameFragment
    FROM CuratedAsset ca
    JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
    JOIN Publication p ON p.Id = pa.PublicationId
    LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE p.MepsLanguageId = ${langId}
    ORDER BY ca.ListType, ca.SortOrder
    LIMIT 50
  `);
  if (r[0]?.values?.length) {
    console.log(`\n=== MepsLanguageId ${langId} (${r[0].values.length} rows) ===`);
    for (const row of r[0].values) console.log(row.join(' | '));
  }
}

// Find Portuguese T tracts titles
const tracts = db.exec(`
  SELECT MepsLanguageId, KeySymbol, ShortTitle, Title
  FROM Publication
  WHERE KeySymbol LIKE 'T-%' AND MepsLanguageId = 5
  ORDER BY KeySymbol
`);
console.log('\nPortuguese tracts count:', tracts[0]?.values?.length);
for (const row of tracts[0]?.values ?? []) console.log(row.join(' | '));
