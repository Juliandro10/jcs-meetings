import type {
  ChairmanAssignment,
  ChairmanPrepRecord,
  ParsedChairmanDesignation,
} from './chairman-prep-types';

export function newChairmanAssignmentId() {
  return crypto.randomUUID();
}

export function parsedDesignationToAssignments(
  parsed: ParsedChairmanDesignation,
): ChairmanAssignment[] {
  return parsed.assignments.map((entry) => ({
    id: newChairmanAssignmentId(),
    section: entry.section,
    partTitle: entry.partTitle.trim(),
    durationMin: entry.durationMin,
    assignees: entry.assignees.map((name) => name.trim()).filter(Boolean),
    partTitleManual: entry.partTitleManual,
  }));
}

export function mergeDesignationIntoPrep(
  record: ChairmanPrepRecord,
  parsed: ParsedChairmanDesignation,
  meta: { fileName?: string; importedAt?: string },
): ChairmanPrepRecord {
  return {
    ...record,
    congregation: parsed.congregation?.trim() || record.congregation,
    meetingDate: parsed.meetingDate?.trim() || record.meetingDate,
    bibleReading: parsed.bibleReading?.trim() || record.bibleReading,
    openingSong: parsed.openingSong?.trim() || record.openingSong,
    middleSong: parsed.middleSong?.trim() || record.middleSong,
    closingSong: parsed.closingSong?.trim() || record.closingSong,
    chairmanName: parsed.chairmanName?.trim() || record.chairmanName,
    openingPrayer: parsed.openingPrayer?.trim() || record.openingPrayer,
    closingPrayer: parsed.closingPrayer?.trim() || record.closingPrayer,
    assignments: parsedDesignationToAssignments(parsed),
    importedAt: meta.importedAt ?? new Date().toISOString(),
    sourceFileName: meta.fileName ?? record.sourceFileName,
    content: undefined,
  };
}
