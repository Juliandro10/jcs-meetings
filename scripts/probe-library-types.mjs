import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const man = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const gz = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${man.current}/catalog.db.gz`);
const dbBuf = gunzipSync(Buffer.from(await gz.arrayBuffer()));
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

const queries = [
  'SELECT PublicationTypeId, COUNT(*) c FROM Publication WHERE MepsLanguageId=5 GROUP BY PublicationTypeId ORDER BY c DESC',
  "SELECT KeySymbol, PublicationTypeId, IssueTagNumber, Title FROM Publication WHERE MepsLanguageId=5 AND KeySymbol IN ('w','mwb','g','bh','lr','lmd','sfg') ORDER BY KeySymbol, IssueTagNumber DESC LIMIT 20",
  "SELECT KeySymbol, PublicationTypeId, IssueTagNumber, ShortTitle FROM Publication WHERE MepsLanguageId=5 AND KeySymbol LIKE 'T-%' LIMIT 15",
];

for (let typeId = 1; typeId <= 8; typeId++) {
  queries.push(
    `SELECT KeySymbol, PublicationTypeId, IssueTagNumber, Title FROM Publication WHERE MepsLanguageId=5 AND PublicationTypeId=${typeId} LIMIT 8`,
  );
}

for (const q of queries) {
  try {
    const r = db.exec(q);
    console.log('\n===', q.slice(0, 100), '===');
    console.log(JSON.stringify(r[0]?.values, null, 2));
  } catch (e) {
    console.log('ERR', e.message);
  }
}

for (const sym of ['w', 'mwb', 'mwb26', 'w26', 'lfb', 'lmd', 'sfg', 'lff']) {
  const r = db.exec(`
    SELECT KeySymbol, PublicationTypeId, IssueTagNumber, Title
    FROM Publication
    WHERE MepsLanguageId=5 AND KeySymbol='${sym}'
    ORDER BY IssueTagNumber DESC LIMIT 3
  `);
  console.log('\nSYM', sym, JSON.stringify(r[0]?.values));
}

const r14 = db.exec(`
  SELECT KeySymbol, PublicationTypeId, IssueTagNumber, Title
  FROM Publication WHERE MepsLanguageId=5 AND PublicationTypeId=14
  ORDER BY IssueTagNumber DESC LIMIT 8
`);
console.log('\nTYPE 14', JSON.stringify(r14[0]?.values));

const rmwb = db.exec(`
  SELECT KeySymbol, PublicationTypeId, COUNT(*) c
  FROM Publication WHERE MepsLanguageId=5 AND KeySymbol LIKE 'mwb%'
  GROUP BY KeySymbol, PublicationTypeId
`);
console.log('\nMWB GROUP', JSON.stringify(rmwb[0]?.values));

