import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const m = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const db = new (await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) })).Database(
  gunzipSync(Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${m.current}/catalog.db.gz`)).arrayBuffer())),
);

const flags = `
  EXISTS (SELECT 1 FROM PublicationAttributeMap pam JOIN PublicationAttribute pa ON pa.Id=pam.PublicationAttributeId WHERE pam.PublicationId=p.Id AND pa.Name='Examining the Scriptures') AS IsExamine,
  EXISTS (SELECT 1 FROM PublicationAttributeMap pam JOIN PublicationAttribute pa ON pa.Id=pam.PublicationAttributeId WHERE pam.PublicationId=p.Id AND pa.Name='Archive') AS IsArchive
`;

for (const type of [4, 10]) {
  const label = type === 4 ? 'brochures' : 'tracts';
  const rows =
    db.exec(`
    SELECT p.KeySymbol, p.Title, p.Year, ${flags}
    FROM Publication p WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=${type}
  `)[0]?.values ?? [];

  const current = rows.filter((r) => !r[3] && !r[4]);
  const archive = rows.filter((r) => r[4] && !r[3]);
  const examine = rows.filter((r) => r[3]);
  console.log('\n', label, { total: rows.length, current: current.length, archive: archive.length, examine: examine.length });
  console.log('Examine pubs:', examine.map((r) => [r[0], r[2], r[1]]));
}
