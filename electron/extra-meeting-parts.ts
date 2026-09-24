import { randomUUID } from 'node:crypto';
import { extractPautaFileText } from './elder-meeting-pauta';
import { importedTextToHtml } from './imported-documents-store';
import type { ExtraMeetingPartContextItem } from './types';

const CONTEXT_TEXT_LIMIT = 40_000;

export function clipExtraPartContextText(text: string) {
  const trimmed = text.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (trimmed.length <= CONTEXT_TEXT_LIMIT) return trimmed;
  return `${trimmed.slice(0, CONTEXT_TEXT_LIMIT).trim()}\n\n[Texto cortado para caber no contexto da parte.]`;
}

export function extraPartContextFromText(params: {
  kind: ExtraMeetingPartContextItem['kind'];
  title: string;
  text: string;
  fileName?: string;
}): ExtraMeetingPartContextItem {
  const text = clipExtraPartContextText(params.text);
  return {
    id: randomUUID(),
    kind: params.kind,
    title: params.title.trim() || 'Contexto',
    fileName: params.fileName,
    text,
    html: importedTextToHtml(text),
    addedAt: new Date().toISOString(),
  };
}

export async function extractExtraPartContextFromFile(
  fileName: string,
  buffer: Buffer,
): Promise<ExtraMeetingPartContextItem | null> {
  const text = clipExtraPartContextText(await extractPautaFileText(fileName, buffer));
  if (!text) return null;
  const title = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || fileName;
  return extraPartContextFromText({
    kind: 'file',
    title,
    text,
    fileName,
  });
}

export function extraPartImageFileName(mimeType: string) {
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg')
    ? 'jpg'
    : mimeType.includes('gif')
      ? 'gif'
      : mimeType.includes('webp')
        ? 'webp'
        : mimeType.includes('bmp')
          ? 'bmp'
          : 'png';
  return `img-${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}.${ext}`;
}
