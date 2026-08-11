import path from 'node:path';
import { downloadJwpub, isPubCached } from './jw-download';
import { openJwpubBundle } from './jwpub-bundle';
import { getDocumentHtml } from './jwpub-reader';
import type { ResolveLinkResult } from './types';

export const LFB_STUDY_QUESTIONS = [
  'O que você aprendeu sobre Jeová nessa história?',
  'Que lições você aprendeu com essa história?',
  'Como colocar em prática as lições aprendidas no ministério, na família e na congregação?',
] as const;

export type LfbStory = {
  documentId: number;
  mepsDocumentId: number;
  storyNumber: number;
  title: string;
  html: string;
  plainText: string;
};

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMepsIdsFromHref(href: string) {
  return [...href.matchAll(/T:(\d+)/g)].map((match) => Number(match[1]));
}

export function parseStoryNumbersFromLabel(label?: string) {
  const match = label?.match(/hist[oó]rias?\s+(\d+)\s*[-–]\s*(\d+)/i);
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const numbers: number[] = [];
  for (let n = start; n <= end; n++) numbers.push(n);
  return numbers;
}

export const LFB_STUDY_FIELD_IDS = ['study-q1', 'study-q2', 'study-q3'] as const;

export function buildLfbStudyFieldsHtml() {
  const fields = LFB_STUDY_FIELD_IDS.map(
    (fieldId, index) => `
<label class="jcs-lfb-study-label" for="${fieldId}">${index + 1}. ${LFB_STUDY_QUESTIONS[index]}</label>
<textarea id="${fieldId}" class="jcs-editable-field jcs-lfb-study-field" rows="1" data-pid="${fieldId}"></textarea>`,
  ).join('\n');

  return `
<section class="jcs-lfb-study-prep">
  <h4 class="jcs-lfb-study-heading">Perguntas do estudo de congregação</h4>
  ${fields}
</section>`;
}

export function extractLfbBlocks(html: string) {
  const blocks: Array<{ blockId: string; text: string }> = [];
  const blockRe = /<(p|li|h[1-6])[^>]*\bdata-pid="(\d+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(html)) !== null) {
    const text = stripHtml(match[3]);
    if (text.length >= 8) blocks.push({ blockId: match[2], text });
  }

  return blocks;
}

export type LfbSabeQuestion = {
  blockId: string;
  questionIndex: number;
  text: string;
  noteId: string;
};

export type LfbStoryStructure = {
  blocks: Array<{ blockId: string; text: string }>;
  sabeResponderBlockId?: string;
  sabeResponderQuestions: LfbSabeQuestion[];
  bodyBlockIds: string[];
};

/** Separa várias perguntas no mesmo bloco (ex.: "Quem era X? Por que Y?"). */
export function splitSabeResponderQuestions(blockText: string): string[] {
  const text = blockText.replace(/^sabe responder\??\s*/i, '').trim();
  if (!text) return [];

  const matches = [...text.matchAll(/[^?]+\?/gu)].map((match) => match[0].trim());
  if (matches.length > 0) return matches.filter((question) => question.length >= 8);
  return text.includes('?') ? [text] : [];
}

export function buildLfbSabeNoteId(blockId: string, questionIndex: number) {
  return `sabe-${blockId}-${questionIndex}`;
}

function pushSabeQuestionsFromBlock(
  target: LfbSabeQuestion[],
  blockId: string,
  blockText: string,
) {
  const questions = splitSabeResponderQuestions(blockText);
  const texts = questions.length > 0 ? questions : blockText.includes('?') ? [blockText.trim()] : [];

  texts.forEach((text, questionIndex) => {
    target.push({
      blockId,
      questionIndex,
      text,
      noteId: buildLfbSabeNoteId(blockId, questionIndex),
    });
  });
}

/** Blocos úteis para grifos e contexto da IA (corpo da história + "Sabe responder?"). */
export function extractLfbStoryStructure(html: string): LfbStoryStructure {
  const blocks = extractLfbBlocks(html);
  let sabeResponderBlockId: string | undefined;
  let afterSabe = false;
  const sabeResponderQuestions: LfbSabeQuestion[] = [];

  for (const block of blocks) {
    if (/sabe responder/i.test(block.text)) {
      sabeResponderBlockId = block.blockId;
      afterSabe = true;
      pushSabeQuestionsFromBlock(sabeResponderQuestions, block.blockId, block.text);
      continue;
    }

    if (afterSabe) {
      if (block.text.includes('?') && block.text.length < 350) {
        pushSabeQuestionsFromBlock(sabeResponderQuestions, block.blockId, block.text);
        continue;
      }
      if (
        sabeResponderQuestions.length > 0 &&
        (/^[A-Za-zÁ-ú]{2,4}\.\s*\d/.test(block.text) || block.text.length < 20)
      ) {
        break;
      }
    }
  }

  const skipIds = new Set([
    ...sabeResponderQuestions.map((item) => item.blockId),
    ...(sabeResponderBlockId ? [sabeResponderBlockId] : []),
  ]);

  const bodyBlockIds = blocks
    .filter((block) => {
      if (skipIds.has(block.blockId)) return false;
      if (/^HISTÓRIA\s+\d+/i.test(block.text)) return false;
      if (block.text.length < 36) return false;
      if (/^Sabe responder/i.test(block.text)) return false;
      return true;
    })
    .map((block) => block.blockId);

  return { blocks, sabeResponderBlockId, sabeResponderQuestions, bodyBlockIds };
}

async function resolveLfbJwpubPath(cacheDir: string, lang = 'T') {
  const filePath = path.join(cacheDir, `lfb_${lang}_.jwpub`);
  if (await isPubCached(cacheDir, 'lfb', '', lang)) return filePath;
  return null;
}

export function isLfbStudyLink(href: string, linkLabel?: string) {
  const lower = `${href} ${linkLabel ?? ''}`.toLowerCase();
  return lower.includes('lfb') || /T:1102016\d+/.test(href);
}

export async function ensureLfbJwpub(cacheDir: string, lang = 'T') {
  const filePath = path.join(cacheDir, `lfb_${lang}_.jwpub`);
  if (await isPubCached(cacheDir, 'lfb', '', lang)) return filePath;

  const result = await downloadJwpub({ pub: 'lfb', issue: '', lang, cacheDir });
  if (!result.ok || !result.filePath) {
    throw new Error(result.error ?? 'Não foi possível baixar o livro lfb.');
  }
  return result.filePath;
}

async function lookupDocumentsByMepsIds(jwpubPath: string, mepsIds: number[]) {
  const bundle = await openJwpubBundle(jwpubPath);
  const rows: Array<{ documentId: number; mepsDocumentId: number; title: string }> = [];

  for (const mepsDocumentId of mepsIds) {
    const row = bundle.db.exec(
      `SELECT DocumentId, MepsDocumentId, Title FROM Document WHERE MepsDocumentId = ${mepsDocumentId} LIMIT 1`,
    )[0]?.values?.[0];
    if (row) {
      rows.push({
        documentId: Number(row[0]),
        mepsDocumentId: Number(row[1]),
        title: String(row[2]),
      });
    }
  }

  return rows;
}

async function lookupDocumentsByStoryNumbers(jwpubPath: string, storyNumbers: number[]) {
  const bundle = await openJwpubBundle(jwpubPath);
  const rows: Array<{ documentId: number; mepsDocumentId: number; title: string; storyNumber: number }> = [];

  for (const storyNumber of storyNumbers) {
    const docs = bundle.db.exec('SELECT DocumentId, MepsDocumentId, Title FROM Document ORDER BY DocumentId')[0]
      ?.values;
    if (!docs) continue;

    for (const [documentId, mepsDocumentId, title] of docs) {
      const html = await getDocumentHtml(jwpubPath, Number(documentId));
      if (new RegExp(`HISTÓRIA\\s+${storyNumber}\\b`, 'i').test(stripHtml(html))) {
        rows.push({
          documentId: Number(documentId),
          mepsDocumentId: Number(mepsDocumentId),
          title: String(title),
          storyNumber,
        });
        break;
      }
    }
  }

  return rows;
}

function storyNumberFromHtml(html: string, fallback: number) {
  const match = stripHtml(html).match(/HISTÓRIA\s+(\d+)/i);
  return match ? Number(match[1]) : fallback;
}

export async function loadLfbStoriesFromCache(
  cacheDir: string,
  href: string,
  linkLabel?: string,
): Promise<LfbStory[]> {
  const jwpubPath = await resolveLfbJwpubPath(cacheDir);
  if (!jwpubPath) {
    throw new Error('Baixe o livro lfb para abrir as histórias.');
  }

  let docRows = await lookupDocumentsByMepsIds(jwpubPath, parseMepsIdsFromHref(href));

  if (docRows.length === 0) {
    const storyNumbers = parseStoryNumbersFromLabel(linkLabel);
    if (storyNumbers?.length) {
      docRows = await lookupDocumentsByStoryNumbers(jwpubPath, storyNumbers);
    }
  }

  if (docRows.length === 0) {
    throw new Error('Histórias do livro de estudo não encontradas.');
  }

  const stories: LfbStory[] = [];
  for (let index = 0; index < docRows.length; index++) {
    const row = docRows[index];
    const html = await getDocumentHtml(jwpubPath, row.documentId);
    const storyNumber = storyNumberFromHtml(html, parseStoryNumbersFromLabel(linkLabel)?.[index] ?? index + 1);
    stories.push({
      documentId: row.documentId,
      mepsDocumentId: row.mepsDocumentId,
      storyNumber,
      title: row.title,
      html,
      plainText: stripHtml(html).slice(0, 6000),
    });
  }

  return stories.sort((a, b) => a.storyNumber - b.storyNumber);
}

export async function loadLfbStories(
  cacheDir: string,
  href: string,
  linkLabel?: string,
): Promise<LfbStory[]> {
  await ensureLfbJwpub(cacheDir);
  return loadLfbStoriesFromCache(cacheDir, href, linkLabel);
}

export function formatLfbStoriesHtml(stories: LfbStory[]) {
  return stories
    .map(
      (story) => `
<section class="jcs-lfb-story">
  <h3 class="jcs-lfb-story-title">História ${story.storyNumber} — ${story.title}</h3>
  <div class="jcs-lfb-story-body">${story.html}</div>
</section>`,
    )
    .join('\n');
}

export function formatLfbStoriesPlainText(stories: LfbStory[]) {
  return stories
    .map(
      (story) =>
        `### História ${story.storyNumber} — ${story.title}\n${story.plainText.slice(0, 4500)}`,
    )
    .join('\n\n');
}

export async function resolveLfbStudyLink(
  cacheDir: string,
  href: string,
  linkLabel?: string,
): Promise<ResolveLinkResult> {
  const downloaded = await isPubCached(cacheDir, 'lfb', '', 'T');
  const storyNumbers = parseStoryNumbersFromLabel(linkLabel) ?? [];
  const label = linkLabel?.trim() || (storyNumbers.length ? `lfb histórias ${storyNumbers.join('-')}` : 'lfb');

  const bookLabel = 'Aprenda com as Histórias da Bíblia';
  const studyBook = {
    href,
    linkLabel,
    pub: 'lfb' as const,
    stories: [] as Array<{ documentId: number; storyNumber: number; title: string }>,
  };

  if (downloaded) {
    try {
      const stories = await loadLfbStoriesFromCache(cacheDir, href, linkLabel);
      studyBook.stories = stories.map((story) => ({
        documentId: story.documentId,
        storyNumber: story.storyNumber,
        title: story.title,
      }));

      const lastStoryNumber = stories.at(-1)?.storyNumber ?? stories[0].storyNumber;
      const title =
        stories.length === 1
          ? `${stories[0].storyNumber}. ${stories[0].title}`
          : `${stories[0].storyNumber}. ${stories[0].title.split(' ').slice(0, 4).join(' ')}…`;

      return {
        ok: true,
        kind: 'study-book',
        title,
        subtitle: bookLabel,
        html: formatLfbStoriesHtml(stories),
        download: {
          pub: 'lfb',
          issue: '',
          label: bookLabel,
          downloaded: true,
          sizeMb: 27,
        },
        studyBook,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao abrir livro de estudo';
      return { ok: false, error: message };
    }
  }

  studyBook.stories = storyNumbers.map((storyNumber) => ({
    documentId: 0,
    storyNumber,
    title: `História ${storyNumber}`,
  }));

  const previewTitle =
    storyNumbers.length >= 2
      ? `Histórias ${storyNumbers[0]}–${storyNumbers.at(-1)}`
      : storyNumbers.length === 1
        ? `História ${storyNumbers[0]}`
        : label;

  return {
    ok: true,
    kind: 'study-book',
    title: previewTitle,
    subtitle: bookLabel,
    html: `<p class="jcs-lfb-download-hint">Baixe o livro para ler as histórias desta semana e preparar as lições.</p>`,
    download: {
      pub: 'lfb',
      issue: '',
      label: bookLabel,
      downloaded: false,
      sizeMb: 27,
    },
    studyBook,
  };
}

export { extractCbsStudyFromHtml } from '../shared/cbs-study-parse';
