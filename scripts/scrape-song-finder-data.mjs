const html = await (
  await fetch(
    'https://www.jw.org/pt/biblioteca/musicas-canticos/cante-de-coracao/65-confiantes-nos-vamos-continuar/',
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  )
).text();

for (const pat of ['jsFinderLink', 'data-docid', 'data-pub', 'data-prefer', 'class="link"']) {
  const re = new RegExp(`.{0,140}${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,180}`, 'gi');
  const matches = [...html.matchAll(re)].slice(0, 8);
  if (matches.length) {
    console.log(`\n== ${pat}`);
    for (const m of matches) console.log(m[0].replace(/\s+/g, ' '));
  }
}

// FinderLink module create function
const cms = await (
  await fetch('https://www.jw.org/assets/ct/a63ae92c98/cms.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
).text();
const modIdx = cms.indexOf('module.define("FinderLink"');
console.log('\nFinderLink module:', cms.slice(modIdx, modIdx + 1500).replace(/\s+/g, ' '));
