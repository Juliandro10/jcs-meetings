const html = await (
  await fetch(
    'https://www.jw.org/pt/biblioteca/musicas-canticos/cante-de-coracao/65-confiantes-nos-vamos-continuar/',
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  )
).text();

for (const needle of ['jsSegmentControl', 'ViewOptions', 'LnkViewOpt', 'device-text', 'printed-text']) {
  const idx = html.indexOf(needle);
  console.log(needle, idx >= 0 ? html.slice(Math.max(0, idx - 40), idx + 300).replace(/\s+/g, ' ') : 'NOT FOUND');
}

console.log('\nHrefs with docid:');
for (const m of html.matchAll(/href="([^"]*1102016865[^"]*)"/gi)) {
  console.log(m[1]);
}

// GETPUBMEDIALINKS output=html for song
const apiUrl =
  'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&docid=1102016865&langwritten=T&fileformat=HTML';
const api = await (await fetch(apiUrl)).json();
console.log('\nAPI HTML format:', JSON.stringify(api, null, 2).slice(0, 800));
