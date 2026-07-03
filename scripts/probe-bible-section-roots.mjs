import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

async function loadDb(pub, lang = 'T') {
  const cacheDir = path.join(os.tmpdir(), 'jcs-bible-probe');
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `${pub}_${lang}_.jwpub`);
  if (!fs.existsSync(file)) {
    const apiUrl = `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?pub=${pub}&issue=&fileformat=JWPUB&output=json&langwritten=${lang}&txtCMSLang=${lang}&alllangs=0`;
    const data = JSON.parse(await (await fetch(apiUrl)).text());
    const url = data?.files?.[lang]?.JWPUB?.[0]?.file?.url;
    if (!url) throw new Error(`No download for ${pub}`);
    fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
  const outer = await JSZip.loadAsync(fs.readFileSync(file));
  const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
  const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
  const dbBuf = await inner.file(manifest.publication.fileName).async('nodebuffer');
  return new SQL.Database(dbBuf);
}

function stripHtml(v) {
  return String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function listTopLevel(db, viewId = 2) {
  const rows =
    db.exec(
      `SELECT PublicationViewItemId, DefaultDocumentId, Title
       FROM PublicationViewItem
       WHERE PublicationViewId = ${viewId} AND (ParentPublicationViewItemId IS NULL OR ParentPublicationViewItemId = 0)
       ORDER BY PublicationViewItemId`,
    )[0]?.values ?? [];
  return rows.map(([id, docId, title]) => ({
    id: Number(id),
    docId: Number(docId),
    title: stripHtml(title),
  }));
}

function countChildren(db, parentId, viewId = 2) {
  const row = db.exec(
    `SELECT COUNT(*) FROM PublicationViewItem WHERE PublicationViewId = ${viewId} AND ParentPublicationViewItemId = ${parentId}`,
  )[0]?.values?.[0]?.[0];
  return Number(row ?? 0);
}

for (const pub of ['nwt', 'nwtsty']) {
  console.log(`\n=== ${pub} top-level nav ===`);
  const db = await loadDb(pub);
  for (const item of listTopLevel(db)) {
    console.log(item.id, item.docId || '-', item.title, `children=${countChildren(db, item.id)}`);
  }
}

// Also find by title pattern
for (const pub of ['nwt', 'nwtsty']) {
  console.log(`\n=== ${pub} search INTRO/ÍNDICE/APÊNDICE ===`);
  const db = await loadDb(pub);
  const rows =
    db.exec(
      `SELECT PublicationViewItemId, ParentPublicationViewItemId, DefaultDocumentId, Title
       FROM PublicationViewItem
       WHERE PublicationViewId = 2
       ORDER BY PublicationViewItemId`,
    )[0]?.values ?? [];
  for (const [id, parent, docId, title] of rows) {
    const clean = stripHtml(title);
    if (/introdu|índice|indice|apêndice|apendice|livros/i.test(clean)) {
      console.log(id, 'parent', parent, 'doc', docId, clean.slice(0, 80));
    }
  }
}
