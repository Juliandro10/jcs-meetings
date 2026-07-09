import type { ChairmanAssignment } from './chairman-prep-types';

function partNumber(title: string): number | null {
  const match = title.trim().match(/^(\d+)[\.)]\s/);
  return match ? Number(match[1]) : null;
}

function isMusicPart(title: string) {
  return /cântico|cantico|m[úu]sica/i.test(title);
}

/** Partes sem caixa Destaque — só transição (ou lembrete, nas de estudante). */
export function shouldHideChairmanHighlight(assignment: ChairmanAssignment): boolean {
  if (assignment.section === 'tesouros') {
    const n = partNumber(assignment.partTitle);
    if (n === 1 || n === 2) return true;
    return /joias|gemas|que joias/i.test(assignment.partTitle);
  }

  if (assignment.section === 'vida' && !isMusicPart(assignment.partTitle)) {
    return true;
  }

  return false;
}