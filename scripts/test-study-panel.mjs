import os from 'node:os';
import path from 'node:path';
import { resolveJwpubLink } from '../electron/jw-link-resolver.ts';
import { readJwpubMedia } from '../electron/jwpub-bundle.ts';
import { getDocumentHtml } from '../electron/jwpub-reader.ts';

const cacheDir = path.join(os.tmpdir(), 'jcs-img-test');

const html = await getDocumentHtml(path.join(cacheDir, 'mwb_T_202605.jwpub'), 9);
console.log('html has jcs-media', html.includes('jcs-media://'));
console.log('html has broken jwpub-media', html.includes('jwpub-media://'));

const media = await readJwpubMedia(
  path.join(cacheDir, 'mwb_T_202605.jwpub'),
  '202026169_univ_cnt_1.jpg',
);
console.log('media bytes', media?.buffer.length, media?.mimeType);

const pubLink = await resolveJwpubLink(cacheDir, {
  href: 'jwpub://p/T:2004803/17-17',
  linkLabel: 'w04 1/11 16 § 12',
  sourcePub: 'mwb',
  sourceIssue: '202605',
});
console.log('pub link ok', pubLink.ok, pubLink.title?.slice(0, 60));
console.log('pub html len', pubLink.html?.length);
console.log('pub download', pubLink.download);

const bibleLink = await resolveJwpubLink(cacheDir, {
  href: 'jwpub://b/NWTR/24:11:21-24:11:21',
  linkLabel: 'Jer. 11:21',
  sourcePub: 'mwb',
  sourceIssue: '202605',
});
console.log('bible ok', bibleLink.ok, bibleLink.title);
console.log('bible html preview', bibleLink.html?.slice(0, 200));
