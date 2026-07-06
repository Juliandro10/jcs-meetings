import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const AKAMAI = 'https://assetsnffrgf-a.akamaihd.net/assets/m';
const JW_CDN = 'https://b.jw-cdn.org';

function coverUrlV1(fragment) {
  const normalized = String(fragment).replace(/^\//, '');
  if (normalized.startsWith('images/')) return `${JW_CDN}/${normalized}`;
  const m = normalized.match(/(\d+)_([a-z]+)_(sqr|lsr)-/i);
  if (m) return `${AKAMAI}/${m[1]}/${m[2]}/art/${m[1]}_${m[2]}_${m[3].toLowerCase()}_xl.jpg`;
  return null;
}

function coverUrlFixed(fragment) {
  const normalized = String(fragment).replace(/^\//, '');
  const m = normalized.match(/(\d+)_([a-z]+)_(sqr|lsr)-/i);
  if (m) {
    const [, assetId, variant, shape] = m;
    return `${AKAMAI}/${assetId}/${variant}/art/${assetId}_${variant}_${shape.toLowerCase()}_xl.jpg`;
  }
  if (normalized.startsWith('images/')) {
    if (/_tile-/i.test(normalized)) {
      return `${JW_CDN}/${normalized.replace(/-(\d+)x(\d+)(\.jpg)$/i, '-1200x1200$2')}`;
    }
    return `${JW_CDN}/${normalized}`;
  }
  return null;
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
  WHERE p.MepsLanguageId=5 AND p.KeySymbol IN ('w','wp','mwb') AND p.PublicationTypeId IN (14,30)
  ORDER BY p.IssueTagNumber DESC LIMIT 80
`)[0]?.values ?? [];

async function check(label, fn) {
  let ok = 0;
  let fail = 0;
  for (const [, , frag] of rows) {
    const url = fn(frag);
    if (!url) {
      fail++;
      continue;
    }
    const r = await fetch(url, { method: 'HEAD', headers: { Referer: 'https://www.jw.org/' } });
    if (r.ok) ok++;
    else fail++;
  }
  console.log(label, { ok, fail, total: rows.length });
}

await check('broken (jw-cdn first)', coverUrlV1);
await check('fixed (akamai first)', coverUrlFixed);
