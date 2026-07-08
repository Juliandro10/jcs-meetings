import type { ChairmanAssignment } from './chairman-prep-types';

export type ChairmanOpeningPreview = {
  intro?: string;
  treasuresHighlight: string;
  lifeChristianHighlight: string;
  treasuresPartTitle?: string;
  lifeChristianPartTitle?: string;
};

function isMusicPart(title: string) {
  return /cântico|cantico|m[úu]sica/i.test(title);
}

function isCbsPart(title: string) {
  return /estudo bíblico|congregação|congregacao|\bebc\b|\bcbs\b/i.test(title);
}

function isTreasuresDiscourse(assignment: ChairmanAssignment) {
  const title = assignment.partTitle;
  if (/joias|leitura|gemas/i.test(title)) return false;
  if (/^\s*1[\.)]\s/.test(title.trim())) return true;
  if (assignment.section === 'tesouros' && assignment.durationMin === 10) return true;
  return /discurso|tesouros/i.test(title);
}

export function resolveOpeningPartHints(assignments: ChairmanAssignment[]) {
  const tesouros = assignments.filter((a) => a.section === 'tesouros');
  const treasuresDiscourse =
    tesouros.find((a) => isTreasuresDiscourse(a)) ??
    tesouros.find((a) => !/joias|leitura|gemas/i.test(a.partTitle)) ??
    tesouros[0];

  const vidaParts = assignments.filter(
    (a) => a.section === 'vida' && !isMusicPart(a.partTitle),
  );
  const nonCbs = vidaParts.filter((a) => !isCbsPart(a.partTitle));
  const candidates = nonCbs.length > 0 ? nonCbs : vidaParts;

  const fifteenMin = candidates.filter((a) => a.durationMin === 15);
  let lifeChristian =
    fifteenMin.length === 1
      ? fifteenMin[0]
      : fifteenMin[0] ??
        candidates.find((a) => {
          const min = a.durationMin ?? 0;
          return min >= 10 && min <= 20;
        }) ??
        candidates[0];

  return { treasuresDiscourse, lifeChristian };
}

export function composeOpeningSummary(preview: ChairmanOpeningPreview): string {
  const blocks: string[] = [];
  if (preview.intro?.trim()) blocks.push(preview.intro.trim());
  if (preview.treasuresHighlight.trim()) blocks.push(preview.treasuresHighlight.trim());
  if (preview.lifeChristianHighlight.trim()) blocks.push(preview.lifeChristianHighlight.trim());
  return blocks.join('\n\n');
}

export function openingPreviewFromAssignments(
  assignments: ChairmanAssignment[],
  partial: Pick<ChairmanOpeningPreview, 'intro' | 'treasuresHighlight' | 'lifeChristianHighlight'>,
): ChairmanOpeningPreview {
  const { treasuresDiscourse, lifeChristian } = resolveOpeningPartHints(assignments);
  return {
    intro: partial.intro,
    treasuresHighlight: partial.treasuresHighlight,
    lifeChristianHighlight: partial.lifeChristianHighlight,
    treasuresPartTitle: treasuresDiscourse?.partTitle,
    lifeChristianPartTitle: lifeChristian?.partTitle,
  };
}

export function emptyOpeningPreview(assignments: ChairmanAssignment[]): ChairmanOpeningPreview {
  const { treasuresDiscourse, lifeChristian } = resolveOpeningPartHints(assignments);
  return {
    intro: '',
    treasuresHighlight: '',
    lifeChristianHighlight: '',
    treasuresPartTitle: treasuresDiscourse?.partTitle,
    lifeChristianPartTitle: lifeChristian?.partTitle,
  };
}

/** Compatibilidade: conteúdo antigo só com openingSummary. */
export function ensureOpeningPreview(
  openingSummary: string,
  assignments: ChairmanAssignment[],
  existing?: ChairmanOpeningPreview,
): ChairmanOpeningPreview {
  if (existing?.treasuresHighlight || existing?.lifeChristianHighlight) {
    const fromAssignments = emptyOpeningPreview(assignments);
    return {
      ...fromAssignments,
      ...existing,
      treasuresPartTitle: fromAssignments.treasuresPartTitle,
      lifeChristianPartTitle: fromAssignments.lifeChristianPartTitle,
    };
  }
  if (!openingSummary.trim()) {
    return emptyOpeningPreview(assignments);
  }
  return {
    ...emptyOpeningPreview(assignments),
    intro: openingSummary.trim(),
  };
}
