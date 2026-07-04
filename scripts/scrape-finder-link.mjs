const js = await (
  await fetch('https://www.jw.org/assets/ct/a63ae92c98/cms.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
).text();

for (const n of ['FinderLink', 'finderLink', 'jwlibrary', 'prefer=content', 'prefer=lang', 'jwlshare']) {
  let idx = 0;
  let c = 0;
  while ((idx = js.indexOf(n, idx + 1)) >= 0 && c < 3) {
    console.log(`\n${n} #${c}`, js.slice(idx, idx + 450).replace(/\s+/g, ' '));
    c++;
  }
}
