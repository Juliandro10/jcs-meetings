const cms = await (
  await fetch('https://www.jw.org/assets/ct/a63ae92c98/cms.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
).text();

const endIdx = cms.indexOf('module.define("FinderLink"');
const chunk = cms.slice(Math.max(0, endIdx - 2500), endIdx + 200);
console.log(chunk.replace(/\s+/g, ' '));

// Simulate share link for song page
const params = { docid: 1102016865, wtlocale: 'T', srcid: 'share' };
// find create: function in FinderLink export
const createIdx = cms.lastIndexOf('create:function', endIdx);
console.log('\ncreate near FinderLink:', cms.slice(createIdx, createIdx + 800).replace(/\s+/g, ' '));
