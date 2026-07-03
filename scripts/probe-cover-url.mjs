const id = '1102024303';
const tries = [
  `https://assetsnffrgf-a.akamaihd.net/assets/m/${id}/afrn/art/${id}_afrn_sqr_xl.jpg`,
  `https://assetsnffrgf-a.akamaihd.net/assets/m/${id}/univ/art/${id}_afrn_sqr_xl.jpg`,
  `https://assetsnffrgf-a.akamaihd.net/assets/m/${id}/univ/art/${id}_univ_sqr_xl.jpg`,
  `https://assetsnffrgf-a.akamaihd.net/assets/m/${id}/afrn/art/${id}_univ_sqr_xl.jpg`,
];
for (const u of tries) {
  const r = await fetch(u, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log(r.status, u);
}

function coverFromFragment(fragment) {
  const match = fragment?.match(/\/(\d+)_([a-z]+)_sqr-/i);
  if (!match) return null;
  const [, assetId, variant] = match;
  return `https://assetsnffrgf-a.akamaihd.net/assets/m/${assetId}/${variant}/art/${assetId}_${variant}_sqr_xl.jpg`;
}

const fragments = [
  'images/d9/1102021805_univ_sqr-600x600.jpg',
  'images/bc/1102024303_afrn_sqr-600x600.jpg',
  'images/d2/1102024301_univ_sqr-600x600.jpg',
  'images/b8/102018042_univ_sqr-600x600.jpg',
];
for (const f of fragments) {
  const url = coverFromFragment(f);
  const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log(r.status, f, '->', url);
}
