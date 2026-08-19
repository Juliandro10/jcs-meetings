import fs from 'node:fs/promises';
import path from 'node:path';
import { buildChairmanPrepHtml } from '../shared/chairman-prep-html';
import { parseDiscourseThemeFromNote, sanitizeJcsReadFileSlug } from '../shared/jcs-read-discourse';
import { DISCOURSE_SCRIPT_TAG } from '../shared/discourse-script';
import {
  buildPreparedPartInnerHtml,
  preparedPartDisplayTitle,
  preparedPartDocumentId,
  preparedPartFileName,
} from '../shared/jcs-read-prepared-part';
import { linkifyBibleCitationsHtml } from '../src/lib/bible-citation';
import {
  buildJcsReadDocumentHtml,
  buildJcsReadOutlineHtml,
  buildJcsReadRichNoteHtml,
  isRichOutlineContent,
  outlineValueToBodyHtml,
} from '../shared/jcs-read-html';
import type {
  JcsReadCatalog,
  JcsReadExportResult,
  JcsReadWeekDocument,
  JcsReadWeekManifest,
} from '../shared/jcs-read-types';
import { JCS_READ_FORMAT } from '../shared/jcs-read-types';
import { formatUnknownError } from '../shared/format-unknown-error';
import { writeJcsReadZip } from './jcs-read-zip';
import { alignChairmanPrepRecordWithMwb } from './chairman-mwb-align';
import { enrichChairmanPrepBibleReading } from './chairman-prep-enrich';
import { loadChairmanPrep } from './chairman-prep-store';
import { resolvePreparedDiscourseOutline } from './jcs-read-discourse-resolve';
import { buildCbsStudyExportHtml } from './jcs-read-lfb-export';
import {
  bakePreparedDocumentHtml,
  rewriteMediaUrlsForExport,
  sanitizeMediaFileName,
} from './jcs-read-bake';
import { extractCbsStudyFromHtml } from './lfb-reader';
import { getDocumentHtml, getPreparedDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import { readJwpubMedia } from './jwpub-bundle';
import type { MeetingWeek } from './types';
import {
  documentPrepPrefix,
  getFieldValues,
  getHighlights,
  getNotes,
  getPublicTalkNote,
  type PrepNote,
} from './user-prep-store';

const CATALOG_FILE = 'catalog.json';

function weekFolderName(week: MeetingWeek) {
  return week.id.replace(/[^\w-]/g, '_');
}

function isDiscourseScriptNote(note: PrepNote) {
  return note.tags?.includes(DISCOURSE_SCRIPT_TAG) ?? false;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeTextFile(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

async function copyMediaAssets(params: {
  jwpubPath: string;
  assetsDir: string;
  html: string;
}) {
  const { html, mediaFiles } = rewriteMediaUrlsForExport(params.html);
  await ensureDir(params.assetsDir);

  for (const item of mediaFiles) {
    const dest = path.join(params.assetsDir, item.localName);
    try {
      await fs.access(dest);
      continue;
    } catch {
      /* not copied yet */
    }
    const media = await readJwpubMedia(params.jwpubPath, item.sourceName);
    if (!media) continue;
    await fs.writeFile(dest, media.buffer);
  }

  return html;
}

async function exportPublicationDocument(params: {
  cacheDir: string;
  userDataDir: string;
  pub: 'mwb' | 'w';
  issue: string;
  documentId: number;
  title: string;
  subtitle: string;
  assetsDir: string;
  outFile: string;
  includeNote?: (note: PrepNote) => boolean;
}) {
  const jwpubPath = await resolveCachedPubPath(params.cacheDir, params.pub, params.issue);
  if (!jwpubPath) {
    throw new Error(
      params.pub === 'mwb'
        ? 'Apostila não baixada. Baixe a publicação antes de exportar.'
        : 'Sentinela não baixada. Baixe a publicação antes de exportar.',
    );
  }

  const prepared = await getPreparedDocumentHtml(jwpubPath, params.documentId);
  const prefix = documentPrepPrefix(params.pub, params.issue, params.documentId);
  const fieldValues = await getFieldValues(params.userDataDir, prefix);
  const highlights = await getHighlights(
    params.userDataDir,
    params.pub,
    params.issue,
    params.documentId,
  );
  const allNotes = await getNotes(params.userDataDir, params.pub, params.issue, params.documentId);
  const notes = params.includeNote ? allNotes.filter(params.includeNote) : allNotes;

  let bodyHtml = bakePreparedDocumentHtml({
    html: prepared.html,
    pub: params.pub,
    issue: params.issue,
    documentId: params.documentId,
    fieldValues,
    highlights,
  });

  bodyHtml = await copyMediaAssets({
    jwpubPath,
    assetsDir: params.assetsDir,
    html: bodyHtml,
  });

  const html = buildJcsReadDocumentHtml({
    title: params.title,
    subtitle: params.subtitle,
    bodyHtml,
    publicationCss: prepared.publicationCss,
    notes: notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      anchorText: note.anchorText,
      tags: note.tags,
    })),
  });

  await writeTextFile(params.outFile, html);
}

async function exportPreparedPartDocuments(params: {
  userDataDir: string;
  pub: 'mwb';
  issue: string;
  documentId: number;
  week: MeetingWeek;
  weekDir: string;
  noteIds?: string[];
}): Promise<JcsReadWeekDocument[]> {
  const allNotes = await getNotes(
    params.userDataDir,
    params.pub,
    params.issue,
    params.documentId,
  );
  let notes = allNotes.filter(isDiscourseScriptNote);
  if (params.noteIds) {
    const selected = new Set(params.noteIds);
    notes = notes.filter((note) => selected.has(note.id));
  }
  if (notes.length === 0) return [];

  const linkifySegment = (text: string) => linkifyBibleCitationsHtml(text, 'all');
  const documents: JcsReadWeekDocument[] = [];

  for (const note of notes) {
    const fileName = preparedPartFileName(note);
    const docId = preparedPartDocumentId(note.id);
    const title = preparedPartDisplayTitle(note.title || 'Roteiro');
    const outlineHtml = buildPreparedPartInnerHtml(note.body, linkifySegment);
    const html = buildJcsReadOutlineHtml({
      title,
      subtitle: `${params.week.label} · ${params.week.bibleReading}`,
      outlineHtml,
    });

    await writeTextFile(path.join(params.weekDir, fileName), html);
    documents.push({
      id: docId,
      kind: 'prepared-part',
      title,
      file: fileName,
    });
  }

  return documents;
}

async function removeLegacyPreparedPartsExport(weekDir: string) {
  const legacyFile = path.join(weekDir, 'prepared-parts.html');
  try {
    await fs.unlink(legacyFile);
  } catch {
    /* already removed */
  }
}

async function mergePreparedPartDocuments(params: {
  weekDir: string;
  week: MeetingWeek;
  newDocuments: JcsReadWeekDocument[];
  removeOtherPreparedParts?: boolean;
}) {
  const manifestPath = path.join(params.weekDir, 'week.json');
  let manifest: JcsReadWeekManifest;

  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    manifest = JSON.parse(raw) as JcsReadWeekManifest;
  } catch {
    manifest = {
      format: JCS_READ_FORMAT,
      weekId: params.week.id,
      label: params.week.label,
      bibleReading: params.week.bibleReading,
      dateIso: params.week.dateIso,
      exportedAt: new Date().toISOString(),
      documents: [],
    };
  }

  manifest.weekId = params.week.id;
  manifest.label = params.week.label;
  manifest.bibleReading = params.week.bibleReading;
  manifest.dateIso = params.week.dateIso;
  manifest.exportedAt = new Date().toISOString();
  manifest.format = JCS_READ_FORMAT;

  manifest.documents = manifest.documents.filter(
    (doc) => doc.id !== 'prepared-parts' && doc.kind !== 'prepared-parts',
  );

  if (params.removeOtherPreparedParts) {
    const keepIds = new Set(params.newDocuments.map((doc) => doc.id));
    manifest.documents = manifest.documents.filter(
      (doc) => doc.kind !== 'prepared-part' || keepIds.has(doc.id),
    );
  }

  for (const doc of params.newDocuments) {
    const index = manifest.documents.findIndex((item) => item.id === doc.id);
    if (index >= 0) {
      manifest.documents[index] = doc;
    } else {
      manifest.documents.push(doc);
    }
  }

  await removeLegacyPreparedPartsExport(params.weekDir);
  await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function exportPreparedPartForJcsRead(params: {
  exportRoot: string;
  userDataDir: string;
  week: MeetingWeek;
  note: PrepNote;
}): Promise<JcsReadExportResult> {
  try {
    if (!params.week.mwbIssue || !params.week.mwbDocumentId) {
      return { ok: false, error: 'Baixe a apostila desta semana antes de exportar o roteiro.' };
    }

    const folder = weekFolderName(params.week);
    const weekDir = path.join(params.exportRoot, 'weeks', folder);
    await ensureDir(weekDir);

    const documents = await exportPreparedPartDocuments({
      userDataDir: params.userDataDir,
      pub: 'mwb',
      issue: params.week.mwbIssue,
      documentId: params.week.mwbDocumentId,
      week: params.week,
      weekDir,
      noteIds: [params.note.id],
    });

    if (documents.length === 0) {
      return { ok: false, error: 'Roteiro não encontrado para exportação.' };
    }

    const manifest = await mergePreparedPartDocuments({
      weekDir,
      week: params.week,
      newDocuments: documents,
    });

    await upsertCatalog(params.exportRoot, params.week, folder);
    const zipPath = await writeJcsReadZip(params.exportRoot);

    return {
      ok: true,
      folderPath: weekDir,
      zipPath,
      weekId: params.week.id,
      documentCount: manifest.documents.length,
    };
  } catch (err) {
    console.error('[exportPreparedPartForJcsRead]', err);
    return { ok: false, error: formatUnknownError(err, 'Erro ao exportar roteiro para tablet') };
  }
}

const ELDER_OUTLINES_FOLDER = 'esbocos';
const ELDER_OUTLINES_WEEK_ID = 'elder-outlines';

function elderOutlinesCatalogWeek(): MeetingWeek {
  return {
    id: ELDER_OUTLINES_WEEK_ID,
    dateIso: '0000-01-01',
    label: 'Esboços',
    dateRangeCaps: '',
    bibleReading: '',
    watchtowerTitle: '',
    isCurrentWeek: false,
  };
}

export async function exportElderOutlineForJcsRead(params: {
  exportRoot: string;
  title: string;
  pub: string;
  pubLabel: string;
  documentId: number;
  preparedName?: string;
  value: string;
}): Promise<JcsReadExportResult> {
  try {
    const value = params.value.trim();
    if (!value) {
      return { ok: false, error: 'Não há conteúdo no esboço para exportar.' };
    }

    const week = elderOutlinesCatalogWeek();
    const weekDir = path.join(params.exportRoot, 'weeks', ELDER_OUTLINES_FOLDER);
    await ensureDir(weekDir);

    const displayTitle = (params.preparedName ?? params.title).trim() || params.title;
    const slug = sanitizeJcsReadFileSlug(`outline-${params.pub}-${displayTitle}`) || `outline-${params.documentId}`;
    const fileName = `${slug}-${params.documentId}.html`;
    const docId = `discourse-outline-${params.pub.toLowerCase()}-${params.documentId}`;
    const html = buildJcsReadOutlineHtml({
      title: `Esboço — ${displayTitle}`,
      subtitle: params.pubLabel,
      outlineHtml: outlineValueToBodyHtml(value),
    });

    await writeTextFile(path.join(weekDir, fileName), html);

    const document: JcsReadWeekDocument = {
      id: docId,
      kind: 'discourse-outline',
      title: displayTitle,
      file: fileName,
    };

    const manifest = await mergePreparedPartDocuments({
      weekDir,
      week,
      newDocuments: [document],
    });
    await upsertCatalog(params.exportRoot, week, ELDER_OUTLINES_FOLDER);
    const zipPath = await writeJcsReadZip(params.exportRoot);

    return {
      ok: true,
      folderPath: weekDir,
      zipPath,
      weekId: week.id,
      documentCount: manifest.documents.length,
    };
  } catch (err) {
    console.error('[exportElderOutlineForJcsRead]', err);
    return { ok: false, error: formatUnknownError(err, 'Erro ao exportar esboço para tablet') };
  }
}

async function upsertCatalog(exportRoot: string, week: MeetingWeek, folder: string) {
  const catalogPath = path.join(exportRoot, CATALOG_FILE);
  let catalog: JcsReadCatalog = {
    format: JCS_READ_FORMAT,
    updatedAt: new Date().toISOString(),
    weeks: [],
  };

  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    catalog = JSON.parse(raw) as JcsReadCatalog;
  } catch {
    /* fresh catalog */
  }

  const exportedAt = new Date().toISOString();
  const entry = {
    weekId: week.id,
    label: week.label,
    bibleReading: week.bibleReading,
    dateIso: week.dateIso,
    folder,
    exportedAt,
  };

  catalog.weeks = catalog.weeks.filter((item) => item.weekId !== week.id);
  catalog.weeks.push(entry);
  catalog.weeks.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  catalog.updatedAt = exportedAt;
  catalog.format = JCS_READ_FORMAT;

  await writeTextFile(catalogPath, JSON.stringify(catalog, null, 2));
}

export async function exportWeekForJcsRead(params: {
  exportRoot: string;
  cacheDir: string;
  userDataRoot: string;
  userDataDir: string;
  week: MeetingWeek;
  preparedPartNoteIds?: string[];
}): Promise<JcsReadExportResult> {
  try {
    const folder = weekFolderName(params.week);
    const weekDir = path.join(params.exportRoot, 'weeks', folder);
    const assetsDir = path.join(weekDir, 'assets');
    await ensureDir(weekDir);

    const documents: JcsReadWeekDocument[] = [];
    const exportedAt = new Date().toISOString();
    const warnings: string[] = [];

    if (params.week.mwbDownloaded && params.week.mwbDocumentId && params.week.mwbIssue) {
      await exportPublicationDocument({
        cacheDir: params.cacheDir,
        userDataDir: params.userDataDir,
        pub: 'mwb',
        issue: params.week.mwbIssue,
        documentId: params.week.mwbDocumentId,
        title: 'Apostila — Vida e Ministério',
        subtitle: `${params.week.label} · ${params.week.bibleReading}`,
        assetsDir,
        outFile: path.join(weekDir, 'mwb.html'),
        includeNote: (note) => !isDiscourseScriptNote(note),
      });
      documents.push({
        id: 'mwb',
        kind: 'mwb',
        title: params.week.label,
        file: 'mwb.html',
      });

      const preparedPartDocs = await exportPreparedPartDocuments({
        userDataDir: params.userDataDir,
        pub: 'mwb',
        issue: params.week.mwbIssue,
        documentId: params.week.mwbDocumentId,
        week: params.week,
        weekDir,
        noteIds: params.preparedPartNoteIds,
      });
      documents.push(...preparedPartDocs);
      await removeLegacyPreparedPartsExport(weekDir);

      try {
        const mwbPath = await resolveCachedPubPath(params.cacheDir, 'mwb', params.week.mwbIssue);
        if (mwbPath) {
          const mwbHtml = await getDocumentHtml(mwbPath, params.week.mwbDocumentId);
          const cbsStudy = extractCbsStudyFromHtml(mwbHtml);
          if (cbsStudy?.href) {
            const cbsHtml = await buildCbsStudyExportHtml({
              cacheDir: params.cacheDir,
              userDataDir: params.userDataDir,
              href: cbsStudy.href,
              linkLabel: cbsStudy.linkLabel,
              weekLabel: params.week.label,
              assetsDir,
              pub: cbsStudy.pub,
            });
            if (cbsHtml) {
              await writeTextFile(path.join(weekDir, 'cbs.html'), cbsHtml);
              documents.push({
                id: 'cbs',
                kind: 'cbs',
                title: cbsStudy.linkLabel || 'Estudo de congregação',
                file: 'cbs.html',
              });
            } else {
              const bookLabel =
                cbsStudy.pub === 'wcg'
                  ? 'Ande Corajosamente com Deus'
                  : 'Aprenda com as Histórias da Bíblia';
              warnings.push(`Estudo de congregação: baixe o livro ${bookLabel} e prepare o capítulo.`);
            }
          }
        }
      } catch {
        warnings.push('Não foi possível exportar o estudo de congregação desta semana.');
      }
    }

    if (params.week.wDownloaded && params.week.wDocumentId && params.week.wIssue) {
      await exportPublicationDocument({
        cacheDir: params.cacheDir,
        userDataDir: params.userDataDir,
        pub: 'w',
        issue: params.week.wIssue,
        documentId: params.week.wDocumentId,
        title: 'Estudo de A Sentinela',
        subtitle: params.week.watchtowerTitle,
        assetsDir,
        outFile: path.join(weekDir, 'w.html'),
      });
      documents.push({
        id: 'w',
        kind: 'w',
        title: 'Sentinela',
        file: 'w.html',
      });
    }

    const publicTalkBody = await getPublicTalkNote(params.userDataDir, params.week.id);
    if (publicTalkBody.trim()) {
      const html = buildJcsReadRichNoteHtml({
        title: 'Discurso público — preparação',
        subtitle: params.week.label,
        body: publicTalkBody,
      });
      await writeTextFile(path.join(weekDir, 'public-talk.html'), html);
      documents.push({
        id: 'public-talk',
        kind: 'public-talk',
        title: 'Discurso público',
        file: 'public-talk.html',
      });
    }

    const { themeNumber, themeTitle } = parseDiscourseThemeFromNote(publicTalkBody);
    if (themeNumber && themeTitle) {
      const preparedOutline = await resolvePreparedDiscourseOutline({
        cacheDir: params.cacheDir,
        userDataDir: params.userDataDir,
        themeNumber,
        themeTitle,
      });
      if (preparedOutline?.value?.trim()) {
        const outlineTitle = `${themeNumber}. ${themeTitle}`;
        const slug = sanitizeJcsReadFileSlug(`outline-${themeNumber}-${themeTitle}`) || `outline-${themeNumber}`;
        const outlineFile = `${slug}.html`;
        const html = buildJcsReadOutlineHtml({
          title: `Esboço — ${outlineTitle}`,
          subtitle: preparedOutline.name?.trim() || params.week.label,
          outlineHtml: outlineValueToBodyHtml(preparedOutline.value),
        });
        await writeTextFile(path.join(weekDir, outlineFile), html);
        documents.push({
          id: `discourse-outline-${themeNumber}`,
          kind: 'discourse-outline',
          title: `Esboço ${themeNumber}`,
          file: outlineFile,
        });
      }
    }

    const chairmanRaw = await loadChairmanPrep(params.userDataRoot, params.week.id);
    let chairman = chairmanRaw
      ? await alignChairmanPrepRecordWithMwb(
          params.cacheDir,
          params.userDataRoot,
          params.week.id,
          chairmanRaw,
        )
      : null;
    const shouldExportChairman =
      chairman &&
      (Boolean(chairman.content) ||
        chairman.assignments.length > 0 ||
        Boolean(chairman.chairmanName?.trim()));
    if (shouldExportChairman) {
      try {
        chairman = await enrichChairmanPrepBibleReading(params.cacheDir, params.week, chairman);
      } catch (err) {
        console.warn('[exportWeekForJcsRead] enrich chairman skipped', err);
        warnings.push(
          'Folha do presidente exportada sem alguns links automáticos (cânticos/leitura).',
        );
      }
      const html = buildChairmanPrepHtml(chairman, { tablet: true });
      await writeTextFile(path.join(weekDir, 'chairman.html'), html);
      documents.push({
        id: 'chairman',
        kind: 'chairman',
        title: 'Folha do presidente',
        file: 'chairman.html',
      });
    }

    if (documents.length === 0) {
      return {
        ok: false,
        error: 'Nada para exportar. Baixe apostila/sentinela ou adicione anotações.',
      };
    }

    const weekManifest: JcsReadWeekManifest = {
      format: JCS_READ_FORMAT,
      weekId: params.week.id,
      label: params.week.label,
      bibleReading: params.week.bibleReading,
      dateIso: params.week.dateIso,
      exportedAt,
      documents,
    };

    await writeTextFile(path.join(weekDir, 'week.json'), JSON.stringify(weekManifest, null, 2));
    await upsertCatalog(params.exportRoot, params.week, folder);

    const zipPath = await writeJcsReadZip(params.exportRoot);

    return {
      ok: true,
      folderPath: weekDir,
      zipPath,
      weekId: params.week.id,
      documentCount: documents.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (err) {
    console.error('[exportWeekForJcsRead]', err);
    const message = formatUnknownError(err, 'Erro ao exportar para tablet');
    return { ok: false, error: message };
  }
}

export { sanitizeMediaFileName };
