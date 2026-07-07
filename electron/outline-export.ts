import fs from 'node:fs/promises';
import { BrowserWindow } from 'electron';
import { MEETING_ATA_EDITOR_STYLES } from '../shared/elder-meeting-ata';
import {
  DISCOURSE_MANUSCRIPT_HIGHLIGHT,
  prepareDiscourseBodyHtml as buildDiscourseBodyHtml,
} from '../shared/discourse-manuscript-html';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRichOutlineContent(value: string) {
  return /<(p|div|span|strong|em|u|mark|br|font|a)\b/i.test(value);
}

function plainOutlineToHtml(text: string) {
  if (!text.trim()) return '<p></p>';
  return text
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export function stripOutlinePlainText(value: string) {
  const normalized = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized;
}

/** Nome seguro para salvar no Windows, preservando acentos. */
export function sanitizeExportFileName(name: string, maxLength = 48): string {
  return name
    .slice(0, maxLength)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeOutlineHtmlForExport(value: string) {
  let html = isRichOutlineContent(value) ? value : plainOutlineToHtml(value);
  html = html.replace(/<a\b[^>]*class="[^"]*jcs-bible-ref[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');
  html = html.replace(/\s*contenteditable="[^"]*"/gi, '');
  html = html.replace(/\s*data-href="[^"]*"/gi, '');
  html = html.replace(/\s*data-label="[^"]*"/gi, '');
  html = html.replace(/\s*tabindex="[^"]*"/gi, '');
  return html;
}

const EXPORT_BODY_STYLES = `
  body {
    font-family: 'Segoe UI', Calibri, 'Arial Unicode MS', sans-serif;
    font-size: 12pt;
    line-height: 1.55;
    margin: 2cm;
    color: #222;
  }
  h1 { font-size: 16pt; margin: 0 0 0.35em; color: #1a1a1a; }
  h2 { font-size: 11pt; font-weight: normal; color: #555; margin: 0 0 1.25em; }
  p { margin: 0 0 0.75em; }
  strong, b { font-weight: 700; }
  em, i { font-style: italic; }
  u { text-decoration: underline; }
  mark { border-radius: 2px; padding: 0 1px; }
  font[size="1"] { font-size: 8pt; }
  font[size="2"] { font-size: 10pt; }
  font[size="3"] { font-size: 12pt; }
  font[size="4"] { font-size: 14pt; }
  font[size="5"] { font-size: 16pt; }
  font[size="6"] { font-size: 18pt; }
  font[size="7"] { font-size: 22pt; }
  ${MEETING_ATA_EDITOR_STYLES}
`;

/** Manuscrito de tribuna / discurso — Times New Roman 14pt, margens A4, parágrafos compactos. */
const DISCOURSE_MANUSCRIPT_STYLES = `
  @page {
    size: 21cm 29.7cm;
    margin: 2.5cm 3cm 2.5cm 3cm;
  }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 14pt;
    line-height: 1.15;
    color: #000;
    margin: 0;
  }
  .discourse-title {
    font-family: 'Times New Roman', Times, serif;
    font-size: 14pt;
    font-weight: bold;
    margin: 0 0 6pt;
    color: #000;
  }
  .discourse-week {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    font-weight: normal;
    font-style: italic;
    margin: 0 0 14pt;
    color: #000;
  }
  .discourse-body p,
  .discourse-body div {
    margin: 0 0 6pt;
    font-size: 14pt;
    line-height: 1.15;
  }
  .discourse-body p:last-child,
  .discourse-body div:last-child {
    margin-bottom: 0;
  }
  .discourse-body strong,
  .discourse-body b {
    font-weight: bold;
  }
  .discourse-body em,
  .discourse-body i {
    font-style: italic;
  }
  .discourse-body u {
    text-decoration: underline;
  }
  .discourse-body .discourse-hl-text,
  .discourse-body p.discourse-hl {
    background-color: ${DISCOURSE_MANUSCRIPT_HIGHLIGHT};
  }
  .discourse-body span[style*="background-color"],
  .discourse-body mark {
    color: inherit;
  }
  font[size="1"] { font-size: 10pt; }
  font[size="2"] { font-size: 12pt; }
  font[size="3"] { font-size: 14pt; }
  font[size="4"] { font-size: 16pt; }
  font[size="5"] { font-size: 18pt; }
  font[size="6"] { font-size: 20pt; }
  font[size="7"] { font-size: 24pt; }
`;

function wordPageNumberField(fallback = '1'): string {
  return [
    '<!--[if supportFields]>',
    '<span style="mso-element:field-begin"></span>',
    '<span style="mso-spacerun:yes">&nbsp;</span>PAGE',
    '<span style="mso-element:field-separator"></span>',
    '<![endif]-->',
    `<span style="mso-no-proof:yes">${fallback}</span>`,
    '<!--[if supportFields]><span style="mso-element:field-end"></span><![endif]-->',
  ].join('');
}

/** Cabeçalho Word — número da página nos dois cantos superiores. */
const DISCOURSE_WORD_PAGE_HEADER = `
<div style="mso-element:header" id="discourse-page-header">
  <table border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr>
      <td style="width:50%;text-align:left;vertical-align:bottom;padding:0;font-size:11pt;font-family:'Times New Roman',serif;">
        ${wordPageNumberField()}
      </td>
      <td style="width:50%;text-align:right;vertical-align:bottom;padding:0;font-size:11pt;font-family:'Times New Roman',serif;">
        ${wordPageNumberField()}
      </td>
    </tr>
  </table>
</div>`;

/** PDF — cantos superiores via headerTemplate do Chromium. */
const DISCOURSE_PDF_HEADER_TEMPLATE = `
<div style="width:100%;font-size:11pt;font-family:'Times New Roman',serif;color:#000;padding:0 1.2cm;display:flex;justify-content:space-between;box-sizing:border-box;">
  <span class="pageNumber"></span>
  <span class="pageNumber"></span>
</div>`;

function buildPlainHtmlDocument(title: string, subtitle: string, body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>${EXPORT_BODY_STYLES}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <h2>${escapeHtml(subtitle)}</h2>
  ${paragraphs || '<p></p>'}
</body>
</html>`;
}

function buildRichHtmlDocument(title: string, subtitle: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>${EXPORT_BODY_STYLES}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <h2>${escapeHtml(subtitle)}</h2>
  <div class="outline-body">${bodyHtml}</div>
</body>
</html>`;
}

function prepareDiscourseBodyForExport(value: string) {
  let html = buildDiscourseBodyHtml(value);
  html = sanitizeOutlineHtmlForExport(html);
  return html;
}

function buildDiscourseManuscriptDocument(title: string, weekLabel: string, bodyHtml: string) {
  const subtitleBlock = weekLabel.trim()
    ? `<p class="discourse-week">${escapeHtml(weekLabel.trim())}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
  <!--[if gte mso 9]>
  <style>
    @page Section1 {
      size: 21cm 29.7cm;
      margin: 2.5cm 3cm 2.5cm 3cm;
      mso-header-margin: 1.0cm;
      mso-footer-margin: 0;
      mso-page-orientation: portrait;
    }
    div.Section1 { page: Section1; }
    p.MsoHeader {
      margin: 0;
      font-size: 11pt;
      font-family: 'Times New Roman', serif;
    }
    p.MsoNormal, li.MsoNormal, div.MsoNormal {
      margin-top: 0cm;
      margin-right: 0cm;
      margin-bottom: 6pt;
      margin-left: 0cm;
      line-height: 115%;
      font-size: 14pt;
      font-family: 'Times New Roman', serif;
    }
    span.discourse-hl-text {
      background: ${DISCOURSE_MANUSCRIPT_HIGHLIGHT};
      mso-highlight: cyan;
    }
    p.discourse-hl {
      background: ${DISCOURSE_MANUSCRIPT_HIGHLIGHT};
    }
  </style>
  <![endif]-->
  <style>${DISCOURSE_MANUSCRIPT_STYLES}</style>
</head>
<body>
  ${DISCOURSE_WORD_PAGE_HEADER}
  <div class="Section1">
    <p class="discourse-title MsoNormal"><b>${escapeHtml(title)}</b></p>
    ${subtitleBlock}
    <div class="discourse-body">${bodyHtml}</div>
  </div>
</body>
</html>`;
}

async function printHtmlToPdf(
  html: string,
  filePath: string,
  options?: { discoursePageNumbers?: boolean },
) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await win.webContents.printToPDF({
      marginsType: options?.discoursePageNumbers ? 0 : 1,
      printBackground: true,
      ...(options?.discoursePageNumbers
        ? {
            displayHeaderFooter: true,
            headerTemplate: DISCOURSE_PDF_HEADER_TEMPLATE,
            footerTemplate: '<div></div>',
            marginOptions: {
              top: 0.55,
              bottom: 0.98,
              left: 1.18,
              right: 1.18,
            },
          }
        : {}),
    });
    await fs.writeFile(filePath, pdf);
    return { ok: true as const };
  } finally {
    win.destroy();
  }
}

function buildBodyOnlyHtmlDocument(bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>ATA</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>${EXPORT_BODY_STYLES}</style>
</head>
<body>
  <div class="outline-body">${bodyHtml}</div>
</body>
</html>`;
}

/** Exportação da ATA de reunião — corpo único, sem H1/H2 duplicados. */
export async function exportMeetingAtaDocument(
  filePath: string,
  format: 'doc' | 'pdf',
  bodyHtml: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sanitized = sanitizeOutlineHtmlForExport(bodyHtml);
    const html = buildBodyOnlyHtmlDocument(sanitized);

    if (format === 'pdf') {
      return printHtmlToPdf(html, filePath);
    }

    await fs.writeFile(filePath, `\ufeff${html}`, 'utf8');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar ATA';
    return { ok: false, error: message };
  }
}

export async function exportOutlineDocument(
  filePath: string,
  format: 'doc' | 'pdf',
  title: string,
  subtitle: string,
  value: string,
  preserveFormatting: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (preserveFormatting) {
      const bodyHtml = sanitizeOutlineHtmlForExport(value);
      const html = buildRichHtmlDocument(title, subtitle, bodyHtml);

      if (format === 'pdf') {
        return printHtmlToPdf(html, filePath);
      }

      await fs.writeFile(filePath, `\ufeff${html}`, 'utf8');
      return { ok: true };
    }

    const plainBody = stripOutlinePlainText(value);
    const html = buildPlainHtmlDocument(title, subtitle, plainBody);

    if (format === 'doc') {
      await fs.writeFile(filePath, `\ufeff${html}`, 'utf8');
      return { ok: true };
    }

    return printHtmlToPdf(html, filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar esboço';
    return { ok: false, error: message };
  }
}

/** HTML completo → PDF (relatórios, resumos). */
export async function exportFullHtmlToPdf(
  filePath: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  return printHtmlToPdf(html, filePath);
}

/** Roteiro de tribuna e discurso público — manuscrito Times New Roman. */
export async function exportPublicTalkNote(
  filePath: string,
  format: 'doc' | 'pdf',
  title: string,
  weekLabel: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const bodyHtml = prepareDiscourseBodyForExport(body);
    const html = buildDiscourseManuscriptDocument(title, weekLabel, bodyHtml);

    if (format === 'pdf') {
      return printHtmlToPdf(html, filePath, { discoursePageNumbers: true });
    }

    await fs.writeFile(filePath, `\ufeff${html}`, 'utf8');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar manuscrito';
    return { ok: false, error: message };
  }
}
