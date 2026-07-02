import path from 'node:path';
import os from 'node:os';
import { resolveLfbStudyLink } from '../electron/lfb-reader.ts';

const cache = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub');
const href = 'jwpub://p/T:1102016108/$p/T:1102016109/';
const r = await resolveLfbStudyLink(cache, href, 'lfb histórias 98-99');
console.log(r.ok, r.title, 'html bytes', r.html?.length);
