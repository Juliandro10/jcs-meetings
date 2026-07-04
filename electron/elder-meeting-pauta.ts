import {
  parsePautaDocument,
  parsedPautaToAgendaItems,
} from '../shared/elder-meeting-pauta-parse';
import { repairCommonMojibake } from '../shared/elder-meeting-text';
import { normalizePautaText, type PautaNormalizeResult } from './elder-meeting-pauta-normalize';
import { newAgendaItemId, type ElderMeetingAgendaItem } from './elder-meeting-store';
import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';
import WordExtractor from 'word-extractor';

function stripControlChars(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function isMostlyPrintable(text: string) {
  if (!text.trim()) return false;
  let printable = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 0xfffd)) printable += 1;
  }
  return printable / text.length >= 0.92;
}

export function decodeTextBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return stripControlChars(buffer.subarray(3).toString('utf8')).trim();
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return stripControlChars(buffer.subarray(2).toString('utf16le')).trim();
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return stripControlChars(buffer.subarray(2).toString('utf16be')).trim();
  }

  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('\uFFFD') && isMostlyPrintable(utf8)) {
    return stripControlChars(utf8).trim();
  }

  try {
    const win1252 = new TextDecoder('windows-1252').decode(buffer);
    if (isMostlyPrintable(win1252)) return stripControlChars(win1252).trim();
  } catch {
    // ignore
  }

  return stripControlChars(buffer.toString('latin1')).trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) return '';

  const xml = await documentFile.async('string');
  const paragraphs = xml.split(/<w:p[\s>]/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const parts: string[] = [];
    const textMatches = paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g);
    for (const match of textMatches) {
      parts.push(decodeXmlEntities(match[1] ?? ''));
    }
    const line = parts.join('').replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
  }

  return lines.join('\n');
}

async function extractLegacyDocText(buffer: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  return doc.getBody().trim();
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text ?? '').trim();
  } finally {
    await parser.destroy();
  }
}

export async function extractPautaFileText(fileName: string, buffer: Buffer): Promise<string> {
  const lower = fileName.toLowerCase();
  let text = '';

  if (lower.endsWith('.txt')) {
    text = decodeTextBuffer(buffer);
  } else if (lower.endsWith('.docx')) {
    text = await extractDocxText(buffer);
  } else if (lower.endsWith('.doc')) {
    try {
      text = await extractLegacyDocText(buffer);
    } catch {
      text = '';
    }
  } else if (lower.endsWith('.pdf')) {
    try {
      text = await extractPdfText(buffer);
    } catch {
      text = '';
    }
  } else {
    text = decodeTextBuffer(buffer);
  }

  return stripControlChars(repairCommonMojibake(text)).trim();
}

export type { PautaNormalizeResult };

export async function normalizePautaFromFileText(
  text: string,
  options?: { forceAi?: boolean },
) {
  return normalizePautaText(text, options);
}

/** Síncrono — só heurística (testes/legado). */
export function buildPautaImportFromTextSync(text: string): {
  items: ElderMeetingAgendaItem[];
  openingPrayer: string;
  closingPrayer: string;
} {
  const parsed = parsePautaDocument(stripControlChars(repairCommonMojibake(text)).trim());
  const agenda = parsedPautaToAgendaItems(parsed);
  return {
    openingPrayer: parsed.openingPrayer,
    closingPrayer: parsed.closingPrayer,
    items: agenda.map((entry) => ({
      id: newAgendaItemId(),
      title: entry.title,
      notes: entry.notes,
    })),
  };
}
