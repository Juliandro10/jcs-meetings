import { findCachedPubs, getPreparedDocumentHtml } from '../electron/jwpub-reader.ts';

const cacheDir = 'C:/Users/Tricot&Cia/AppData/Roaming/JCS Meetings/publications';
const mwbFiles = await findCachedPubs(cacheDir, 'mwb');
if (!mwbFiles[0]) {
  console.log('no mwb');
  process.exit(0);
}

const prep = await getPreparedDocumentHtml(mwbFiles[0], 9);
const classes = new Set();
for (const m of prep.html.matchAll(/class="([^"]+)"/gi)) {
  for (const cls of m[1].split(/\s+/)) {
    if (/north|south|east|west|half|center|figure|thumb|bleed|spread|page|float/i.test(cls)) {
      classes.add(cls);
    }
  }
}
console.log('MWB classes:', [...classes].sort());
console.log('CSS uses figure.north:', /figure\.north/.test(prep.publicationCss));
const figSample = prep.html.match(/<figure[\s\S]{0,200}/i)?.[0];
console.log('Figure sample:', figSample);
