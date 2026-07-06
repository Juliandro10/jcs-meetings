import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const AKAMAI = 'https://assetsnffrgf-a.akamaihd.net/assets/m';
const JW_CDN = 'https://b.jw-cdn.org';

function coverUrlFromImageFragment(fragment) {
  if (!fragment) return undefined;
  const normalized = fragment.replace(/^\//, '');
  const akamaiMatch = normalized.match(/(\d+)_([a-z]+)_(sqr|lsr|wss|wpub|sqs|lss)-/i);
  if (akamaiMatch) {
    const [, assetId, variant, shape] = akamaiMatch;
    return `${AKAMAI}/${assetId}/${variant}/art/${assetId}_${variant}_${shape.toLowerCase()}_xl.jpg`;
  }
  if (/_tile-/i.test(normalized)) {
    const path = normalized.startsWith('images/') ? normalized : `images/${normalized}`;
    return `${JW_CDN}/${path.replace(/-\d+x\d+(\.jpg)$/i, '-1200x1200$1')}`;
  }
  if (normalized.startsWith('images/')) return `${JW_CDN}/${normalized}`;
  return undefined;
}

const require = createRequire(import.meta.url);
const manifest = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const gz = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${manifest.current}/catalog.db.gz`);
const dbBuf = gunzipSync(Buffer.from(await gz.arrayBuffer()));
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

const subquery = `
  (
    SELECT ia2.NameFragment
    FROM PublicationAsset pa2
    JOIN PublicationAssetImageMap m2 ON m2.PublicationAssetId = pa2.Id
    JOIN ImageAsset ia2 ON ia2.Id = m2.ImageAssetId
    WHERE pa2.PublicationId = p.Id
      AND (
        ia2.NameFragment LIKE '%600x600%'
        OR ia2.NameFragment LIKE '%1200x%'
        OR ia2.NameFragment LIKE '%_sqr-%'
        OR ia2.NameFragment LIKE '%_lsr-%'
        OR ia2.NameFragment LIKE '%_tile-%'
      )
    ORDER BY
      CASE
        WHEN ia2.NameFragment LIKE '%600x600%' THEN 0
        WHEN ia2.NameFragment LIKE '%1200x%' THEN 1
        ELSE 2
      END,
      LENGTH(ia2.NameFragment) DESC
    LIMIT 1
  ) AS NameFragment
`;

const rows =
  db.exec(`
  SELECT p.KeySymbol, ${subquery}
  FROM Publication p
  WHERE p.MepsLanguageId = 5 AND p.KeySymbol LIKE 'T-%' AND p.PublicationTypeId = 10
  ORDER BY p.ShortTitle
`)[0]?.values ?? [];

let ok = 0;
let fail = 0;
for (const [pub, frag] of rows) {
  const url = coverUrlFromImageFragment(String(frag));
  if (!url) {
    fail++;
    console.log('NO URL', pub, frag);
    continue;
  }
  const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.jw.org/' } });
  if (r.ok) ok++;
  else {
    fail++;
    console.log(r.status, pub, url);
  }
}
console.log({ total: rows.length, ok, fail });
