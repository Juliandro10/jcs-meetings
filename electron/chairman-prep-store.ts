import fs from 'node:fs/promises';
import path from 'node:path';
import { repairCommonMojibake } from '../shared/elder-meeting-text';
import type { ChairmanGeneratedContent, ChairmanPrepRecord } from '../shared/chairman-prep-types';

export {
  mergeDesignationIntoPrep,
  parsedDesignationToAssignments,
  newChairmanAssignmentId,
} from '../shared/chairman-prep-merge';

function prepPath(userDataRoot: string, weekId: string) {
  return path.join(userDataRoot, 'chairman-prep', `${weekId}.json`);
}

function normalizeRecord(record: ChairmanPrepRecord): ChairmanPrepRecord {
  return {
    ...record,
    weekLabel: repairCommonMojibake(record.weekLabel),
    bibleReading: repairCommonMojibake(record.bibleReading),
    congregation: record.congregation ? repairCommonMojibake(record.congregation) : undefined,
    chairmanName: record.chairmanName ? repairCommonMojibake(record.chairmanName) : undefined,
    openingPrayer: record.openingPrayer ? repairCommonMojibake(record.openingPrayer) : undefined,
    closingPrayer: record.closingPrayer ? repairCommonMojibake(record.closingPrayer) : undefined,
    announcements: record.announcements ? repairCommonMojibake(record.announcements) : undefined,
    sourceFileName: record.sourceFileName ? repairCommonMojibake(record.sourceFileName) : undefined,
    assignments: record.assignments.map((item) => ({
      ...item,
      partTitle: repairCommonMojibake(item.partTitle),
      assignees: item.assignees.map((name) => repairCommonMojibake(name)),
      mwbPartHint: item.mwbPartHint ? repairCommonMojibake(item.mwbPartHint) : undefined,
    })),
    content: record.content
      ? {
          ...record.content,
          openingSummary: repairCommonMojibake(record.content.openingSummary),
          openingPreview: record.content.openingPreview
            ? {
                intro: record.content.openingPreview.intro
                  ? repairCommonMojibake(record.content.openingPreview.intro)
                  : undefined,
                treasuresHighlight: repairCommonMojibake(
                  record.content.openingPreview.treasuresHighlight,
                ),
                lifeChristianHighlight: repairCommonMojibake(
                  record.content.openingPreview.lifeChristianHighlight,
                ),
                treasuresPartTitle: record.content.openingPreview.treasuresPartTitle
                  ? repairCommonMojibake(record.content.openingPreview.treasuresPartTitle)
                  : undefined,
                lifeChristianPartTitle: record.content.openingPreview.lifeChristianPartTitle
                  ? repairCommonMojibake(record.content.openingPreview.lifeChristianPartTitle)
                  : undefined,
              }
            : undefined,
          closingSummary: repairCommonMojibake(record.content.closingSummary),
          finalQuestion: repairCommonMojibake(record.content.finalQuestion),
          finalQuestionOptions: record.content.finalQuestionOptions.map((opt) =>
            repairCommonMojibake(opt),
          ) as ChairmanGeneratedContent['finalQuestionOptions'],
          parts: record.content.parts.map((part) => ({
            ...part,
            transition: repairCommonMojibake(part.transition),
            highlight: part.highlight ? repairCommonMojibake(part.highlight) : undefined,
            lessonRef: part.lessonRef ? repairCommonMojibake(part.lessonRef) : undefined,
            lessonSummary: part.lessonSummary ? repairCommonMojibake(part.lessonSummary) : undefined,
            privateSuggestion: part.privateSuggestion
              ? repairCommonMojibake(part.privateSuggestion)
              : undefined,
          })),
        }
      : undefined,
  };
}

export function emptyChairmanPrep(params: {
  weekId: string;
  weekLabel: string;
  bibleReading: string;
}): ChairmanPrepRecord {
  const now = new Date().toISOString();
  return {
    weekId: params.weekId,
    weekLabel: params.weekLabel,
    bibleReading: params.bibleReading,
    assignments: [],
    updatedAt: now,
  };
}

export async function loadChairmanPrep(
  userDataRoot: string,
  weekId: string,
): Promise<ChairmanPrepRecord | null> {
  try {
    const raw = await fs.readFile(prepPath(userDataRoot, weekId), 'utf8');
    const parsed = JSON.parse(raw) as ChairmanPrepRecord;
    return normalizeRecord(parsed);
  } catch {
    return null;
  }
}

export async function saveChairmanPrep(userDataRoot: string, record: ChairmanPrepRecord) {
  const file = prepPath(userDataRoot, record.weekId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload: ChairmanPrepRecord = {
    ...normalizeRecord(record),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export async function deleteChairmanPrep(userDataRoot: string, weekId: string): Promise<boolean> {
  try {
    await fs.unlink(prepPath(userDataRoot, weekId));
    return true;
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    if (code === 'ENOENT') return true;
    throw err;
  }
}
