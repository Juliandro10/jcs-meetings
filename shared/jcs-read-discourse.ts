import { parseTalkTheme } from './talk-theme-parse';
import { normalizePlainText } from './text-normalize';

export function parseDiscourseThemeFromNote(raw: string) {
  const plain = normalizePlainText(
    raw
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, '\n'),
  );
  if (!plain) return { themeNumber: null as number | null, themeTitle: '' };

  const firstLine = plain.split('\n').map((line) => line.trim()).find(Boolean) ?? plain;
  const parsed = parseTalkTheme(firstLine);
  if (parsed.themeNumber) return parsed;

  const inline = plain.match(/\b(\d{1,3})\.\s+([A-Za-zÀ-ú0-9"“][^.!\n]{8,120})/);
  if (inline) {
    return { themeNumber: Number(inline[1]), themeTitle: inline[2]!.trim() };
  }

  return parsed;
}

export function sanitizeJcsReadFileSlug(value: string, max = 40) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .toLowerCase();
}
