import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ImportedDocument, ImportedDocumentKind, ImportedDocumentListItem } from './types';
import { IMPORTED_DOC_ID_TOKEN, type ImportedExtractAsset } from './imported-document-extract';

type StoreFile = {
  documents: ImportedDocument[];
};

export const IMPORTED_FILES_DIR = 'imported-document-files';

function storePath(userDataRoot: string) {
  return path.join(userDataRoot, 'imported-documents.json');
}

export function importedAssetsDir(userDataRoot: string, id: string) {
  return path.join(userDataRoot, IMPORTED_FILES_DIR, id);
}

export function isSafeImportedId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function isSafeImportedAssetName(fileName: string) {
  return /^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
}

export function importedAssetFilePath(userDataRoot: string, id: string, fileName: string) {
  if (!isSafeImportedId(id) || !isSafeImportedAssetName(fileName)) return null;
  return path.join(importedAssetsDir(userDataRoot, id), fileName);
}

function kindFromFileName(fileName: string): ImportedDocumentKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.doc')) return 'doc';
  if (lower.endsWith('.txt')) return 'txt';
  return 'other';
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || fileName;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function importedTextToHtml(text: string) {
  const trimmed = text.replace(/\u00a0/g, ' ').trim();
  if (!trimmed) return '<p><br></p>';
  return trimmed
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

async function loadStore(userDataRoot: string): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath(userDataRoot), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    return { documents: Array.isArray(parsed.documents) ? parsed.documents : [] };
  } catch {
    return { documents: [] };
  }
}

async function saveStore(userDataRoot: string, store: StoreFile) {
  await fs.mkdir(userDataRoot, { recursive: true });
  await fs.writeFile(storePath(userDataRoot), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function toListItem(doc: ImportedDocument): ImportedDocumentListItem {
  const { body: _body, ...item } = doc;
  return item;
}

async function writeAssets(userDataRoot: string, id: string, assets: ImportedExtractAsset[]) {
  if (assets.length === 0) return;
  const dir = importedAssetsDir(userDataRoot, id);
  await fs.mkdir(dir, { recursive: true });
  for (const asset of assets) {
    if (!isSafeImportedAssetName(asset.fileName)) continue;
    await fs.writeFile(path.join(dir, asset.fileName), asset.buffer);
  }
}

export async function listImportedDocuments(userDataRoot: string): Promise<ImportedDocumentListItem[]> {
  const store = await loadStore(userDataRoot);
  return [...store.documents]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toListItem);
}

export async function getImportedDocument(
  userDataRoot: string,
  id: string,
): Promise<ImportedDocument | null> {
  const store = await loadStore(userDataRoot);
  return store.documents.find((item) => item.id === id) ?? null;
}

export async function createImportedDocument(
  userDataRoot: string,
  params: {
    sourceFileName: string;
    body: string;
    assets?: ImportedExtractAsset[];
    title?: string;
  },
): Promise<ImportedDocument> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const doc: ImportedDocument = {
    id,
    title: (params.title ?? titleFromFileName(params.sourceFileName)).trim() || 'Documento',
    sourceFileName: params.sourceFileName,
    sourceKind: kindFromFileName(params.sourceFileName),
    body: params.body.replaceAll(IMPORTED_DOC_ID_TOKEN, id),
    createdAt: now,
    updatedAt: now,
  };
  await writeAssets(userDataRoot, id, params.assets ?? []);
  const store = await loadStore(userDataRoot);
  store.documents.unshift(doc);
  await saveStore(userDataRoot, store);
  return doc;
}

export async function saveImportedDocument(
  userDataRoot: string,
  params: { id: string; title?: string; body: string },
): Promise<ImportedDocument | null> {
  const store = await loadStore(userDataRoot);
  const index = store.documents.findIndex((item) => item.id === params.id);
  if (index < 0) return null;
  const current = store.documents[index];
  const next: ImportedDocument = {
    ...current,
    title: params.title?.trim() || current.title,
    body: params.body,
    updatedAt: new Date().toISOString(),
  };
  store.documents[index] = next;
  await saveStore(userDataRoot, store);
  return next;
}

export async function deleteImportedDocument(userDataRoot: string, id: string): Promise<boolean> {
  const store = await loadStore(userDataRoot);
  const next = store.documents.filter((item) => item.id !== id);
  if (next.length === store.documents.length) return false;
  store.documents = next;
  await saveStore(userDataRoot, store);
  await fs.rm(importedAssetsDir(userDataRoot, id), { recursive: true, force: true });
  return true;
}
