import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDocumentHtml, listDocuments } from '../electron/jwpub-reader.ts';

const mwbFile = path.join(os.tmpdir(), 'jcs-test-cache2', 'mwb_T_202605.jwpub');
const html = await getDocumentHtml(mwbFile, 9);
const idx = html.indexOf('gen-field');
fs.writeFileSync('temp-field-snippet.html', html.slice(Math.max(0, idx - 200), idx + 800));
console.log('written temp-field-snippet.html');
