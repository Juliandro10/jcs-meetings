import type { PDFParse } from 'pdf-parse';
import { formatJcsPageJumpHref, jcsPageAnchorId } from '../shared/jcs-page-jump';
import { findJcsReadRefSpans } from '../shared/jcs-read-ref-links';

export type PdfPageHotspot = {
  href: string;
  label: string;
  kind: 'bible' | 'song' | 'jump';
  left: number;
  top: number;
  width: number;
  height: number;
};

type PdfJsRef = { num: number; gen: number };

type PdfJsViewport = {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => [number, number];
};

type PdfJsAnnotation = {
  subtype?: string;
  dest?: unknown;
  url?: string;
  overlaidText?: string;
  contents?: string;
  rect?: number[];
};

type PdfJsPage = {
  getViewport: (opts: { scale: number }) => PdfJsViewport;
  getTextContent: (opts: { includeMarkedContent: boolean; disableNormalization: boolean }) => Promise<{
    items: Array<{
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
    }>;
  }>;
  getAnnotations?: (opts?: { intent?: string }) => Promise<PdfJsAnnotation[]>;
};

type PdfJsDoc = {
  numPages?: number;
  getPage: (n: number) => Promise<PdfJsPage>;
  getPageIndex: (ref: PdfJsRef) => Promise<number>;
  getDestination?: (name: string) => Promise<unknown>;
};

type Glyph = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  run?: number;
};

const ACUTE: Record<string, string> = {
  a: 'á',
  A: 'Á',
  e: 'é',
  E: 'É',
  i: 'í',
  I: 'Í',
  o: 'ó',
  O: 'Ó',
  u: 'ú',
  U: 'Ú',
  y: 'ý',
  Y: 'Ý',
};
const CIRC: Record<string, string> = {
  a: 'â',
  A: 'Â',
  e: 'ê',
  E: 'Ê',
  i: 'î',
  I: 'Î',
  o: 'ô',
  O: 'Ô',
  u: 'û',
  U: 'Û',
};
const TILDE: Record<string, string> = { a: 'ã', A: 'Ã', o: 'õ', O: 'Õ', n: 'ñ', N: 'Ñ' };
const GRAVE: Record<string, string> = {
  a: 'à',
  A: 'À',
  e: 'è',
  E: 'È',
  i: 'ì',
  I: 'Ì',
  o: 'ò',
  O: 'Ò',
  u: 'ù',
  U: 'Ù',
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return (value / total) * 100;
}

function isAccentToken(text: string) {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 2 && /^[´'`'^~¨¸˜ˆˇ']+$/.test(trimmed);
}

function accentKind(token: string): 'acute' | 'circ' | 'tilde' | 'grave' | 'cedilla' | null {
  const t = token.trim();
  if (/[,¸]/.test(t)) return 'cedilla';
  if (/[\^ˆ]/.test(t)) return 'circ';
  if (/[~˜]/.test(t)) return 'tilde';
  if (/[`̀]/.test(t)) return 'grave';
  if (/[´'']/.test(t)) return 'acute';
  return null;
}

function applyAccent(letter: string, kind: NonNullable<ReturnType<typeof accentKind>>, nextLetter?: string) {
  if (kind === 'cedilla' && /c/i.test(letter)) return letter === 'C' ? 'Ç' : 'ç';
  if (kind === 'circ') return CIRC[letter] ?? letter;
  if (kind === 'tilde') return TILDE[letter] ?? letter;
  if (kind === 'grave') return GRAVE[letter] ?? letter;
  if (kind === 'acute') {
    if (/a/i.test(letter) && nextLetter && /o/i.test(nextLetter)) {
      return letter === 'A' ? 'Ã' : 'ã';
    }
    return ACUTE[letter] ?? letter;
  }
  return letter;
}

/** Recompõe acentos que o PDF solta como `´`, `^`, `,`. */
export function repairPdfGlyphText(text: string) {
  let s = text.replace(/\u00a0/g, ' ');
  s = s.replace(/[´'`']\s*ões/gi, 'ões');
  s = s.replace(/[´'`']\s*ães/gi, 'ães');
  s = s.replace(/[´'`']\s*ão/gi, 'ão');
  s = s.replace(/[´'`']\s*ãe/gi, 'ãe');
  s = s.replace(/([Nn])[Hh][´'`'](?=\s|$|[.,;:!?)\]])/g, (_, n: string) => `${n}${n === 'N' ? 'HÃ' : 'hã'}`);
  s = s.replace(/([Nn])[´'`'](?=\s|$|[.,;:!?)\]])/g, (_, n: string) => (n === 'N' ? 'NÃ' : 'nã'));
  s = s.replace(/([A-Za-z])[´'`'](?=\s|$|[.,;:!?)\]])/g, (_, letter: string) => {
    const upper = letter === letter.toUpperCase();
    if (/n/i.test(letter)) return upper ? 'NÃ' : 'nã';
    if (/[aeiou]/i.test(letter)) return ACUTE[letter] ?? letter;
    return `${letter}${upper ? 'Á' : 'á'}`;
  });
  s = s.replace(/([Cc])\s*[,¸]\s*/g, (_, c: string) => (c === 'C' ? 'Ç' : 'ç'));
  s = s.replace(/[,¸]\s*([Cc])/g, (_, c: string) => (c === 'C' ? 'Ç' : 'ç'));
  s = s.replace(/([AaEeIiOoUu])\s*[\^ˆ]\s*/g, (_, l: string) => CIRC[l] ?? l);
  s = s.replace(/[\^ˆ]\s*([AaEeIiOoUu])/g, (_, l: string) => CIRC[l] ?? l);
  s = s.replace(/([AaOoNn])\s*[~˜]\s*/g, (_, l: string) => TILDE[l] ?? l);
  s = s.replace(/[~˜]\s*([AaOoNn])/g, (_, l: string) => TILDE[l] ?? l);
  s = s.replace(/[´'`']\s*([AaEeIiOoUuYy])/g, (full, l: string, offset: number, src: string) => {
    const next = src.slice(offset + full.length).match(/^\s*([Oo])/);
    return applyAccent(l, 'acute', next?.[1]);
  });
  s = s.replace(/([AaEeIiOoUuYy])\s*[´'`'](?=\s|$|[.,;:!?)\]])/g, (_, l: string) => ACUTE[l] ?? l);
  s = s.replace(/(\p{L}{2,})\s+([áéíóúâêîôûãõçÁÉÍÓÚÂÊÔÃÕÇ]\p{Ll}+)/gu, '$1$2');
  s = s.replace(/(\p{Lu})\s+([áéíóúâêîôûãõç]\p{Ll}{2,})/gu, '$1$2');
  s = s.replace(/(\p{Ll})\s+([áéíóúâêôãõç])(?=\s|$|[.,;:!?)] )/gu, '$1$2');
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s;
}

function getLoadedPdfDoc(parser: PDFParse): PdfJsDoc | null {
  return (parser as unknown as { doc?: PdfJsDoc }).doc ?? null;
}

const viewportCache = new WeakMap<object, Map<number, PdfJsViewport>>();

async function viewportForPage(doc: PdfJsDoc, pageNumber: number) {
  const cache = viewportCache.get(doc) ?? new Map<number, PdfJsViewport>();
  if (!viewportCache.has(doc)) viewportCache.set(doc, cache);
  const existing = cache.get(pageNumber);
  if (existing) return existing;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  cache.set(pageNumber, viewport);
  return viewport;
}

function destName(dest: unknown[]): string {
  const kind = dest[1];
  if (kind && typeof kind === 'object' && 'name' in kind) {
    return String((kind as { name: unknown }).name);
  }
  return '';
}

function destUserY(dest: unknown[]): number | null {
  const name = destName(dest);
  if (name === 'XYZ') return typeof dest[3] === 'number' ? dest[3] : null;
  if (name === 'FitH' || name === 'FitBH') return typeof dest[2] === 'number' ? dest[2] : null;
  if (name === 'FitR') return typeof dest[5] === 'number' ? dest[5] : null;
  return null;
}

async function resolveNamedDest(doc: PdfJsDoc, dest: unknown, depth = 0): Promise<unknown[] | null> {
  if (depth > 4) return null;
  if (Array.isArray(dest)) return dest;
  const destTypes = new Set(['XYZ', 'Fit', 'FitH', 'FitV', 'FitR', 'FitB', 'FitBH', 'FitBV']);
  if (typeof dest === 'string') {
    if (destTypes.has(dest) || !doc.getDestination) return null;
    try {
      return resolveNamedDest(doc, await doc.getDestination(dest), depth + 1);
    } catch {
      return null;
    }
  }
  if (dest && typeof dest === 'object' && 'name' in dest) {
    const name = String((dest as { name: unknown }).name);
    if (destTypes.has(name)) return null;
    return resolveNamedDest(doc, name, depth + 1);
  }
  return null;
}

async function resolveDestPage(
  doc: PdfJsDoc,
  dest: unknown,
  pageCount: number,
): Promise<{ pageNumber: number; topPct: number } | null> {
  const explicit = await resolveNamedDest(doc, dest);
  if (!explicit?.length) return null;
  const ref = explicit[0] as PdfJsRef | undefined;
  if (!ref || typeof ref.num !== 'number') return null;
  const index = await doc.getPageIndex(ref);
  const pageNumber = index + 1;
  if (pageNumber < 1 || pageNumber > pageCount) return null;
  const pdfY = destUserY(explicit);
  if (pdfY == null) return { pageNumber, topPct: 0 };
  const viewport = await viewportForPage(doc, pageNumber);
  const [, vy] = viewport.convertToViewportPoint(0, pdfY);
  return { pageNumber, topPct: pct(vy, viewport.height) };
}

function pdfRectToBox(rect: number[], viewport: PdfJsViewport) {
  const [x1, y1, x2, y2] = rect;
  const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
  const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);
  const left = pct(Math.min(vx1, vx2), viewport.width);
  const right = pct(Math.max(vx1, vx2), viewport.width);
  const top = pct(Math.min(vy1, vy2), viewport.height);
  const bottom = pct(Math.max(vy1, vy2), viewport.height);
  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: Math.max(1.1, Math.min(100, right) - Math.max(0, left)),
    height: Math.max(0.9, Math.min(100, bottom) - Math.max(0, top)),
  };
}

async function collectJumpHotspots(
  doc: PdfJsDoc,
  pageNumber: number,
  pageCount: number,
): Promise<PdfPageHotspot[]> {
  const page = await doc.getPage(pageNumber);
  if (!page.getAnnotations) return [];
  const annots = await page.getAnnotations({ intent: 'display' });
  if (!Array.isArray(annots) || annots.length === 0) return [];
  const viewport = await viewportForPage(doc, pageNumber);
  const hotspots: PdfPageHotspot[] = [];

  for (const annot of annots) {
    if (String(annot.subtype || '') !== 'Link' || !annot.dest || annot.url) continue;
    if (!Array.isArray(annot.rect) || annot.rect.length < 4) continue;
    try {
      const dest = await resolveDestPage(doc, annot.dest, pageCount);
      if (!dest) continue;
      const box = pdfRectToBox(annot.rect, viewport);
      if (box.width > 92 || box.height > 18) continue;
      const rawLabel = annot.overlaidText || (typeof annot.contents === 'string' ? annot.contents : '');
      const label = String(rawLabel || `Página ${dest.pageNumber}`).trim();
      hotspots.push({
        href: formatJcsPageJumpHref(dest),
        label: label || `Página ${dest.pageNumber}`,
        kind: 'jump',
        ...box,
      });
    } catch (err) {
      console.error('[pdf-page-layout] dest', pageNumber, err);
    }
  }

  return hotspots;
}

function foldForMap(text: string) {
  const folded: string[] = [];
  const origIndex: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (/[´'`'^~¨¸˜ˆˇ']/.test(ch)) continue;
    const piece = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (!piece) continue;
    if (/\s/.test(piece)) {
      const prev = folded[folded.length - 1];
      let next = '';
      for (let j = i + 1; j < text.length; j += 1) {
        const nch = text[j]!;
        if (/[´'`'^~¨¸˜ˆˇ']/.test(nch)) continue;
        const nbase = nch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        if (!nbase || /\s/.test(nbase)) continue;
        next = nbase;
        break;
      }
      if (prev && /\p{L}/u.test(prev) && /\p{L}/u.test(next)) continue;
    }
    for (const unit of piece) {
      if (/\s/.test(unit)) continue;
      folded.push(unit);
      origIndex.push(i);
    }
  }
  return { folded: folded.join(''), origIndex };
}

function mapLabelOntoJoined(joined: string, label: string): { start: number; end: number } | null {
  const src = foldForMap(joined);
  const needle = foldForMap(label).folded;
  if (!needle) return null;
  const at = src.folded.indexOf(needle);
  if (at < 0) return null;
  const start = src.origIndex[at];
  const last = src.origIndex[at + needle.length - 1];
  if (start == null || last == null) return null;
  return { start, end: last + 1 };
}

/** Liga o intervalo achado no texto reparado às letras originais da página. */
function mapRepairedRangeToJoined(
  joined: string,
  repaired: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  if (start < 0 || end <= start) return null;
  if (joined === repaired && end <= joined.length) return { start, end };

  const repairedFold = foldForMap(repaired);
  const joinedFold = foldForMap(joined);
  let foldStart = -1;
  let foldEnd = -1;
  for (let i = 0; i < repairedFold.origIndex.length; i += 1) {
    const orig = repairedFold.origIndex[i]!;
    if (orig >= start && orig < end) {
      if (foldStart < 0) foldStart = i;
      foldEnd = i;
    }
  }
  if (foldStart < 0 || foldEnd < foldStart) return null;

  if (joinedFold.folded === repairedFold.folded) {
    const mappedStart = joinedFold.origIndex[foldStart];
    const mappedEnd = joinedFold.origIndex[foldEnd];
    if (mappedStart == null || mappedEnd == null) return null;
    return { start: mappedStart, end: mappedEnd + 1 };
  }

  const needle = repairedFold.folded.slice(foldStart, foldEnd + 1);
  if (!needle) return null;

  let occurrence = 0;
  let from = 0;
  while (from < foldStart) {
    const at = repairedFold.folded.indexOf(needle, from);
    if (at < 0 || at > foldStart) break;
    if (at === foldStart) break;
    occurrence += 1;
    from = at + 1;
  }

  let seen = 0;
  let searchFrom = 0;
  let at = -1;
  while (seen <= occurrence) {
    at = joinedFold.folded.indexOf(needle, searchFrom);
    if (at < 0) return null;
    if (seen === occurrence) break;
    seen += 1;
    searchFrom = at + 1;
  }

  const mappedStart = joinedFold.origIndex[at];
  const mappedEnd = joinedFold.origIndex[at + needle.length - 1];
  if (mappedStart == null || mappedEnd == null) return null;
  return { start: mappedStart, end: mappedEnd + 1 };
}

function rangeOccupied(occupied: boolean[], start: number, end: number) {
  for (let i = start; i < end; i += 1) {
    if (occupied[i]) return true;
  }
  return false;
}

function markRange(occupied: boolean[], start: number, end: number) {
  for (let i = start; i < end; i += 1) occupied[i] = true;
}

function boxFromGlyphs(glyphs: Glyph[]) {
  let left = 100;
  let top = 100;
  let right = 0;
  let bottom = 0;
  for (const glyph of glyphs) {
    left = Math.min(left, glyph.left);
    top = Math.min(top, glyph.top);
    right = Math.max(right, glyph.right);
    bottom = Math.max(bottom, glyph.bottom);
  }
  const padX = 0.35;
  const padY = 0.25;
  left = Math.max(0, left - padX);
  top = Math.max(0, top - padY);
  right = Math.min(100, right + padX);
  bottom = Math.min(100, bottom + padY);
  return {
    left,
    top,
    width: Math.max(2.4, right - left),
    height: Math.max(1.35, bottom - top),
  };
}

function joinPage(lines: Glyph[][]) {
  let text = '';
  const boxes: Array<Glyph | null> = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) {
      text += ' ';
      boxes.push(null);
    }
    const part = joinLine(lines[i]!);
    text += part.text;
    boxes.push(...part.boxes);
  }
  return { text, boxes };
}

function glyphsInRange(boxes: Array<Glyph | null>, start: number, end: number) {
  const seen = new Set<Glyph>();
  const out: Glyph[] = [];
  for (let i = start; i < end; i += 1) {
    const glyph = boxes[i];
    if (!glyph || seen.has(glyph)) continue;
    seen.add(glyph);
    out.push(glyph);
  }
  return out;
}

function splitGlyphsByLine(glyphs: Glyph[]) {
  const groups = new Map<string, Glyph[]>();
  for (const glyph of glyphs) {
    const key = String(Math.round(glyph.top * 5) / 5);
    const list = groups.get(key) ?? [];
    list.push(glyph);
    groups.set(key, list);
  }
  return [...groups.values()];
}

function clusterLines(glyphs: Glyph[]) {
  if (glyphs.length === 0) return [] as Glyph[][];
  const heights = glyphs.map((g) => g.bottom - g.top).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 1.2;
  const sorted = [...glyphs].sort((a, b) => a.top + a.bottom - (b.top + b.bottom) || a.left - b.left);
  const lines: Glyph[][] = [];
  for (const glyph of sorted) {
    const cy = (glyph.top + glyph.bottom) / 2;
    const line = lines.find((group) => {
      const gcy = group.reduce((sum, item) => sum + (item.top + item.bottom) / 2, 0) / group.length;
      const overlap =
        Math.min(...group.map((item) => item.bottom), glyph.bottom) -
        Math.max(...group.map((item) => item.top), glyph.top);
      return Math.abs(cy - gcy) <= medianH * 0.7 || overlap > medianH * 0.2;
    });
    if (line) line.push(glyph);
    else lines.push([glyph]);
  }
  for (const line of lines) line.sort((a, b) => a.left - b.left);
  lines.sort((a, b) => a[0]!.top - b[0]!.top);
  return lines;
}

function attachAccents(glyphs: Glyph[]) {
  const accents = glyphs.filter((g) => isAccentToken(g.text));
  const letters = glyphs.filter((g) => !isAccentToken(g.text));
  if (accents.length === 0) return glyphs;

  const used = new Set<Glyph>();
  for (const accent of accents) {
    const kind = accentKind(accent.text);
    if (!kind) continue;
    const ax = (accent.left + accent.right) / 2;
    const ay = (accent.top + accent.bottom) / 2;
    const scored = letters
      .map((letter) => {
        const lx = (letter.left + letter.right) / 2;
        const ly = (letter.top + letter.bottom) / 2;
        const contains = ax >= letter.left - 0.8 && ax <= letter.right + 0.8;
        const dist = Math.abs(lx - ax) + Math.abs(ly - ay) * 0.35;
        return { letter, contains, dist };
      })
      .sort((a, b) => Number(b.contains) - Number(a.contains) || a.dist - b.dist);
    const vowels = scored.filter((item) => /^[aeiouáéíóúâêôãõ]/i.test(item.letter.text[0] ?? ''));
    const target =
      vowels[0] && (!scored[0] || vowels[0].dist <= scored[0].dist + 1.5) ? vowels[0].letter : scored[0]?.letter;
    if (!target) continue;
    const idx = letters.indexOf(target);
    const next = letters[idx + 1];
    const firstChar = target.text[0] ?? '';
    if (kind === 'cedilla') {
      target.text = applyAccent(firstChar, kind) + target.text.slice(1);
    } else if (/^[aeiouAEIOU]/.test(target.text)) {
      target.text = applyAccent(firstChar, kind, next?.text[0]) + target.text.slice(1);
    } else if (kind === 'acute' && /[Nn]$/.test(target.text)) {
      target.text += target.text === target.text.toUpperCase() ? 'Ã' : 'ã';
    } else if (kind === 'acute') {
      target.text += target.text === target.text.toUpperCase() ? 'Á' : 'á';
    }
    used.add(accent);
  }
  return glyphs.filter((g) => !used.has(g) && g.text.length > 0);
}

function explodeGlyph(glyph: Glyph): Glyph[] {
  const chars = [...glyph.text];
  if (chars.length <= 1) return [glyph];
  return splitItemToGlyphs(glyph.text, glyph.left, glyph.right, glyph.top, glyph.bottom).map((part) => ({
    ...part,
    run: glyph.run,
  }));
}

function joinLine(glyphs: Glyph[]) {
  const pieces: Glyph[] = [];
  for (const glyph of glyphs) pieces.push(...explodeGlyph(glyph));

  const boxes: Array<Glyph | null> = [];
  let text = '';
  for (let index = 0; index < pieces.length; index += 1) {
    const glyph = pieces[index]!;
    if (index > 0) {
      const prev = pieces[index - 1]!;
      const sameRun = glyph.run != null && glyph.run === prev.run;
      if (!sameRun) {
        const gap = glyph.left - prev.right;
        const h = Math.max(glyph.bottom - glyph.top, 1);
        if (gap > Math.max(0.45, h * 0.22)) {
          text += ' ';
          boxes.push(null);
        }
      }
    }
    text += glyph.text;
    for (let i = 0; i < glyph.text.length; i += 1) boxes.push(glyph);
  }
  return { text, boxes };
}

function splitItemToGlyphs(str: string, left: number, right: number, top: number, bottom: number): Glyph[] {
  const chars = [...str];
  if (chars.length === 0) return [];
  const span = Math.max(right - left, 0.15);
  if (chars.length === 1) {
    return [
      {
        text: chars[0]!,
        left,
        top,
        right: left + span,
        bottom,
      },
    ];
  }
  const unit = span / chars.length;
  return chars.map((ch, index) => ({
    text: ch,
    left: left + index * unit,
    top,
    right: left + (index + 1) * unit,
    bottom,
  }));
}

async function glyphsForPage(page: PdfJsPage): Promise<Glyph[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
  const glyphs: Glyph[] = [];
  let run = 0;
  for (const item of content.items) {
    if (!item || typeof item.str !== 'string' || !item.str) continue;
    const tm = item.transform;
    if (!tm || tm.length < 6) continue;
    const width = Number(item.width) || 0;
    const height = Number(item.height) || Math.abs(tm[3]) || 8;
    const [x0, y0] = viewport.convertToViewportPoint(tm[4], tm[5]);
    const [x1, y1] = viewport.convertToViewportPoint(tm[4] + width, tm[5] + height);
    const left = pct(Math.min(x0, x1), viewport.width);
    const right = pct(Math.max(x0, x1), viewport.width);
    const top = pct(Math.min(y0, y1), viewport.height);
    const bottom = pct(Math.max(y0, y1), viewport.height);
    if (right - left <= 0 && item.str.trim() === '') continue;
    run += 1;
    const charCount = [...item.str].length;
    const boxRight = right > left + 0.04 ? right : left + Math.max(0.6, charCount * 0.52);
    const boxBottom = bottom > top ? bottom : top + 1.1;
    for (const part of splitItemToGlyphs(item.str, left, boxRight, top, boxBottom)) {
      glyphs.push({ ...part, run });
    }
  }
  return glyphs;
}

export function layoutPageHotspots(rawGlyphs: Glyph[]): PdfPageHotspot[] {
  const glyphs = attachAccents(rawGlyphs);
  const lines = clusterLines(glyphs);
  const joined = joinPage(lines);
  const repaired = repairPdfGlyphText(joined.text);
  const occupied = Array.from({ length: joined.text.length }, () => false);
  const hotspots: PdfPageHotspot[] = [];

  const pushMapped = (
    start: number,
    end: number,
    href: string,
    label: string,
    kind: 'bible' | 'song' | 'jump',
  ) => {
    if (start < 0 || end <= start || end > joined.text.length) return;
    if (rangeOccupied(occupied, start, end)) return;
    const spanGlyphs = glyphsInRange(joined.boxes, start, end);
    if (spanGlyphs.length === 0) return;
    markRange(occupied, start, end);
    for (const group of splitGlyphsByLine(spanGlyphs)) {
      const box = boxFromGlyphs(group);
      if (box.width > 72 || box.height > 14) continue;
      hotspots.push({ href, label, kind, ...box });
    }
  };

  for (const span of findJcsReadRefSpans(repaired)) {
    const mapped =
      mapRepairedRangeToJoined(joined.text, repaired, span.start, span.end) ??
      mapLabelOntoJoined(joined.text, span.label);
    if (!mapped) continue;
    pushMapped(mapped.start, mapped.end, span.href, span.label, span.kind);
  }

  for (const span of findJcsReadRefSpans(joined.text)) {
    pushMapped(span.start, span.end, span.href, span.label, span.kind);
  }

  hotspots.sort((a, b) => b.width * b.height - a.width * a.height);
  return hotspots;
}

export async function collectPageHotspots(
  parser: PDFParse,
  pageNumber: number,
  pageCount: number,
): Promise<PdfPageHotspot[]> {
  const doc = getLoadedPdfDoc(parser);
  if (!doc) return [];

  try {
    const page = await doc.getPage(pageNumber);
    const jumps = await collectJumpHotspots(doc, pageNumber, pageCount);
    const refs = layoutPageHotspots(await glyphsForPage(page));
    return [...jumps, ...refs];
  } catch (err) {
    console.error('[pdf-page-layout] page', pageNumber, err);
    return [];
  }
}

function hotspotClass(kind: PdfPageHotspot['kind']) {
  if (kind === 'jump') return 'jcs-page-hotspot jcs-page-jump';
  if (kind === 'song') return 'jcs-page-hotspot jcs-song-ref';
  return 'jcs-page-hotspot jcs-bible-ref';
}

export function renderPdfPageHtml(src: string, alt: string, hotspots: PdfPageHotspot[], pageNumber: number) {
  const marks = hotspots
    .map((spot, index) => {
      const z = spot.kind === 'jump' ? index + 1 : index + 80;
      const style = `left:${spot.left.toFixed(2)}%;top:${spot.top.toFixed(2)}%;width:${spot.width.toFixed(2)}%;height:${spot.height.toFixed(2)}%;z-index:${z};`;
      return `<a class="${hotspotClass(spot.kind)}" href="#" contenteditable="false" tabindex="-1" data-href="${escapeHtml(spot.href)}" data-label="${escapeHtml(spot.label)}" style="${style}">\u00a0</a>`;
    })
    .join('');
  return `<figure class="jcs-imported-page" id="${escapeHtml(jcsPageAnchorId(pageNumber))}"><div class="jcs-imported-page-stack" contenteditable="false"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">${marks}</div></figure>`;
}
