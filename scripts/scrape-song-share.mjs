import fs from 'node:fs';

const song = 65;
const docid = 1102016800 + song;
const url =
  'https://www.jw.org/pt/biblioteca/musicas-canticos/cante-de-coracao/65-confiantes-nos-vamos-continuar/';

const html = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

const patterns = [
  /jwlibrary:[^\s"'<>]+/gi,
  /data-jwlibrary[^=]*="[^"]+"/gi,
  /data-open[^=]*="[^"]+"/gi,
  /"mepsDocumentId"\s*:\s*\d+/gi,
  /"documentId"\s*:\s*\d+/gi,
  /preferHTML[^\s"'<>]*/gi,
  /digitalPubFormat[^\n]{0,200}/gi,
  /jsWrittenFormat[^\n]{0,200}/gi,
  /jsPrintFormat[^\n]{0,200}/gi,
  /Printed Edition|Digital Edition|Edição digital|Edição impressa/gi,
];

for (const re of patterns) {
  const hits = [...html.matchAll(re)].slice(0, 6);
  if (hits.length) {
    console.log('\n==', String(re), '==');
    for (const h of hits) console.log(h[0].slice(0, 160));
  }
}

// fetch EN page with digital/printed tabs
const enUrl =
  'https://www.jw.org/en/library/music-songs/sing-out-joyfully/65-we-will-keep-enduring/';
const enHtml = await fetch(enUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
console.log('\nEN digital mentions', (enHtml.match(/Digital Edition/gi) ?? []).length);
console.log('EN printed mentions', (enHtml.match(/Printed Edition/gi) ?? []).length);
for (const m of enHtml.matchAll(/data-url="([^"]*65[^"]*)"/gi)) console.log('data-url', m[1]);

// try apps.jw.org or hub links
for (const m of html.matchAll(/https:\/\/[^\"']*jw[^\"']*65[^\"']*/gi)) {
  console.log('link', m[0].slice(0, 140));
}

// GETPUBMEDIALINKS variants
const variants = [
  `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&docid=${docid}&langwritten=T`,
  `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=sjj&docid=${docid}&langwritten=T`,
  `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=sjjm&docid=${docid}&langwritten=T`,
];
for (const u of variants) {
  const r = await fetch(u);
  const d = r.ok ? await r.json() : null;
  console.log('\nAPI', u.split('?')[1], '->', d?.pub, d?.pubName);
}

await fs.promises.writeFile('scripts/song-page-snippet.html', html.slice(0, 120000));
