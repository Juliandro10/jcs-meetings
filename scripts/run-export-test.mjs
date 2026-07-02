import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const cache = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub');
const prep = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/prep');
const out = path.join(os.tmpdir(), 'jcs-test-export.jwlibrary');

import {
  JWL_USERDATA_SCHEMA_VERSION,
} from '../electron/jwlibrary-schema.ts';

const { exportJwlibrary } = await import('../electron/jwlibrary-export.ts');
const { loadPrepData } = await import('../electron/user-prep-store.ts');
const { resolveCachedPubPath } = await import('../electron/jwpub-reader.ts');

const prepData = await loadPrepData(prep);
console.log('prep counts', {
  fields: Object.keys(prepData.fields).length,
  highlights: Object.keys(prepData.highlights).length,
  notes: Object.keys(prepData.notes).length,
});
console.log('mwb cache', await resolveCachedPubPath(cache, 'mwb', '202605'));

const result = await exportJwlibrary(cache, prep, out);
console.log('export result:', result);

if (!result.ok) process.exit(1);

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const zip = await JSZip.loadAsync(fs.readFileSync(out));
const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
const db = new SQL.Database(await zip.file('userData.db').async('nodebuffer'));
const locs = db.exec('SELECT KeySymbol, IssueTagNumber, MepsLanguage, DocumentId, Track, Title FROM Location')[0]?.values;
console.log('Locations:', locs);
const fields = db.exec('SELECT LocationId, TextTag, length(Value) FROM InputField')[0]?.values;
console.log('InputFields:', fields);
const marks = db.exec(
  'SELECT um.LocationId, br.Identifier, br.StartToken, br.EndToken FROM UserMark um JOIN BlockRange br ON br.UserMarkId=um.UserMarkId LIMIT 3',
)[0]?.values;
console.log('Marks sample:', marks);

const version = db.exec('PRAGMA user_version')[0]?.values?.[0]?.[0];
const locCols = db.exec('PRAGMA table_info(Location)')[0]?.values?.map((r) => r[1]);
const hasMediaIdx = db.exec("SELECT name FROM sqlite_master WHERE name='IX_Location_Media'")[0]?.values?.length;
console.log('PRAGMA user_version:', version, '(expected', JWL_USERDATA_SCHEMA_VERSION + ')');
console.log('Location columns:', locCols?.join(', '));
console.log('IX_Location_Media:', hasMediaIdx ? 'yes' : 'no');
console.log('manifest schemaVersion:', manifest.userDataBackup?.schemaVersion);
