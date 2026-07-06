import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const m = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const db = new (await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) })).Database(
  gunzipSync(Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${m.current}/catalog.db.gz`)).arrayBuffer())),
);

const flags = `
  EXISTS (SELECT 1 FROM PublicationAttributeMap pam JOIN PublicationAttribute pa ON pa.Id=pam.PublicationAttributeId WHERE pam.PublicationId=p.Id AND pa.Name='Yearbook') AS IsYearbook,
  EXISTS (SELECT 1 FROM PublicationAttributeMap pam JOIN PublicationAttribute pa ON pa.Id=pam.PublicationAttributeId WHERE pam.PublicationId=p.Id AND pa.Name='Archive') AS IsArchive
`;

const rows =
  db.exec(`
  SELECT p.KeySymbol, p.Title, p.Year, ${flags}
  FROM Publication p WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=2
`)[0]?.values ?? [];

const sections = { current: [], archive: [], yearbooks: [] };
for (const [pub, title, year, yb, arch] of rows) {
  if (yb) sections.yearbooks.push([pub, year, title]);
  else if (arch) sections.archive.push([pub, year, title]);
  else sections.current.push([pub, year, title]);
}

const sortAlpha = (a, b) => String(a[2]).localeCompare(String(b[2]), 'pt-BR');
sections.current.sort(sortAlpha);
sections.archive.sort(sortAlpha);
sections.yearbooks.sort((a, b) => b[1] - a[1] || sortAlpha(a, b));

console.log('counts', {
  current: sections.current.length,
  archive: sections.archive.length,
  yearbooks: sections.yearbooks.length,
});
console.log('\nCurrent first 5:', sections.current.slice(0, 5).map((r) => r[2]));
console.log('Archive first 5:', sections.archive.slice(0, 5).map((r) => r[2]));
console.log('Yearbooks first 5:', sections.yearbooks.slice(0, 5).map((r) => [r[1], r[2]]));
