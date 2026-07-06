import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs, { type Database } from 'sql.js';
import { getJwpubCoverUrl } from './jwpub-bundle';
import { downloadJwpub, isPubCached } from './jw-download';
import { standardizeJwpubCacheDir } from './jwpub-cache-normalize';
import { resolveCachedPubPath } from './jwpub-reader';

const require = createRequire(import.meta.url);
const CATALOG_MANIFEST_URL = 'https://app.jw-cdn.org/catalogs/publications/v4/manifest.json';
const CATALOG_IMAGE_BASE = 'https://app.jw-cdn.org/catalogs/publications/v4/images/';
const AKAMAI_COVER_BASE = 'https://assetsnffrgf-a.akamaihd.net/assets/m';
const JW_CDN_IMAGE_BASE = 'https://b.jw-cdn.org';
const JWPUB_COVER_DOWNLOAD_CONCURRENCY = 4;
const PERIODICAL_ARCHIVE_LIMIT = 120;

/** MepsLanguageId for jw.org lang codes used by JCS (expand as needed). */
const MEPS_LANGUAGE_IDS: Record<string, number> = {
  T: 5,
  E: 0,
};

/** JW Library Teaching Toolbox — publication order (after videos). */
const TEACHING_KIT_PUB_SYMBOLS = [
  'lff',
  'll',
  'lffi',
  'T-ftr',
  'T-fam',
  'T-god',
  'T-pry',
  'T-jss',
  'T-kng',
  'T-sfr',
  'T-dth',
  'T-rlg',
] as const;

export type CatalogPublicationCard = {
  pub: string;
  issue: string;
  title: string;
  cardTitle: string;
  subtitle?: string;
  imageUrl?: string;
  sortOrder: number;
};

export type LibraryCategoryId =
  | 'books'
  | 'brochures'
  | 'tracts'
  | 'watchtower'
  | 'awake'
  | 'workbooks';

export type LibraryPublicationSection = 'current' | 'archive' | 'yearbooks';

export type LibraryPublicationCard = CatalogPublicationCard & {
  id: string;
  downloaded: boolean;
  section: LibraryPublicationSection;
  year: number;
  imageFallbackUrls?: string[];
};

let sqlInit: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let catalogDbPromise: Promise<Database> | null = null;
let catalogVersion: string | null = null;

async function getSql() {
  if (!sqlInit) {
    sqlInit = await initSqlJs({
      locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
    });
  }
  return sqlInit;
}

function mepsLanguageId(lang: string) {
  return MEPS_LANGUAGE_IDS[lang] ?? MEPS_LANGUAGE_IDS.T;
}

const CATALOG_COVER_FRAGMENT_SUBQUERY = `
  (
    SELECT ia2.NameFragment
    FROM PublicationAsset pa2
    JOIN PublicationAssetImageMap m2 ON m2.PublicationAssetId = pa2.Id
    JOIN ImageAsset ia2 ON ia2.Id = m2.ImageAssetId
    WHERE pa2.PublicationId = p.Id
      AND (
        ia2.NameFragment LIKE '%600x600%'
        OR ia2.NameFragment LIKE '%1200x%'
        OR ia2.NameFragment LIKE '%400.jpg%'
        OR ia2.NameFragment LIKE '%280.jpg%'
        OR ia2.NameFragment LIKE '%_sqr-%'
        OR ia2.NameFragment LIKE '%_lsr-%'
        OR ia2.NameFragment LIKE '%_tile-%'
      )
    ORDER BY
      CASE
        WHEN ia2.NameFragment LIKE '%600x600%' THEN 0
        WHEN ia2.NameFragment LIKE '%1200x%' THEN 1
        WHEN ia2.NameFragment LIKE '%400.jpg%' THEN 2
        WHEN ia2.NameFragment LIKE '%280.jpg%' THEN 3
        WHEN ia2.NameFragment LIKE '%270x270%' THEN 4
        ELSE 5
      END,
      LENGTH(ia2.NameFragment) DESC
    LIMIT 1
  ) AS NameFragment
`;

function catalogSectionFlagsSubquery(includeYearbooks: boolean) {
  const yearbookClause = includeYearbooks
    ? `
  EXISTS (
    SELECT 1 FROM PublicationAttributeMap pam
    JOIN PublicationAttribute pa ON pa.Id = pam.PublicationAttributeId
    WHERE pam.PublicationId = p.Id AND pa.Name = 'Yearbook'
  ) AS IsYearbook,`
    : '0 AS IsYearbook,';

  return `
  ${yearbookClause}
  EXISTS (
    SELECT 1 FROM PublicationAttributeMap pam
    JOIN PublicationAttribute pa ON pa.Id = pam.PublicationAttributeId
    WHERE pam.PublicationId = p.Id AND pa.Name = 'Archive'
  ) AS IsArchive
  `;
}

function sqlFlagValue(value: string | number | Uint8Array | null | undefined) {
  return value === 1 || value === '1' || value === true;
}

function buildCoverUrlsFromImageFragment(fragment?: string | null) {
  if (!fragment) return { primary: undefined, fallbacks: [] as string[] };

  const normalized = fragment.replace(/^\//, '');
  const fallbacks: string[] = [];
  const addFallback = (url?: string) => {
    if (url && !fallbacks.includes(url)) fallbacks.push(url);
  };

  let primary: string | undefined;
  const akamaiMatch = normalized.match(/(\d+)_([a-z]+)_(sqr|lsr)-/i);
  if (akamaiMatch) {
    const [, assetId, variant, shape] = akamaiMatch;
    primary = `${AKAMAI_COVER_BASE}/${assetId}/${variant}/art/${assetId}_${variant}_${shape.toLowerCase()}_xl.jpg`;
  }

  if (normalized.startsWith('images/')) {
    addFallback(`${JW_CDN_IMAGE_BASE}/${normalized}`);
    if (/_tile-/i.test(normalized)) {
      addFallback(`${JW_CDN_IMAGE_BASE}/${normalized.replace(/-(\d+)x(\d+)(\.jpg)$/i, '-1200x1200$2')}`);
    }
    addFallback(`${CATALOG_IMAGE_BASE}${normalized}`);
  }

  if (!primary) {
    primary = fallbacks.shift();
  } else {
    const withoutPrimary = fallbacks.filter((url) => url !== primary);
    fallbacks.length = 0;
    fallbacks.push(...withoutPrimary);
  }

  return { primary, fallbacks };
}

function coverUrlFromImageFragment(_pub: string, fragment?: string | null) {
  return buildCoverUrlsFromImageFragment(fragment).primary;
}

function coverFallbackUrlsFromImageFragment(fragment?: string | null) {
  return buildCoverUrlsFromImageFragment(fragment).fallbacks;
}

const PT_MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export function formatPeriodicalIssueLabel(issue: string): string {
  const digits = normalizeCatalogIssue(issue).replace(/\D/g, '');
  if (digits.length < 6) return '';
  const year = digits.slice(0, 4);
  const month = Number(digits.slice(4, 6));
  if (month < 1 || month > 12) return '';
  return `${PT_MONTH_NAMES[month - 1]} de ${year}`;
}

function isPeriodicalLibraryCategory(categoryId: LibraryCategoryId) {
  return categoryId === 'watchtower' || categoryId === 'awake' || categoryId === 'workbooks';
}

function isPeriodicalIssueKey(issue: string) {
  const digits = normalizeCatalogIssue(issue).replace(/\D/g, '');
  return digits.length >= 6 && Number(digits.slice(0, 4)) >= 1950;
}

export function parsePublicationYear(pub: string, issue: string, dbYear?: number | string | null) {
  const parsedDbYear = Number(dbYear ?? 0);
  if (Number.isFinite(parsedDbYear) && parsedDbYear > 0) return parsedDbYear;

  const issueDigits = normalizeCatalogIssue(issue).replace(/\D/g, '');
  if (issueDigits.length >= 4) {
    const y = Number(issueDigits.slice(0, 4));
    if (y >= 1950 && y <= 2100) return y;
  }

  const ybMatch = pub.match(/^yb(\d{2})$/i);
  if (ybMatch) {
    const yy = Number(ybMatch[1]);
    return yy >= 70 ? 1900 + yy : 2000 + yy;
  }

  return 0;
}

function periodicalArchiveBeforeIssue() {
  const year = new Date().getFullYear() - 2;
  return year * 10000 + 100;
}

function classifyLibrarySection(
  categoryId: LibraryCategoryId,
  pub: string,
  year: number,
  issueTag: string | number,
  flags?: { isArchive?: boolean; isYearbook?: boolean },
): LibraryPublicationSection {
  if (categoryId === 'books') {
    if (flags?.isYearbook) return 'yearbooks';
    if (flags?.isArchive) return 'archive';
    return 'current';
  }
  if (categoryId === 'brochures') {
    return flags?.isArchive ? 'archive' : 'current';
  }
  if (categoryId === 'tracts') {
    return flags?.isArchive ? 'archive' : 'current';
  }
  if (categoryId === 'watchtower' || categoryId === 'awake' || categoryId === 'workbooks') {
    const issueNumber = Number(issueTag);
    if (Number.isFinite(issueNumber) && issueNumber > 0 && issueNumber < periodicalArchiveBeforeIssue()) {
      return 'archive';
    }
    if (year > 0 && year < new Date().getFullYear() - 2) {
      return 'archive';
    }
    return 'current';
  }
  return 'current';
}

const SECTION_SORT_ORDER: Record<LibraryPublicationSection, number> = {
  current: 0,
  archive: 1,
  yearbooks: 2,
};

function sortKeyTitle(title: string) {
  return title.replace(/^[\s'"“”‘’´`]+/u, '').trim();
}

function sortLibraryCards(cards: LibraryPublicationCard[]): LibraryPublicationCard[] {
  return [...cards].sort((a, b) => {
    const sectionDiff = SECTION_SORT_ORDER[a.section] - SECTION_SORT_ORDER[b.section];
    if (sectionDiff !== 0) return sectionDiff;

    if (a.section === 'yearbooks') {
      const yearDiff = b.year - a.year;
      if (yearDiff !== 0) return yearDiff;
    }

    if (isPeriodicalIssueKey(a.issue) && isPeriodicalIssueKey(b.issue)) {
      const issueDiff =
        Number(b.issue.replace(/\D/g, '')) - Number(a.issue.replace(/\D/g, ''));
      if (issueDiff !== 0) return issueDiff;
    }

    return sortKeyTitle(a.cardTitle).localeCompare(sortKeyTitle(b.cardTitle), 'pt-BR', {
      sensitivity: 'base',
    });
  });
}

function publicationNeedsJwpubCoverPrefetch(pub: string, imageUrl?: string) {
  if (pub.startsWith('T-')) return true;
  return !imageUrl;
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

export async function ensureJwpubCoverCache(
  cacheDir: string,
  lang: string,
  cards: Array<{ pub: string; issue: string; imageUrl?: string }>,
) {
  const toDownload = [];

  for (const card of cards) {
    if (await isPubCached(cacheDir, card.pub, card.issue, lang)) continue;
    if (!publicationNeedsJwpubCoverPrefetch(card.pub, card.imageUrl)) continue;
    toDownload.push(card);
  }

  if (toDownload.length === 0) return;

  await runWithConcurrency(toDownload, JWPUB_COVER_DOWNLOAD_CONCURRENCY, async (card) => {
    const result = await downloadJwpub({
      pub: card.pub,
      issue: card.issue,
      lang,
      cacheDir,
      skipStandardize: true,
    });
    if (!result.ok) {
      console.warn(`[JCS] Falha ao baixar capa de ${card.pub}:`, result.error);
    }
  });

  try {
    await standardizeJwpubCacheDir(cacheDir);
  } catch (err) {
    console.warn('[JCS] Falha ao padronizar cache após capas:', err);
  }
}

export async function resolvePublicationCoverUrl(
  cacheDir: string,
  lang: string,
  card: { pub: string; issue: string; imageUrl?: string },
): Promise<string | undefined> {
  const jwpubPath = await resolveCachedPubPath(cacheDir, card.pub, card.issue || undefined);
  if (jwpubPath) {
    const cover = await getJwpubCoverUrl(jwpubPath, card.pub, card.issue, lang);
    if (cover) return cover;
  }
  return card.imageUrl;
}

function publicationSubtitle(pub: string, categoryId?: LibraryCategoryId) {
  if (categoryId === 'books') return 'Livro';
  if (categoryId === 'brochures') return 'Brochura';
  if (categoryId === 'tracts' || pub.startsWith('T-')) return 'Folheto';
  if (categoryId === 'watchtower') return pub === 'wp' ? 'Sentinela (público)' : 'Sentinela (estudo)';
  if (categoryId === 'awake') return 'Despertai!';
  if (categoryId === 'workbooks') return 'Apostila';
  if (pub === 'lffi' || pub === 'lff' || pub === 'll') return 'Brochura';
  if (pub === 'g') return 'Revista';
  if (pub.startsWith('T-')) return 'Folheto';
  return undefined;
}

function isTractSymbol(pub: string) {
  return pub.startsWith('T-');
}

async function loadCatalogDatabase(catalogDir: string) {
  await fs.mkdir(catalogDir, { recursive: true });

  const manifestRes = await fetch(CATALOG_MANIFEST_URL);
  if (!manifestRes.ok) throw new Error('Não foi possível carregar o catálogo de publicações.');
  const manifest = (await manifestRes.json()) as { current?: string };
  const version = manifest.current;
  if (!version) throw new Error('Catálogo de publicações inválido.');

  const dbPath = path.join(catalogDir, `catalog-${version}.db`);
  const markerPath = path.join(catalogDir, 'catalog-version.txt');

  try {
    const cachedVersion = await fs.readFile(markerPath, 'utf8');
    if (cachedVersion.trim() === version) {
      const cachedDb = await fs.readFile(dbPath);
      const SQL = await getSql();
      catalogVersion = version;
      return new SQL.Database(cachedDb);
    }
  } catch {
    /* refresh catalog */
  }

  const gzRes = await fetch(`https://app.jw-cdn.org/catalogs/publications/v4/${version}/catalog.db.gz`);
  if (!gzRes.ok) throw new Error('Não foi possível baixar catalog.db.gz.');
  const dbBuffer = gunzipSync(Buffer.from(await gzRes.arrayBuffer()));
  await fs.writeFile(dbPath, dbBuffer);
  await fs.writeFile(markerPath, version, 'utf8');
  catalogVersion = version;

  const SQL = await getSql();
  return new SQL.Database(dbBuffer);
}

async function getCatalogDatabase(catalogDir: string) {
  if (!catalogDbPromise) {
    catalogDbPromise = loadCatalogDatabase(catalogDir);
  }
  return catalogDbPromise;
}

function queryPublicationCard(
  db: Database,
  mepsLangId: number,
  pub: string,
  issue: number,
  sortOrder: number,
): CatalogPublicationCard | null {
  const issueFilter =
    issue > 0
      ? `AND p.IssueTagNumber = ${issue}`
      : 'AND (p.IssueTagNumber = 0 OR p.IssueTagNumber IS NULL)';

  const rows = db.exec(`
    SELECT p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, ia.NameFragment
    FROM Publication p
    LEFT JOIN PublicationAsset pa ON pa.PublicationId = p.Id
    LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE p.MepsLanguageId = ${mepsLangId}
      AND p.KeySymbol = '${pub.replace(/'/g, "''")}'
      ${issueFilter}
      AND (ia.NameFragment IS NULL OR ia.NameFragment LIKE '%600x600%')
    ORDER BY p.Id
    LIMIT 1
  `)[0]?.values?.[0];

  if (!rows) return null;

  const [, issueTag, shortTitle, title, imageFragment] = rows.map(String);
  const cardTitle = isTractSymbol(pub) ? shortTitle : title;

  return {
    pub,
    issue: issueTag && issueTag !== '0' ? issueTag : '',
    title,
    cardTitle,
    subtitle: publicationSubtitle(pub),
    imageUrl: coverUrlFromImageFragment(pub, imageFragment),
    sortOrder,
  };
}

function queryTeachingKitAwakeIssue(db: Database, mepsLangId: number) {
  const row = db.exec(`
    SELECT p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, ia.NameFragment, ca.SortOrder
    FROM CuratedAsset ca
    JOIN PublicationAsset pa ON pa.Id = ca.PublicationAssetId
    JOIN Publication p ON p.Id = pa.PublicationId
    LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE ca.ListType = 2
      AND ca.SortOrder = 17
      AND p.MepsLanguageId = ${mepsLangId}
      AND p.KeySymbol = 'g'
      AND (ia.NameFragment IS NULL OR ia.NameFragment LIKE '%600x600%')
    LIMIT 1
  `)[0]?.values?.[0];

  if (!row) return null;

  const [, issueTag, shortTitle, title, imageFragment, sortOrder] = row.map(String);
  return {
    pub: 'g',
    issue: issueTag && issueTag !== '0' ? issueTag : '',
    title,
    cardTitle: shortTitle || title,
    subtitle: publicationSubtitle('g'),
    imageUrl: coverUrlFromImageFragment('g', imageFragment),
    sortOrder: Number(sortOrder),
  } satisfies CatalogPublicationCard;
}

export function normalizeCatalogIssue(issueTag: string | number | null | undefined) {
  const raw = String(issueTag ?? '').trim();
  if (!raw || raw === '0') return '';
  if (raw.length >= 8) return raw.slice(0, 6);
  if (raw.length > 6) return raw.slice(0, 6);
  return raw;
}

const LIBRARY_CATEGORY_QUERIES: Record<
  LibraryCategoryId,
  {
    where: string;
    orderBy: string;
    cardTitleFromShort?: boolean;
    periodical?: boolean;
    useCatalogSections?: boolean;
    yearbooksSection?: boolean;
    excludeExaminingScriptures?: boolean;
  }
> = {
  books: { where: 'p.PublicationTypeId = 2', orderBy: 'p.Title COLLATE NOCASE ASC', useCatalogSections: true },
  brochures: {
    where: 'p.PublicationTypeId = 4',
    orderBy: 'p.Title COLLATE NOCASE ASC',
    useCatalogSections: true,
    yearbooksSection: false,
    excludeExaminingScriptures: true,
  },
  tracts: {
    where: "p.KeySymbol LIKE 'T-%' AND p.PublicationTypeId = 10",
    orderBy: 'p.ShortTitle COLLATE NOCASE ASC',
    cardTitleFromShort: true,
    useCatalogSections: true,
    yearbooksSection: false,
  },
  watchtower: {
    where: "p.KeySymbol IN ('w', 'wp') AND p.PublicationTypeId = 14",
    orderBy: 'p.IssueTagNumber DESC',
    periodical: true,
  },
  awake: {
    where: "p.KeySymbol = 'g' AND p.PublicationTypeId = 13",
    orderBy: 'p.IssueTagNumber DESC',
    periodical: true,
  },
  workbooks: {
    where: "p.KeySymbol = 'mwb' AND p.PublicationTypeId = 30",
    orderBy: 'p.IssueTagNumber DESC',
    periodical: true,
  },
};

function queryLibraryCategoryRows(
  db: Database,
  mepsLangId: number,
  config: (typeof LIBRARY_CATEGORY_QUERIES)[LibraryCategoryId],
) {
  const sectionFlags = config.useCatalogSections
    ? `, ${catalogSectionFlagsSubquery(config.yearbooksSection !== false)}`
    : ', 0 AS IsYearbook, 0 AS IsArchive';

  const excludeExamine = config.excludeExaminingScriptures
    ? `
      AND NOT EXISTS (
        SELECT 1 FROM PublicationAttributeMap pam
        JOIN PublicationAttribute pa ON pa.Id = pam.PublicationAttributeId
        WHERE pam.PublicationId = p.Id AND pa.Name = 'Examining the Scriptures'
      )`
    : '';

  const select = `
    SELECT p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, p.Year, ${CATALOG_COVER_FRAGMENT_SUBQUERY}${sectionFlags}
    FROM Publication p
    WHERE p.MepsLanguageId = ${mepsLangId}
      AND ${config.where}${excludeExamine}
  `;

  if (!config.periodical) {
    return db.exec(`${select} ORDER BY ${config.orderBy}`)[0]?.values ?? [];
  }

  const archiveBefore = periodicalArchiveBeforeIssue();
  const current =
    db.exec(`${select} AND p.IssueTagNumber >= ${archiveBefore} ORDER BY p.IssueTagNumber DESC`)[0]
      ?.values ?? [];
  const archive =
    db.exec(
      `${select} AND p.IssueTagNumber < ${archiveBefore} ORDER BY p.IssueTagNumber DESC LIMIT ${PERIODICAL_ARCHIVE_LIMIT}`,
    )[0]?.values ?? [];

  return [...current, ...archive];
}

function rowToLibraryCard(
  categoryId: LibraryCategoryId,
  row: (string | number | Uint8Array)[],
  cardTitleFromShort: boolean,
  sortOrder: number,
): Omit<LibraryPublicationCard, 'downloaded'> | null {
  const [pub, issueTag, shortTitle, title, yearRaw, imageFragment] = row.map(String);
  if (!pub) return null;

  const issue = normalizeCatalogIssue(issueTag);
  let cardTitle = cardTitleFromShort ? shortTitle || title : title;
  if (isPeriodicalLibraryCategory(categoryId)) {
    const issueLabel = formatPeriodicalIssueLabel(issue);
    if (issueLabel) cardTitle = issueLabel;
  }
  if (!cardTitle.trim()) return null;

  const year = parsePublicationYear(pub, issue, yearRaw);
  const sectionFlags =
    row[6] !== undefined && row[7] !== undefined
      ? {
          isYearbook: sqlFlagValue(row[6]),
          isArchive: sqlFlagValue(row[7]),
        }
      : {
          isYearbook: /^syr|^yb/i.test(pub),
          isArchive: false,
        };
  const section = classifyLibrarySection(categoryId, pub, year, issueTag, sectionFlags);
  const coverUrls = buildCoverUrlsFromImageFragment(imageFragment);

  return {
    id: `${pub}_${issue || '0'}`,
    pub,
    issue,
    title,
    cardTitle,
    subtitle: publicationSubtitle(pub, categoryId),
    imageUrl: coverUrls.primary,
    imageFallbackUrls: coverUrls.fallbacks.length > 0 ? coverUrls.fallbacks : undefined,
    sortOrder,
    year,
    section,
  };
}

export async function fetchLibraryCategoryPublications(
  catalogDir: string,
  cacheDir: string,
  categoryId: LibraryCategoryId,
  lang = 'T',
): Promise<LibraryPublicationCard[]> {
  const db = await getCatalogDatabase(catalogDir);
  const config = LIBRARY_CATEGORY_QUERIES[categoryId];
  const mepsLangId = mepsLanguageId(lang);

  const rows = queryLibraryCategoryRows(db, mepsLangId, config);

  const seen = new Set<string>();
  const items: LibraryPublicationCard[] = [];

  for (const [index, row] of rows.entries()) {
    const card = rowToLibraryCard(categoryId, row, Boolean(config.cardTitleFromShort), index);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);

    const downloaded = await isPubCached(cacheDir, card.pub, card.issue, lang);
    const imageUrl = downloaded
      ? await resolvePublicationCoverUrl(cacheDir, lang, card)
      : card.imageUrl;

    items.push({
      ...card,
      imageUrl,
      imageFallbackUrls: downloaded ? undefined : card.imageFallbackUrls,
      downloaded,
    });
  }

  return sortLibraryCards(items);
}

export async function enrichLibraryDownloadedCovers(
  cacheDir: string,
  items: LibraryPublicationCard[],
  lang = 'T',
): Promise<LibraryPublicationCard[]> {
  const enriched: LibraryPublicationCard[] = [];
  for (const item of items) {
    const imageUrl = await resolvePublicationCoverUrl(cacheDir, lang, item);
    enriched.push({ ...item, imageUrl: imageUrl ?? item.imageUrl });
  }
  return enriched;
}

export async function lookupCatalogPublicationCard(
  catalogDir: string,
  pub: string,
  issue: string,
  lang = 'T',
): Promise<CatalogPublicationCard | null> {
  const db = await getCatalogDatabase(catalogDir);
  const mepsLangId = mepsLanguageId(lang);
  const issueTag = issue ? Number(`${issue}00`) : 0;
  const card = queryPublicationCard(db, mepsLangId, pub, issueTag, 0);
  if (card) return card;

  if (!issue) {
    return queryPublicationCard(db, mepsLangId, pub, 0, 0);
  }

  const rows =
    db.exec(`
    SELECT p.KeySymbol, p.IssueTagNumber, p.ShortTitle, p.Title, p.Year, ia.NameFragment,
      EXISTS (
        SELECT 1 FROM PublicationAttributeMap pam
        JOIN PublicationAttribute pa ON pa.Id = pam.PublicationAttributeId
        WHERE pam.PublicationId = p.Id AND pa.Name = 'Yearbook'
      ) AS IsYearbook,
      EXISTS (
        SELECT 1 FROM PublicationAttributeMap pam
        JOIN PublicationAttribute pa ON pa.Id = pam.PublicationAttributeId
        WHERE pam.PublicationId = p.Id AND pa.Name = 'Archive'
      ) AS IsArchive
    FROM Publication p
    LEFT JOIN PublicationAsset pa ON pa.PublicationId = p.Id
    LEFT JOIN PublicationAssetImageMap m ON m.PublicationAssetId = pa.Id
    LEFT JOIN ImageAsset ia ON ia.Id = m.ImageAssetId
    WHERE p.MepsLanguageId = ${mepsLangId}
      AND p.KeySymbol = '${pub.replace(/'/g, "''")}'
      AND CAST(p.IssueTagNumber AS TEXT) LIKE '${issue.replace(/'/g, "''")}%'
    LIMIT 1
  `)[0]?.values?.[0];

  if (!rows) return null;
  const mapped = rowToLibraryCard('books', rows, pub.startsWith('T-'), 0);
  if (!mapped) return null;
  const { id: _id, ...rest } = mapped;
  void _id;
  return rest;
}

export async function fetchTeachingKitPublicationCards(
  catalogDir: string,
  lang = 'T',
): Promise<CatalogPublicationCard[]> {
  const db = await getCatalogDatabase(catalogDir);
  const mepsLangId = mepsLanguageId(lang);
  const cards: CatalogPublicationCard[] = [];

  TEACHING_KIT_PUB_SYMBOLS.forEach((pub, index) => {
    const card = queryPublicationCard(db, mepsLangId, pub, 0, index);
    if (card) cards.push(card);
  });

  const awake = queryTeachingKitAwakeIssue(db, mepsLangId);
  if (awake) {
    awake.sortOrder = 3;
    cards.splice(3, 0, awake);
  }

  cards.forEach((card, index) => {
    card.sortOrder = index;
  });

  return cards;
}

export function resetPublicationCatalogCache() {
  catalogDbPromise = null;
  catalogVersion = null;
}
