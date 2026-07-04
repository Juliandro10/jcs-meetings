import fs from 'node:fs/promises';
import { BrowserWindow } from 'electron';
import { PDFArray, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import {
  composeTalkThemeCardHtml,
  suggestTalkThemeCardFileName,
  type TalkThemeCardInput,
} from '../shared/talk-theme-card-html';

type CanticoBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

async function injectPdfUriLink(
  pdfBytes: Buffer,
  uri: string,
  bounds: CanticoBounds,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[0];
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const x1 = (bounds.left / bounds.viewportWidth) * pageWidth;
  const x2 = ((bounds.left + bounds.width) / bounds.viewportWidth) * pageWidth;
  const yTop = (bounds.top / bounds.viewportHeight) * pageHeight;
  const yBottom = ((bounds.top + bounds.height) / bounds.viewportHeight) * pageHeight;
  const rect = [x1, pageHeight - yBottom, x2, pageHeight - yTop];

  const linkRef = pdfDoc.context.register(
    pdfDoc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: rect,
      Border: [0, 0, 0],
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(uri),
      },
    }),
  );

  const existingAnnots = page.node.lookup(PDFName.of('Annots'), PDFArray);
  if (existingAnnots) {
    existingAnnots.push(linkRef);
  } else {
    page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkRef]));
  }

  return Buffer.from(await pdfDoc.save());
}

export async function writeTalkThemeCardHtml(filePath: string, input: TalkThemeCardInput) {
  const html = composeTalkThemeCardHtml(input);
  await fs.writeFile(filePath, html, 'utf8');
}

export async function writeTalkThemeCardPdf(filePath: string, input: TalkThemeCardInput) {
  const html = composeTalkThemeCardHtml(input, { forPdf: true });
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await win.webContents.executeJavaScript(
      `document.fonts.ready.then(() => new Promise((resolve) => setTimeout(resolve, 400)))`,
    );

    const bounds = await win.webContents.executeJavaScript<CanticoBounds>(`
      (function () {
        var el = document.getElementById('pdf-cantico-target');
        if (!el) return null;
        var rect = el.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
        };
      })()
    `);

    if (!bounds) {
      throw new Error('Não foi possível localizar a área do cântico no PDF.');
    }

    const pdfRaw = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      marginsType: 0,
    });

    const pdfWithLink = await injectPdfUriLink(
      Buffer.from(pdfRaw),
      input.jwLibraryAndroidIntentUrl,
      bounds,
    );
    await fs.writeFile(filePath, pdfWithLink);
  } finally {
    win.destroy();
  }
}

export { composeTalkThemeCardHtml, suggestTalkThemeCardFileName };
