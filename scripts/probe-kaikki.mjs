const res = await fetch('https://kaikki.org/ptwiktionary/rawdata.html');
const html = await res.text();
const links = [...html.matchAll(/href="([^"]+\.jsonl\.gz)"/gi)].map((m) => m[1]);
console.log('links', links.slice(0, 5));

if (links[0]) {
  const base = new URL('https://kaikki.org/ptwiktionary/rawdata.html');
  const url = new URL(links[0], base).href;
  console.log('url', url);
  const head = await fetch(url, { method: 'HEAD' });
  console.log('head', head.status, head.headers.get('content-length'));
  const sample = await fetch(url, { headers: { Range: 'bytes=0-80000' } });
  const buf = Buffer.from(await sample.arrayBuffer());
  const { gunzipSync } = await import('node:zlib');
  const text = gunzipSync(buf).toString('utf8');
  const line = text.split('\n').find(Boolean);
  const entry = JSON.parse(line);
  console.log('entry', entry.word, entry.lang, entry.lang_code, entry.pos, entry.senses?.[0]?.glosses);
}
