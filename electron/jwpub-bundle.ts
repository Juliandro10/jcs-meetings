import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs, { type Database } from 'sql.js';
import { deriveKeyIv } from './jwpub-crypto';

const require = createRequire(import.meta.url);
const SQL_WASM_DIR = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));

export type JwpubBundle = {
  jwpubPath: string;
  pub: string;
  issue: string;
  lang: string;
  db: Database;
  inner: JSZip;
  keyIv: Buffer;
};

let sqlInit: Awaited<ReturnType<typeof initSqlJs>> | null = null;
const bundleCache = new Map<string, JwpubBundle>();

async function getSql() {
  if (!sqlInit) {
    sqlInit = await initSqlJs({
      locateFile: (file) => path.join(SQL_WASM_DIR, file),
    });
  }
  return sqlInit;
}

function parseJwpubFileName(fileName: string) {
  const match = fileName.match(/^(.+)_([A-Za-z]+)_?(\d*)\.jwpub$/i);
  if (!match) throw new Error(`Nome de jwpub inválido: ${fileName}`);
  return { pub: match[1].toLowerCase(), lang: match[2], issue: match[3] ?? '' };
}

export async function openJwpubBundle(jwpubPath: string): Promise<JwpubBundle> {
  const cached = bundleCache.get(jwpubPath);
  if (cached) return cached;

  const buffer = await fs.readFile(jwpubPath);
  const outer = await JSZip.loadAsync(buffer);
  const manifestRaw = await outer.file('manifest.json')?.async('string');
  if (!manifestRaw) throw new Error('manifest.json ausente no jwpub');

  const manifest = JSON.parse(manifestRaw) as { publication: { fileName: string } };
  const innerBuffer = await outer.file('contents')?.async('nodebuffer');
  if (!innerBuffer) throw new Error('contents ausente no jwpub');

  const inner = await JSZip.loadAsync(innerBuffer);
  const dbBuffer = await inner.file(manifest.publication.fileName)?.async('nodebuffer');
  if (!dbBuffer) throw new Error('banco SQLite ausente no jwpub');

  const SQL = await getSql();
  const db = new SQL.Database(dbBuffer);
  const keyIv = deriveKeyIv(db);
  const { pub, lang, issue } = parseJwpubFileName(path.basename(jwpubPath));

  const bundle: JwpubBundle = { jwpubPath, pub, issue, lang, db, inner, keyIv };
  bundleCache.set(jwpubPath, bundle);
  return bundle;
}

export function clearJwpubBundleCache() {
  for (const bundle of bundleCache.values()) {
    bundle.db.close();
  }
  bundleCache.clear();
}

export async function readJwpubMedia(
  jwpubPath: string,
  fileName: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const bundle = await openJwpubBundle(jwpubPath);
  const normalized = fileName.replace(/^jwpub-media:\/\//, '');
  const zipFile = bundle.inner.file(normalized);
  if (!zipFile) return null;

  const buffer = Buffer.from(await zipFile.async('nodebuffer'));
  const mimeRow = bundle.db.exec(
    `SELECT MimeType FROM Multimedia WHERE FilePath = '${normalized.replace(/'/g, "''")}' LIMIT 1`,
  )[0]?.values?.[0]?.[0];

  return {
    buffer,
    mimeType: mimeRow ? String(mimeRow) : guessMimeType(normalized),
  };
}

function guessMimeType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function mediaIssueSegment(issue: string) {
  return issue || '_';
}

function parseMediaIssueSegment(segment: string) {
  return segment === '_' ? '' : segment;
}

export function rewriteJwpubMediaUrls(html: string, pub: string, issue: string, lang = 'T') {
  return html.replace(/jwpub-media:\/\/([^"'>\s]+)/g, (_match, fileName: string) => {
    const encoded = encodeURIComponent(fileName);
    return `jcs-media://${pub}/${lang}/${mediaIssueSegment(issue)}/${encoded}`;
  });
}

type JwpubManifestImage = {
  fileName?: string;
  type?: string;
  width?: number;
  height?: number;
};

export function buildJcsMediaUrl(pub: string, lang: string, issue: string, fileName: string) {
  return `jcs-media://${pub}/${lang}/${mediaIssueSegment(issue)}/${encodeURIComponent(fileName)}`;
}

export async function getJwpubThumbnailFileName(jwpubPath: string): Promise<string | null> {
  const buffer = await fs.readFile(jwpubPath);
  const outer = await JSZip.loadAsync(buffer);
  const manifestRaw = await outer.file('manifest.json')?.async('string');
  if (!manifestRaw) return null;

  const manifest = JSON.parse(manifestRaw) as {
    publication?: { images?: JwpubManifestImage[] };
    images?: JwpubManifestImage[];
  };

  const images = manifest.publication?.images ?? manifest.images ?? [];
  const thumbnail =
    images.find((image) => image.fileName?.includes('600x600') && image.type === 't') ??
    images.find((image) => image.type === 't') ??
    images.find((image) => image.type === 'c');

  return thumbnail?.fileName ?? null;
}

export async function getJwpubCoverUrl(
  jwpubPath: string,
  pub: string,
  issue: string,
  lang: string,
): Promise<string | null> {
  const fileName = await getJwpubThumbnailFileName(jwpubPath);
  if (!fileName) return null;
  return buildJcsMediaUrl(pub, lang, issue, fileName);
}
