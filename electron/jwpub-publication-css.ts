import type JSZip from 'jszip';
import type { Database } from 'sql.js';
import type { JwpubBundle } from './jwpub-bundle';
import { buildJcsMediaUrl, rewriteJwpubMediaUrls } from './jwpub-bundle';

/** Largura lógica de layout das publicações JW (px). */
const JW_LAYOUT_WIDTH = 600;

const publicationCssCache = new Map<string, string>();

/** CSS de fallback — livros/apostilas sem folha .css no .jwpub (ex.: lfb). */
export const JW_PUB_FIGURE_FALLBACK_CSS = `
.jwpub-content figure {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
.jwpub-content figure img {
  max-width: 100%;
  height: auto;
  display: block;
}
/* div wrapper — padrão MEPS do livro lfb */
.jwpub-content div.north_center,
.jwpub-content div.south_center {
  clear: both;
  width: 100%;
  max-width: 100%;
  text-align: center;
  float: none;
  margin: 0.75em 0;
}
.jwpub-content div.east_right,
.jwpub-content div.east_right.half {
  float: right;
  clear: right;
  width: 48%;
  max-width: 48%;
  margin: 0 0 0.75em 0.75em;
}
.jwpub-content div.west_left,
.jwpub-content div.west_left.half {
  float: left;
  clear: left;
  width: 48%;
  max-width: 48%;
  margin: 0 0.75em 0.75em 0;
}
.jwpub-content div.north_center img,
.jwpub-content div.south_center img,
.jwpub-content div.east_right img,
.jwpub-content div.west_left img {
  width: 100%;
  max-width: 100%;
  height: auto;
  float: none;
  margin: 0;
}
/* img com classe de layout sem wrapper (apostila / trechos) */
.jwpub-content img.north_center,
.jwpub-content img.south_center {
  display: block;
  clear: both;
  width: 100%;
  max-width: 100%;
  height: auto;
  margin: 0.75em auto;
  float: none;
}
.jwpub-content img.east_right,
.jwpub-content img.east_right.half {
  float: right;
  clear: right;
  width: 48%;
  max-width: 48%;
  height: auto;
  margin: 0 0 0.75em 0.75em;
}
.jwpub-content img.west_left,
.jwpub-content img.west_left.half {
  float: left;
  clear: left;
  width: 48%;
  max-width: 48%;
  height: auto;
  margin: 0 0.75em 0.75em 0;
}
/* figure.* — publicações mais antigas */
.jwpub-content figure.north {
  clear: both;
  width: 100%;
  max-width: 100%;
  text-align: center;
  float: none;
}
.jwpub-content figure.north img {
  width: auto;
  max-width: 100%;
}
.jwpub-content figure.south,
.jwpub-content figure.east {
  float: right;
  width: 48%;
  max-width: 48%;
  margin: 0 0 0.75em 0.75em;
  clear: right;
}
.jwpub-content figure.west {
  float: left;
  width: 48%;
  max-width: 48%;
  margin: 0 0.75em 0.75em 0;
  clear: left;
}
.jwpub-content figure.south img,
.jwpub-content figure.west img,
.jwpub-content figure.east img {
  width: 100%;
  max-width: 100%;
  height: auto;
}
.jwpub-content figure.thumbnail,
.jwpub-content figure.thmb,
.jwpub-content figure.small {
  width: 36%;
  max-width: 36%;
}
.jwpub-content figure.fullBleed,
.jwpub-content figure.fullPage,
.jwpub-content figure.fullSpread,
.jwpub-content img.dc-bleedToArticleEdge {
  width: 100%;
  max-width: 100%;
  float: none;
  clear: both;
  text-align: center;
}
.jwpub-content figcaption,
.jwpub-content figure caption,
.jwpub-content .figcaption {
  display: block;
  font-size: 0.88em;
  line-height: 1.45;
  text-align: center;
  margin-top: 0.35em;
}
.jwpub-content .bodyTxt::after,
.jwpub-content .pub::after,
.jwpub-content .section::after,
.jwpub-content .pGroup::after {
  content: "";
  display: table;
  clear: both;
}
`.trim();

export type PreparedJwpubDocument = {
  html: string;
  publicationCss: string;
};

function rewriteCssMediaUrls(css: string, pub: string, issue: string, lang: string) {
  return css
    .replace(/jwpub-media:\/\/([^)"'\s]+)/g, (_match, fileName: string) =>
      buildJcsMediaUrl(pub, lang, issue, decodeURIComponent(fileName)),
    )
    .replace(/url\(\s*["']?jwpub-media:\/\/([^)"'\s]+)["']?\s*\)/gi, (_match, fileName: string) =>
      `url("${buildJcsMediaUrl(pub, lang, issue, decodeURIComponent(fileName))}")`,
    );
}

function scopeCssToJwpubContent(css: string) {
  const trimmed = css.trim();
  if (!trimmed) return '';
  if (trimmed.includes('.jwpub-content')) return trimmed;
  return trimmed.replace(/(^|\})([^{@/][^{]*)\{/g, (_match, prefix, selector: string) => {
    const scoped = selector
      .split(',')
      .map((part) => {
        const s = part.trim();
        if (!s || s.startsWith('@') || s.startsWith('.jwpub-content')) return s;
        return `.jwpub-content ${s}`;
      })
      .join(', ');
    return `${prefix}${scoped}{`;
  });
}

async function readCssFromZip(inner: JSZip, fileName: string) {
  const file = inner.file(fileName) ?? inner.file(decodeURIComponent(fileName));
  if (!file) return null;
  try {
    return await file.async('string');
  } catch {
    return null;
  }
}

async function loadZipStylesheets(bundle: JwpubBundle) {
  const cssNames = Object.keys(bundle.inner.files)
    .filter((name) => !name.endsWith('/') && /\.css$/i.test(name))
    .sort();

  const parts: string[] = [];
  for (const name of cssNames) {
    const raw = await readCssFromZip(bundle.inner, name);
    if (raw) {
      parts.push(rewriteCssMediaUrls(raw, bundle.pub, bundle.issue, bundle.lang));
    }
  }
  return parts.join('\n\n');
}

async function loadLinkedStylesheets(bundle: JwpubBundle, html: string) {
  const hrefs = [
    ...html.matchAll(/<link[^>]+href=["']jwpub-media:\/\/([^"']+\.css)["']/gi),
    ...html.matchAll(/href=["']jwpub-media:\/\/([^"']+\.css)["']/gi),
  ].map((match) => match[1]);

  const unique = [...new Set(hrefs)];
  const parts: string[] = [];
  for (const href of unique) {
    const raw = await readCssFromZip(bundle.inner, href);
    if (raw) {
      parts.push(rewriteCssMediaUrls(raw, bundle.pub, bundle.issue, bundle.lang));
    }
  }
  return parts.join('\n\n');
}

function extractInlineStyles(html: string) {
  const styles: string[] = [];
  const without = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_full, css: string) => {
    if (css?.trim()) styles.push(css.trim());
    return '';
  });
  return { html: without, css: styles.join('\n\n') };
}

function stripDocumentShell(html: string) {
  let work = html
    .replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');

  const bodyMatch = work.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) return bodyMatch[1].trim();

  work = work
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  return work.trim();
}

function loadMultimediaDimensions(db: Database) {
  const map = new Map<string, { width: number; height: number }>();
  try {
    const probe = db.exec('SELECT * FROM Multimedia LIMIT 1')[0];
    const cols = probe?.columns ?? [];
    if (!cols.includes('Width') || !cols.includes('Height') || !cols.includes('FilePath')) {
      return map;
    }

    const rows =
      db.exec('SELECT FilePath, Width, Height FROM Multimedia WHERE Width > 0 AND Height > 0')[0]
        ?.values ?? [];

    for (const row of rows) {
      const filePath = String(row[0] ?? '');
      const width = Number(row[1]);
      const height = Number(row[2]);
      if (!filePath || !Number.isFinite(width) || !Number.isFinite(height)) continue;
      map.set(filePath, { width, height });
      map.set(filePath.split('/').pop() ?? filePath, { width, height });
    }
  } catch {
    return map;
  }
  return map;
}

function findMediaDimensions(
  map: Map<string, { width: number; height: number }>,
  src: string,
) {
  const decoded = decodeURIComponent(src);
  const fileName = decoded.split('/').pop() ?? decoded;
  for (const key of [decoded, fileName]) {
    const direct = map.get(key);
    if (direct) return direct;
  }
  for (const [key, value] of map.entries()) {
    if (key.endsWith(fileName) || fileName.endsWith(key)) return value;
  }
  return null;
}

function hasLayoutImageClass(attrs: string) {
  return /\b(?:north|south|east|west)_(?:center|left|right)\b|\b(?:north|south|east|west)\b|\bhalf\b|\bthird\b|\bdc-bleedToArticleEdge\b/i.test(
    attrs,
  );
}

function enrichImagesFromMultimedia(html: string, db: Database) {
  const dimensions = loadMultimediaDimensions(db);
  if (dimensions.size === 0) return html;

  return html.replace(/<img\b([^>]*?)>/gi, (full, attrs: string) => {
    if (/\bwidth\s*=/i.test(attrs)) return full;
    if (hasLayoutImageClass(attrs)) return full;
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) return full;

    const dims = findMediaDimensions(dimensions, srcMatch[1]);
    if (!dims) return full;

    let width = dims.width;
    let height = dims.height;
    if (width > JW_LAYOUT_WIDTH) {
      height = Math.round(height * (JW_LAYOUT_WIDTH / width));
      width = JW_LAYOUT_WIDTH;
    }

    return `<img${attrs} width="${width}" height="${height}">`;
  });
}

export async function prepareJwpubDocument(
  bundle: JwpubBundle,
  rawHtml: string,
): Promise<PreparedJwpubDocument> {
  const linkedCss = await loadLinkedStylesheets(bundle, rawHtml);
  const { html: withoutInline, css: inlineFromDoc } = extractInlineStyles(rawHtml);
  const bodyHtml = stripDocumentShell(withoutInline);
  const htmlWithMedia = rewriteJwpubMediaUrls(bodyHtml, bundle.pub, bundle.issue, bundle.lang);

  const zipCss = publicationCssCache.get(bundle.jwpubPath) ?? '';
  if (!zipCss) {
    const loadedZipCss = await loadZipStylesheets(bundle);
    if (loadedZipCss) {
      publicationCssCache.set(bundle.jwpubPath, scopeCssToJwpubContent(loadedZipCss));
    }
  }

  const cached = publicationCssCache.get(bundle.jwpubPath) ?? '';
  const combined = [cached, linkedCss, inlineFromDoc].filter(Boolean).join('\n\n');
  const scoped = combined ? scopeCssToJwpubContent(combined) : '';
  const publicationCss = scoped || JW_PUB_FIGURE_FALLBACK_CSS;

  const html = enrichImagesFromMultimedia(htmlWithMedia, bundle.db);

  return { html, publicationCss };
}

export function clearPublicationCssCache() {
  publicationCssCache.clear();
}
