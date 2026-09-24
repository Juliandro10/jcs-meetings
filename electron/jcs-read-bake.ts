import path from 'node:path';
import { parse, type HTMLElement } from 'node-html-parser';
import { normalizePlainText } from '../shared/text-normalize';
import { isLfbStudyNoteId } from './lfb-study-notes';
import type { PrepHighlight, PrepNote } from './user-prep-store';
import { isWcgQuestionNoteId, WCG_BIBLE_READING_NOTE_ID } from './wcg-study-notes';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fieldKey(pub: string, issue: string, documentId: number, fieldId: string) {
  return `${pub}_${issue}_d${documentId}_f${fieldId}`;
}

function highlightClassForColor(color: string) {
  const allowed = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'];
  return allowed.includes(color) ? `jcs-hl-${color}` : 'jcs-hl-yellow';
}

function findBlock(root: ReturnType<typeof parse>, blockId: string) {
  const byPid = root.querySelector(`[data-pid="${blockId}"]`);
  if (byPid) return byPid;
  const byId = root.querySelector(`#p${blockId}`) ?? root.querySelector(`#${blockId}`);
  return byId;
}

function wrapFirstNeedle(html: string, needle: string, className: string) {
  const normalizedNeedle = normalizePlainText(needle);
  if (!normalizedNeedle || normalizedNeedle.length < 2) return html;

  const plain = normalizePlainText(html.replace(/<[^>]+>/g, ' '));
  if (plain.indexOf(normalizedNeedle) < 0 && plain.toLowerCase().indexOf(normalizedNeedle.toLowerCase()) < 0) {
    return html;
  }

  const re = new RegExp(
    normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'),
    'i',
  );
  const match = html.match(re);
  if (!match || match.index === undefined) return html;

  const start = match.index;
  const end = start + match[0].length;
  return `${html.slice(0, start)}<mark class="${className}">${html.slice(start, end)}</mark>${html.slice(end)}`;
}

function applyHighlightsToHtml(html: string, highlights: PrepHighlight[]) {
  if (highlights.length === 0) return html;
  const root = parse(html, { comment: false });

  for (const highlight of highlights) {
    const block = findBlock(root, highlight.blockId);
    if (!block) continue;
    const className = highlightClassForColor(highlight.color);
    const next = wrapFirstNeedle(block.innerHTML, highlight.text, className);
    if (next !== block.innerHTML) block.set_content(next);
  }

  return root.toString();
}

function nextHtmlElement(node: HTMLElement) {
  const direct = (node as HTMLElement & { nextElementSibling?: HTMLElement | null }).nextElementSibling;
  if (direct) return direct;

  const parent = node.parentNode as HTMLElement | null;
  const children = parent?.childNodes;
  if (!children) return null;

  const index = children.indexOf(node);
  if (index < 0) return null;

  for (let i = index + 1; i < children.length; i++) {
    const child = children[i] as HTMLElement;
    if (child && (child.nodeType === 1 || Boolean(child.tagName))) return child;
  }
  return null;
}

function pickWcgAnswerTextareaNode(candidate: HTMLElement | null) {
  if (!candidate) return null;
  const id = candidate.getAttribute('id') || '';
  if (id === WCG_BIBLE_READING_NOTE_ID) return null;
  return candidate;
}

export function findWcgAnswerTextareaNode(root: HTMLElement, questionBlockId: string) {
  const nextPid = Number(questionBlockId);
  if (Number.isFinite(nextPid)) {
    const byPid = pickWcgAnswerTextareaNode(
      (root.querySelector(`[data-pid="${nextPid + 1}"] textarea`) ??
        root.querySelector(`.gen-field[data-pid="${nextPid + 1}"] textarea`)) as HTMLElement | null,
    );
    if (byPid) return byPid;
  }

  const questionBlock =
    root.querySelector(`.jwpub-block[data-pid="${questionBlockId}"]`) ??
    root.querySelector(`[data-pid="${questionBlockId}"]`);
  if (!questionBlock) return null;

  const nested = pickWcgAnswerTextareaNode(questionBlock.querySelector('textarea') as HTMLElement | null);
  if (nested) return nested;

  let sibling = nextHtmlElement(questionBlock);
  for (let step = 0; step < 8 && sibling; step++) {
    const textarea = pickWcgAnswerTextareaNode(
      (sibling.querySelector('textarea') ??
        (String(sibling.tagName).toUpperCase() === 'TEXTAREA' ? sibling : null)) as HTMLElement | null,
    );
    if (textarea) return textarea;
    sibling = nextHtmlElement(sibling);
  }

  const parent = questionBlock.parentNode as HTMLElement | null;
  return pickWcgAnswerTextareaNode((parent?.querySelector?.('textarea') as HTMLElement | null) ?? null);
}

/** Respostas do EBC ficam em notas; o tablet só mostra o que estiver nos campos. */
export function mergeStudyNotesIntoFieldValues(params: {
  html?: string;
  pub: string;
  issue: string;
  documentId: number;
  fieldValues: Record<string, string>;
  notes: Array<Pick<PrepNote, 'id' | 'body'> & { blockId?: string }>;
}): { fieldValues: Record<string, string>; filledWcgNoteIds: Set<string> } {
  const fieldValues = { ...params.fieldValues };
  const filledWcgNoteIds = new Set<string>();

  for (const note of params.notes) {
    const body = note.body?.trim();
    if (!body || !isLfbStudyNoteId(note.id)) continue;
    const key = fieldKey(params.pub, params.issue, params.documentId, note.id);
    if (!fieldValues[key]?.trim()) fieldValues[key] = body;
  }

  for (const note of params.notes) {
    if (note.id !== WCG_BIBLE_READING_NOTE_ID || !note.body?.trim()) continue;
    const key = fieldKey(params.pub, params.issue, params.documentId, note.id);
    fieldValues[key] = note.body.trim();
    filledWcgNoteIds.add(note.id);
  }

  if (params.pub === 'wcg' && params.html) {
    const container = parse(params.html, { comment: false });
    for (const note of params.notes) {
      if (!isWcgQuestionNoteId(note.id) || !note.body.trim() || !note.blockId) continue;
      const textarea = findWcgAnswerTextareaNode(container, note.blockId);
      if (!textarea) continue;
      const fieldId = textarea.getAttribute('id') || textarea.getAttribute('data-pid') || '';
      if (!fieldId) continue;
        const key = fieldKey(params.pub, params.issue, params.documentId, fieldId);
        fieldValues[key] = note.body.trim();
        filledWcgNoteIds.add(note.id);
    }
  }

  return { fieldValues, filledWcgNoteIds };
}

export function injectWcgFallbackAnswers(
  html: string,
  notes: Array<Pick<PrepNote, 'id' | 'body' | 'blockId'>>,
  filledWcgNoteIds: Set<string>,
) {
  const pending = notes.filter(
    (note) => isWcgQuestionNoteId(note.id) && note.body.trim() && !filledWcgNoteIds.has(note.id),
  );
  if (pending.length === 0) return { html, injectedIds: new Set<string>() };

  const root = parse(html, { comment: false });
  const injectedIds = new Set<string>();
  for (const note of pending) {
    const textarea = note.blockId ? findWcgAnswerTextareaNode(root, note.blockId) : null;
    if (textarea) {
      const parent = textarea.parentNode as HTMLElement | null;
      if (parent?.querySelector?.('.jcs-field-value')?.text?.trim()) {
        injectedIds.add(note.id);
        continue;
      }
      const replacement = parse(
        `<div class="jcs-field-value">${escapeHtml(note.body.trim()).replace(/\n/g, '<br>')}</div>`,
      );
      textarea.replaceWith(replacement);
      injectedIds.add(note.id);
      continue;
    }

    const block =
      root.querySelector(`.jwpub-block[data-pid="${note.blockId}"]`) ??
      root.querySelector(`[data-pid="${note.blockId}"]`);
    if (!block) continue;

    const next = nextHtmlElement(block);
    if (next?.classList.contains('jcs-wcg-answer')) {
      injectedIds.add(note.id);
      continue;
    }
    if (next?.querySelector('.jcs-field-value')?.text?.trim()) {
      injectedIds.add(note.id);
      continue;
    }

    block.insertAdjacentHTML(
      'afterend',
      `<div class="jcs-wcg-answer" data-wcg-note="${escapeHtml(note.id)}"><p class="jcs-wcg-answer-label">Preparação</p><div class="jcs-wcg-answer-body">${escapeHtml(note.body.trim()).replace(/\n/g, '<br>')}</div></div>`,
    );
    injectedIds.add(note.id);
  }

  return { html: root.toString(), injectedIds };
}

function applyFieldValuesToHtml(
  html: string,
  pub: string,
  issue: string,
  documentId: number,
  fieldValues: Record<string, string>,
) {
  const root = parse(html, { comment: false });
  const fields = root.querySelectorAll('textarea');
  fields.forEach((textarea, index) => {
    const fieldId = textarea.getAttribute('id') || textarea.getAttribute('data-pid') || String(index);
    const key = fieldKey(pub, issue, documentId, fieldId);
    const value = fieldValues[key]?.trim() ?? '';
    if (!value) return;
    const replacement = parse(
      `<div class="jcs-field-value">${escapeHtml(value).replace(/\n/g, '<br>')}</div>`,
    );
    textarea.replaceWith(replacement);
  });
  return root.toString();
}

export function bakePreparedDocumentHtml(params: {
  html: string;
  pub: string;
  issue: string;
  documentId: number;
  fieldValues: Record<string, string>;
  highlights: PrepHighlight[];
}) {
  let baked = applyFieldValuesToHtml(
    params.html,
    params.pub,
    params.issue,
    params.documentId,
    params.fieldValues,
  );
  baked = applyHighlightsToHtml(baked, params.highlights);
  return baked;
}

export function sanitizeMediaFileName(fileName: string) {
  return path.basename(fileName).replace(/[^\w.\-()+]/g, '_');
}

export type MediaRewriteResult = {
  html: string;
  mediaFiles: Array<{ sourceName: string; localName: string }>;
};

/** Converte jcs-media:// para caminhos relativos assets/ e lista mídias a copiar. */
export function rewriteMediaUrlsForExport(html: string): MediaRewriteResult {
  const mediaFiles: MediaRewriteResult['mediaFiles'] = [];
  const seen = new Set<string>();

  const next = html.replace(
    /jcs-media:\/\/[^/]+\/[^/]+\/[^/]+\/([^"'>\s]+)/g,
    (_match, encoded: string) => {
      const sourceName = decodeURIComponent(encoded);
      let localName = sanitizeMediaFileName(sourceName);
      if (seen.has(localName)) {
        const ext = path.extname(localName);
        const base = path.basename(localName, ext);
        localName = `${base}-${seen.size}${ext}`;
      }
      seen.add(localName);
      mediaFiles.push({ sourceName, localName });
      return `assets/${localName}`;
    },
  );

  return { html: next, mediaFiles };
}
