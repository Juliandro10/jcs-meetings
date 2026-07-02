const url = 'https://wol.jw.org/wol/finder?wtlocale=T&pub=nwt&bible=24011021';
const r = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
});
const html = await r.text();
console.log('status', r.status, 'len', html.length);

const idx = html.indexOf('Portanto');
console.log('Portanto', idx > 0 ? html.slice(idx, idx + 400) : 'not found');

const dataMatch = html.match(/data-json="([^"]+)"/);
if (dataMatch) {
  const decoded = dataMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  console.log('data-json preview', decoded.slice(0, 500));
}

const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((s) => s.includes('verse') || s.includes('bible') || s.includes('Jeremias'));
console.log('script snippets', scriptMatches.slice(0, 2).map((s) => s.slice(0, 300)));
