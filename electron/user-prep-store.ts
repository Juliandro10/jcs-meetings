import fs from 'node:fs/promises';
import path from 'node:path';

export type PrepField = {
  value: string;
  updatedAt: string;
};

export type PrepHighlight = {
  id: string;
  color: string;
  text: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  updatedAt: string;
};

export type PrepNote = {
  id: string;
  title: string;
  body: string;
  blockId: string;
  anchorText: string;
  startOffset: number;
  endOffset: number;
  tags: string[];
  updatedAt: string;
};

export type PreparedElderOutline = {
  id: string;
  name: string;
  pub: string;
  documentId: number;
  sourceTitle: string;
  sourcePubLabel: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

import type { FieldServiceSuggestionsBundle } from './types';

export type UserPrepData = {
  fields: Record<string, PrepField>;
  highlights: Record<string, PrepHighlight>;
  notes: Record<string, PrepNote>;
  publicTalkNotes?: Record<string, PrepField>;
  fieldServiceNotes?: Record<string, PrepField>;
  fieldServiceSuggestions?: Record<string, FieldServiceSuggestionsBundle>;
  elderOutlineNotes?: Record<string, PrepField>;
  preparedElderOutlines?: Record<string, PreparedElderOutline>;
};

const EMPTY: UserPrepData = {
  fields: {},
  highlights: {},
  notes: {},
  publicTalkNotes: {},
  fieldServiceNotes: {},
  fieldServiceSuggestions: {},
  elderOutlineNotes: {},
  preparedElderOutlines: {},
};

function prepFilePath(userDataDir: string) {
  return path.join(userDataDir, 'prep-data.json');
}

export async function loadPrepData(userDataDir: string): Promise<UserPrepData> {
  try {
    const raw = await fs.readFile(prepFilePath(userDataDir), 'utf8');
    const parsed = JSON.parse(raw) as Partial<UserPrepData>;
    return {
      fields: parsed.fields ?? {},
      highlights: parsed.highlights ?? {},
      notes: parsed.notes ?? {},
      publicTalkNotes: parsed.publicTalkNotes ?? {},
      fieldServiceNotes: parsed.fieldServiceNotes ?? {},
      fieldServiceSuggestions: parsed.fieldServiceSuggestions ?? {},
      elderOutlineNotes: parsed.elderOutlineNotes ?? {},
      preparedElderOutlines: parsed.preparedElderOutlines ?? {},
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function savePrepData(userDataDir: string, data: UserPrepData): Promise<void> {
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(prepFilePath(userDataDir), JSON.stringify(data, null, 2), 'utf8');
}

export function fieldKey(pub: string, issue: string, documentId: number, fieldId: string) {
  return `${pub}_${issue}_d${documentId}_f${fieldId}`;
}

export function highlightKey(pub: string, issue: string, documentId: number, highlightId: string) {
  return `${pub}_${issue}_d${documentId}_h${highlightId}`;
}

export function highlightPrefix(pub: string, issue: string, documentId: number) {
  return `${pub}_${issue}_d${documentId}_h`;
}

export function noteKey(pub: string, issue: string, documentId: number, noteId: string) {
  return `${pub}_${issue}_d${documentId}_n${noteId}`;
}

export function notePrefix(pub: string, issue: string, documentId: number) {
  return `${pub}_${issue}_d${documentId}_n`;
}

export function documentPrepPrefix(pub: string, issue: string, documentId: number) {
  return `${pub}_${issue}_d${documentId}_`;
}

function purgeKeys<T>(record: Record<string, T>, prefix: string) {
  for (const key of Object.keys(record)) {
    if (key.startsWith(prefix)) delete record[key];
  }
}

export async function setFieldValue(
  userDataDir: string,
  key: string,
  value: string,
): Promise<UserPrepData> {
  const data = await loadPrepData(userDataDir);
  data.fields[key] = { value, updatedAt: new Date().toISOString() };
  await savePrepData(userDataDir, data);
  return data;
}

export async function getFieldValues(
  userDataDir: string,
  prefix: string,
): Promise<Record<string, string>> {
  const data = await loadPrepData(userDataDir);
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(data.fields)) {
    if (key.startsWith(prefix)) out[key] = field.value;
  }
  return out;
}

export async function getHighlights(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
): Promise<PrepHighlight[]> {
  const data = await loadPrepData(userDataDir);
  const prefix = highlightPrefix(pub, issue, documentId);
  return Object.entries(data.highlights)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .sort((a, b) => a.startOffset - b.startOffset || a.blockId.localeCompare(b.blockId));
}

export async function saveHighlight(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  highlight: Omit<PrepHighlight, 'updatedAt'>,
): Promise<PrepHighlight[]> {
  const data = await loadPrepData(userDataDir);
  const key = highlightKey(pub, issue, documentId, highlight.id);
  data.highlights[key] = { ...highlight, updatedAt: new Date().toISOString() };
  await savePrepData(userDataDir, data);
  return getHighlights(userDataDir, pub, issue, documentId);
}

export async function saveHighlightsBatch(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  highlights: Omit<PrepHighlight, 'updatedAt'>[],
): Promise<PrepHighlight[]> {
  const data = await loadPrepData(userDataDir);
  const now = new Date().toISOString();
  for (const highlight of highlights) {
    const key = highlightKey(pub, issue, documentId, highlight.id);
    data.highlights[key] = { ...highlight, updatedAt: now };
  }
  await savePrepData(userDataDir, data);
  return getHighlights(userDataDir, pub, issue, documentId);
}

export async function replaceDocumentHighlights(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  highlights: Omit<PrepHighlight, 'updatedAt'>[],
): Promise<PrepHighlight[]> {
  const data = await loadPrepData(userDataDir);
  purgeKeys(data.highlights, highlightPrefix(pub, issue, documentId));
  const now = new Date().toISOString();
  for (const highlight of highlights) {
    const key = highlightKey(pub, issue, documentId, highlight.id);
    data.highlights[key] = { ...highlight, updatedAt: now };
  }
  await savePrepData(userDataDir, data);
  return getHighlights(userDataDir, pub, issue, documentId);
}

export async function removeHighlight(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  highlightId: string,
): Promise<PrepHighlight[]> {
  const data = await loadPrepData(userDataDir);
  delete data.highlights[highlightKey(pub, issue, documentId, highlightId)];
  await savePrepData(userDataDir, data);
  return getHighlights(userDataDir, pub, issue, documentId);
}

export async function getNotes(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
): Promise<PrepNote[]> {
  const data = await loadPrepData(userDataDir);
  const prefix = notePrefix(pub, issue, documentId);
  return Object.entries(data.notes)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .sort((a, b) => a.blockId.localeCompare(b.blockId) || a.startOffset - b.startOffset);
}

export async function saveNote(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  note: Omit<PrepNote, 'updatedAt'>,
): Promise<PrepNote[]> {
  const data = await loadPrepData(userDataDir);
  data.notes[noteKey(pub, issue, documentId, note.id)] = {
    ...note,
    tags: note.tags ?? [],
    updatedAt: new Date().toISOString(),
  };
  await savePrepData(userDataDir, data);
  return getNotes(userDataDir, pub, issue, documentId);
}

export async function saveNotesBatch(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  notes: Omit<PrepNote, 'updatedAt'>[],
): Promise<PrepNote[]> {
  const data = await loadPrepData(userDataDir);
  const now = new Date().toISOString();
  for (const note of notes) {
    data.notes[noteKey(pub, issue, documentId, note.id)] = {
      ...note,
      tags: note.tags ?? [],
      updatedAt: now,
    };
  }
  await savePrepData(userDataDir, data);
  return getNotes(userDataDir, pub, issue, documentId);
}

export async function replaceTaggedNotes(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  tag: string,
  notes: Omit<PrepNote, 'updatedAt'>[],
): Promise<PrepNote[]> {
  const data = await loadPrepData(userDataDir);
  const prefix = notePrefix(pub, issue, documentId);
  for (const key of Object.keys(data.notes)) {
    if (key.startsWith(prefix) && data.notes[key].tags?.includes(tag)) {
      delete data.notes[key];
    }
  }

  const now = new Date().toISOString();
  for (const note of notes) {
    data.notes[noteKey(pub, issue, documentId, note.id)] = {
      ...note,
      tags: note.tags?.length ? note.tags : [tag],
      updatedAt: now,
    };
  }

  await savePrepData(userDataDir, data);
  return getNotes(userDataDir, pub, issue, documentId);
}

export async function removeNote(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  noteId: string,
): Promise<PrepNote[]> {
  const data = await loadPrepData(userDataDir);
  delete data.notes[noteKey(pub, issue, documentId, noteId)];
  await savePrepData(userDataDir, data);
  return getNotes(userDataDir, pub, issue, documentId);
}

export function publicTalkNoteKey(weekId: string) {
  return weekId;
}

export function elderOutlineNoteKey(pub: string, documentId: number) {
  return `${pub.toLowerCase()}_d${documentId}`;
}

export async function getElderOutlineNote(
  userDataDir: string,
  pub: string,
  documentId: number,
): Promise<string> {
  const data = await loadPrepData(userDataDir);
  return data.elderOutlineNotes?.[elderOutlineNoteKey(pub, documentId)]?.value ?? '';
}

export async function setElderOutlineNote(
  userDataDir: string,
  pub: string,
  documentId: number,
  value: string,
): Promise<void> {
  const data = await loadPrepData(userDataDir);
  if (!data.elderOutlineNotes) data.elderOutlineNotes = {};
  data.elderOutlineNotes[elderOutlineNoteKey(pub, documentId)] = {
    value,
    updatedAt: new Date().toISOString(),
  };
  await savePrepData(userDataDir, data);
}

function newPreparedOutlineId() {
  return `peo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function listPreparedElderOutlines(userDataDir: string): Promise<PreparedElderOutline[]> {
  const data = await loadPrepData(userDataDir);
  return Object.values(data.preparedElderOutlines ?? {}).sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function getPreparedElderOutline(
  userDataDir: string,
  id: string,
): Promise<PreparedElderOutline | null> {
  const data = await loadPrepData(userDataDir);
  return data.preparedElderOutlines?.[id] ?? null;
}

export async function findPreparedElderOutlineByName(
  userDataDir: string,
  pub: string,
  documentId: number,
  name: string,
): Promise<PreparedElderOutline | null> {
  const data = await loadPrepData(userDataDir);
  const normalized = name.trim().toLowerCase();
  const match = Object.values(data.preparedElderOutlines ?? {}).find(
    (entry) =>
      entry.pub.toLowerCase() === pub.toLowerCase() &&
      entry.documentId === documentId &&
      entry.name.trim().toLowerCase() === normalized,
  );
  return match ?? null;
}

export async function savePreparedElderOutline(
  userDataDir: string,
  params: {
    id?: string;
    name: string;
    pub: string;
    documentId: number;
    sourceTitle: string;
    sourcePubLabel: string;
    value: string;
  },
): Promise<PreparedElderOutline> {
  const data = await loadPrepData(userDataDir);
  if (!data.preparedElderOutlines) data.preparedElderOutlines = {};

  const now = new Date().toISOString();
  const id = params.id ?? newPreparedOutlineId();
  const existing = data.preparedElderOutlines[id];

  const entry: PreparedElderOutline = {
    id,
    name: params.name.trim(),
    pub: params.pub.toLowerCase(),
    documentId: params.documentId,
    sourceTitle: params.sourceTitle,
    sourcePubLabel: params.sourcePubLabel,
    value: params.value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  data.preparedElderOutlines[id] = entry;
  await savePrepData(userDataDir, data);
  return entry;
}

export async function deletePreparedElderOutline(userDataDir: string, id: string): Promise<boolean> {
  const data = await loadPrepData(userDataDir);
  if (!data.preparedElderOutlines?.[id]) return false;
  delete data.preparedElderOutlines[id];
  await savePrepData(userDataDir, data);
  return true;
}

export async function getPublicTalkNote(
  userDataDir: string,
  weekId: string,
): Promise<string> {
  const data = await loadPrepData(userDataDir);
  return data.publicTalkNotes?.[weekId]?.value ?? '';
}

export async function setPublicTalkNote(
  userDataDir: string,
  weekId: string,
  value: string,
): Promise<void> {
  const data = await loadPrepData(userDataDir);
  if (!data.publicTalkNotes) data.publicTalkNotes = {};
  data.publicTalkNotes[weekId] = { value, updatedAt: new Date().toISOString() };
  await savePrepData(userDataDir, data);
}

export async function getFieldServiceNote(userDataDir: string, weekId: string): Promise<string> {
  const data = await loadPrepData(userDataDir);
  return data.fieldServiceNotes?.[weekId]?.value ?? '';
}

export async function setFieldServiceNote(
  userDataDir: string,
  weekId: string,
  value: string,
): Promise<void> {
  const data = await loadPrepData(userDataDir);
  if (!data.fieldServiceNotes) data.fieldServiceNotes = {};
  data.fieldServiceNotes[weekId] = { value, updatedAt: new Date().toISOString() };
  await savePrepData(userDataDir, data);
}

export async function getFieldServiceSuggestions(
  userDataDir: string,
  weekId: string,
): Promise<FieldServiceSuggestionsBundle | null> {
  const data = await loadPrepData(userDataDir);
  return data.fieldServiceSuggestions?.[weekId] ?? null;
}

export async function setFieldServiceSuggestions(
  userDataDir: string,
  weekId: string,
  bundle: FieldServiceSuggestionsBundle,
): Promise<void> {
  const data = await loadPrepData(userDataDir);
  if (!data.fieldServiceSuggestions) data.fieldServiceSuggestions = {};
  data.fieldServiceSuggestions[weekId] = bundle;
  await savePrepData(userDataDir, data);
}

export async function clearDocumentPrep(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
): Promise<{ fields: number; highlights: number; notes: number }> {
  const data = await loadPrepData(userDataDir);
  const prefix = documentPrepPrefix(pub, issue, documentId);

  const counts = {
    fields: Object.keys(data.fields).filter((key) => key.startsWith(prefix)).length,
    highlights: Object.keys(data.highlights).filter((key) => key.startsWith(prefix)).length,
    notes: Object.keys(data.notes).filter((key) => key.startsWith(prefix)).length,
  };

  purgeKeys(data.fields, prefix);
  purgeKeys(data.highlights, prefix);
  purgeKeys(data.notes, prefix);

  await savePrepData(userDataDir, data);
  return counts;
}
