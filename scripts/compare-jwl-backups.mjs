import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });

const files = {
  jcs: 'C:/Users/Tricot&Cia/Downloads/2026-07-02.jwlibrary',
  jwl: 'C:/Users/Tricot&Cia/Downloads/UserdataBackup_2026-07-02_DESKTOP-SCA8F8M.jwlibrary',
};

async function openDb(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const dbName = manifest.userDataBackup?.databaseName ?? 'userData.db';
  const dbBytes = await zip.file(dbName).async('nodebuffer');
  return { db: new SQL.Database(dbBytes), manifest };
}

function q(db, sql) {
  const r = db.exec(sql)[0];
  if (!r) return { cols: [], rows: [] };
  return { cols: r.columns, rows: r.values };
}

function printSection(title, cols, rows, limit = 20) {
  console.log(`\n=== ${title} (${rows.length} rows) ===`);
  for (const row of rows.slice(0, limit)) {
    const obj = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
    console.log(JSON.stringify(obj));
  }
  if (rows.length > limit) console.log(`... +${rows.length - limit} more`);
}

for (const [label, filePath] of Object.entries(files)) {
  if (!fs.existsSync(filePath)) {
    console.log(`MISSING: ${label} -> ${filePath}`);
    continue;
  }

  const { db, manifest } = await openDb(filePath);
  console.log(`\n######## ${label.toUpperCase()}: ${path.basename(filePath)} ########`);
  console.log('manifest:', JSON.stringify(manifest, null, 2));

  const mwbLocs = q(
    db,
    `SELECT LocationId, KeySymbol, IssueTagNumber, MepsLanguage, DocumentId, Track, Type, Title
     FROM Location
     WHERE KeySymbol LIKE 'mwb%' OR KeySymbol = 'mwb'
     ORDER BY LocationId`,
  );
  printSection('Location (mwb*)', mwbLocs.cols, mwbLocs.rows);

  const wLocs = q(
    db,
    `SELECT LocationId, KeySymbol, IssueTagNumber, MepsLanguage, DocumentId, Track, Type, Title
     FROM Location WHERE KeySymbol LIKE 'w%' ORDER BY LocationId LIMIT 10`,
  );
  printSection('Location (w*)', wLocs.cols, wLocs.rows, 10);

  if (mwbLocs.rows.length) {
    const ids = mwbLocs.rows.map((r) => r[0]).join(',');
    const fields = q(db, `SELECT LocationId, TextTag, Value FROM InputField WHERE LocationId IN (${ids})`);
    printSection('InputField (mwb locations)', fields.cols, fields.rows);

    const marks = q(
      db,
      `SELECT um.UserMarkId, um.LocationId, um.ColorIndex, um.StyleIndex, um.Version,
              br.BlockType, br.Identifier, br.StartToken, br.EndToken
       FROM UserMark um
       JOIN BlockRange br ON br.UserMarkId = um.UserMarkId
       WHERE um.LocationId IN (${ids})`,
    );
    printSection('UserMark+BlockRange (mwb)', marks.cols, marks.rows);

    const notes = q(
      db,
      `SELECT NoteId, LocationId, BlockType, BlockIdentifier, substr(Title,1,60) AS Title,
              length(Content) AS ContentLen, UserMarkId
       FROM Note WHERE LocationId IN (${ids})`,
    );
    printSection('Note (mwb locations)', notes.cols, notes.rows);
  }

  const allFields = q(db, 'SELECT LocationId, TextTag, substr(Value,1,80) AS Value FROM InputField');
  printSection('ALL InputField', allFields.cols, allFields.rows);

  const userVersion = q(db, 'PRAGMA user_version');
  console.log('\nPRAGMA user_version:', userVersion.rows[0]?.[0]);
  db.close();
}
