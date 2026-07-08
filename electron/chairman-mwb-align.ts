import type { ChairmanAssignment, ChairmanPrepRecord, ParsedChairmanDesignation } from '../shared/chairman-prep-types';
import {
  alignChairmanAssignmentsWithMwb,
  buildMwbPartRefsFromTitles,
  type MwbPartRef,
} from '../shared/chairman-mwb-title-align';
import { openingPreviewFromAssignments } from '../shared/chairman-opening-preview';
import { parsedDesignationToAssignments } from '../shared/chairman-prep-merge';
import { extractDocumentStructure } from './document-structure';
import { getDocumentHtml, loadMeetingWeeks, resolveCachedPubPath } from './jwpub-reader';
import type { MeetingWeek } from './types';
import { bibleReadingsMatch } from '../shared/chairman-designation-week-pick';

async function loadMwbPartRefs(
  cacheDir: string,
  week: Pick<MeetingWeek, 'mwbDownloaded' | 'mwbDocumentId' | 'mwbIssue'>,
): Promise<MwbPartRef[]> {
  if (!week.mwbDownloaded || week.mwbDocumentId == null || !week.mwbIssue) {
    return [];
  }

  const filePath = await resolveCachedPubPath(cacheDir, 'mwb', week.mwbIssue);
  if (!filePath) return [];

  const html = await getDocumentHtml(filePath, week.mwbDocumentId);
  const structure = extractDocumentStructure(html);
  return buildMwbPartRefsFromTitles(structure.parts);
}

/** Semana + partes da apostila — prioriza leitura bíblica importada. */
export async function resolveMwbPartsForDesignation(
  cacheDir: string,
  userDataRoot: string,
  weekId: string,
  document: ParsedChairmanDesignation,
): Promise<{ parts: MwbPartRef[]; week: MeetingWeek | null; aligned: boolean }> {
  const { weeks } = await loadMeetingWeeks(cacheDir, userDataRoot);
  let week = weeks.find((item) => item.id === weekId) ?? null;

  if (document.bibleReading?.trim()) {
    const byReading = weeks.find(
      (item) =>
        item.mwbDownloaded &&
        document.bibleReading?.trim() &&
        bibleReadingsMatch(item.bibleReading, document.bibleReading),
    );
    if (byReading) week = byReading;
  }

  if (!week?.mwbDownloaded || week.mwbDocumentId == null || !week.mwbIssue) {
    return { parts: [], week, aligned: false };
  }

  const parts = await loadMwbPartRefs(cacheDir, week);
  return { parts, week, aligned: parts.length > 0 };
}

export async function alignDesignationDocumentWithMwb(
  cacheDir: string,
  userDataRoot: string,
  weekId: string,
  document: ParsedChairmanDesignation,
): Promise<{ document: ParsedChairmanDesignation; titlesAlignedFromMwb: boolean }> {
  const { parts, aligned } = await resolveMwbPartsForDesignation(
    cacheDir,
    userDataRoot,
    weekId,
    document,
  );

  const assignments = alignChairmanAssignmentsWithMwb(
    parsedDesignationToAssignments(document),
    parts,
  );

  const titlesChanged = assignments.some(
    (item, index) => {
      const raw = document.assignments[index];
      return raw && item.partTitle !== raw.partTitle.trim();
    },
  );

  return {
    titlesAlignedFromMwb: aligned && titlesChanged,
    document: {
      ...document,
      assignments: assignments.map(({ section, partTitle, durationMin, assignees }) => ({
        section,
        partTitle,
        durationMin,
        assignees,
      })),
    },
  };
}

export async function alignChairmanPrepRecordWithMwb(
  cacheDir: string,
  userDataRoot: string,
  weekId: string,
  record: ChairmanPrepRecord,
): Promise<ChairmanPrepRecord> {
  const { parts } = await resolveMwbPartsForDesignation(cacheDir, userDataRoot, weekId, {
    bibleReading: record.bibleReading,
    assignments: record.assignments.map(({ section, partTitle, durationMin, assignees }) => ({
      section,
      partTitle,
      durationMin,
      assignees,
    })),
  });

  const assignments = alignChairmanAssignmentsWithMwb(record.assignments, parts);
  const titlesChanged = assignments.some(
    (item, index) => item.partTitle !== record.assignments[index]?.partTitle,
  );
  if (!titlesChanged) return record;

  let next: ChairmanPrepRecord = { ...record, assignments };

  if (record.content) {
    const preview = record.content.openingPreview;
    next = {
      ...next,
      content: {
        ...record.content,
        openingPreview: openingPreviewFromAssignments(assignments, {
          intro: preview?.intro,
          treasuresHighlight: preview?.treasuresHighlight ?? '',
          lifeChristianHighlight: preview?.lifeChristianHighlight ?? '',
        }),
      },
    };
  }

  return next;
}
