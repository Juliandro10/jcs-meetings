const docid = 1102016865;
const endpoints = [
  `https://b.jw-cdn.org/apis/wol-link?docid=${docid}&wtlocale=T`,
  `https://b.jw-cdn.org/apis/wol-link?docid=${docid}&wtlocale=T&prefer=content`,
  `https://b.jw-cdn.org/apis/wol-link?docid=${docid}&wtlocale=T&pub=sjj`,
  `https://www.jw.org/open?docid=${docid}&prefer=content`,
];

for (const u of endpoints) {
  try {
    const r = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/html,*/*' },
      redirect: 'manual',
    });
    const ct = r.headers.get('content-type') ?? '';
    const body = await r.text();
    console.log('\n===', u);
    console.log('status', r.status, 'location', r.headers.get('location'));
    console.log('ctype', ct);
    console.log(body.slice(0, 800));
  } catch (err) {
    console.log('ERR', u, err);
  }
}

// jw.org page config wol-link usage in HTML
const html = await fs.readFile('scripts/song-page-snippet.html', 'utf8');
for (const m of html.matchAll(/wol-link[^\"']{0,120}/gi)) console.log('wol-link ref', m[0]);

import fs from 'node:fs';
