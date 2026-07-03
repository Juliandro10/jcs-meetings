import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const CATALOG_IMAGE_BASE = 'https://app.jw-cdn.org/catalogs/publications/v4/images/';

const man = await (await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json')).json();
const dbBuf = gunzipSync(
  Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${man.current}/catalog.db.gz`)).arrayBuffer()),
);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

const TEACHING_KIT_SORT_MIN = 5;
const TEACHING_KIT_SORT_MAX = 26;
const MEPS_PT = 5;

const r = db.exec(`
  SELECT ca.SortOrder, p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, ia.NameFragment
  FROM CuratedAsset ca
  JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
  JOIN Publication p ON p.Id = pa.PublicationId
  LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
  LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
  WHERE ca.ListType = 2
    AND p.MepsLanguageId = ${MEPS_PT}
    AND ca.SortOrder BETWEEN ${TEACHING_KIT_SORT_MIN} AND ${TEACHING_KIT_SORT_MAX}
    AND (ia.NameFragment IS NULL OR ia.NameFragment LIKE '%600x600%')
  ORDER BY ca.SortOrder, p.KeySymbol
`);

const seen = new Set();
for (const [sort, pub, issue, short, title, img] of r[0]?.values ?? []) {
  const key = `${pub}_${issue}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`${sort} | ${pub} | ${issue} | ${short} | ${img ? CATALOG_IMAGE_BASE + img : 'NO IMG'}`);
}
