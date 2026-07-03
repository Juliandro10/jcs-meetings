import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const initSqlJs = (await import('sql.js')).default;

const catalogDir = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'catalog');
const dbPath = fs.readdirSync(catalogDir).find((f) => f.startsWith('catalog-') && f.endsWith('.db'));
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(fs.readFileSync(path.join(catalogDir, dbPath)));

const AKAMAI = 'https://assetsnffrgf-a.akamaihd.net/assets/m';

function coverFromFragment(fragment) {
  if (!fragment) return null;
  const match = fragment.match(/(\d+)_([a-z]+)_sqr-/i);
  if (!match) return null;
  const [, assetId, variant] = match;
  return `${AKAMAI}/${assetId}/${variant}/art/${assetId}_${variant}_sqr_xl.jpg`;
}

for (const pub of ['T-ftr', 'T-fam', 'T-god', 'lff', 'g']) {
  const rows =
    db.exec(`
    SELECT ia.NameFragment FROM Publication p
    LEFT JOIN PublicationAsset pa ON pa.PublicationId = p.Id
    LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE p.MepsLanguageId = 5 AND p.KeySymbol = '${pub}'
    AND (ia.NameFragment IS NULL OR ia.NameFragment LIKE '%600x600%')
    LIMIT 3
  `)[0]?.values ?? [];
  for (const [fragment] of rows) {
    const url = coverFromFragment(fragment);
    let ok = false;
    if (url) {
      const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
      ok = r.ok;
    }
    console.log(pub, fragment, ok ? 'OK' : 'FAIL', url ?? '-');
  }
}
