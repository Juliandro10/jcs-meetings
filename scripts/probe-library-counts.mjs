import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const manifest = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const gz = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${manifest.current}/catalog.db.gz`);
const dbBuf = gunzipSync(Buffer.from(await gz.arrayBuffer()));
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

const queries = {
  books: 'p.PublicationTypeId = 2',
  brochures: 'p.PublicationTypeId = 4',
  tracts: "p.KeySymbol LIKE 'T-%' AND p.PublicationTypeId = 10",
  watchtower: "p.KeySymbol IN ('w', 'wp') AND p.PublicationTypeId = 14",
  awake: "p.KeySymbol = 'g' AND p.PublicationTypeId = 13",
  workbooks: "p.KeySymbol = 'mwb' AND p.PublicationTypeId = 30",
};

for (const [name, where] of Object.entries(queries)) {
  const count =
    db.exec(`SELECT COUNT(*) FROM Publication p WHERE p.MepsLanguageId=5 AND ${where}`)[0]?.values?.[0]?.[0] ?? 0;
  console.log(name, count);
}

const wIssues =
  db.exec(`
  SELECT KeySymbol, IssueTagNumber, Year, ShortTitle
  FROM Publication WHERE MepsLanguageId=5 AND KeySymbol='w'
  ORDER BY IssueTagNumber DESC LIMIT 5
`)[0]?.values ?? [];
console.log('\nw recent:', wIssues);

const wOld =
  db.exec(`
  SELECT KeySymbol, IssueTagNumber, Year
  FROM Publication WHERE MepsLanguageId=5 AND KeySymbol='w'
  ORDER BY IssueTagNumber ASC LIMIT 3
`)[0]?.values ?? [];
console.log('w oldest:', wOld);
