import type { ChairmanAssignment, ChairmanPrepRecord } from './chairman-prep-types';
import type { ChairmanSongRef } from './chairman-song-links';
import { isSongAssignment, parseSongNumber } from './chairman-song-links';

/** Índice da designação que é o cântico do meio (abaixo de Nossa vida cristã). */
export function findMiddleSongAssignmentIndex(assignments: ChairmanAssignment[]): number {
  for (let i = 0; i < assignments.length; i++) {
    if (assignments[i]!.section === 'musica') return i;
  }

  const firstVidaIdx = assignments.findIndex((a) => a.section === 'vida');
  if (firstVidaIdx >= 0 && isSongAssignment(assignments[firstVidaIdx]!)) {
    return firstVidaIdx;
  }

  if (firstVidaIdx > 0) {
    for (let i = firstVidaIdx - 1; i >= 0; i -= 1) {
      const part = assignments[i]!;
      if (part.section === 'ministerio') break;
      if (isSongAssignment(part)) return i;
    }
  }

  return -1;
}

export function extractMiddleSongFromAssignments(
  assignments: ChairmanAssignment[],
  existingMiddle?: string,
): { middleSong?: string; assignments: ChairmanAssignment[] } {
  const index = findMiddleSongAssignmentIndex(assignments);

  if (existingMiddle?.trim()) {
    const middleSong = existingMiddle.trim();
    const middleNum = parseSongNumber(middleSong);
    const withoutIndex = index >= 0 ? assignments.filter((_, i) => i !== index) : assignments;
    if (!middleNum) {
      return { middleSong, assignments: withoutIndex };
    }
    const assignmentsWithoutDupes = withoutIndex.filter((assignment) => {
      if (!isSongAssignment(assignment) && assignment.section !== 'musica') return true;
      const assignmentNum = parseSongNumber(assignment.partTitle);
      return assignmentNum !== middleNum;
    });
    return { middleSong, assignments: assignmentsWithoutDupes };
  }

  if (index < 0) return { assignments };

  const songTitle = assignments[index]!.partTitle.trim();
  const next = assignments.filter((_, i) => i !== index);
  return { middleSong: songTitle, assignments: next };
}

export function resolveMiddleSongRef(record: ChairmanPrepRecord): ChairmanSongRef | undefined {
  if (record.songLinks?.middle) return record.songLinks.middle;

  const index = findMiddleSongAssignmentIndex(record.assignments);
  if (index < 0) return undefined;
  return record.songLinks?.byAssignmentId?.[record.assignments[index]!.id];
}

export function isDuplicateMiddleSongAssignment(
  assignment: ChairmanAssignment,
  record: Pick<ChairmanPrepRecord, 'middleSong' | 'songLinks' | 'assignments'>,
): boolean {
  if (!isSongAssignment(assignment) && assignment.section !== 'musica') return false;

  const middleNum =
    parseSongNumber(record.middleSong ?? '') ?? record.songLinks?.middle?.songNumber ?? null;
  const assignmentNum = parseSongNumber(assignment.partTitle);

  if (middleNum && assignmentNum && middleNum === assignmentNum) return true;

  if (assignment.section === 'musica' && (record.middleSong || record.songLinks?.middle)) {
    return true;
  }

  const firstVidaIdx = record.assignments.findIndex((a) => a.section === 'vida');
  if (
    firstVidaIdx >= 0 &&
    record.assignments[firstVidaIdx]?.id === assignment.id &&
    isSongAssignment(assignment) &&
    Boolean(record.middleSong || record.songLinks?.middle)
  ) {
    return true;
  }

  return false;
}

export function normalizeChairmanMiddleSong(record: ChairmanPrepRecord): ChairmanPrepRecord {
  const { middleSong, assignments } = extractMiddleSongFromAssignments(
    record.assignments,
    record.middleSong,
  );
  if (middleSong === record.middleSong && assignments.length === record.assignments.length) {
    return record;
  }
  return {
    ...record,
    middleSong: middleSong ?? record.middleSong,
    assignments,
  };
}
