const fragments = [
  ['1102024301', 'univ'],
  ['1102024303', 'afrn'],
  ['1102024305', 'univ'],
  ['1102024307', 'asia'],
  ['1102024309', 'amer'],
];

const bases = [
  'https://assetsnffrgf-a.akamaihd.net/assets/m/{id}/{variant}/art/{id}_{variant}_sqr_xl.jpg',
  'https://assetsnffrgf-a.akamaihd.net/assets/m/{id}/univ/art/{id}_{variant}_sqr_xl.jpg',
  'https://cfp2.jw-cdn.org/a/d7ee45/3/o/{id}_{variant}_sqr-600x600.jpg',
  'https://b.jw-cdn.org/img/e/{id}/univ/art/{id}_{variant}_sqr_xl.jpg',
];

for (const [id, variant] of fragments) {
  for (const template of bases) {
    const u = template.replaceAll('{id}', id).replaceAll('{variant}', variant);
    const r = await fetch(u, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) console.log('OK', u);
  }
}
