const url = 'https://wol.jw.org/wol/dt/r1/lp-t/2026/07/01';
const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  },
});
const html = await res.text();
for (const pat of ['<h2', '<h3', 'class="pub', 'class="dc', 'class="date', 'id="p1"']) {
  const i = html.indexOf(pat);
  if (i >= 0) console.log(pat, html.slice(i, i + 200));
}
