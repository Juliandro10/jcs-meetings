import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });

async function inspect(archivePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(archivePath));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const dbName = manifest.userData?.name ?? 'userData.db';
  const dbBytes = await zip.file(dbName).async('nodebuffer');
  const db = new SQL.Database(dbBytes);

  const locs = db.exec(
    'SELECT LocationId, KeySymbol, IssueTagNumber, MepsLanguage, DocumentId, Track, Type, Title FROM Location ORDER BY LocationId',
  )[0];
  console.log('\n===', path.basename(archivePath), '===');
  console.log('Location rows:', locs?.values?.length ?? 0);
  for (const row of locs?.values ?? []) {
    console.log(row.join(' | '));
  }

  const fields = db.exec('SELECT LocationId, TextTag, substr(Value,1,40) FROM InputField')[0];
  console.log('InputField:', fields?.values?.length ?? 0);
  for (const row of fields?.values ?? []) console.log(' ', row.join(' | '));

  const marks = db.exec(
    'SELECT um.UserMarkId, um.LocationId, um.ColorIndex, um.StyleIndex, br.Identifier, br.StartToken, br.EndToken FROM UserMark um JOIN BlockRange br ON br.UserMarkId=um.UserMarkId LIMIT 10',
  )[0];
  console.log('UserMark sample:', marks?.values?.length ?? 0);
  for (const row of marks?.values ?? []) console.log(' ', row.join(' | '));

  const notes = db.exec(
    'SELECT NoteId, LocationId, BlockType, BlockIdentifier, substr(Title,1,50) FROM Note LIMIT 10',
  )[0];
  console.log('Note sample:', notes?.values?.length ?? 0);
  for (const row of notes?.values ?? []) console.log(' ', row.join(' | '));
}

const userExport = 'C:/Users/Tricot&Cia/Downloads/JCSMeetingsBackup_2026-07-02.jwlibrary';
if (fs.existsSync(userExport)) await inspect(userExport);

const jwlPaths = [
  'C:/Users/Tricot&Cia/AppData/Local/Packages/WatchtowerBibleandTractSocietyofPennsylvania.JWLibrary_*/LocalState/userData.db',
];
// Try common JW Library paths
const candidates = [
  'C:/Users/Tricot&Cia/AppData/Local/Packages',
];
for (const base of candidates) {
  if (!fs.existsSync(base)) continue;
  for (const dir of fs.readdirSync(base)) {
    if (!dir.includes('JWLibrary')) continue;
    const dbPath = path.join(base, dir, 'LocalState/userData.db');
    if (fs.existsSync(dbPath)) {
      const db = new SQL.Database(fs.readFileSync(dbPath));
      const mwb = db.exec(
        "SELECT LocationId, KeySymbol, IssueTagNumber, DocumentId, Track, Title FROM Location WHERE KeySymbol='mwb26' OR KeySymbol LIKE 'mwb%' LIMIT 5",
      )[0];
      if (mwb?.values?.length) {
        console.log('\n=== REAL JW Library userData.db mwb locations ===');
        console.log(dbPath);
        for (const row of mwb.values) console.log(row.join(' | '));
      }
    }
  }
}
