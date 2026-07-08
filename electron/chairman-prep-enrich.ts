import type { ChairmanPrepRecord } from '../shared/chairman-prep-types';
import { buildChairmanBibleReadingHtml } from './chairman-bible-reading-html';
import { buildChairmanSongLinks } from './chairman-songs-enrich';
import { extractDocumentStructure } from './document-structure';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { MeetingWeek } from './types';

/** Preenche leituras bíblicas e cânticos (links) a partir da apostila da semana. */
export async function enrichChairmanPrepForExport(
  cacheDir: string,
  week: Pick<MeetingWeek, 'mwbDownloaded' | 'mwbDocumentId' | 'mwbIssue'>,
  record: ChairmanPrepRecord,
): Promise<ChairmanPrepRecord> {
  if (!week.mwbDownloaded || week.mwbDocumentId == null || !week.mwbIssue) {
    const songLinks = await buildChairmanSongLinks(record, undefined, undefined);
    return songLinks ? { ...record, songLinks } : record;
  }

  const filePath = await resolveCachedPubPath(cacheDir, 'mwb', week.mwbIssue);
  if (!filePath) {
    const songLinks = await buildChairmanSongLinks(record, undefined, undefined);
    return songLinks ? { ...record, songLinks } : record;
  }

  const html = await getDocumentHtml(filePath, week.mwbDocumentId);
  const structure = extractDocumentStructure(html);

  let updated: ChairmanPrepRecord = { ...record };

  if (structure.bibleReadingHref) {
    updated = {
      ...updated,
      bibleReadingHref: structure.bibleReadingHref,
    };
  }

  const studentReading = structure.studentBibleReading;
  if (studentReading?.href) {
    const passageHtml = buildChairmanBibleReadingHtml(
      studentReading.href,
      studentReading.label,
      {
        heading: 'Trecho designado na apostila',
        versesLabel: 'Versículos a anunciar',
      },
    );
    if (passageHtml) {
      updated = {
        ...updated,
        studentBibleReadingHref: studentReading.href,
        studentBibleReadingPassageHtml: passageHtml,
        bibleReadingPassageHtml: undefined,
      };
    }
  }

  const songLinks = await buildChairmanSongLinks(updated, html, structure);
  if (songLinks) {
    updated = { ...updated, songLinks };
  }

  return updated;
}

/** @deprecated Use enrichChairmanPrepForExport */
export const enrichChairmanPrepBibleReading = enrichChairmanPrepForExport;
