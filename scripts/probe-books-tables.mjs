import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const m = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const db = new (await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) })).Database(
  gunzipSync(Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${m.current}/catalog.db.gz`)).arrayBuffer())),
);

console.log('PublicationAttribute cols:', db.exec('PRAGMA table_info(PublicationAttribute)')[0].values.map((r) => r[1]));
console.log('PublicationAttributeMap cols:', db.exec('PRAGMA table_info(PublicationAttributeMap)')[0].values.map((r) => r[1]));

const attrs = db.exec('SELECT * FROM PublicationAttribute LIMIT 30')[0];
console.log('\nPublicationAttribute rows:', attrs?.values?.length);
for (const row of attrs?.values ?? []) console.log(row);

const attrBooks = db.exec(`
  SELECT pa_attr.Name, pa_attr.Value, p.KeySymbol, p.Title
  FROM PublicationAttributeMap pam
  JOIN PublicationAttribute pa_attr ON pa_attr.Id = pam.PublicationAttributeId
  JOIN Publication p ON p.Id = pam.PublicationId
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2
  LIMIT 40
`)[0]?.values ?? [];
console.log('\nAttribute map for books:', attrBooks.length);
for (const r of attrBooks.slice(0, 20)) console.log(r);

// PublicationRootKey table
console.log('\nPublicationRootKey cols:', db.exec('PRAGMA table_info(PublicationRootKey)')[0].values.map((r) => r[1]));
const rootSample = db.exec(`
  SELECT prk.*, p.KeySymbol, p.Title
  FROM Publication p
  JOIN PublicationRootKey prk ON prk.Id = p.PublicationRootKeyId
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2
  LIMIT 10
`)[0];
console.log('RootKey join cols', rootSample?.columns);
for (const r of rootSample?.values ?? []) console.log(r);
