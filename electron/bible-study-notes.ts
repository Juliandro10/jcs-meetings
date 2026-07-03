import type { Database } from 'sql.js';
import { decryptContent } from './jwpub-crypto';
import type { JwpubBundle } from './jwpub-bundle';
import { rewriteJwpubMediaUrls } from './jwpub-bundle';

function verseNumberFromLabel(labelHtml: string): number | null {
  const vl = String(labelHtml).match(/class="vl"[^>]*>\s*(\d+)/);
  if (vl) return Number(vl[1]);

  const cl = String(labelHtml).match(/class="cl"[^>]*>\s*(\d+)/);
  if (cl) return Number(cl[1]);

  return null;
}

export function findBibleVerseId(
  db: Database,
  bookNumber: number,
  chapterNumber: number,
  verseNumber: number,
): number | null {
  const range = db.exec(
    `SELECT FirstVerseId, LastVerseId FROM BibleChapter WHERE BookNumber = ${bookNumber} AND ChapterNumber = ${chapterNumber} LIMIT 1`,
  )[0]?.values?.[0];
  if (!range) return null;

  const [firstId, lastId] = range.map(Number);
  const rows =
    db.exec(
      `SELECT BibleVerseId, Label FROM BibleVerse WHERE BibleVerseId BETWEEN ${firstId} AND ${lastId} ORDER BY BibleVerseId`,
    )[0]?.values ?? [];

  for (const [bibleVerseId, label] of rows) {
    const parsed = verseNumberFromLabel(String(label));
    if (parsed !== verseNumber) continue;

    const isChapterMarker =
      /class="cl"/.test(String(label)) && parsed === chapterNumber && verseNumber !== 1;
    if (isChapterMarker) continue;

    return Number(bibleVerseId);
  }

  if (verseNumber === 1) {
    for (const [bibleVerseId, label] of rows) {
      if (!/class="cl"/.test(String(label))) continue;
      const parsed = verseNumberFromLabel(String(label));
      if (parsed === 1 || (parsed === chapterNumber && chapterNumber === 1)) {
        return Number(bibleVerseId);
      }
    }
  }

  return null;
}

function listVerseCommentaryIds(db: Database, bibleVerseId: number): number[] {
  const rows =
    db.exec(
      `SELECT VerseCommentaryId FROM VerseCommentaryMap WHERE BibleVerseId = ${bibleVerseId} ORDER BY VerseCommentaryId`,
    )[0]?.values ?? [];
  return rows.map(([id]) => Number(id));
}

export function getStudyNotesHtmlForVerse(
  bundle: JwpubBundle,
  bookNumber: number,
  chapterNumber: number,
  verseNumber: number,
): string | null {
  const bibleVerseId = findBibleVerseId(bundle.db, bookNumber, chapterNumber, verseNumber);
  if (bibleVerseId == null) return null;

  const commentaryIds = listVerseCommentaryIds(bundle.db, bibleVerseId);
  if (commentaryIds.length === 0) return null;

  const parts: string[] = [];
  for (const commentaryId of commentaryIds) {
    const row = bundle.db.exec(
      `SELECT Content FROM VerseCommentary WHERE VerseCommentaryId = ${commentaryId} LIMIT 1`,
    )[0]?.values?.[0];
    if (!row?.[0]) continue;

    const html = rewriteJwpubMediaUrls(
      decryptContent(bundle.keyIv, row[0] as Uint8Array),
      bundle.pub,
      bundle.issue,
      bundle.lang,
    );
    if (html.trim()) parts.push(html);
  }

  if (parts.length === 0) return null;
  return parts.join('\n');
}
