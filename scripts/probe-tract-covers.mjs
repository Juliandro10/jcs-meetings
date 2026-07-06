import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const manifest = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const gz = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${manifest.current}/catalog.db.gz`);
const dbBuf = gunzipSync(Buffer.from(await gz.arrayBuffer()));
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

for (const pub of ['T-30', 'T-ftr', 'T-26', 'bh', 'lmd']) {
  const rows =
    db.exec(`
    SELECT p.KeySymbol, ia.NameFragment
    FROM Publication p
    LEFT JOIN PublicationAsset pa ON pa.PublicationId = p.Id
    LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE p.MepsLanguageId = 5 AND p.KeySymbol = '${pub}'
    LIMIT 8
  `)[0]?.values ?? [];
  console.log('\n---', pub);
  for (const row of rows) console.log(' ', row);
}

// GETPUBMEDIALINKS cover for tract
const apiUrl =
  'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?pub=T-30&issue=&fileformat=JWPUB&output=json&langwritten=T&txtCMSLang=T&alllangs=0';
const api = await fetch(apiUrl).then((r) => r.json());
console.log('\nGETPUBMEDIALINKS T-30 images:', JSON.stringify(api?.pub?.[0]?.files?.JWPUB?.[0]?.images ?? api?.pub?.[0]?.images, null, 2));

const tractRows =
  db.exec(`
  SELECT p.KeySymbol, ia.NameFragment
  FROM Publication p
  LEFT JOIN PublicationAsset pa ON pa.PublicationId = p.Id
  LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
  LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
  WHERE p.MepsLanguageId = 5 AND p.KeySymbol LIKE 'T-%' AND p.PublicationTypeId = 10
  AND ia.NameFragment LIKE '%600x600%'
  ORDER BY p.ShortTitle
`)[0]?.values ?? [];

let sqr = 0;
let tile = 0;
let other = 0;
for (const [pub, frag] of tractRows) {
  if (/univ_sqr|_sqr-/.test(String(frag))) sqr++;
  else if (/tile/.test(String(frag))) tile++;
  else {
    other++;
    console.log('other', pub, frag);
  }
}
console.log('\ntract covers:', { total: tractRows.length, sqr, tile, other });
