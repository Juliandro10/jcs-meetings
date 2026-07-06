import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const m = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const db = new (await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) })).Database(
  gunzipSync(Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${m.current}/catalog.db.gz`)).arrayBuffer())),
);

function bookAttrs(pub) {
  return db.exec(`
    SELECT pa.Name FROM PublicationAttributeMap pam
    JOIN PublicationAttribute pa ON pa.Id = pam.PublicationAttributeId
    JOIN Publication p ON p.Id = pam.PublicationId
    WHERE p.MepsLanguageId=5 AND p.KeySymbol='${pub}'
  `)[0]?.values?.map((r) => r[0]) ?? [];
}

// Known current from JW screenshot (pub symbols from DB match)
const currentPubs = [
  'rr', 'gm', 'cl', 'wcg', 'lfb', 'lr', 'be', 'sjj', 'kl', 'lvs', 'bt', 'it', 'nwtstg', 'ia', 'jy', 'lv',
  'gt', 'bh', 'kr', 'od', 'yp1', 'yp2', 'scl', 'lff', 'jv', 'si', 'cf', 'bhs',
];

const archiveSample = ['bw', 'lp', 'ce', 'wt', 'ad', 'ka', 'gh', 'sn', 'hp'];

console.log('Current book attrs:');
for (const pub of currentPubs.slice(0, 5)) {
  console.log(pub, bookAttrs(pub));
}
console.log('\nArchive book attrs:');
for (const pub of archiveSample) {
  console.log(pub, bookAttrs(pub));
}

// Count attrs per book for all regular books
const all = db.exec(`
  SELECT p.KeySymbol, p.Title FROM Publication p
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2
  AND p.KeySymbol NOT LIKE 'yb%' AND p.KeySymbol NOT LIKE 'syr%'
`)[0]?.values ?? [];

const withStudy = [];
const withoutStudy = [];
for (const [pub, title] of all) {
  const attrs = bookAttrs(String(pub));
  if (attrs.includes('Study')) withStudy.push(pub);
  else withoutStudy.push(pub);
}
console.log('\nWith Study attr', withStudy.length, withoutStudy.length);

// List all unique attribute combos for regular books
const combo = new Map();
for (const [pub] of all) {
  const key = bookAttrs(String(pub)).sort().join('|') || '(none)';
  if (!combo.has(key)) combo.set(key, []);
  combo.get(key).push(pub);
}
console.log('\nAttribute combos:');
for (const [k, pubs] of [...combo.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
  console.log(k, 'count', pubs.length, 'sample', pubs.slice(0, 4).join(','));
}

// Is current set exactly the combo with most books?
const currentSet = new Set(currentPubs);
const missingFromCurrent = all.filter(([p]) => !currentSet.has(String(p))).map(([p, t]) => [p, t]);
console.log('\nNot in our current list', missingFromCurrent.length);
for (const [p, t] of missingFromCurrent.slice(0, 20)) console.log(p, String(t).slice(0, 50));
