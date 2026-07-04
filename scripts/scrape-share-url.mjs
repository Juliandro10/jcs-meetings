const url =
  'https://www.jw.org/pt/biblioteca/musicas-canticos/cante-de-coracao/65-confiantes-nos-vamos-continuar/';
const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]).filter((s) => s.includes('/assets/'));
console.log('scripts', scripts.length);

for (const s of scripts) {
  const full = s.startsWith('http') ? s : `https://www.jw.org${s}`;
  const js = await (await fetch(full, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  if (js.includes('jwlshare') || js.includes('shareURL') || js.includes('wol-link')) {
    console.log('\nHIT', full);
    for (const needle of ['jwlshare', 'shareURL', 'wol-link', 'preferHTMLOverSubImg']) {
      const idx = js.indexOf(needle);
      if (idx >= 0) console.log(needle, js.slice(Math.max(0, idx - 120), idx + 280).replace(/\s+/g, ' '));
    }
  }
}
