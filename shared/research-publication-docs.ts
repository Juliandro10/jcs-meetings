const VOLUME_II_TITLE = /\b(volume|tomo)\s*(ii|2|dois)\b/i;

/** Separa artigos do Perspicaz quando vol. I e II vêm no mesmo .jwpub. */
export function filterPerspicazVolumeDocuments<T extends { documentId: number; title: string }>(
  documents: T[],
  volume: 1 | 2,
): T[] {
  const splitAt = documents.findIndex((doc) => VOLUME_II_TITLE.test(doc.title));
  if (splitAt > 0) {
    return volume === 1 ? documents.slice(0, splitAt) : documents.slice(splitAt);
  }

  const readable = documents.filter((doc) => doc.documentId !== 0);
  if (readable.length <= 1) return documents;

  const mid = Math.ceil(readable.length / 2);
  const readableSet = new Set(readable.map((doc) => doc.documentId));
  const firstHalf = new Set(readable.slice(0, mid).map((doc) => doc.documentId));
  const secondHalf = new Set(readable.slice(mid).map((doc) => doc.documentId));
  const keep = volume === 1 ? firstHalf : secondHalf;

  return documents.filter((doc) => !readableSet.has(doc.documentId) || keep.has(doc.documentId));
}
