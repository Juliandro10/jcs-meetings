import { extractCbsStudyFromHtml } from './lfb-reader';

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
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSectionHeader(text: string) {
  const trimmed = text.trim();
  if (trimmed.length > 90) return false;

  const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (!numbered) return false;

  const title = numbered[2].toUpperCase();
  return (
    title.includes('TESOUROS DA PALAVRA') ||
    title.includes('JOIAS ESPIRITUAIS') ||
    title.includes('LEITURA DA BÍBLIA') ||
    title.includes('LEITURA DA BIBLIA') ||
    title.includes('FAÇA SEU MELHOR NO MINISTÉRIO') ||
    title.includes('FAÇA SEU MELHOR NO MINISTERIO') ||
    title.includes('NOSSA VIDA CRISTÃ') ||
    title.includes('NOSSA VIDA CRISTA')
  );
}

function detectKind(text: string, section: string): MeetingPartKind {
  const lower = text.toLowerCase();
  if (lower.includes('joias espirituais') && lower.includes('?')) return 'joias';
  if (lower.includes('joias espirituais')) return 'joias';
  if (section.includes('minist')) return 'ministry';
  if (section.includes('vida crist')) return 'life';
  if (section.includes('tesouro')) return 'treasures';
  if (/^\(\d+\s*min\)/i.test(text) && section.includes('minist')) return 'ministry';
  if (/^\(\d+\s*min\)/i.test(text) && section.includes('vida crist')) return 'life';
  if (lower.includes('leitura da bíblia') && /^\(\d+\s*min\)/i.test(text)) return 'reading';
  if (lower.includes('necessidades locais')) return 'local';
  if (lower.includes('estudo bíblico de congregação') || lower.includes('estudo biblico')) return 'cbs';
  if (/ — /.test(text) && /\b[A-Za-zÁ-ú]{2,4}\.\s*\d/.test(text)) return 'treasures';
  return 'other';
}

function partTitle(text: string) {
  const numbered = text.match(/^(\d+\.\s[^.?]{3,120})/);
  if (numbered) return numbered[1].trim();
  if (/^\(\d+\s*min\)/i.test(text)) {
    const snippet = text.match(/^(\(\d+\s*min\)[^.]{0,100})/i);
    if (snippet) return snippet[1].trim();
  }
  if (text.length <= 90) return text;
  return text.slice(0, 90).trim() + '…';
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
    if (fieldId) fields.push({ fieldId, afterBlockId: lastBlockBeforeField });
  }

  const fieldByBlock = new Map(fields.map((field) => [field.afterBlockId ?? '', field.fieldId]));

  let section = '';
  const parts: MeetingPart[] = [];
  for (const block of blocks) {
    if (isSectionHeader(block.text)) {
      section = block.text.replace(/^\d+\.\s+/, '');
      continue;
    }

    if (!isMeetingPart(block.text)) continue;
    if (/^\d+\.\s/.test(block.text) && isSectionHeader(block.text)) continue;

    const kind = detectKind(block.text, section);
    if (/^\d+\.\s/.test(block.text) && kind === 'joias' && !block.text.includes('?')) continue;

    parts.push({
      blockId: block.blockId,
      text: block.text,
      title: partTitle(block.text),
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
