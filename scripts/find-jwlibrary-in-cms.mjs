const cms = await (
  await fetch('https://www.jw.org/assets/ct/a63ae92c98/cms.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
).text();

let idx = 0;
let count = 0;
while ((idx = cms.indexOf('jwlibrary', idx + 1)) >= 0 && count < 10) {
  console.log(`\n#${count}`, cms.slice(Math.max(0, idx - 80), idx + 200).replace(/\s+/g, ' '));
  count++;
}

console.log('\nOfficial share URL would be:');
console.log(
  'https://www.jw.org/finder?' +
    new URLSearchParams({ docid: '1102016865', wtlocale: 'T', srcid: 'share' }).toString(),
);

console.log('\nReference style:');
console.log(
  'jwlibrary:///finder?' +
    new URLSearchParams({
      srcid: 'jwlshare',
      wtlocale: 'T',
      prefer: 'lang',
      docid: '1102016865',
    }).toString() +
    '&prefer=content',
);

// wol-link might be called from page - search wol_link_api
idx = cms.indexOf('wol_link');
while (idx >= 0) {
  console.log('\nwol_link', cms.slice(idx, idx + 350).replace(/\s+/g, ' '));
  idx = cms.indexOf('wol_link', idx + 1);
  if (idx > 500000) break;
}
