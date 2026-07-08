import type { ChairmanAssignment, ChairmanAssignmentSection } from './chairman-prep-types';

export type MwbPartRef = {
  title: string;
  kind: string;
  durationMin?: number;
};

const ALIGN_SECTIONS: ChairmanAssignmentSection[] = ['tesouros', 'ministerio', 'vida'];

function partNumber(title: string): number | null {
  const match = title.trim().match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

function durationFromTitle(title: string): number | undefined {
  const match = title.match(/\((\d+)\s*min\)/i);
  return match ? Number(match[1]) : undefined;
}

function assignmentDuration(assignment: ChairmanAssignment): number | undefined {
  return assignment.durationMin ?? durationFromTitle(assignment.partTitle);
}

function kindMatchesSection(kind: string, section: ChairmanAssignmentSection): boolean {
  switch (section) {
    case 'tesouros':
      return kind === 'treasures' || kind === 'joias' || kind === 'reading';
    case 'ministerio':
      return kind === 'ministry';
    case 'vida':
      return kind === 'life' || kind === 'local' || kind === 'cbs';
    default:
      return false;
  }
}

function sectionPool(section: ChairmanAssignmentSection, mwbParts: MwbPartRef[]) {
  return mwbParts.filter((part) => kindMatchesSection(part.kind, section));
}

function isNonMwbAssignment(assignment: ChairmanAssignment) {
  return /c[aâ]ntico|cantico|m[uú]sica/i.test(assignment.partTitle);
}

function sortByPartNumber(pool: MwbPartRef[]) {
  return [...pool].sort(
    (a, b) => (partNumber(a.title) ?? 999) - (partNumber(b.title) ?? 999),
  );
}

function pickPart(
  pool: MwbPartRef[],
  predicate: (part: MwbPartRef) => boolean,
): MwbPartRef | undefined {
  return pool.find(predicate);
}

function isJoiasRow(assignment: ChairmanAssignment): boolean {
  return /joias|gemas|que joias/i.test(assignment.partTitle);
}

function mwbTesourosSlots(pool: MwbPartRef[]) {
  return {
    discourse:
      pickPart(pool, (p) => p.kind === 'treasures') ??
      pickPart(pool, (p) => partNumber(p.title) === 1),
    joias:
      pickPart(pool, (p) => p.kind === 'joias') ??
      pickPart(pool, (p) => partNumber(p.title) === 2),
    reading:
      pickPart(pool, (p) => p.kind === 'reading') ??
      pickPart(pool, (p) => partNumber(p.title) === 3),
  };
}

function shortestUniqueDuration(rows: ChairmanAssignment[]): number | undefined {
  const durations = rows
    .map(assignmentDuration)
    .filter((value): value is number => value != null);
  if (!durations.length) return undefined;

  const counts = new Map<number, number>();
  for (const value of durations) counts.set(value, (counts.get(value) ?? 0) + 1);

  const unique = [...counts.entries()]
    .filter(([, count]) => count === 1)
    .map(([duration]) => duration);
  if (!unique.length) return undefined;
  return Math.min(...unique);
}

function identifyTesourosRoles(rows: ChairmanAssignment[], pool: MwbPartRef[]) {
  const mwb = mwbTesourosSlots(pool);
  const used = new Set<ChairmanAssignment>();

  const pick = (pred: (row: ChairmanAssignment) => boolean) => {
    const row = rows.find((item) => !used.has(item) && pred(item));
    if (row) used.add(row);
    return row;
  };

  const joias = pick(isJoiasRow) ?? pick((row) => partNumber(row.partTitle) === 2);
  const reading =
    pick((row) => /leitura da b[ií]blia/i.test(row.partTitle)) ??
    pick((row) => partNumber(row.partTitle) === 3) ??
    pick((row) => {
      const dur = assignmentDuration(row);
      return (
        mwb.reading?.durationMin != null &&
        dur != null &&
        dur === mwb.reading.durationMin &&
        !isJoiasRow(row)
      );
    }) ??
    pick((row) => {
      const shortest = shortestUniqueDuration(rows);
      const dur = assignmentDuration(row);
      return shortest != null && dur === shortest && !isJoiasRow(row);
    });
  const discourse =
    pick(
      (row) =>
        !isJoiasRow(row) &&
        row !== reading &&
        (partNumber(row.partTitle) === 1 ||
          (mwb.discourse?.durationMin != null &&
            assignmentDuration(row) === mwb.discourse.durationMin)),
    ) ?? pick((row) => !isJoiasRow(row) && row !== reading);

  return { discourse, joias, reading };
}

function isCbsAssignment(assignment: ChairmanAssignment) {
  const dur = assignmentDuration(assignment);
  const lower = assignment.partTitle.toLowerCase();
  if (/estudo b[ií]blico|cbs|congrega[cç][aã]o/i.test(lower)) return true;
  if (/tente o seguinte|fa[cç]a o desafio/i.test(lower)) return true;
  if (dur === 30) return true;
  return false;
}

/** Tesouros: identifica cada linha (discurso/joias/leitura) e corrige só o título — não move designados. */
function applyTesourosInPlace(rows: ChairmanAssignment[], pool: MwbPartRef[]): ChairmanAssignment[] {
  const titles = tesourosCanonicalTitles(pool);
  const { discourse, joias, reading } = identifyTesourosRoles(rows, pool);
  const titleFor = new Map<ChairmanAssignment, string>();

  if (discourse) titleFor.set(discourse, titles[0]?.trim() || discourse.partTitle);
  if (joias) titleFor.set(joias, titles[1]?.trim() || '2. Joias espirituais');
  if (reading) titleFor.set(reading, titles[2]?.trim() || '3. Leitura da Bíblia');

  return rows.map((row) => ({
    ...row,
    partTitle: titleFor.get(row)?.trim() ?? row.partTitle,
  }));
}

function applyMinisterioInPlace(rows: ChairmanAssignment[], pool: MwbPartRef[]): ChairmanAssignment[] {
  const mwbMinistry = sortByPartNumber(pool.filter((part) => part.kind === 'ministry'));
  if (!mwbMinistry.length) return rows;

  const usedMwb = new Set<number>();
  return rows.map((row) => {
    const dur = assignmentDuration(row);
    const number = partNumber(row.partTitle);

    let idx = mwbMinistry.findIndex(
      (part, i) => !usedMwb.has(i) && number != null && number === partNumber(part.title),
    );
    if (idx < 0 && dur != null) {
      idx = mwbMinistry.findIndex((part, i) => !usedMwb.has(i) && part.durationMin === dur);
    }
    if (idx < 0) return row;

    usedMwb.add(idx);
    return { ...row, partTitle: mwbMinistry[idx]!.title.trim() };
  });
}

function applyVidaInPlace(rows: ChairmanAssignment[], pool: MwbPartRef[]): ChairmanAssignment[] {
  const cbs =
    pickPart(pool, (p) => p.kind === 'cbs') ??
    pickPart(pool, (p) => /estudo b[ií]blico/i.test(p.title));
  const lifeParts = sortByPartNumber(pool.filter((p) => p.kind === 'life' || p.kind === 'local'));
  let lifeIdx = 0;

  return rows.map((row) => {
    if (isCbsAssignment(row)) {
      return { ...row, partTitle: cbs?.title.trim() ?? '8. Estudo bíblico de congregação' };
    }
    const life = lifeParts[lifeIdx];
    if (life) {
      lifeIdx += 1;
      return { ...row, partTitle: life.title.trim() };
    }
    return row;
  });
}

/** Tesouros: 1 discurso · 2 joias · 3 leitura — rótulos fixos da reunião VMM. */
function tesourosCanonicalTitles(pool: MwbPartRef[]): string[] {
  const discourse =
    pickPart(pool, (p) => partNumber(p.title) === 1) ??
    pickPart(pool, (p) => p.kind === 'treasures' && /^\d+\.\s/.test(p.title));
  const joias =
    pickPart(pool, (p) => p.kind === 'joias') ?? pickPart(pool, (p) => partNumber(p.title) === 2);
  const reading =
    pickPart(pool, (p) => p.kind === 'reading') ?? pickPart(pool, (p) => partNumber(p.title) === 3);

  return [
    discourse?.title.trim(),
    joias?.title.trim() || '2. Joias espirituais',
    reading?.title.trim() || '3. Leitura da Bíblia',
  ].filter(Boolean) as string[];
}

function canonicalTitlesForSection(
  section: ChairmanAssignmentSection,
  pool: MwbPartRef[],
  assignmentCount: number,
): string[] {
  if (section === 'tesouros') return tesourosCanonicalTitles(pool);
  if (section === 'ministerio') {
    return sortByPartNumber(pool.filter((p) => p.kind === 'ministry')).map((p) => p.title.trim());
  }
  if (section === 'vida') {
    const cbs =
      pickPart(pool, (p) => p.kind === 'cbs') ??
      pickPart(pool, (p) => /estudo b[ií]blico/i.test(p.title));
    const lifeParts = sortByPartNumber(pool.filter((p) => p.kind === 'life' || p.kind === 'local'));
    const hasCbs = assignmentCount > 0 && cbs;
    const lifeSlots = hasCbs ? Math.max(0, assignmentCount - 1) : assignmentCount;
    const titles = lifeParts.slice(0, lifeSlots).map((p) => p.title.trim());
    if (hasCbs && cbs) titles.push(cbs.title.trim());
    return titles;
  }
  return [];
}

function applySectionAlign(
  assignments: ChairmanAssignment[],
  section: ChairmanAssignmentSection,
  mwbParts: MwbPartRef[],
): ChairmanAssignment[] {
  const pool = sectionPool(section, mwbParts);
  const indices: number[] = [];
  const sectionRows: ChairmanAssignment[] = [];

  assignments.forEach((assignment, index) => {
    if (assignment.section !== section || isNonMwbAssignment(assignment)) return;
    indices.push(index);
    sectionRows.push(assignment);
  });

  if (!sectionRows.length) return assignments;

  let updated: ChairmanAssignment[];
  if (section === 'tesouros') {
    updated = applyTesourosInPlace(sectionRows, pool);
  } else if (section === 'ministerio') {
    updated = applyMinisterioInPlace(sectionRows, pool);
  } else if (section === 'vida') {
    updated = applyVidaInPlace(sectionRows, pool);
  } else {
    updated = sectionRows;
  }

  const out = assignments.map((a) => ({ ...a }));
  indices.forEach((index, slot) => {
    const row = updated[slot];
    if (!row) return;
    out[index] = row;
  });

  return out;
}

/**
 * Corrige títulos pelos da apostila (mwb) sem trocar designados de lugar.
 * A folha de designações só define quem faz cada parte — temas vêm da apostila.
 */
export function alignChairmanAssignmentsWithMwb(
  assignments: ChairmanAssignment[],
  mwbParts: MwbPartRef[],
): ChairmanAssignment[] {
  const manualTitles = new Map(
    assignments
      .filter((assignment) => assignment.partTitleManual)
      .map((assignment) => [assignment.id, assignment.partTitle] as const),
  );

  let out = assignments.map((assignment) => ({ ...assignment }));

  for (const section of ALIGN_SECTIONS) {
    out = applySectionAlign(out, section, mwbParts);
  }

  return out.map((assignment) => {
    const manualTitle = manualTitles.get(assignment.id);
    if (!manualTitle) return assignment;
    return { ...assignment, partTitle: manualTitle, partTitleManual: true };
  });
}

export function resolveCanonicalPartTitle(
  assignment: ChairmanAssignment,
  mwbParts: MwbPartRef[],
): string | null {
  const [aligned] = alignChairmanAssignmentsWithMwb([assignment], mwbParts);
  if (!aligned || aligned.partTitle === assignment.partTitle) return null;
  return aligned.partTitle;
}

export function buildMwbPartRefsFromTitles(
  parts: Array<{ title: string; kind: string; text?: string }>,
): MwbPartRef[] {
  return parts.map((part) => ({
    title: part.title,
    kind: part.kind,
    durationMin: durationFromTitle(part.text ?? part.title),
  }));
}
