import fs from 'node:fs/promises';
import path from 'node:path';
import { linkifyBibleCitationsHtml } from '../src/lib/bible-citation';
import { buildJcsReadDocumentHtml } from '../shared/jcs-read-html';
import type {
  JcsReadCatalog,
  JcsReadExportResult,
  JcsReadWeekDocument,
  JcsReadWeekManifest,
} from '../shared/jcs-read-types';
import { JCS_READ_FORMAT } from '../shared/jcs-read-types';
import {
  preachingPresentationsForPoint,
  type PreachingTruthPresentation,
} from '../shared/preaching-truth-presentations';
import { formatUnknownError } from '../shared/format-unknown-error';
import { loadPreachingContent, type PreachingContent } from './preaching';
import type { FieldServiceConsiderationSuggestion, MeetingWeek } from './types';
import { getFieldServiceNote, getFieldServiceSuggestions } from './user-prep-store';
import { writeJcsReadZip } from './jcs-read-zip';

const PREACHING_DIR = 'preaching';
const PREACHING_CATALOG = path.join(PREACHING_DIR, 'catalog.json');
const PREACHING_WEEKS = path.join(PREACHING_DIR, 'weeks');

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

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeTextFile(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

async function upsertPreachingCatalog(exportRoot: string, week: MeetingWeek, folder: string) {
  const catalogPath = path.join(exportRoot, PREACHING_CATALOG);
  let catalog: JcsReadCatalog = {
    format: JCS_READ_FORMAT,
    updatedAt: new Date().toISOString(),
    weeks: [],
  };

  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    catalog = JSON.parse(raw) as JcsReadCatalog;
  } catch {
    /* fresh preaching catalog */
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

async function loadWeekManifest(weekDir: string, week: MeetingWeek): Promise<JcsReadWeekManifest> {
  const manifestPath = path.join(weekDir, 'week.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(raw) as JcsReadWeekManifest;
  } catch {
    return {
      format: JCS_READ_FORMAT,
      weekId: week.id,
      label: week.label,
      bibleReading: week.bibleReading,
      dateIso: week.dateIso,
      exportedAt: new Date().toISOString(),
      documents: [],
    };
  }
}

function buildPresentationCardHtml(presentation: PreachingTruthPresentation) {
  const scriptureHtml = linkifyBibleCitationsHtml(presentation.scriptureRef, 'all');
  const followUpLabel =
    presentation.followUp.kind === 'tract'
      ? presentation.followUp.label
      : presentation.followUp.label;

  return `<article class="jcs-note-card">
    <h3>${escapeHtml(presentation.title)}</h3>
    <p>${escapeHtml(presentation.opening)}</p>
    <p><strong>Texto bíblico:</strong> ${scriptureHtml}</p>
    <p><strong>Leitura com o morador:</strong> ${escapeHtml(presentation.readWithResident)}</p>
    <p><strong>Encaminhamento:</strong> ${escapeHtml(presentation.bridge)}</p>
    <p class="jcs-note-quote">Material sugerido: ${escapeHtml(followUpLabel)}</p>
  </article>`;
}

function buildPreachingPresentationsBody(content: PreachingContent) {
  const parts: string[] = [];

  if (content.introHtml) {
    parts.push(`<div class="jwpub-content">${content.introHtml}</div>`);
  }

  for (const topic of content.topics) {
    const pointItems = topic.points
      .map((point) => {
        const presentations = preachingPresentationsForPoint(point.number);
        const presentationsHtml =
          presentations.length > 0
            ? `<div class="jcs-preaching-presentations">
    <p class="jcs-preaching-presentations-label">Apresentações sugeridas</p>
    ${presentations.map(buildPresentationCardHtml).join('\n')}
  </div>`
            : '';

        return `<li>
    <div class="jwpub-content">${point.html}</div>
    ${presentationsHtml}
  </li>`;
      })
      .join('\n');

    parts.push(`<section class="jcs-preaching-topic">
  <h2>${escapeHtml(topic.title)}</h2>
  <ol class="jcs-preaching-points">${pointItems}</ol>
</section>`);
  }

  return parts.join('\n');
}

function buildPreachingPresentationsHtml(content: PreachingContent) {
  const bodyHtml = buildPreachingPresentationsBody(content);
  return buildJcsReadDocumentHtml({
    title: 'Apresentações',
    subtitle: 'Ame as Pessoas — Faça Discípulos',
    bodyHtml,
  });
}

function buildSuggestionCardHtml(item: FieldServiceConsiderationSuggestion) {
  const bodyHtml = linkifyBibleCitationsHtml(item.body, 'all');
  const encouragement = item.encouragement
    ? `<p class="jcs-field-service-encouragement">${escapeHtml(item.encouragement)}</p>`
    : '';
  const sources =
    item.sources.length > 0
      ? `<p class="jcs-note-quote">Fontes: ${escapeHtml(item.sources.join(' · '))}</p>`
      : '';

  return `<article class="jcs-note-card">
    <h3>${escapeHtml(item.title)}</h3>
    ${item.scripture ? `<p><strong>${escapeHtml(item.scripture)}</strong></p>` : ''}
    <div>${bodyHtml}</div>
    ${encouragement}
    ${sources}
  </article>`;
}

function buildFieldServiceHtml(params: {
  week: MeetingWeek;
  suggestions: FieldServiceConsiderationSuggestion[];
  draft: string;
  generatedAt?: string;
}) {
  const sections: string[] = [];

  if (params.suggestions.length > 0) {
    sections.push(`<section>
  <h2>Sugestões</h2>
  ${params.generatedAt ? `<p class="jcs-note-quote">Geradas em ${escapeHtml(new Date(params.generatedAt).toLocaleString('pt-BR'))}</p>` : ''}
  ${params.suggestions.map(buildSuggestionCardHtml).join('\n')}
</section>`);
  }

  if (params.draft.trim()) {
    const paragraphs = params.draft
      .trim()
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
      .join('\n');
    sections.push(`<section>
  <h2>Rascunho</h2>
  ${paragraphs}
</section>`);
  }

  if (sections.length === 0) {
    throw new Error('Não há sugestões nem rascunho para exportar.');
  }

  return buildJcsReadDocumentHtml({
    title: 'Saída de campo',
    subtitle: params.week.label,
    bodyHtml: sections.join('\n'),
  });
}

async function upsertPreachingWeekDocument(params: {
  exportRoot: string;
  week: MeetingWeek;
  document: JcsReadWeekDocument;
  htmlContent: string;
}): Promise<JcsReadExportResult> {
  const folder = weekFolderName(params.week);
  const weekDir = path.join(params.exportRoot, PREACHING_WEEKS, folder);
  await ensureDir(weekDir);

  await writeTextFile(path.join(weekDir, params.document.file), params.htmlContent);

  const manifest = await loadWeekManifest(weekDir, params.week);
  manifest.weekId = params.week.id;
  manifest.label = params.week.label;
  manifest.bibleReading = params.week.bibleReading;
  manifest.dateIso = params.week.dateIso;
  manifest.exportedAt = new Date().toISOString();
  manifest.format = JCS_READ_FORMAT;
  manifest.documents = manifest.documents.filter((item) => item.id !== params.document.id);
  manifest.documents.push(params.document);

  await writeTextFile(path.join(weekDir, 'week.json'), JSON.stringify(manifest, null, 2));
  await upsertPreachingCatalog(params.exportRoot, params.week, folder);

  const zipPath = await writeJcsReadZip(params.exportRoot);

  return {
    ok: true,
    folderPath: weekDir,
    zipPath,
    weekId: params.week.id,
    documentCount: manifest.documents.length,
  };
}

export async function exportPreachingPresentationsForJcsRead(params: {
  exportRoot: string;
  cacheDir: string;
  week: MeetingWeek;
}): Promise<JcsReadExportResult> {
  try {
    const content = await loadPreachingContent(params.cacheDir);
    if (!content.ok || content.topics.length === 0) {
      return {
        ok: false,
        error: content.error ?? 'Conteúdo de pregação indisponível. Baixe Ame as Pessoas — Faça Discípulos.',
      };
    }

    const html = buildPreachingPresentationsHtml(content);
    return await upsertPreachingWeekDocument({
      exportRoot: params.exportRoot,
      week: params.week,
      document: {
        id: 'preaching',
        kind: 'preaching',
        title: 'Apresentações',
        file: 'preaching.html',
      },
      htmlContent: html,
    });
  } catch (err) {
    console.error('[exportPreachingPresentationsForJcsRead]', err);
    return { ok: false, error: formatUnknownError(err, 'Erro ao exportar apresentações para tablet') };
  }
}

export async function exportFieldServiceForJcsRead(params: {
  exportRoot: string;
  userDataDir: string;
  week: MeetingWeek;
}): Promise<JcsReadExportResult> {
  try {
    const bundle = await getFieldServiceSuggestions(params.userDataDir, params.week.id);
    const draft = await getFieldServiceNote(params.userDataDir, params.week.id);
    const suggestions = bundle?.suggestions ?? [];

    if (suggestions.length === 0 && !draft.trim()) {
      return {
        ok: false,
        error: 'Gere sugestões ou escreva um rascunho antes de exportar.',
      };
    }

    const html = buildFieldServiceHtml({
      week: params.week,
      suggestions,
      draft,
      generatedAt: bundle?.generatedAt,
    });

    return await upsertPreachingWeekDocument({
      exportRoot: params.exportRoot,
      week: params.week,
      document: {
        id: 'field-service',
        kind: 'field-service',
        title: 'Saída de campo',
        file: 'field-service.html',
      },
      htmlContent: html,
    });
  } catch (err) {
    console.error('[exportFieldServiceForJcsRead]', err);
    return { ok: false, error: formatUnknownError(err, 'Erro ao exportar saída de campo para tablet') };
  }
}
