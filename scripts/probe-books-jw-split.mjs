import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const manifest = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const gz = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${manifest.current}/catalog.db.gz`);
const dbBuf = gunzipSync(Buffer.from(await gz.arrayBuffer()));
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(dbBuf);

// JW current books from screenshot (KeySymbol guesses)
const jwCurrent = [
  'rr', 'gm', 'cl', 'wcg', 'lfb', 'lr', 'be', 'sjj', 'lff', 'lvs', 'bt', 'nwtsty', 'nwtstg',
  'ia', 'lff', 'bh', 'kr', 'od', 'yp1', 'yp2', 'scl', 'jt', 'si', 'cf', 'bhs', 'bh', 'lv',
  'jes', 'jy', 'lf', 'od',
];

const all = db.exec(`
  SELECT KeySymbol, Year, Title, PublicationRootKeyId, Reserved
  FROM Publication WHERE MepsLanguageId=5 AND PublicationTypeId=2
  AND KeySymbol NOT LIKE 'yb%' AND KeySymbol NOT LIKE 'syr%'
  ORDER BY Title COLLATE NOCASE
`)[0]?.values ?? [];

console.log('Regular books', all.length);

// Check if archive books share RootKeyId pattern
const rootIds = new Map();
for (const row of all) {
  const root = row[3];
  if (!rootIds.has(root)) rootIds.set(root, []);
  rootIds.get(root).push(row[0]);
}

// PublicationAsset - any OutOfPrint or Discontinued column?
const paCols = db.exec('PRAGMA table_info(PublicationAsset)')[0].values.map((r) => r[1]);
console.log('PublicationAsset cols:', paCols);

const paSample = db.exec(`
  SELECT pa.*, p.KeySymbol, p.Year
  FROM PublicationAsset pa
  JOIN Publication p ON p.Id = pa.PublicationId
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2
  LIMIT 3
`)[0];
console.log('PA columns', paSample?.columns);
console.log('PA sample row', paSample?.values?.[0]);

// Match known current vs archive from titles
const jwCurrentTitles = [
  'A Adoração Pura',
  'A Bíblia',
  'Achegue-se a Jeová',
  'Ande Corajosamente',
  'Aprenda com as Histórias',
  'Aprenda do Grande Instrutor',
  'Beneficie-se',
  'Cante de Coração',
  'Conhecimento Que Conduz',
  'Continue a Amar',
  'Dê Testemunho Cabal',
  'Estudo Perspicaz',
  'Glossário',
  'Imite a Sua Fé',
  'Jesus — o Caminho',
  'Mantenha-se no Amor',
  'O Maior Homem',
  'O Que a Bíblia Realmente',
  'O Reino de Deus já Governa',
  'Organizados para Fazer',
  'Os Jovens Perguntam',
  'Princípios Bíblicos',
  'Seja Feliz para Sempre',
  'Testemunhas de Jeová — Proclamadores',
  'Toda a Escritura',
  'Venha Ser Meu Seguidor',
  'Você Pode Entender',
];

function matchesCurrent(title) {
  return jwCurrentTitles.some((prefix) => String(title).startsWith(prefix));
}

const classified = { current: [], archive: [] };
for (const [pub, year, title, root, reserved] of all) {
  if (matchesCurrent(String(title))) classified.current.push([pub, year, title]);
  else classified.archive.push([pub, year, title]);
}

console.log('\nMatched current', classified.current.length);
console.log('Matched archive', classified.archive.length);
console.log('\nUnmatched (archive candidates):');
for (const r of classified.archive.slice(0, 15)) console.log(r[0], r[1], String(r[2]).slice(0, 55));

console.log('\nCurrent list:');
for (const r of classified.current) console.log(r[0], r[1], String(r[2]).slice(0, 50));

// Check PublicationRootKeyId difference
const currentRoots = new Set(classified.current.map((r) => all.find((x) => x[0] === r[0])?.[3]));
const archiveRoots = new Set(classified.archive.map((r) => all.find((x) => x[0] === r[0])?.[3]));
console.log('\nCurrent unique roots', currentRoots.size, 'Archive unique roots', archiveRoots.size);
