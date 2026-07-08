import { DISCOURSE_SCRIPT_TAG } from './discourse-script';
import { prepareDiscourseBodyHtml } from './discourse-manuscript-html';

export type JcsReadNote = {
  id: string;
  title: string;
  body: string;
  anchorText: string;
  tags?: string[];
};

const HIGHLIGHT_SWATCH: Record<string, string> = {
  yellow: '#fff176',
  green: '#a5d6a7',
  blue: '#90caf9',
  pink: '#f48fb1',
  purple: '#ce93d8',
  orange: '#ffcc80',
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

/** CSS enxuto — compatível com WebView Android 4.4 (sem flex/grid moderno). */
export const JCS_READ_BASE_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #f3f4f6;
  color: #1f2937;
  font-family: Georgia, "Times New Roman", serif;
  -webkit-text-size-adjust: 100%;
}
.jcs-read-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 14px 48px;
  background: #fff;
  min-height: 100%;
}
.jcs-read-header {
  border-bottom: 3px solid #6d28d9;
  padding-bottom: 12px;
  margin-bottom: 18px;
}
.jcs-read-header h1 {
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 20px;
  line-height: 1.25;
  margin: 0 0 6px;
  color: #4c1d95;
}
.jcs-read-header .meta {
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}
.jcs-read-body { font-size: 18px; line-height: 1.55; }
.jcs-read-body img { max-width: 100%; height: auto; }
.jcs-read-body figure { margin: 12px 0; }
.jcs-read-body textarea { display: none; }
.jcs-field-value {
  display: block;
  margin: 8px 0 14px;
  padding: 10px 12px;
  background: #f5f3ff;
  border-left: 4px solid #7c3aed;
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.jcs-hl-yellow, .jcs-hl-green, .jcs-hl-blue, .jcs-hl-pink, .jcs-hl-purple, .jcs-hl-orange {
  padding: 0 1px;
  border-radius: 2px;
}
.jcs-hl-yellow { background: #fff176; }
.jcs-hl-green { background: #a5d6a7; }
.jcs-hl-blue { background: #90caf9; }
.jcs-hl-pink { background: #f48fb1; }
.jcs-hl-purple { background: #ce93d8; }
.jcs-hl-orange { background: #ffcc80; }
.jcs-notes-block {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 2px dashed #d1d5db;
}
.jcs-notes-block h2 {
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 16px;
  color: #6d28d9;
  margin: 0 0 12px;
}
.jcs-note-card {
  margin: 0 0 12px;
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.jcs-note-card h3 {
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 14px;
  margin: 0 0 6px;
  color: #374151;
}
.jcs-note-card p {
  margin: 0;
  font-size: 15px;
  line-height: 1.45;
}
.jcs-note-quote {
  font-size: 13px;
  color: #6b7280;
  font-style: italic;
  margin: 0 0 6px;
}
.jcs-plain-doc { font-size: 17px; line-height: 1.55; }
.jcs-plain-doc p { margin: 0 0 12px; }
.jcs-outline-body { font-family: "Segoe UI", Arial, sans-serif; font-size: 16px; line-height: 1.55; }
.jcs-outline-body p { margin: 0 0 10px; }
.jcs-outline-body strong, .jcs-outline-body b { font-weight: 700; }
.jcs-outline-body mark, .jcs-outline-body .discourse-hl-text {
  background: #00ffff;
  padding: 0 2px;
}
.jcs-outline-body ul, .jcs-outline-body ol { margin: 0 0 10px 1.2em; padding: 0; }
.jcs-prepared-part {
  margin: 0 0 28px;
  padding-bottom: 20px;
  border-bottom: 2px dashed #d1d5db;
}
.jcs-prepared-part:last-child { border-bottom: none; }
.jcs-prepared-part h2 {
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 17px;
  color: #6d28d9;
  margin: 0 0 12px;
}
.jcs-cbs-story {
  margin: 0 0 32px;
  padding-bottom: 24px;
  border-bottom: 3px solid #e5e7eb;
}
.jcs-cbs-story:last-child { border-bottom: none; }
.jcs-cbs-story-title {
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 18px;
  color: #4c1d95;
  margin: 0 0 14px;
}
.jcs-lfb-study-prep {
  margin-top: 20px;
  padding: 12px;
  background: #f5f3ff;
  border-left: 4px solid #7c3aed;
}
.jcs-lfb-study-heading {
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 15px;
  margin: 0 0 10px;
  color: #4c1d95;
}
.jcs-lfb-study-label {
  display: block;
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 14px;
  margin: 10px 0 4px;
  color: #374151;
}
`;

export function highlightSwatch(color: string) {
  return HIGHLIGHT_SWATCH[color] ?? HIGHLIGHT_SWATCH.yellow;
}

export function isRichOutlineContent(value: string) {
  return /<(p|div|span|strong|em|u|mark|br|a)\b/i.test(value);
}

export function plainOutlineToHtml(text: string) {
  if (!text.trim()) return '<p></p>';
  return text
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export function outlineValueToBodyHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '<p></p>';
  return isRichOutlineContent(trimmed) ? trimmed : plainOutlineToHtml(trimmed);
}

function noteBodyToHtml(body: string, tags?: string[]) {
  const isDiscourse = tags?.includes(DISCOURSE_SCRIPT_TAG) ?? false;
  if (isDiscourse) {
    return `<div class="jcs-outline-body">${prepareDiscourseBodyHtml(outlineValueToBodyHtml(body))}</div>`;
  }
  if (isRichOutlineContent(body)) {
    return `<div class="jcs-outline-body">${outlineValueToBodyHtml(body)}</div>`;
  }
  return `<p>${nl2br(body)}</p>`;
}

export function buildJcsReadOutlineHtml(params: {
  title: string;
  subtitle?: string;
  outlineHtml: string;
}) {
  return buildJcsReadDocumentHtml({
    title: params.title,
    subtitle: params.subtitle,
    bodyHtml: `<div class="jcs-outline-body">${params.outlineHtml}</div>`,
  });
}

export function buildJcsReadRichNoteHtml(params: {
  title: string;
  subtitle?: string;
  body: string;
}) {
  if (isRichOutlineContent(params.body)) {
    return buildJcsReadDocumentHtml({
      title: params.title,
      subtitle: params.subtitle,
      bodyHtml: `<div class="jcs-outline-body">${params.body}</div>`,
    });
  }
  return buildJcsReadPlainHtml(params);
}

export function buildJcsReadNotesSection(notes: JcsReadNote[]) {
  if (notes.length === 0) return '';
  return `<section class="jcs-notes-block">
  <h2>Notas</h2>
  ${notes
    .map(
      (note) => `<article class="jcs-note-card">
    <h3>${escapeHtml(note.title || 'Nota')}</h3>
    ${note.anchorText ? `<p class="jcs-note-quote">"${escapeHtml(note.anchorText)}"</p>` : ''}
    ${noteBodyToHtml(note.body, note.tags)}
  </article>`,
    )
    .join('\n')}
</section>`;
}

export function buildJcsReadDocumentHtml(params: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  publicationCss?: string;
  notes?: JcsReadNote[];
}) {
  const notesHtml = params.notes && params.notes.length > 0 ? buildJcsReadNotesSection(params.notes) : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(params.title)}</title>
  <style>
${JCS_READ_BASE_CSS}
${params.publicationCss ?? ''}
  </style>
</head>
<body>
  <div class="jcs-read-shell">
    <header class="jcs-read-header">
      <h1>${escapeHtml(params.title)}</h1>
      ${params.subtitle ? `<p class="meta">${escapeHtml(params.subtitle)}</p>` : ''}
    </header>
    <div class="jcs-read-body jwpub-content">
      ${params.bodyHtml}
    </div>
    ${notesHtml}
  </div>
</body>
</html>`;
}

export function buildJcsReadPlainHtml(params: {
  title: string;
  subtitle?: string;
  body: string;
}) {
  const paragraphs = params.body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${nl2br(part)}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(params.title)}</title>
  <style>${JCS_READ_BASE_CSS}</style>
</head>
<body>
  <div class="jcs-read-shell">
    <header class="jcs-read-header">
      <h1>${escapeHtml(params.title)}</h1>
      ${params.subtitle ? `<p class="meta">${escapeHtml(params.subtitle)}</p>` : ''}
    </header>
    <div class="jcs-plain-doc">
      ${paragraphs || '<p></p>'}
    </div>
  </div>
</body>
</html>`;
}
