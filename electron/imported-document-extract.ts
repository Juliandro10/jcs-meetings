import { PDFParse } from 'pdf-parse';
import JSZip from 'jszip';
import { joinBrokenJcsReadRefsInText, linkifyJcsReadRefsInHtml } from '../shared/jcs-read-ref-links';
import { collectPageHotspots, renderPdfPageHtml } from './pdf-page-layout';
import { extractPautaFileText } from './elder-meeting-pauta';

export const IMPORTED_DOC_ID_TOKEN = '__JCS_IMPORTED_ID__';

export type ImportedExtractAsset = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export type ImportedExtractResult = {
  html: string;
  assets: ImportedExtractAsset[];
  hasText: boolean;
  hasImages: boolean;
};

const MAX_PDF_PAGES = 40;
const PDF_PAGE_WIDTH = 960;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function mimeFromExt(fileName: string) {
  const ext = fileName.toLowerCase().replace(/^.*\./, '');
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function extFromMime(mime: string, fallback = 'png') {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('png')) return 'png';
  return fallback;
}

function safeAssetName(base: string, ext: string) {
  const stem = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'img';
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  return `${stem}.${cleanExt}`;
}

function imageTag(fileName: string, alt: string, className: string) {
  const src = `jcs-imported://${IMPORTED_DOC_ID_TOKEN}/${fileName}`;
  return `<figure class="${className}"><img src="${src}" alt="${escapeHtml(alt)}"></figure>`;
}

function textToHtml(text: string) {
  const trimmed = joinBrokenJcsReadRefsInText(text.replace(/\u00a0/g, ' ')).trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function toBuffer(data: unknown): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === 'object' && data !== null && 'buffer' in data) {
    return toBuffer((data as { buffer: unknown }).buffer);
  }
  return null;
}

async function extractPdf(buffer: Buffer): Promise<ImportedExtractResult> {
  const parser = new PDFParse({ data: buffer });
  const assets: ImportedExtractAsset[] = [];
  const parts: string[] = [];
  try {
    const shots = await parser.getScreenshot({
      first: MAX_PDF_PAGES,
      desiredWidth: PDF_PAGE_WIDTH,
      imageDataUrl: false,
      imageBuffer: true,
    });
    const pages = Array.isArray(shots?.pages) ? shots.pages : [];
    for (const [index, page] of pages.entries()) {
      const data = toBuffer((page as { data?: unknown }).data) ?? toBuffer(page);
      if (!data?.length) continue;
      const pageNumber = Number((page as { pageNumber?: number }).pageNumber) || index + 1;
      const fileName = `page-${String(pageNumber).padStart(2, '0')}.png`;
      assets.push({ fileName, mimeType: 'image/png', buffer: data });
      const src = `jcs-imported://${IMPORTED_DOC_ID_TOKEN}/${fileName}`;
      const hotspots = await collectPageHotspots(parser, pageNumber);
      parts.push(renderPdfPageHtml(src, `Página ${pageNumber}`, hotspots));
    }

    if (assets.length === 0) {
      const images = await parser.getImage({ imageThreshold: 40, imageDataUrl: false, imageBuffer: true });
      const imagePages = Array.isArray(images?.pages) ? images.pages : [];
      let n = 0;
      for (const page of imagePages) {
        const list = Array.isArray((page as { images?: unknown[] }).images)
          ? (page as { images: unknown[] }).images
          : [];
        for (const image of list) {
          const data = toBuffer((image as { data?: unknown }).data) ?? toBuffer(image);
          if (!data?.length) continue;
          n += 1;
          const mime = String((image as { mimeType?: string }).mimeType || 'image/png');
          const fileName = safeAssetName(`img-${String(n).padStart(2, '0')}`, extFromMime(mime));
          assets.push({ fileName, mimeType: mime, buffer: data });
          parts.push(imageTag(fileName, 'Imagem', 'jcs-imported-image'));
        }
      }
    }
  } catch (err) {
    console.error('[imported-doc] extractPdf', err);
  } finally {
    await parser.destroy();
  }

  return {
    html: parts.join('') || '<p><br></p>',
    assets,
    hasText: false,
    hasImages: assets.length > 0,
  };
}

function parseDocxImageRels(relsXml: string) {
  const map = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = match[1] ?? '';
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    const type = attrs.match(/\bType="([^"]+)"/)?.[1] ?? '';
    if (!id || !target) continue;
    if (!/image/i.test(type) && !/media\//i.test(target)) continue;
    map.set(id, target.replace(/\\/g, '/'));
  }
  return map;
}

function resolveDocxMediaPath(target: string) {
  const cleaned = target.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!cleaned || cleaned.includes('..')) return null;
  if (cleaned.startsWith('word/')) return cleaned;
  return `word/${cleaned}`;
}

async function extractDocx(buffer: Buffer): Promise<ImportedExtractResult> {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  const relsFile = zip.file('word/_rels/document.xml.rels');
  const xml = documentFile ? await documentFile.async('string') : '';
  const relsXml = relsFile ? await relsFile.async('string') : '';
  const rels = parseDocxImageRels(relsXml);
  const used = new Map<string, string>();
  const assets: ImportedExtractAsset[] = [];
  const parts: string[] = [];
  let imageIndex = 0;

  const addImage = async (relId: string) => {
    const existing = used.get(relId);
    if (existing) {
      parts.push(imageTag(existing, 'Imagem', 'jcs-imported-image'));
      return;
    }
    const target = rels.get(relId);
    if (!target) return;
    const zipPath = resolveDocxMediaPath(target);
    if (!zipPath) return;
    const file = zip.file(zipPath);
    if (!file) return;
    imageIndex += 1;
    const ext = zipPath.split('.').pop() || 'png';
    const fileName = safeAssetName(`img-${String(imageIndex).padStart(2, '0')}`, ext);
    used.set(relId, fileName);
    assets.push({
      fileName,
      mimeType: mimeFromExt(fileName),
      buffer: await file.async('nodebuffer'),
    });
    parts.push(imageTag(fileName, 'Imagem', 'jcs-imported-image'));
  };

  const paragraphs = xml.split(/<w:p[\s>]/);
  for (const paragraph of paragraphs) {
    const texts: string[] = [];
    for (const match of paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
      texts.push(decodeXmlEntities(match[1] ?? ''));
    }
    const line = texts.join('').replace(/\s+/g, ' ').trim();
    if (line) parts.push(`<p>${escapeHtml(line)}</p>`);

    const embeds = [
      ...[...paragraph.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)].map((m) => m[1]),
      ...[...paragraph.matchAll(/<v:imagedata\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]),
    ];
    for (const relId of embeds) {
      if (relId) await addImage(relId);
    }
  }

  for (const [relId] of rels) {
    if (!used.has(relId)) await addImage(relId);
  }

  const html = parts.join('') || '<p><br></p>';
  return {
    html: linkifyJcsReadRefsInHtml(html),
    assets,
    hasText: /<p>/i.test(html) && !/^<p><br><\/p>$/i.test(html),
    hasImages: assets.length > 0,
  };
}

export async function extractImportedDocument(
  fileName: string,
  buffer: Buffer,
): Promise<ImportedExtractResult> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.docx')) {
    return extractDocx(buffer);
  }

  if (lower.endsWith('.pdf')) {
    return extractPdf(buffer);
  }

  const text = await extractPautaFileText(fileName, buffer);
  const html = linkifyJcsReadRefsInHtml(textToHtml(text) || '<p><br></p>');
  return {
    html,
    assets: [],
    hasText: Boolean(text.trim()),
    hasImages: false,
  };
}
