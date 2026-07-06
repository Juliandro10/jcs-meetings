import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const AKAMAI = 'https://assetsnffrgf-a.akamaihd.net/assets/m';
const JW_CDN = 'https://b.jw-cdn.org';
const CATALOG_IMAGES = 'https://app.jw-cdn.org/catalogs/publications/v4/images/';

function akamaiUrl(fragment) {
  const n = String(fragment).replace(/^\//, '');
  const m = n.match(/(\d+)_([a-z]+)_(sqr|lsr)-/i);
  if (!m) return null;
  return `${AKAMAI}/${m[1]}/${m[2]}/art/${m[1]}_${m[2]}_${m[3].toLowerCase()}_xl.jpg`;
}

const require = createRequire(import.meta.url);
const m = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const db = new (await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) })).Database(
  gunzipSync(Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${m.current}/catalog.db.gz`)).arrayBuffer())),
);

const coverSub = `(SELECT ia2.NameFragment FROM PublicationAsset pa2 JOIN PublicationAssetImageMap m2 ON m2.PublicationAssetId=pa2.Id JOIN ImageAsset ia2 ON ia2.Id=m2.ImageAssetId WHERE pa2.PublicationId=p.Id AND (ia2.NameFragment LIKE '%600x600%' OR ia2.NameFragment LIKE '%_sqr-%' OR ia2.NameFragment LIKE '%_tile-%') ORDER BY CASE WHEN ia2.NameFragment LIKE '%600x600%' THEN 0 WHEN ia2.NameFragment LIKE '%_sqr-%' THEN 1 ELSE 2 END LIMIT 1)`;

const rows =
  db.exec(`
  SELECT p.KeySymbol, p.IssueTagNumber, ${coverSub}
  FROM Publication p
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId IN (2,4,10,13,14,30)
`)[0]?.values ?? [];

const fails = [];
for (const [pub, issue, frag] of rows) {
  const url = akamaiUrl(frag);
  if (!url) {
    fails.push({ pub, issue, frag, reason: 'no-akamai-match' });
    continue;
  }
  const r = await fetch(url, { method: 'HEAD', headers: { Referer: 'https://www.jw.org/' } });
  if (!r.ok) fails.push({ pub, issue, frag, reason: `akamai-${r.status}` });
}

const byFrag = new Map();
for (const f of fails) byFrag.set(String(f.frag), (byFrag.get(String(f.frag)) ?? 0) + 1);
console.log('Total pubs:', rows.length, '| missing cover URL:', fails.length);
console.log('Unique failing fragments:', byFrag.size);
console.log('Top fragments:', [...byFrag.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8));

// Test fallbacks for first 5 unique fails
const seen = new Set();
for (const f of fails) {
  if (seen.has(f.frag)) continue;
  seen.add(f.frag);
  const frag = String(f.frag);
  const tries = [
    `${JW_CDN}/${frag}`,
    `${CATALOG_IMAGES}${frag}`,
    frag.includes('generic_tile') ? `${JW_CDN}/${frag.replace(/-600x600/, '-1200x1200')}` : null,
  ].filter(Boolean);
  console.log('\nFail sample', f.pub, f.issue, frag);
  for (const u of tries) {
    const r = await fetch(u, { method: 'HEAD', headers: { Referer: 'https://www.jw.org/', Origin: 'https://www.jw.org' } });
    console.log(' ', r.status, u.slice(0, 90));
  }
  if (seen.size >= 4) break;
}
