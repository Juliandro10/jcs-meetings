const cms = await (
  await fetch('https://www.jw.org/assets/ct/a63ae92c98/cms.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
).text();

for (const needle of [
  'ViewModeSelected',
  'wol-link',
  'wol_link',
  'preferHTML',
  'htmlOverSub',
  'docSubImgHTML',
  'LnkViewOptText',
  'DigitalView',
]) {
  let idx = 0;
  let c = 0;
  while ((idx = cms.indexOf(needle, idx + 1)) >= 0 && c < 3) {
    console.log(`\n${needle} #${c}`, cms.slice(Math.max(0, idx - 40), idx + 350).replace(/\s+/g, ' '));
    c++;
  }
}
