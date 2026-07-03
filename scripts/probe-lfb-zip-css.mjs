import JSZip from 'jszip';
import fs from 'node:fs';

const jwpubPath =
  'C:/Users/Tricot&Cia/AppData/Roaming/JCS Meetings/publications/lfb_T_.jwpub';
const buf = fs.readFileSync(jwpubPath);
const outer = await JSZip.loadAsync(buf);
const contentsFile = outer.file('contents');
if (!contentsFile) throw new Error('no contents');
const contentsBuf = await contentsFile.async('nodebuffer');
const inner = await JSZip.loadAsync(contentsBuf);

const all = Object.keys(inner.files).filter((n) => !n.endsWith('/'));
console.log('All files count:', all.length);
console.log('Sample:', all.slice(0, 30));

for (const name of all) {
  if (/\.(css|html|xml)$/i.test(name) || name.includes('style')) {
    console.log(' -', name);
  }
}

// Check mwb too
const mwbPath = fs.readdirSync('C:/Users/Tricot&Cia/AppData/Roaming/JCS Meetings/publications').find((f) => f.startsWith('mwb_'));
if (mwbPath) {
  const mwbBuf = fs.readFileSync(`C:/Users/Tricot&Cia/AppData/Roaming/JCS Meetings/publications/${mwbPath}`);
  const mOuter = await JSZip.loadAsync(mwbBuf);
  const mContents = mOuter.file('contents');
  if (mContents) {
    const mInner = await JSZip.loadAsync(await mContents.async('nodebuffer'));
  const mCss = Object.keys(mInner.files).filter((n) => /\.css$/i.test(n));
  console.log('\nMWB css files:', mCss);
  }
}
