const html = await (
  await fetch(
    'https://www.jw.org/pt/biblioteca/musicas-canticos/cante-de-coracao/65-confiantes-nos-vamos-continuar/',
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  )
).text();

const patterns = [
  'digital',
  'impress',
  'Segment',
  'jsSegment',
  'preferHTML',
  'subImg',
  'data-pub',
  'class="link"',
  'alternate',
  'biblioteca-digitale',
];

for (const pat of patterns) {
  const re = new RegExp(`.{0,120}${pat}.{0,160}`, 'gi');
  const matches = [...html.matchAll(re)].slice(0, 5);
  if (matches.length) {
    console.log(`\n== ${pat}`);
    for (const m of matches) console.log(m[0].replace(/\s+/g, ' ').slice(0, 280));
  }
}

// WOL digital page share
const wolHtml = await (
  await fetch('https://wol.jw.org/pt/wol/d/r5/lp-t/1102016865', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
).text();
const shareMatch = wolHtml.match(/shareBaseUrl[^>]+value="([^"]+)"/i);
console.log('\nWOL shareBaseUrl:', shareMatch?.[1]);
