const url = 'https://wol.jw.org/wol/dt/r1/lp-t/24/11/21';
const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html',
  },
});
const html = await res.text();
const match = html.match(/<span id="verse21"[^>]*>([\s\S]*?)<\/span>/i)
  ?? html.match(/class="[^"]*verse[^"]*"[^>]*>[\s\S]{0,800}/i);
console.log('status', res.status);
console.log('preview', match?.[0]?.slice(0, 400) ?? html.slice(html.indexOf('verse'), html.indexOf('verse') + 400));
