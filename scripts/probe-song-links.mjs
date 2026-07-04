const song = 65;
const docid = 1102016800 + song;

const html = await fetch(
  'https://www.jw.org/pt/biblioteca/musicas-canticos/cante-de-coracao/65-confiantes-nos-vamos-continuar/',
  { headers: { 'User-Agent': 'Mozilla/5.0' } },
).then((r) => r.text());

const canon = html.match(/rel="canonical" href="([^"]+)"/i);
console.log('canonical', canon?.[1]);

const bodyClass = html.match(/<body[^>]*class="([^"]+)"/i)?.[1] ?? '';
console.log('body classes', bodyClass);

// GETPUBMEDIALINKS by docid only
const meta = await fetch(
  `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&docid=${docid}&langwritten=T`,
).then((r) => r.json());
console.log('docid meta pub', meta.pub, meta.pubName);

// Proposed URLs
const urls = [
  `jwlibrary:///finder?srcid=jwlshare&wtlocale=T&docid=${docid}&prefer=content`,
  `jwlibrary:///finder?srcid=jwlshare&wtlocale=T&pub=sjj&docid=${docid}&prefer=content`,
  `jwlibrary:///finder?srcid=jwlshare&wtlocale=T&pub=sjj&issue=0&docid=${docid}&prefer=content`,
  `https://www.jw.org/pt/biblioteca/musicas-canticos/cante-de-coracao/65-confiantes-nos-vamos-continuar/`,
];
for (const u of urls) console.log(u);
