import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs, { type Database } from 'sql.js';
import { extractDocumentStructure, resolveNoteTitle } from './document-structure';
import {
  buildLfbStudyNote,
  isLfbStudyNoteId,
  isLfbStudyPrepNote,
  isLfbSabePrepNote,
  lfbStudyNoteIdForQuestion,
  lfbStudyQuestionForNoteId,
} from './lfb-study-notes';
import { openJwpubBundle } from './jwpub-bundle';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import {
  JWL_USERDATA_SCHEMA_VERSION,
  SCHEMA_DDL,
  SCHEMA_INDEXES,
  SCHEMA_TRIGGERS,
} from './jwlibrary-schema';
import type { PrepField, PrepHighlight, PrepNote, UserPrepData } from './user-prep-store';
import { loadPrepData, savePrepData } from './user-prep-store';

const require = createRequire(import.meta.url);
const SQL_WASM_DIR = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));

const HIGHLIGHT_COLOR_INDEX: Record<string, number> = {
  yellow: 1,
  green: 2,
  blue: 3,
  pink: 4,
  purple: 5,
  orange: 6,
};

const PREP_KEY_RE = /^(mwb|w|lfb)_([^_]*)_d(\d+)_(f|h|n)(.+)$/;

type ParsedPrepKey = {
  pub: string;
  issue: string;
  documentId: number;
  kind: 'field' | 'highlight' | 'note';
  id: string;
};

type PublicationMeta = {
  keySymbol: string;
  locationKeySymbol: string;
  mepsLanguage: number;
  issueTagNumber: number;
};

type DocumentMeta = {
  mepsDocumentId: number;
  title: string;
  localDocumentId: number;
  track: number | null;
};

const JW_TOKEN_RE = /\w+(?:['.:-]\w+)*|[^\s\w\u200b]/g;

type LocationRow = {
  LocationId: number;
  BookNumber: number | null;
  ChapterNumber: number | null;
  DocumentId: number | null;
  Track: number | null;
  IssueTagNumber: number;
  KeySymbol: string | null;
  MepsLanguage: number | null;
  Type: number;
  Title: string | null;
  Specialty: string | null;
  Edition: string | null;
};

type ExportStats = {
  locations: number;
  inputFields: number;
  userMarks: number;
  blockRanges: number;
  notes: number;
};

export type JwLibraryExportResult = {
  ok: boolean;
  filePath?: string;
  stats?: ExportStats;
  error?: string;
};

export type JwLibraryImportResult = {
  ok: boolean;
  stats?: { fields: number; highlights: number; notes: number };
  error?: string;
};

let sqlInit: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSql() {
  if (!sqlInit) {
    sqlInit = await initSqlJs({
      locateFile: (file) => path.join(SQL_WASM_DIR, file),
    });
  }
  return sqlInit;
}

function parsePrepKey(key: string): ParsedPrepKey | null {
  const match = key.match(PREP_KEY_RE);
  if (!match) return null;
  return {
    pub: match[1],
    issue: match[2],
    documentId: Number(match[3]),
    kind: match[4] === 'f' ? 'field' : match[4] === 'h' ? 'highlight' : 'note',
    id: match[5],
  };
}

function pubCacheKey(pub: string, issue: string) {
  return `${pub}|${issue}`;
}

function documentGroupKey(pub: string, issue: string, documentId: number) {
  return `${pub}|${issue}|${documentId}`;
}

function prepPubFromKeySymbol(keySymbol: string) {
  if (keySymbol === 'mwb26' || keySymbol === 'mwb') return 'mwb';
  if (keySymbol === 'w' || /^w\d/.test(keySymbol)) return 'w';
  if (keySymbol === 'lfb') return 'lfb';
  return keySymbol;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeJwText(text: string) {
  return text.replace(/\u200b/g, '').match(JW_TOKEN_RE) ?? [];
}

function charOffsetsToJwTokens(fullText: string, startOffset: number, endOffset: number) {
  const tokens = tokenizeJwText(fullText);
  if (tokens.length === 0) return { startToken: 0, endToken: 0 };

  let cursor = 0;
  let startToken = 0;
  let endToken = tokens.length - 1;

  for (let i = 0; i < tokens.length; i++) {
    const tokenStart = fullText.indexOf(tokens[i], cursor);
    if (tokenStart < 0) continue;
    const tokenEnd = tokenStart + tokens[i].length;
    if (startOffset >= tokenStart && startOffset <= tokenEnd) startToken = i;
    if (endOffset >= tokenStart && endOffset <= tokenEnd) {
      endToken = i;
      break;
    }
    cursor = tokenEnd;
  }

  return { startToken, endToken };
}

function extractParagraphPlainText(html: string, blockId: string) {
  const re = new RegExp(
    `<(?:p|li|h[1-6])[^>]*\\bdata-pid="${blockId}"[^>]*>([\\s\\S]*?)<\\/(?:p|li|h[1-6])>`,
    'i',
  );
  const match = re.exec(html);
  return match ? stripHtml(match[1]) : '';
}

function jwTokensToCharOffsets(fullText: string, startToken: number, endToken: number) {
  const tokens = tokenizeJwText(fullText);
  if (tokens.length === 0) {
    return { startOffset: 0, endOffset: 0, text: '' };
  }

  const safeStart = Math.min(Math.max(startToken, 0), tokens.length - 1);
  const safeEnd = Math.min(Math.max(endToken, safeStart), tokens.length - 1);

  let cursor = 0;
  let startOffset = 0;
  let endOffset = fullText.length;

  for (let i = 0; i < tokens.length; i++) {
    const tokenStart = fullText.indexOf(tokens[i], cursor);
    if (tokenStart < 0) continue;
    const tokenEnd = tokenStart + tokens[i].length;
    if (i === safeStart) startOffset = tokenStart;
    if (i === safeEnd) {
      endOffset = tokenEnd;
      break;
    }
    cursor = tokenEnd;
  }

  const text = fullText.slice(startOffset, endOffset).replace(/\s+/g, ' ').trim();
  return { startOffset, endOffset, text };
}

function highlightToTokenRange(html: string, highlight: PrepHighlight) {
  const paragraph = extractParagraphPlainText(html, highlight.blockId);
  if (!paragraph) {
    const tokens = tokenizeJwText(highlight.text);
    return { startToken: 0, endToken: Math.max(tokens.length - 1, 0) };
  }

  if (highlight.startOffset >= 0 && highlight.endOffset > highlight.startOffset) {
    return charOffsetsToJwTokens(paragraph, highlight.startOffset, highlight.endOffset);
  }

  const needle = highlight.text.replace(/\s+/g, ' ').trim();
  const idx = paragraph.indexOf(needle);
  if (idx >= 0) {
    return charOffsetsToJwTokens(paragraph, idx, idx + needle.length);
  }

  const tokens = tokenizeJwText(needle);
  return { startToken: 0, endToken: Math.max(tokens.length - 1, 0) };
}

function noteToTokenRange(html: string, note: PrepNote) {
  const paragraph = extractParagraphPlainText(html, note.blockId);
  const needle = (note.anchorText || note.title).replace(/\s+/g, ' ').trim();
  if (!paragraph) {
    const tokens = tokenizeJwText(needle);
    return { startToken: 0, endToken: Math.max(tokens.length - 1, 0) };
  }

  if (note.startOffset >= 0 && note.endOffset > note.startOffset) {
    return charOffsetsToJwTokens(paragraph, note.startOffset, note.endOffset);
  }

  if (needle) {
    const idx = paragraph.indexOf(needle);
    if (idx >= 0) {
      return charOffsetsToJwTokens(paragraph, idx, idx + needle.length);
    }
  }

  const tokens = tokenizeJwText(needle || paragraph.slice(0, 40));
  return { startToken: 0, endToken: Math.max(tokens.length - 1, 0) };
}

function run(db: Database, sql: string, params: unknown[] = []) {
  db.run(sql, params);
}

function queryAll<T extends Record<string, unknown>>(db: Database, sql: string): T[] {
  const result = db.exec(sql);
  if (!result[0]) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, index) => {
      record[col] = row[index];
    });
    return record as T;
  });
}

async function loadPublicationMeta(cacheDir: string, pub: string, issue: string): Promise<PublicationMeta | null> {
  const filePath = await resolveCachedPubPath(cacheDir, pub, issue);
  if (!filePath) return null;

  const bundle = await openJwpubBundle(filePath);
  const row = bundle.db.exec(
    'SELECT MepsLanguageIndex, Symbol, IssueTagNumber, UndatedSymbol, PublicationCategorySymbol FROM Publication LIMIT 1',
  )[0]?.values?.[0];
  if (!row) return null;

  const symbol = String(row[1]);
  const undated = row[3] ? String(row[3]) : '';
  const category = row[4] ? String(row[4]) : '';

  return {
    mepsLanguage: Number(row[0]),
    keySymbol: symbol,
    // JW Library (Reuniões) resolve Location pelo símbolo curto da publicação (ex.: mwb, w, lfb).
    locationKeySymbol: undated || category || symbol,
    issueTagNumber: Number(row[2]),
  };
}

async function loadDocumentMeta(
  cacheDir: string,
  pub: string,
  issue: string,
  documentId: number,
): Promise<DocumentMeta | null> {
  const filePath = await resolveCachedPubPath(cacheDir, pub, issue);
  if (!filePath) return null;

  const bundle = await openJwpubBundle(filePath);
  const row = bundle.db.exec(
    `SELECT MepsDocumentId, Title FROM Document WHERE DocumentId = ${documentId} LIMIT 1`,
  )[0]?.values?.[0];
  if (!row) return null;

  const trackRow = bundle.db.exec(
    `SELECT FirstDateOffset FROM DatedText WHERE DocumentId = ${documentId} LIMIT 1`,
  )[0]?.values?.[0]?.[0];

  return {
    mepsDocumentId: Number(row[0]),
    title: String(row[1]),
    localDocumentId: documentId,
    track: trackRow != null ? Number(trackRow) : null,
  };
}

async function findLocalDocumentId(
  cacheDir: string,
  keySymbol: string,
  issue: string,
  mepsDocumentId: number | null,
  track: number | null,
): Promise<number | null> {
  const pub = prepPubFromKeySymbol(keySymbol);
  const filePath = await resolveCachedPubPath(cacheDir, pub, issue);
  if (!filePath) return null;

  const bundle = await openJwpubBundle(filePath);

  if (track != null) {
    const byTrack = bundle.db.exec(
      `SELECT DocumentId FROM DatedText WHERE FirstDateOffset = ${track} LIMIT 1`,
    )[0]?.values?.[0]?.[0];
    if (byTrack) return Number(byTrack);
  }

  if (mepsDocumentId == null) return null;

  const row = bundle.db.exec(
    `SELECT DocumentId FROM Document WHERE MepsDocumentId = ${mepsDocumentId} LIMIT 1`,
  )[0]?.values?.[0]?.[0];
  return row ? Number(row) : null;
}

function groupPrepByDocument(prep: UserPrepData) {
  const groups = new Map<
    string,
    {
      pub: string;
      issue: string;
      documentId: number;
      fields: Array<{ textTag: string; value: string }>;
      highlights: PrepHighlight[];
      notes: PrepNote[];
    }
  >();

  for (const [key, field] of Object.entries(prep.fields)) {
    const parsed = parsePrepKey(key);
    if (!parsed || parsed.kind !== 'field' || !field.value.trim()) continue;
    const groupKey = documentGroupKey(parsed.pub, parsed.issue, parsed.documentId);
    const group = groups.get(groupKey) ?? {
      pub: parsed.pub,
      issue: parsed.issue,
      documentId: parsed.documentId,
      fields: [],
      highlights: [],
      notes: [],
    };
    group.fields.push({ textTag: parsed.id, value: field.value });
    groups.set(groupKey, group);
  }

  for (const [key, highlight] of Object.entries(prep.highlights)) {
    const parsed = parsePrepKey(key);
    if (!parsed || parsed.kind !== 'highlight') continue;
    const groupKey = documentGroupKey(parsed.pub, parsed.issue, parsed.documentId);
    const group = groups.get(groupKey) ?? {
      pub: parsed.pub,
      issue: parsed.issue,
      documentId: parsed.documentId,
      fields: [],
      highlights: [],
      notes: [],
    };
    group.highlights.push(highlight);
    groups.set(groupKey, group);
  }

  for (const [key, note] of Object.entries(prep.notes)) {
    const parsed = parsePrepKey(key);
    if (!parsed || parsed.kind !== 'note') continue;
    const groupKey = documentGroupKey(parsed.pub, parsed.issue, parsed.documentId);
    const group = groups.get(groupKey) ?? {
      pub: parsed.pub,
      issue: parsed.issue,
      documentId: parsed.documentId,
      fields: [],
      highlights: [],
      notes: [],
    };
    group.notes.push(note);
    groups.set(groupKey, group);
  }

  return [...groups.values()];
}

type DocumentLocationSet = {
  track: number | null;
  document: number | null;
  input: number | null;
  primary: number;
};

function stableNoteExportGuid(
  pub: string,
  issue: string,
  documentId: number,
  noteId: string,
): string {
  const hash = createHash('sha256')
    .update(`${pub}|${issue}|${documentId}|${noteId}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function allocateExportNoteGuid(
  pub: string,
  issue: string,
  documentId: number,
  noteId: string,
  usedGuids: Set<string>,
): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const seed = attempt === 0 ? noteId : `${noteId}#${attempt}`;
    const guid = stableNoteExportGuid(pub, issue, documentId, seed);
    if (!usedGuids.has(guid)) {
      usedGuids.add(guid);
      return guid;
    }
  }
  const guid = randomUUID();
  usedGuids.add(guid);
  return guid;
}

async function buildDatabaseContents(cacheDir: string, prep: UserPrepData) {
  const locations: LocationRow[] = [];
  const inputFields: Array<{ LocationId: number; TextTag: string; Value: string }> = [];
  const userMarks: Array<{
    UserMarkId: number;
    ColorIndex: number;
    LocationId: number;
    StyleIndex: number;
    UserMarkGuid: string;
    Version: number;
  }> = [];
  const blockRanges: Array<{
    BlockRangeId: number;
    BlockType: number;
    Identifier: number;
    StartToken: number | null;
    EndToken: number | null;
    UserMarkId: number;
  }> = [];
  const notes: Array<{
    NoteId: number;
    Guid: string;
    UserMarkId: number | null;
    LocationId: number;
    Title: string | null;
    Content: string | null;
    LastModified: string;
    Created: string;
    BlockType: number;
    BlockIdentifier: number | null;
  }> = [];

  const locationIndex = new Map<string, number>();
  let nextLocationId = 1;
  let nextUserMarkId = 1;
  let nextBlockRangeId = 1;
  let nextNoteId = 1;
  const usedNoteGuids = new Set<string>();

  const pubMetaCache = new Map<string, PublicationMeta | null>();
  const docMetaCache = new Map<string, DocumentMeta | null>();
  const htmlCache = new Map<string, string>();
  const structureCache = new Map<string, ReturnType<typeof extractDocumentStructure>>();

  async function getCachedDocumentHtml(pub: string, issue: string, documentId: number) {
    const key = documentGroupKey(pub, issue, documentId);
    if (htmlCache.has(key)) return htmlCache.get(key)!;
    const filePath = await resolveCachedPubPath(cacheDir, pub, issue);
    if (!filePath) return '';
    const html = await getDocumentHtml(filePath, documentId);
    htmlCache.set(key, html);
    return html;
  }

  async function getCachedDocumentStructure(pub: string, issue: string, documentId: number) {
    const key = documentGroupKey(pub, issue, documentId);
    if (structureCache.has(key)) return structureCache.get(key)!;
    const html = await getCachedDocumentHtml(pub, issue, documentId);
    const structure = extractDocumentStructure(html);
    structureCache.set(key, structure);
    return structure;
  }

  function noteTitleForExport(note: PrepNote, structure: ReturnType<typeof extractDocumentStructure>) {
    if (isLfbStudyPrepNote(note) || isLfbSabePrepNote(note)) return note.title;
    return resolveNoteTitle(structure, note.blockId) ?? note.title;
  }

  async function ensureDocumentLocations(pub: string, issue: string, documentId: number) {
    const pubKey = pubCacheKey(pub, issue);
    if (!pubMetaCache.has(pubKey)) {
      pubMetaCache.set(pubKey, await loadPublicationMeta(cacheDir, pub, issue));
    }
    const pubMeta = pubMetaCache.get(pubKey);
    if (!pubMeta) return null;

    const docKey = documentGroupKey(pub, issue, documentId);
    if (!docMetaCache.has(docKey)) {
      docMetaCache.set(docKey, await loadDocumentMeta(cacheDir, pub, issue, documentId));
    }
    const docMeta = docMetaCache.get(docKey);
    if (!docMeta) return null;

    const baseKey = `${pubMeta.locationKeySymbol}|${pubMeta.issueTagNumber}`;

    function upsertLocation(
      key: string,
      row: Omit<LocationRow, 'LocationId'>,
    ): number {
      const existing = locationIndex.get(key);
      if (existing) return existing;
      const locationId = nextLocationId++;
      locationIndex.set(key, locationId);
      locations.push({ LocationId: locationId, ...row });
      return locationId;
    }

    const shared = {
      BookNumber: null as number | null,
      ChapterNumber: null as number | null,
      IssueTagNumber: pubMeta.issueTagNumber,
      KeySymbol: pubMeta.locationKeySymbol,
      Type: 0,
      Specialty: null as string | null,
      Edition: null as string | null,
    };

    // JW Library cria até 3 Locations por semana da apostila:
    // 1) Track (Reuniões)  2) DocumentId+MepsLanguage (grifos na view do doc)  3) DocumentId sem idioma (campos tt*)
    const track =
      docMeta.track != null
        ? upsertLocation(`${baseKey}|track|${docMeta.track}|${pubMeta.mepsLanguage}`, {
            ...shared,
            DocumentId: null,
            Track: docMeta.track,
            MepsLanguage: pubMeta.mepsLanguage,
            Title: docMeta.title,
          })
        : null;

    const document = upsertLocation(
      `${baseKey}|doc|${docMeta.mepsDocumentId}|${pubMeta.mepsLanguage}`,
      {
        ...shared,
        DocumentId: docMeta.mepsDocumentId,
        Track: null,
        MepsLanguage: pubMeta.mepsLanguage,
        Title: docMeta.title,
      },
    );

    const input = upsertLocation(`${baseKey}|input|${docMeta.mepsDocumentId}|null`, {
      ...shared,
      DocumentId: docMeta.mepsDocumentId,
      Track: null,
      MepsLanguage: null,
      Title: '',
    });

    return {
      track,
      document,
      input,
      primary: track ?? document,
    };
  }

  function addNoteAnchorMark(
    locationId: number,
    blockIdentifier: number,
    tokens: { startToken: number; endToken: number },
    guid: string,
  ): number {
    const userMarkId = nextUserMarkId++;
    userMarks.push({
      UserMarkId: userMarkId,
      ColorIndex: 0,
      LocationId: locationId,
      StyleIndex: 0,
      UserMarkGuid: guid,
      Version: 1,
    });
    blockRanges.push({
      BlockRangeId: nextBlockRangeId++,
      BlockType: 1,
      Identifier: blockIdentifier,
      StartToken: tokens.startToken,
      EndToken: tokens.endToken,
      UserMarkId: userMarkId,
    });
    return userMarkId;
  }

  function addNote(
    locationId: number,
    note: PrepNote,
    blockIdentifier: number,
    userMarkId: number | null,
    guid: string,
    title: string,
  ) {
    const now = note.updatedAt || new Date().toISOString();
    notes.push({
      NoteId: nextNoteId++,
      Guid: guid,
      UserMarkId: userMarkId,
      LocationId: locationId,
      Title: title,
      Content: note.body,
      LastModified: now,
      Created: now,
      BlockType: 1,
      BlockIdentifier: blockIdentifier,
    });
  }

  function addUserMark(
    locationId: number,
    highlight: PrepHighlight,
    tokens: { startToken: number; endToken: number },
    styleIndex: number,
    guid: string,
  ) {
    const blockIdentifier = Number.parseInt(highlight.blockId, 10);
    if (!Number.isFinite(blockIdentifier)) return;

    const userMarkId = nextUserMarkId++;
    userMarks.push({
      UserMarkId: userMarkId,
      ColorIndex: HIGHLIGHT_COLOR_INDEX[highlight.color] ?? 1,
      LocationId: locationId,
      StyleIndex: styleIndex,
      UserMarkGuid: guid,
      Version: 1,
    });
    blockRanges.push({
      BlockRangeId: nextBlockRangeId++,
      BlockType: 1,
      Identifier: blockIdentifier,
      StartToken: tokens.startToken,
      EndToken: tokens.endToken,
      UserMarkId: userMarkId,
    });
  }

  for (const group of groupPrepByDocument(prep)) {
    const locationSet = await ensureDocumentLocations(group.pub, group.issue, group.documentId);
    if (!locationSet) continue;
    const documentHtml = await getCachedDocumentHtml(group.pub, group.issue, group.documentId);
    const structure = await getCachedDocumentStructure(group.pub, group.issue, group.documentId);

    if (group.pub === 'lfb') {
      const legacyStudyFields = group.fields.filter((field) => isLfbStudyNoteId(field.textTag));
      if (legacyStudyFields.length > 0) {
        group.fields = group.fields.filter((field) => !isLfbStudyNoteId(field.textTag));
        for (const field of legacyStudyFields) {
          if (group.notes.some((note) => note.id === field.textTag)) continue;
          group.notes.push(buildLfbStudyNote(field.textTag, field.value, documentHtml));
        }
      }
    }

    for (const field of group.fields) {
      if (locationSet.track) {
        inputFields.push({
          LocationId: locationSet.track,
          TextTag: field.textTag,
          Value: field.value,
        });
      }
      inputFields.push({
        LocationId: locationSet.input,
        TextTag: field.textTag,
        Value: field.value,
      });
    }

    for (const highlight of group.highlights) {
      const tokens = highlightToTokenRange(documentHtml, highlight);
      if (locationSet.track) {
        addUserMark(locationSet.track, highlight, tokens, 1, highlight.id || randomUUID());
      }
      addUserMark(locationSet.document, highlight, tokens, 0, randomUUID());
    }

    for (const note of group.notes) {
      const blockIdentifier = Number.parseInt(note.blockId, 10);
      if (!Number.isFinite(blockIdentifier)) continue;
      const tokens = noteToTokenRange(documentHtml, note);
      const noteGuid = allocateExportNoteGuid(
        group.pub,
        group.issue,
        group.documentId,
        note.id || String(nextNoteId),
        usedNoteGuids,
      );
      const exportTitle = noteTitleForExport(note, structure);

      if (locationSet.track) {
        // JW Library (MWB): uma nota por Location de Track, sem duplicata no Document.
        addNote(locationSet.track, note, blockIdentifier, null, noteGuid, exportTitle);
      } else {
        const anchorMarkId = addNoteAnchorMark(
          locationSet.document,
          blockIdentifier,
          tokens,
          randomUUID(),
        );
        addNote(locationSet.document, note, blockIdentifier, anchorMarkId, noteGuid, exportTitle);
      }
    }
  }

  return {
    locations,
    inputFields,
    userMarks,
    blockRanges,
    notes,
    stats: {
      locations: locations.length,
      inputFields: inputFields.length,
      userMarks: userMarks.length,
      blockRanges: blockRanges.length,
      notes: notes.length,
    },
  };
}

async function createUserDataDb(contents: Awaited<ReturnType<typeof buildDatabaseContents>>) {
  const SQL = await getSql();
  const db = new SQL.Database();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  run(db, 'PRAGMA foreign_keys = OFF');
  run(db, `PRAGMA user_version = ${JWL_USERDATA_SCHEMA_VERSION}`);
  for (const ddl of SCHEMA_DDL) run(db, ddl);
  for (const idx of SCHEMA_INDEXES) run(db, idx);

  run(db, 'BEGIN TRANSACTION');

  for (const row of contents.locations) {
    run(
      db,
      `INSERT INTO Location (LocationId, BookNumber, ChapterNumber, DocumentId, Track, IssueTagNumber, KeySymbol, MepsLanguage, Type, Title, Specialty, Edition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.LocationId,
        row.BookNumber,
        row.ChapterNumber,
        row.DocumentId,
        row.Track,
        row.IssueTagNumber,
        row.KeySymbol,
        row.MepsLanguage,
        row.Type,
        row.Title,
        row.Specialty,
        row.Edition,
      ],
    );
  }

  for (const row of contents.userMarks) {
    run(
      db,
      `INSERT INTO UserMark (UserMarkId, ColorIndex, LocationId, StyleIndex, UserMarkGuid, Version)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.UserMarkId, row.ColorIndex, row.LocationId, row.StyleIndex, row.UserMarkGuid, row.Version],
    );
  }

  for (const row of contents.notes) {
    run(
      db,
      `INSERT INTO Note (NoteId, Guid, UserMarkId, LocationId, Title, Content, LastModified, Created, BlockType, BlockIdentifier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.NoteId,
        row.Guid,
        row.UserMarkId,
        row.LocationId,
        row.Title,
        row.Content,
        row.LastModified,
        row.Created,
        row.BlockType,
        row.BlockIdentifier,
      ],
    );
  }

  for (const row of contents.blockRanges) {
    run(
      db,
      `INSERT INTO BlockRange (BlockRangeId, BlockType, Identifier, StartToken, EndToken, UserMarkId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.BlockRangeId, row.BlockType, row.Identifier, row.StartToken, row.EndToken, row.UserMarkId],
    );
  }

  for (const row of contents.inputFields) {
    run(db, 'INSERT INTO InputField (LocationId, TextTag, Value) VALUES (?, ?, ?)', [
      row.LocationId,
      row.TextTag,
      row.Value,
    ]);
  }

  run(db, 'INSERT INTO LastModified (LastModified) VALUES (?)', [now]);
  run(db, 'INSERT INTO android_metadata (locale) VALUES (?)', ['pt_BR']);
  run(db, 'COMMIT');

  for (const trigger of SCHEMA_TRIGGERS) run(db, trigger);

  run(db, 'PRAGMA foreign_keys = ON');
  const fkErrors = queryAll(db, 'PRAGMA foreign_key_check');
  if (fkErrors.length > 0) {
    db.close();
    throw new Error(`Foreign key violations: ${JSON.stringify(fkErrors)}`);
  }

  const dbBytes = Buffer.from(db.export());
  db.close();
  return { dbBytes, now };
}

async function packJwlibrary(dbBytes: Buffer, deviceName: string) {
  const hash = createHash('sha256').update(dbBytes).digest('hex');
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const dateStr = now.split('T')[0] ?? now.slice(0, 10);
  const manifest = {
    name: `JCSMeetingsBackup_${dateStr}.jwlibrary`,
    creationDate: dateStr,
    version: 1,
    type: 0,
    userDataBackup: {
      lastModifiedDate: now,
      deviceName,
      databaseName: 'userData.db',
      hash,
      schemaVersion: JWL_USERDATA_SCHEMA_VERSION,
    },
  };

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  zip.file('userData.db', dbBytes);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

function issueStringFromTag(issueTagNumber: number) {
  if (!issueTagNumber) return '';
  const raw = String(issueTagNumber);
  if (raw.length === 8 && raw.endsWith('00')) return raw.slice(0, 6);
  return raw.padStart(6, '0');
}

const COLOR_BY_INDEX: Record<number, string> = {
  1: 'yellow',
  2: 'green',
  3: 'blue',
  4: 'pink',
  5: 'purple',
  6: 'orange',
};

export async function exportJwlibrary(
  cacheDir: string,
  userDataDir: string,
  outputPath: string,
): Promise<JwLibraryExportResult> {
  try {
    const prep = await loadPrepData(userDataDir);
    const contents = await buildDatabaseContents(cacheDir, prep);

    if (
      contents.stats.inputFields === 0 &&
      contents.stats.userMarks === 0 &&
      contents.stats.notes === 0
    ) {
      return { ok: false, error: 'Não há preparação para exportar (campos, grifos ou notas).' };
    }

    const { dbBytes } = await createUserDataDb(contents);
    const archive = await packJwlibrary(dbBytes, 'JCS Meetings');
    await fs.writeFile(outputPath, archive);

    return { ok: true, filePath: outputPath, stats: contents.stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar .jwlibrary';
    return { ok: false, error: message };
  }
}

export async function importJwlibrary(
  cacheDir: string,
  userDataDir: string,
  archivePath: string,
): Promise<JwLibraryImportResult> {
  try {
    const SQL = await getSql();
    const archiveBytes = await fs.readFile(archivePath);
    const zip = await JSZip.loadAsync(archiveBytes);
    const manifestRaw = await zip.file('manifest.json')?.async('string');
    if (!manifestRaw) return { ok: false, error: 'manifest.json ausente no arquivo.' };

    const manifest = JSON.parse(manifestRaw) as { userDataBackup?: { databaseName?: string } };
    const dbName = manifest.userDataBackup?.databaseName ?? 'userData.db';
    const dbBytes = await zip.file(dbName)?.async('nodebuffer');
    if (!dbBytes) return { ok: false, error: `${dbName} ausente no arquivo.` };

    const db = new SQL.Database(dbBytes);
    const locations = queryAll<LocationRow>(db, 'SELECT * FROM Location');
    const inputFields = queryAll<{ LocationId: number; TextTag: string; Value: string }>(
      db,
      'SELECT * FROM InputField',
    );
    const userMarks = queryAll<{
      UserMarkId: number;
      ColorIndex: number;
      LocationId: number;
      UserMarkGuid: string;
    }>(db, 'SELECT UserMarkId, ColorIndex, LocationId, UserMarkGuid FROM UserMark');
    const blockRanges = queryAll<{
      BlockRangeId: number;
      BlockType: number;
      Identifier: number;
      StartToken: number | null;
      EndToken: number | null;
      UserMarkId: number;
    }>(db, 'SELECT * FROM BlockRange');
    const importedNotes = queryAll<{
      Guid: string;
      LocationId: number | null;
      Title: string | null;
      Content: string | null;
      BlockType: number;
      BlockIdentifier: number | null;
      LastModified: string;
    }>(db, 'SELECT Guid, LocationId, Title, Content, BlockType, BlockIdentifier, LastModified FROM Note');
    db.close();

    const locationById = new Map(locations.map((loc) => [loc.LocationId, loc]));
    const blockRangeByMark = new Map<number, (typeof blockRanges)[number]>();
    for (const range of blockRanges) {
      if (!blockRangeByMark.has(range.UserMarkId)) blockRangeByMark.set(range.UserMarkId, range);
    }

    const prep: UserPrepData = await loadPrepData(userDataDir);
    const merged: UserPrepData = {
      fields: { ...prep.fields },
      highlights: { ...prep.highlights },
      notes: { ...prep.notes },
      publicTalkNotes: prep.publicTalkNotes ? { ...prep.publicTalkNotes } : {},
    };
    let fields = 0;
    let highlights = 0;
    let notes = 0;
    let skipped = 0;

    const importHtmlCache = new Map<string, string>();
    async function getImportDocumentHtml(pub: string, issue: string, documentId: number) {
      const key = documentGroupKey(pub, issue, documentId);
      if (importHtmlCache.has(key)) return importHtmlCache.get(key)!;
      const filePath = await resolveCachedPubPath(cacheDir, pub, issue);
      if (!filePath) return '';
      const html = await getDocumentHtml(filePath, documentId);
      importHtmlCache.set(key, html);
      return html;
    }

    const importedHighlightKeys = new Set<string>();

    for (const field of inputFields) {
      const location = locationById.get(field.LocationId);
      if (!location?.KeySymbol) {
        skipped++;
        continue;
      }
      const issue = issueStringFromTag(location.IssueTagNumber);
      const prepPub = prepPubFromKeySymbol(location.KeySymbol);
      const localDocId = await findLocalDocumentId(
        cacheDir,
        location.KeySymbol,
        issue,
        location.DocumentId,
        location.Track,
      );
      if (!localDocId) {
        skipped++;
        continue;
      }
      if (prepPub === 'lfb' && isLfbStudyNoteId(field.TextTag)) continue;
      const key = `${prepPub}_${issue}_d${localDocId}_f${field.TextTag}`;
      merged.fields[key] = { value: field.Value, updatedAt: new Date().toISOString() };
      fields++;
    }

    for (const mark of userMarks) {
      if (mark.ColorIndex === 0) continue;
      const location = locationById.get(mark.LocationId);
      const range = blockRangeByMark.get(mark.UserMarkId);
      if (!location?.KeySymbol || !range) {
        skipped++;
        continue;
      }
      const issue = issueStringFromTag(location.IssueTagNumber);
      const prepPub = prepPubFromKeySymbol(location.KeySymbol);
      const localDocId = await findLocalDocumentId(
        cacheDir,
        location.KeySymbol,
        issue,
        location.DocumentId,
        location.Track,
      );
      if (!localDocId) {
        skipped++;
        continue;
      }

      const dedupeKey = `${localDocId}_${range.Identifier}_${range.StartToken}_${range.EndToken}_${mark.ColorIndex}`;
      if (importedHighlightKeys.has(dedupeKey)) continue;
      importedHighlightKeys.add(dedupeKey);

      const documentHtml = await getImportDocumentHtml(prepPub, issue, localDocId);
      const paragraph = extractParagraphPlainText(documentHtml, String(range.Identifier));
      const { startOffset, endOffset, text } = jwTokensToCharOffsets(
        paragraph,
        range.StartToken ?? 0,
        range.EndToken ?? 0,
      );

      const key = `${prepPub}_${issue}_d${localDocId}_h${mark.UserMarkGuid}`;
      merged.highlights[key] = {
        id: mark.UserMarkGuid,
        color: COLOR_BY_INDEX[mark.ColorIndex] ?? 'yellow',
        text,
        blockId: String(range.Identifier),
        startOffset,
        endOffset,
        updatedAt: new Date().toISOString(),
      };
      highlights++;
    }

    const importedNoteKeys = new Set<string>();
    const sortedNotes = [...importedNotes].sort((a, b) => {
      const locA = a.LocationId != null ? locationById.get(a.LocationId) : undefined;
      const locB = b.LocationId != null ? locationById.get(b.LocationId) : undefined;
      const trackRank = (loc?: LocationRow) => (loc?.Track != null ? 0 : 1);
      return trackRank(locA) - trackRank(locB);
    });

    for (const note of sortedNotes) {
      if (!note.LocationId || note.BlockType !== 1 || note.BlockIdentifier == null) continue;
      const location = locationById.get(note.LocationId);
      if (!location?.KeySymbol) continue;
      const issue = issueStringFromTag(location.IssueTagNumber);
      const prepPub = prepPubFromKeySymbol(location.KeySymbol);
      const localDocId = await findLocalDocumentId(
        cacheDir,
        location.KeySymbol,
        issue,
        location.DocumentId,
        location.Track,
      );
      if (!localDocId) {
        skipped++;
        continue;
      }

      const blockKey = `${prepPub}_${issue}_d${localDocId}_b${note.BlockIdentifier}`;
      const titleKey = `${prepPub}_${issue}_d${localDocId}_t${(note.Title ?? '').trim().toLowerCase()}`;
      const fromTrack = location.Track != null;
      if (importedNoteKeys.has(blockKey) && !fromTrack) continue;
      if (importedNoteKeys.has(titleKey)) continue;

      const studyNoteId =
        prepPub === 'lfb' ? lfbStudyNoteIdForQuestion(note.Title ?? '') : null;
      const noteId = studyNoteId ?? note.Guid;
      const key = `${prepPub}_${issue}_d${localDocId}_n${noteId}`;
      merged.notes[key] = {
        id: noteId,
        title: studyNoteId ? (lfbStudyQuestionForNoteId(studyNoteId) ?? note.Title ?? '') : (note.Title ?? ''),
        body: note.Content ?? '',
        blockId: String(note.BlockIdentifier),
        anchorText: '',
        startOffset: 0,
        endOffset: 0,
        tags: studyNoteId ? ['lfb-study'] : [],
        updatedAt: note.LastModified,
      };
      importedNoteKeys.add(blockKey);
      importedNoteKeys.add(titleKey);
      notes++;
    }

    if (fields === 0 && highlights === 0 && notes === 0) {
      return {
        ok: false,
        error:
          skipped > 0
            ? 'Nenhum dado importado. Baixe no JCS as publicações (mwb/w) da mesma semana do backup antes de importar.'
            : 'O arquivo não contém campos, grifos ou notas para importar.',
      };
    }

    await savePrepData(userDataDir, merged);
    return { ok: true, stats: { fields, highlights, notes } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao importar .jwlibrary';
    return { ok: false, error: message };
  }
}

export type { PrepField, PrepHighlight, PrepNote };
