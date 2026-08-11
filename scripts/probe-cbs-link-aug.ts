import path from 'node:path';
import { getDocumentHtml, loadMeetingWeeks, resolveCachedPubPath } from '../electron/jwpub-reader';
import { extractCbsStudyFromHtml } from '../electron/lfb-reader';

const userDataRoot = path.join(process.env.APPDATA ?? '', 'JCS Meetings');
const cacheDir = path.join(userDataRoot, 'publications');

async function main() {
  const { weeks } = await loadMeetingWeeks(cacheDir, userDataRoot);
  const week = weeks.find((w) => w.id === '2026-08-10');
  if (!week?.mwbIssue || !week.mwbDocumentId) {
    console.log('Semana ou MWB ausente');
    return;
  }
  const mwbPath = await resolveCachedPubPath(cacheDir, 'mwb', week.mwbIssue);
  if (!mwbPath) {
    console.log('MWB não baixado');
    return;
  }
  const html = await getDocumentHtml(mwbPath, week.mwbDocumentId);
  const cbs = extractCbsStudyFromHtml(html);
  console.log('CBS (lfb extractor):', cbs);

  const lower = html.toLowerCase();
  const idx = lower.indexOf('estudo b');
  if (idx >= 0) {
    console.log('\n--- Snippet around EBC ---\n');
    console.log(html.slice(Math.max(0, idx - 300), idx + 1200));
  }

  const jwpubLinks = [...html.matchAll(/href="(jwpub:\/\/p\/[^"]+)"/gi)].map((m) => m[1]);
  const unique = [...new Set(jwpubLinks)];
  console.log('\nAll jwpub links in MWB:', unique.length);
  for (const link of unique) {
    if (/11020|lfb|lff|coraj|walk/i.test(link) || link.includes('T:11020')) {
      console.log(' ', link);
    }
  }
}

main().catch(console.error);
