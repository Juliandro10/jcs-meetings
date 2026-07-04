import fs from 'node:fs/promises';
import { BrowserWindow } from 'electron';
import { MEETING_ATA_EDITOR_STYLES } from '../shared/elder-meeting-ata';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRtf(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par\n');
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

function buildPlainHtmlDocument(title: string, subtitle: string, body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
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

function buildRtfDocument(title: string, subtitle: string, body: string) {
  return `{\\rtf1\\ansi\\deff0
{\\b ${escapeRtf(title)}\\par}
{\\i ${escapeRtf(subtitle)}\\par\\par}
${escapeRtf(body)}
}`;
}

async function printHtmlToPdf(html: string, filePath: string) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await win.webContents.printToPDF({
      marginsType: 1,
      printBackground: true,
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

    if (format === 'doc') {
      const rtf = buildRtfDocument(title, subtitle, plainBody);
      await fs.writeFile(filePath, rtf, 'utf8');
      return { ok: true };
    }

    const html = buildPlainHtmlDocument(title, subtitle, plainBody);
    return printHtmlToPdf(html, filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar esboço';
    return { ok: false, error: message };
  }
}

/** Exportação simples (texto puro) — discurso público e compatibilidade. */
export async function exportPublicTalkNote(
  filePath: string,
  format: 'doc' | 'pdf',
  title: string,
  weekLabel: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  return exportOutlineDocument(filePath, format, title, weekLabel, body, false);
}
