import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const m = await fetch('https://app.jw-cdn.org/catalogs/publications/v4/manifest.json').then((r) => r.json());
const db = new (await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) })).Database(
  gunzipSync(Buffer.from(await (await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${m.current}/catalog.db.gz`)).arrayBuffer())),
);

const flags = `
  EXISTS (SELECT 1 FROM PublicationAttributeMap pam JOIN PublicationAttribute pa ON pa.Id=pam.PublicationAttributeId WHERE pam.PublicationId=p.Id AND pa.Name='Archive') AS IsArchive,
  EXISTS (SELECT 1 FROM PublicationAttributeMap pam JOIN PublicationAttribute pa ON pa.Id=pam.PublicationAttributeId WHERE pam.PublicationId=p.Id AND pa.Name='Examining the Scriptures') AS IsExamine
`;

function verifyCategory(label, typeId, extraWhere, titleCol) {
  const rows =
    db.exec(`
    SELECT p.KeySymbol, p.${titleCol}, p.Year, ${flags}
    FROM Publication p
    WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=${typeId} ${extraWhere}
      AND NOT EXISTS (
        SELECT 1 FROM PublicationAttributeMap pam
        JOIN PublicationAttribute pa ON pa.Id=pam.PublicationAttributeId
        WHERE pam.PublicationId=p.Id AND pa.Name='Examining the Scriptures'
      )
  `)[0]?.values ?? [];

  const sections = { current: [], archive: [] };
  for (const [pub, title, year, arch] of rows) {
    if (arch) sections.archive.push([pub, year, title]);
    else sections.current.push([pub, year, title]);
  }

  const sortAlpha = (a, b) => String(a[2]).localeCompare(String(b[2]), 'pt-BR');
  sections.current.sort(sortAlpha);
  sections.archive.sort(sortAlpha);

  console.log(`\n${label} counts`, {
    current: sections.current.length,
    archive: sections.archive.length,
    total: rows.length,
  });
  console.log(`${label} current first 5:`, sections.current.slice(0, 5).map((r) => r[2]));
  console.log(`${label} archive first 5:`, sections.archive.slice(0, 5).map((r) => r[2]));
}

const examineCount =
  db.exec(`
  SELECT COUNT(*) FROM Publication p
  WHERE p.MepsLanguageId=5 AND p.PublicationTypeId=4
    AND EXISTS (
      SELECT 1 FROM PublicationAttributeMap pam
      JOIN PublicationAttribute pa ON pa.Id=pam.PublicationAttributeId
      WHERE pam.PublicationId=p.Id AND pa.Name='Examining the Scriptures'
    )
`)[0]?.values?.[0]?.[0];
console.log('Examine brochures excluded:', examineCount);

verifyCategory('Brochures', 4, '', 'Title');
verifyCategory('Tracts', 10, "AND p.KeySymbol LIKE 'T-%'", 'ShortTitle');
