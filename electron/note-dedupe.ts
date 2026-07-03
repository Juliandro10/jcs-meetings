import { resolveNoteTitle, type DocumentStructure } from './document-structure';
import {
  getNotes,
  loadPrepData,
  notePrefix,
  savePrepData,
  type PrepNote,
} from './user-prep-store';

type NoteLike = Pick<PrepNote, 'id' | 'title' | 'body' | 'blockId' | 'tags' | 'updatedAt'>;

function canonicalPartTitle(structure: DocumentStructure, note: NoteLike): string {
  const fromBlock = resolveNoteTitle(structure, note.blockId);
  if (fromBlock) return fromBlock.trim().toLowerCase();

  const title = note.title.trim().toLowerCase();
  if (/^\(\d+\s*min\)/i.test(title)) {
    const block = structure.blocks.find((item) => item.blockId === note.blockId);
    const blockText = block?.text ?? '';
    for (const part of structure.parts) {
      if (blockText.includes(part.title.slice(0, 20)) || part.text.includes(blockText.slice(0, 30))) {
        return part.title.trim().toLowerCase();
      }
    }
  }

  const byTitle = structure.parts.find(
    (part) =>
      part.title.trim().toLowerCase() === title ||
      title.includes(part.title.trim().toLowerCase().slice(0, 18)) ||
      part.title.trim().toLowerCase().includes(title.slice(0, 18)),
  );
  if (byTitle) return byTitle.title.trim().toLowerCase();

  return title;
}

function noteScore(structure: DocumentStructure, note: NoteLike, canonical: string): number {
  let score = (note.body?.length ?? 0) * 2;
  const part = structure.parts.find((item) => item.title.trim().toLowerCase() === canonical);
  if (part && note.blockId === part.blockId) score += 500;
  const block = structure.blocks.find((item) => item.blockId === note.blockId);
  if (block && /^\d+\.\s/.test(block.text.trim())) score += 300;
  if (note.tags?.includes('auto-prep')) score += 50;
  score += Date.parse(note.updatedAt || '') / 1_000_000_000_000;
  return score;
}

export function dedupeNotesForDocument<T extends NoteLike>(
  notes: T[],
  structure: DocumentStructure,
): T[] {
  const groups = new Map<string, T[]>();

  for (const note of notes) {
    const key = canonicalPartTitle(structure, note);
    const group = groups.get(key) ?? [];
    group.push(note);
    groups.set(key, group);
  }

  const deduped: T[] = [];
  for (const [canonical, group] of groups) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    const best = group.reduce((winner, candidate) =>
      noteScore(structure, candidate, canonical) > noteScore(structure, winner, canonical)
        ? candidate
        : winner,
    );

    const part = structure.parts.find((item) => item.title.trim().toLowerCase() === canonical);
    deduped.push({
      ...best,
      title: part?.title ?? best.title,
      blockId: part?.blockId ?? best.blockId,
    });
  }

  return deduped.sort(
    (a, b) => a.blockId.localeCompare(b.blockId) || a.startOffset - b.startOffset,
  );
}

export function dedupeNotesByTitle<T extends NoteLike>(notes: T[]): T[] {
  const byTitle = new Map<string, T>();
  for (const note of notes) {
    const key = note.title.trim().toLowerCase();
    const existing = byTitle.get(key);
    if (!existing || (note.body?.length ?? 0) > (existing.body?.length ?? 0)) {
      byTitle.set(key, note);
    }
  }
  return [...byTitle.values()].sort(
    (a, b) => a.blockId.localeCompare(b.blockId) || a.startOffset - b.startOffset,
  );
}

export async function pruneDuplicateDocumentNotes(
  userDataDir: string,
  pub: string,
  issue: string,
  documentId: number,
  structure: DocumentStructure,
): Promise<PrepNote[]> {
  const data = await loadPrepData(userDataDir);
  const prefix = notePrefix(pub, issue, documentId);
  const notes = Object.entries(data.notes)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value);

  const deduped = dedupeNotesForDocument(notes, structure);
  if (deduped.length === notes.length) return deduped;

  const keepIds = new Set(deduped.map((note) => note.id));
  for (const key of Object.keys(data.notes)) {
    if (!key.startsWith(prefix)) continue;
    const noteId = key.slice(prefix.length);
    if (!keepIds.has(noteId)) delete data.notes[key];
  }

  await savePrepData(userDataDir, data);
  return getNotes(userDataDir, pub, issue, documentId).then((loaded) =>
    dedupeNotesForDocument(loaded, structure),
  );
}
