import { extractCbsStudyFromHtml } from './lfb-reader';
import {
  expandHighlightRange,
  expandHighlightToQuestion,
  expandToCompleteUnit,
  isCompleteHighlightUnit,
} from '../shared/highlight-expand';
import { normalizePlainText } from '../shared/text-normalize';

export type MeetingPartKind =
  | 'treasures'
  | 'ministry'
  | 'life'
  | 'joias'
  | 'reading'
  | 'local'
  | 'cbs'
  | 'other';

export type MeetingPart = {
  blockId: string;
  text: string;
  title: string;
  kind: MeetingPartKind;
  fieldId?: string;
  noteAnchorText: string;
};

export type DocumentField = {
  fieldId: string;
  afterBlockId?: string;
  questionText?: string;
};

export type DocumentStructure = {
  blocks: Array<{ blockId: string; text: string }>;
  parts: MeetingPart[];
  fields: DocumentField[];
  bibleReadingHref?: string;
  joiasFieldId?: string;
  treasuresFieldId?: string;
  cbsStudy?: {
    blockId: string;
    href: string;
    linkLabel: string;
    mepsDocumentIds: number[];
  };
};

function stripHtml(value: string) {
  return normalizePlainText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' '),
  );
}

function findTextIndex(content: string, needle: string) {
  const direct = content.indexOf(needle);
  if (direct >= 0) return { idx: direct, matchLen: needle.length };

  const lowerContent = content.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const caseInsensitive = lowerContent.indexOf(lowerNeedle);
  if (caseInsensitive >= 0) return { idx: caseInsensitive, matchLen: needle.length };

  for (let len = Math.min(needle.length, 72); len >= 4; len -= 1) {
    const prefix = needle.slice(0, len);
    let idx = content.indexOf(prefix);
    if (idx >= 0) return { idx, matchLen: len };
    idx = lowerContent.indexOf(prefix.toLowerCase());
    if (idx >= 0) return { idx, matchLen: len };
  }

  return null;
}

/** Grifo amarelo — só o título numerado (ex.: "4. Iniciando conversas"), sem "(4 min)". */
export function resolveNumberedTitleHighlightOnly(
  blockText: string,
): { text: string; startOffset: number; endOffset: number } | null {
  const content = normalizePlainText(blockText);
  if (!content) return null;

  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean) ?? content;
  const numbered = firstLine.match(/^(\d+\.\s.+?)(?=\s*\(\d+\s*min\)|$)/i);
  if (!numbered) return null;

  const titleOnly = numbered[1]!.trim();
  if (titleOnly.length < 4 || isAllCapsSectionBanner(titleOnly)) return null;

  return resolveHighlightInBlock(content, titleOnly, { maxWords: 16, minWords: 2 });
}

export function resolvePartTitleHighlight(
  blockText: string,
  part: MeetingPart,
): { text: string; startOffset: number; endOffset: number } | null {
  const content = normalizePlainText(blockText);
  if (!content) return null;

  const needles: string[] = [];
  const minLine = part.text.match(/^\(\d+\s*min\)\s*[^.?\n]{2,100}/i);
  if (minLine) needles.push(normalizePlainText(minLine[0]));
  const numbered = part.text.match(/^\d+\.\s*[^.?\n]{2,100}/);
  if (numbered) needles.push(normalizePlainText(numbered[0]));
  // Título após "(15 min)" na mesma linha: "(15 min) Iniciar conversas"
  const minInline = part.text.match(/\(\d+\s*min\)\s*[A-Za-zÀ-ú][^.?\n]{2,80}/i);
  if (minInline) needles.push(normalizePlainText(minInline[0]));
  needles.push(
    normalizePlainText(part.noteAnchorText),
    normalizePlainText(part.title),
    normalizePlainText(part.title.replace(/^\d+\.\s*/, '')),
  );

  const seen = new Set<string>();
  for (const needle of needles) {
    if (!needle || needle.length < 3 || seen.has(needle)) continue;
    seen.add(needle);
    const located = resolveHighlightInBlock(content, needle, { maxWords: 24, minWords: 2 });
    if (located) return located;
  }

  const fallback = content.match(/^(\(\d+\s*min\)[^.?\n]{2,90}|\d+\.\s[^.?\n]{2,90})/i);
  if (fallback) {
    return resolveHighlightInBlock(content, fallback[1]!, { maxWords: 24, minWords: 2 });
  }

  return null;
}

const MEETING_SECTION_KEYWORDS = [
  'TESOUROS DA PALAVRA',
  'JOIAS ESPIRITUAIS',
  'LEITURA DA BÍBLIA',
  'LEITURA DA BIBLIA',
  'FAÇA SEU MELHOR NO MINISTÉRIO',
  'FAÇA SEU MELHOR NO MINISTERIO',
  'NOSSA VIDA CRISTÃ',
  'NOSSA VIDA CRISTA',
] as const;

function sectionTitleMatches(text: string) {
  const upper = text.toUpperCase();
  return MEETING_SECTION_KEYWORDS.some((keyword) => upper.includes(keyword));
}

function isSectionHeader(text: string) {
  const trimmed = text.trim();
  if (trimmed.length > 90 || trimmed.length < 8) return false;

  const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (numbered) return sectionTitleMatches(numbered[2]!);

  // Cabeçalho sem número: "FAÇA SEU MELHOR NO MINISTÉRIO"
  if (trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÀÊÔÃÕÇ]/u.test(trimmed)) {
    return sectionTitleMatches(trimmed);
  }

  return false;
}

function sectionFromHeader(text: string) {
  return text.trim().replace(/^\d+\.\s+/, '');
}

export function isMeetingSectionHeader(text: string) {
  return isSectionHeader(text);
}

/** Banner de seção em MAIÚSCULAS (TESOUROS, FAÇA SEU MELHOR...) — não grifar. */
export function isAllCapsSectionBanner(text: string) {
  const trimmed = text.trim();
  if (trimmed.length > 90 || trimmed.length < 8) return false;

  const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
  const title = (numbered ? numbered[1]! : trimmed).trim();
  if (title !== title.toUpperCase()) return false;
  return sectionTitleMatches(title);
}

export function resolveSectionHeaderHighlight(
  blockText: string,
): { text: string; startOffset: number; endOffset: number } | null {
  const content = normalizePlainText(blockText);
  if (!content || !isSectionHeader(content)) return null;
  const header = content.length <= 90 ? content : content.slice(0, 90).trim();
  return resolveHighlightInBlock(content, header, { maxWords: 14, minWords: 2 });
}

function detectKind(text: string, section: string): MeetingPartKind {
  const lower = text.toLowerCase();
  const sectionLower = section.toLowerCase();
  if (/tente o seguinte|faça o desafio/i.test(lower)) return 'other';
  if (lower.includes('joias espirituais') && lower.includes('?')) return 'joias';
  if (lower.includes('joias espirituais')) return 'joias';
  if (sectionLower.includes('minist')) return 'ministry';
  if (sectionLower.includes('vida crist')) return 'life';
  if (sectionLower.includes('tesouro')) return 'treasures';
  if (sectionLower.includes('leitura da b') && /^\(\d+\s*min\)/i.test(text)) return 'reading';
  if (/^\(\d+\s*min\)/i.test(text) && sectionLower.includes('minist')) return 'ministry';
  if (/^\(\d+\s*min\)/i.test(text) && sectionLower.includes('vida crist')) return 'life';
  if (lower.includes('leitura da bíblia') && /^\(\d+\s*min\)/i.test(text)) return 'reading';
  if (lower.includes('necessidades locais')) return 'local';
  if (lower.includes('estudo bíblico de congregação') || lower.includes('estudo biblico')) return 'cbs';
  if (/ — /.test(text) && /\b[A-Za-zÁ-ú]{2,4}\.\s*\d/.test(text) && !/^\d+\.\s/.test(text.trim())) {
    return 'other';
  }
  return 'other';
}

function partTitle(text: string, lastNumberedTitle?: string) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const numbered = trimmed.match(/^(\d+\.\s.+)/);
  if (numbered) return numbered[1].trim();

  if (/^\(\d+\s*min\)/i.test(trimmed)) {
    if (lastNumberedTitle) return lastNumberedTitle;
    return trimmed.length <= 180 ? trimmed : `${trimmed.slice(0, 177).trim()}…`;
  }

  if ((lower.includes('joias espirituais') && trimmed.includes('?')) || (/ — /.test(trimmed) && /\b[A-Za-zÁ-ú]{2,4}\.\s*\d/.test(trimmed))) {
    return trimmed;
  }

  if (lower.includes('necessidades locais') || lower.includes('estudo bíblico de congregação') || lower.includes('estudo biblico')) {
    return trimmed;
  }

  if (trimmed.length <= 180) return trimmed;
  return `${trimmed.slice(0, 177).trim()}…`;
}

function noteAnchorForPart(text: string) {
  const numbered = text.match(/^(\d+\.\s[^\n?]{3,120})/);
  if (numbered) return numbered[1].trim();
  if (text.length <= 120) return text.trim();
  return text.slice(0, 120).trim();
}

function isMeetingPart(text: string) {
  const lower = text.toLowerCase();
  return (
    /^\d+\.\s/.test(text) ||
    /^\(\d+\s*min\)/i.test(text) ||
    (lower.includes('joias espirituais') && lower.includes('?')) ||
    lower.includes('necessidades locais') ||
    lower.includes('estudo bíblico de congregação') ||
    (/ — /.test(text) && /\b[A-Za-zÁ-ú]{2,4}\.\s*\d/.test(text))
  );
}

function extractBibleReadingHref(html: string) {
  const links = [...html.matchAll(/href="(jwpub:\/\/b\/[^"]+)"/gi)].map((m) => m[1]);
  if (links.length === 0) return undefined;

  let best = links[0];
  let bestSpan = 0;
  for (const href of links) {
    const range = href.match(/(\d+):(\d+):(\d+)-(\d+):(\d+):(\d+)/);
    if (!range) continue;
    const span =
      Number(range[4]) * 1_000_000 +
      Number(range[5]) * 1000 +
      Number(range[6]) -
      (Number(range[1]) * 1_000_000 + Number(range[2]) * 1000 + Number(range[3]));
    if (span > bestSpan) {
      bestSpan = span;
      best = href;
    }
  }
  return best;
}

export function extractDocumentStructure(html: string): DocumentStructure {
  const blocks: Array<{ blockId: string; text: string }> = [];
  const blockRe = /<(p|li|h[1-6])[^>]*\bdata-pid="(\d+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    const text = stripHtml(match[3]);
    if (text.length >= 4) blocks.push({ blockId: match[2], text });
  }

  if (blocks.length === 0) {
    const fallback = /<p[^>]*\bid="(p\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = fallback.exec(html)) !== null) {
      const text = stripHtml(match[2]);
      if (text.length >= 4) blocks.push({ blockId: match[1].replace(/^p/, ''), text });
    }
  }

  const fields: DocumentField[] = [];
  const fieldRe = /<textarea[^>]*\b(?:id="([^"]+)"|data-pid="([^"]+)")[^>]*>/gi;
  let lastBlockBeforeField = blocks[0]?.blockId;
  let cursor = 0;
  while ((match = fieldRe.exec(html)) !== null) {
    const fieldId = match[1] || match[2];
    const pos = match.index ?? 0;
    while (cursor < blocks.length) {
      const blockPos = html.indexOf(`data-pid="${blocks[cursor].blockId}"`);
      if (blockPos >= 0 && blockPos < pos) {
        lastBlockBeforeField = blocks[cursor].blockId;
        cursor++;
      } else break;
    }
    if (fieldId) {
      const afterBlock = blocks.find((block) => block.blockId === lastBlockBeforeField);
      fields.push({
        fieldId,
        afterBlockId: lastBlockBeforeField,
        questionText: afterBlock?.text,
      });
    }
  }

  const fieldByBlock = new Map(fields.map((field) => [field.afterBlockId ?? '', field.fieldId]));

  let section = '';
  let lastNumberedPartTitle = '';
  const parts: MeetingPart[] = [];
  for (const block of blocks) {
    if (isSectionHeader(block.text)) {
      section = sectionFromHeader(block.text);
      continue;
    }

    if (!isMeetingPart(block.text)) continue;
    if (/^\d+\.\s/.test(block.text) && isSectionHeader(block.text)) continue;

    // "(10 min)" na linha seguinte ao título numerado — mesma parte, não criar entrada duplicada.
    if (/^\(\d+\s*min\)/i.test(block.text.trim()) && lastNumberedPartTitle && parts.length > 0) {
      const last = parts[parts.length - 1];
      if (last.title === lastNumberedPartTitle) {
        last.text = `${last.text} ${block.text}`.trim();
        continue;
      }
    }

    const kind = detectKind(block.text, section);
    if (/^\d+\.\s/.test(block.text) && kind === 'joias' && !block.text.includes('?')) continue;

    let title = partTitle(block.text, lastNumberedPartTitle);
    if (kind === 'reading') {
      title = '3. Leitura da Bíblia';
    } else if (kind === 'joias') {
      title = '2. Joias espirituais';
    }
    if (/^\d+\.\s/.test(block.text)) {
      lastNumberedPartTitle = title;
    }

    parts.push({
      blockId: block.blockId,
      text: block.text,
      title,
      kind,
      fieldId: fieldByBlock.get(block.blockId),
      noteAnchorText: noteAnchorForPart(block.text),
    });
  }

  const joiasFieldId =
    fields.find((field) => {
      const block = blocks.find((b) => b.blockId === field.afterBlockId);
      return block?.text.toLowerCase().includes('joias espirituais');
    })?.fieldId ??
    parts.find((part) => part.kind === 'joias' && part.fieldId)?.fieldId;

  const treasuresFieldId =
    fields.find((field) => {
      const block = blocks.find((b) => b.blockId === field.afterBlockId);
      return block?.text.includes(' — ') && /\b[A-Za-zÁ-ú]{2,4}\.\s*\d/.test(block.text);
    })?.fieldId ??
    parts.find((part) => part.kind === 'treasures' && part.fieldId)?.fieldId;

  return {
    blocks,
    parts,
    fields,
    bibleReadingHref: extractBibleReadingHref(html),
    joiasFieldId,
    treasuresFieldId,
    cbsStudy: extractCbsStudyFromHtml(html),
  };
}

export function formatJoiasField(options: string[]) {
  return options
    .filter(Boolean)
    .slice(0, 3)
    .map((opt, index) => `${index + 1}) ${opt.trim()}`)
    .join('\n\n');
}

/** Blocos de conteúdo pertencentes a cada parte (do título até a próxima parte). */
export function getPartBlockRanges(
  parts: MeetingPart[],
  blocks: Array<{ blockId: string; text: string }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let index = 0; index < parts.length; index += 1) {
    const startIdx = blocks.findIndex((block) => block.blockId === parts[index].blockId);
    const endIdx =
      index + 1 < parts.length
        ? blocks.findIndex((block) => block.blockId === parts[index + 1].blockId)
        : blocks.length;
    if (startIdx >= 0) {
      map.set(
        parts[index].blockId,
        blocks.slice(startIdx, endIdx >= 0 ? endIdx : blocks.length).map((block) => block.blockId),
      );
    }
  }
  return map;
}

export function resolveHighlightInBlock(
  blockText: string,
  aiText: string,
  options?: {
    fullSentence?: boolean;
    completeUnit?: boolean;
    maxWords?: number;
    minWords?: number;
    hintStart?: number;
  },
): { text: string; startOffset: number; endOffset: number } | null {
  const content = normalizePlainText(blockText);
  const needle = normalizePlainText(aiText);
  if (!needle || !content) return null;

  const pickNearest = (indices: number[]) => {
    if (indices.length === 0) return -1;
    if (options?.hintStart === undefined) return indices[0]!;
    return indices.reduce((best, idx) =>
      Math.abs(idx - options.hintStart!) < Math.abs(best - options.hintStart!) ? idx : best,
    );
  };

  const findAll = (haystack: string, search: string) => {
    const hits: number[] = [];
    let from = 0;
    while (from <= haystack.length) {
      const idx = haystack.indexOf(search, from);
      if (idx === -1) break;
      hits.push(idx);
      from = idx + 1;
    }
    if (hits.length === 0) {
      const lowerHay = haystack.toLowerCase();
      const lowerSearch = search.toLowerCase();
      from = 0;
      while (from <= lowerHay.length) {
        const idx = lowerHay.indexOf(lowerSearch, from);
        if (idx === -1) break;
        hits.push(idx);
        from = idx + 1;
      }
    }
    return pickNearest(hits);
  };

  let idx = findAll(content, needle);
  let matchLen = needle.length;

  if (idx < 0) {
    const found = findTextIndex(content, needle);
    if (!found) return null;
    idx = found.idx;
    matchLen = found.matchLen;
  }

  let start = idx;
  let end = idx + matchLen;

  if (end < content.length && /\w/u.test(content[end - 1] ?? '') && /\w/u.test(content[end] ?? '')) {
    while (end < content.length && /\S/u.test(content[end] ?? '')) end += 1;
  }
  if (start > 0 && /\w/u.test(content[start] ?? '') && /\w/u.test(content[start - 1] ?? '')) {
    while (start > 0 && /\S/u.test(content[start - 1] ?? '')) start -= 1;
  }

  if (options?.completeUnit) {
    const expanded = expandToCompleteUnit(content, start, end);
    start = expanded.start;
    end = expanded.end;
  } else if (options?.fullSentence) {
    const expanded = expandHighlightRange(content, start, end);
    start = expanded.start;
    end = expanded.end;
  } else if (needle.includes('?') || (content.includes('?') && content.indexOf('?', start) >= start)) {
    const expanded = expandHighlightToQuestion(content, start, end);
    start = expanded.start;
    end = expanded.end;
  }

  let text = content.slice(start, end).trim();
  let words = text.split(/\s+/).filter(Boolean);
  const maxWords = options?.maxWords ?? (options?.fullSentence || options?.completeUnit ? 60 : 18);
  const endsComplete = isCompleteHighlightUnit(text);
  if (words.length > maxWords && !options?.fullSentence && !options?.completeUnit && !endsComplete) {
    text = words.slice(0, maxWords).join(' ');
    words = text.split(/\s+/).filter(Boolean);
    end = start + text.length;
  }

  if (words.length < (options?.minWords ?? 3)) return null;
  return { text, startOffset: start, endOffset: end };
}

/** Resolve grifo no corpo da apostila — sempre frase/pergunta completa. */
export function resolveCompleteHighlightInBlock(
  blockText: string,
  aiText: string,
  hintStart?: number,
): { text: string; startOffset: number; endOffset: number } | null {
  return resolveHighlightInBlock(blockText, aiText, {
    completeUnit: true,
    minWords: 3,
    hintStart,
  });
}

export function buildFieldPromptLines(
  structure: DocumentStructure,
  options?: { excludeFieldIds?: string[] },
): string[] {
  const excluded = new Set(options?.excludeFieldIds ?? []);
  return structure.fields
    .filter((field) => !excluded.has(field.fieldId))
    .map((field) => {
      const question = (field.questionText ?? '').replace(/\s+/g, ' ').trim();
      const label = question.length > 160 ? `${question.slice(0, 157).trim()}…` : question;
      return `- ${field.fieldId}: "${label || 'campo editável'}"`;
    });
}

/** Título canônico da parte da reunião para notas (sem truncar perguntas nem usar só "(10 min)"). */
export function resolveNoteTitle(structure: DocumentStructure, blockId: string): string | undefined {
  const direct = structure.parts.find((part) => part.blockId === blockId);
  if (direct) return direct.title;

  const blockIndex = structure.blocks.findIndex((block) => block.blockId === blockId);
  if (blockIndex < 0) return undefined;

  for (let index = blockIndex; index >= 0; index -= 1) {
    const part = structure.parts.find((item) => item.blockId === structure.blocks[index]?.blockId);
    if (part) return part.title;
  }

  return undefined;
}

export function findAnchorInBlock(blockText: string, anchorText: string) {
  const normalizedBlock = blockText.replace(/\s+/g, ' ').trim();
  const normalizedAnchor = anchorText.replace(/\s+/g, ' ').trim();
  if (!normalizedAnchor) return blockText.slice(0, Math.min(80, blockText.length));

  if (normalizedBlock.includes(normalizedAnchor)) return normalizedAnchor;

  const numbered = normalizedBlock.match(/^\d+\.\s[^\n?]{3,120}/);
  if (numbered && normalizedAnchor.includes(numbered[0].slice(0, 20))) return numbered[0].trim();

  const minPart = normalizedBlock.match(/^\(\d+\s*min\)[^.]{0,100}/i);
  if (minPart) return minPart[0].trim();

  if (normalizedBlock.length <= 120) return normalizedBlock;
  return normalizedBlock.slice(0, 120).trim();
}

export type WatchtowerQuestion = {
  questionBlockId: string;
  questionText: string;
  fieldId: string;
  answerBlockIds: string[];
  isReview: boolean;
};

export type WatchtowerStudyStructure = {
  blocks: Array<{ blockId: string; text: string }>;
  fields: DocumentField[];
  questions: WatchtowerQuestion[];
};

function pushParagraphRange(ids: string[], startRaw: string, endRaw?: string) {
  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let index = lo; index <= hi; index += 1) ids.push(String(index));
}

function parseParagraphRefs(text: string): string[] {
  const ids: string[] = [];
  const patterns = [
    /§§?\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi,
    /(?:par\.?|parágrafo|paragrafo|paragraph)\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi,
    /\(\s*§\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*\)/gi,
    /(?:§§?\s*)?(\d+)\s+e\s+(\d+)/gi,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      pushParagraphRange(ids, match[1]!, match[2]);
    }
  }

  if (/(?:§|par[áa]|veja)/i.test(text)) {
    const range = text.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
    if (range) pushParagraphRange(ids, range[1]!, range[2]);
  }

  return [...new Set(ids)];
}

function inferAnswerBlockIdsFromProximity(
  blocks: Array<{ blockId: string; text: string }>,
  questionBlockId: string,
): string[] {
  const qIndex = blocks.findIndex((block) => block.blockId === questionBlockId);
  if (qIndex <= 0) return [];

  const candidates: string[] = [];
  for (let index = qIndex - 1; index >= 0 && candidates.length < 4; index -= 1) {
    const block = blocks[index]!;
    const trimmed = block.text.trim();
    if (trimmed.includes('?') && trimmed.length < 220) break;
    if (trimmed.length < 32) continue;
    if (/^\(\d+\s*min\)/i.test(trimmed)) continue;
    candidates.unshift(block.blockId);
  }
  return candidates;
}

/** Converte referências da pergunta (§ 5-7, par. 12…) em blockIds reais do HTML. */
export function resolveWatchtowerAnswerBlockIds(
  blocks: Array<{ blockId: string; text: string }>,
  questionText: string,
  questionBlockId: string,
): string[] {
  const refs = parseParagraphRefs(questionText);
  let blockIds = refs
    .map((ref) => blockIdForParagraphNumber(blocks, ref))
    .filter((id): id is string => Boolean(id));

  if (blockIds.length === 0) {
    for (const match of questionText.matchAll(/\((\d{1,2})\)/g)) {
      const id = blockIdForParagraphNumber(blocks, match[1]!);
      if (id) blockIds.push(id);
    }
  }

  if (blockIds.length === 0) {
    blockIds = inferAnswerBlockIdsFromProximity(blocks, questionBlockId);
  }

  return [...new Set(blockIds)];
}

function isReviewSectionHeader(text: string) {
  const lower = text.toLowerCase();
  return lower.includes('revis') || lower.includes('perguntas para revis');
}

function findQuestionBlockForField(
  blocks: Array<{ blockId: string; text: string }>,
  afterBlockId: string | undefined,
) {
  const startIndex = afterBlockId
    ? Math.max(0, blocks.findIndex((block) => block.blockId === afterBlockId))
    : blocks.length - 1;

  for (let index = startIndex; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.text.includes('?')) return block;
    if (/^\d+\.\s/.test(block.text) && block.text.length < 220) return block;
  }

  const fallback = blocks.find((block) => block.blockId === afterBlockId);
  return fallback ?? blocks[startIndex] ?? blocks[0];
}

/** Estrutura do estudo de A Sentinela: perguntas, campos e parágrafos de resposta. */
export function extractWatchtowerStudyStructure(html: string): WatchtowerStudyStructure {
  const { blocks, fields } = extractDocumentStructure(html);
  const questions: WatchtowerQuestion[] = [];

  for (const field of fields) {
    const questionBlock = findQuestionBlockForField(blocks, field.afterBlockId);
    const anchorIndex = blocks.findIndex((block) => block.blockId === questionBlock.blockId);
    let inReview = false;
    if (anchorIndex >= 0) {
      for (let index = 0; index < anchorIndex; index += 1) {
        if (isReviewSectionHeader(blocks[index].text)) inReview = true;
      }
    }

    const answerBlockIds = resolveWatchtowerAnswerBlockIds(
      blocks,
      questionBlock.text,
      questionBlock.blockId,
    );

    questions.push({
      questionBlockId: questionBlock.blockId,
      questionText: questionBlock.text,
      fieldId: field.fieldId,
      answerBlockIds,
      isReview: inReview,
    });
  }

  return { blocks, fields, questions };
}

export function blockIdForParagraphNumber(
  blocks: Array<{ blockId: string; text: string }>,
  paragraphNumber: string,
) {
  const direct = blocks.find((block) => block.blockId === paragraphNumber);
  if (direct) return direct.blockId;

  const numbered = blocks.find((block) => {
    const match = block.text.match(/^(\d+)\.\s/);
    return match?.[1] === paragraphNumber;
  });
  return numbered?.blockId;
}
