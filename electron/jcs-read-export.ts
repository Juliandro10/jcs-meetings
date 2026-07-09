import fs from 'node:fs/promises';
import path from 'node:path';
import { buildChairmanPrepHtml } from '../shared/chairman-prep-html';
import { parseDiscourseThemeFromNote, sanitizeJcsReadFileSlug } from '../shared/jcs-read-discourse';
import { DISCOURSE_SCRIPT_TAG } from '../shared/discourse-script';
import { prepareDiscourseBodyHtml } from '../shared/discourse-manuscript-html';
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

async function exportPreparedPartsDocument(params: {
  userDataDir: string;
  pub: 'mwb';
  issue: string;
  documentId: number;
  weekLabel: string;
  outFile: string;
}) {
  const allNotes = await getNotes(
    params.userDataDir,
    params.pub,
    params.issue,
    params.documentId,
  );
  const notes = allNotes.filter(isDiscourseScriptNote);
  if (notes.length === 0) return false;

  const bodyHtml = notes
    .map((note) => {
      const rich = isRichOutlineContent(note.body)
        ? outlineValueToBodyHtml(note.body)
        : `<p>${escapeHtml(note.body).replace(/\n/g, '<br>')}</p>`;
      return `<section class="jcs-prepared-part">
  <h2>${escapeHtml(note.title || 'Roteiro')}</h2>
  <div class="jcs-outline-body">${prepareDiscourseBodyHtml(rich)}</div>
</section>`;
    })
    .join('\n');

  const html = buildJcsReadDocumentHtml({
    title: 'Partes preparadas',
    subtitle: params.weekLabel,
    bodyHtml,
  });

  await writeTextFile(params.outFile, html);
  return true;
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

      const hasPreparedParts = await exportPreparedPartsDocument({
        userDataDir: params.userDataDir,
        pub: 'mwb',
        issue: params.week.mwbIssue,
        documentId: params.week.mwbDocumentId,
        weekLabel: params.week.label,
        outFile: path.join(weekDir, 'prepared-parts.html'),
      });
      if (hasPreparedParts) {
        documents.push({
          id: 'prepared-parts',
          kind: 'prepared-parts',
          title: 'Partes preparadas',
          file: 'prepared-parts.html',
        });
      }

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
              warnings.push('Estudo de congregação: baixe o livro lfb e prepare as histórias.');
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
    if (chairman?.content) {
      chairman = await enrichChairmanPrepBibleReading(params.cacheDir, params.week, chairman);
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
