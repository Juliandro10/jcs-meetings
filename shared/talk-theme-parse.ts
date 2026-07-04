/** Extrai número e título do tema a partir do título do esboço (ex.: "119. Porque é benéfico…"). */
export function parseTalkTheme(sourceTitle: string, fallbackName?: string): {
  themeNumber: number | null;
  themeTitle: string;
} {
  const source = (sourceTitle || fallbackName || '').trim();
  const match = source.match(/^(\d{1,3})\.\s*(.+)$/);
  if (match) {
    return { themeNumber: Number(match[1]), themeTitle: match[2].trim() };
  }
  return { themeNumber: null, themeTitle: source };
}
