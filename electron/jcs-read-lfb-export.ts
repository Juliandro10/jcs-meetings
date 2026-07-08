import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildLfbStudyFieldsHtml,
  loadLfbStoriesFromCache,
  type LfbStory,
} from './lfb-reader';
import { isLfbStudyNoteId } from './lfb-study-notes';
import { bakePreparedDocumentHtml, rewriteMediaUrlsForExport } from './jcs-read-bake';
import { buildJcsReadDocumentHtml, buildJcsReadNotesSection } from '../shared/jcs-read-html';
import { getPreparedDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import { readJwpubMedia } from './jwpub-bundle';
import { getFieldValues, getHighlights, getNotes, documentPrepPrefix, type PrepNote } from './user-prep-store';

const LFB_PUB = 'lfb';
const LFB_ISSUE = '';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function copyMediaAssets(params: {
  jwpubPath: string;
  assetsDir: string;
  html: string;
}) {
  const { html, mediaFiles } = rewriteMediaUrlsForExport(params.html);
  await fs.mkdir(params.assetsDir, { recursive: true });

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

async function exportLfbStorySection(params: {
  cacheDir: string;
  userDataDir: string;
  story: LfbStory;
  assetsDir: string;
}) {
  const jwpubPath = await resolveCachedPubPath(params.cacheDir, LFB_PUB, LFB_ISSUE);
  if (!jwpubPath) throw new Error('Livro lfb não baixado.');

  const prefix = documentPrepPrefix(LFB_PUB, LFB_ISSUE, params.story.documentId);
  const fieldValues = await getFieldValues(params.userDataDir, prefix);
  const highlights = await getHighlights(
    params.userDataDir,
    LFB_PUB,
    LFB_ISSUE,
    params.story.documentId,
  );
  const allNotes = await getNotes(
    params.userDataDir,
    LFB_PUB,
    LFB_ISSUE,
    params.story.documentId,
  );
  const notes = allNotes.filter((note) => !isLfbStudyNoteId(note.id));

  let bodyHtml = params.story.html;
  if (!bodyHtml.includes('jcs-lfb-study-prep')) {
    bodyHtml += buildLfbStudyFieldsHtml();
  }

  bodyHtml = bakePreparedDocumentHtml({
    html: bodyHtml,
    pub: LFB_PUB,
    issue: LFB_ISSUE,
    documentId: params.story.documentId,
    fieldValues,
    highlights,
  });

  bodyHtml = await copyMediaAssets({
    jwpubPath,
    assetsDir: params.assetsDir,
    html: bodyHtml,
  });

  const notesHtml = buildJcsReadNotesSection(
    notes.map((note: PrepNote) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      anchorText: note.anchorText,
      tags: note.tags,
    })),
  );

  return `
<section class="jcs-cbs-story">
  <h2 class="jcs-cbs-story-title">História ${params.story.storyNumber} — ${escapeHtml(params.story.title)}</h2>
  <div class="jcs-cbs-story-body jwpub-content">${bodyHtml}</div>
  ${notesHtml}
</section>`;
}

export async function buildCbsStudyExportHtml(params: {
  cacheDir: string;
  userDataDir: string;
  href: string;
  linkLabel: string;
  weekLabel: string;
  assetsDir: string;
}): Promise<string | null> {
  const jwpubPath = await resolveCachedPubPath(params.cacheDir, LFB_PUB, LFB_ISSUE);
  if (!jwpubPath) return null;

  let stories: LfbStory[];
  try {
    stories = await loadLfbStoriesFromCache(params.cacheDir, params.href, params.linkLabel);
  } catch {
    return null;
  }
  if (stories.length === 0) return null;

  const samplePrepared = await getPreparedDocumentHtml(jwpubPath, stories[0]!.documentId);
  const sections: string[] = [];

  for (const story of stories) {
    sections.push(
      await exportLfbStorySection({
        cacheDir: params.cacheDir,
        userDataDir: params.userDataDir,
        story,
        assetsDir: params.assetsDir,
      }),
    );
  }

  return buildJcsReadDocumentHtml({
    title: 'Estudo bíblico de congregação',
    subtitle: `${params.weekLabel} · ${params.linkLabel}`,
    bodyHtml: sections.join('\n'),
    publicationCss: samplePrepared.publicationCss,
  });
}
