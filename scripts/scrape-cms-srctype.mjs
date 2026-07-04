const cms = await (
  await fetch('https://www.jw.org/assets/ct/a63ae92c98/cms.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
).text();

for (const needle of ['srctype', 'prefer=html', 'preferHTML', 'subImg', 'jwlshare', 'srcid:"share"', 'srcid:"jwlshare"']) {
  let idx = 0;
  let c = 0;
  while ((idx = cms.indexOf(needle, idx + 1)) >= 0 && c < 4) {
    console.log(`\n${needle} #${c}`, cms.slice(Math.max(0, idx - 30), idx + 200).replace(/\s+/g, ' '));
    c++;
  }
}
