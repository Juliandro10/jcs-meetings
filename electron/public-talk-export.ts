import fs from 'node:fs/promises';
import { BrowserWindow } from 'electron';

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

function buildHtmlDocument(title: string, weekLabel: string, body: string) {
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
  <style>
    body { font-family: Calibri, Segoe UI, sans-serif; font-size: 12pt; line-height: 1.5; margin: 2cm; color: #222; }
    h1 { font-size: 16pt; margin-bottom: 0.25em; }
    h2 { font-size: 11pt; font-weight: normal; color: #555; margin-top: 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <h2>${escapeHtml(weekLabel)}</h2>
  ${paragraphs || '<p></p>'}
</body>
</html>`;
}

function buildRtfDocument(title: string, weekLabel: string, body: string) {
  return `{\\rtf1\\ansi\\deff0
{\\b ${escapeRtf(title)}\\par}
{\\i ${escapeRtf(weekLabel)}\\par\\par}
${escapeRtf(body)}
}`;
}

export async function exportPublicTalkNote(
  filePath: string,
  format: 'doc' | 'pdf',
  title: string,
  weekLabel: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (format === 'doc') {
      const rtf = buildRtfDocument(title, weekLabel, body);
      await fs.writeFile(filePath, rtf, 'utf8');
      return { ok: true };
    }

    const html = buildHtmlDocument(title, weekLabel, body);
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
      return { ok: true };
    } finally {
      win.destroy();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar anotações';
    return { ok: false, error: message };
  }
}
