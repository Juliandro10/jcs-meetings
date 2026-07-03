import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import initSqlJs, { type Database } from 'sql.js';

const require = createRequire(import.meta.url);
const CATALOG_MANIFEST_URL = 'https://app.jw-cdn.org/catalogs/publications/v4/manifest.json';
const AKAMAI_COVER_BASE = 'https://assetsnffrgf-a.akamaihd.net/assets/m';

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

function coverUrlFromImageFragment(pub: string, fragment?: string | null) {
  if (!fragment || pub.startsWith('T-')) return undefined;
  const match = fragment.match(/(\d+)_([a-z]+)_sqr-/i);
  if (!match) return undefined;
  const [, assetId, variant] = match;
  if (variant !== 'univ') return undefined;
  return `${AKAMAI_COVER_BASE}/${assetId}/${variant}/art/${assetId}_${variant}_sqr_xl.jpg`;
}

function publicationSubtitle(pub: string) {
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
