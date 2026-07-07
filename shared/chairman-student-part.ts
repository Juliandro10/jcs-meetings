import type { ChairmanAssignment } from './chairman-prep-types';

export function isStudentAssignment(assignment: ChairmanAssignment) {
  if (assignment.section === 'ministerio') return true;
  if (assignment.section === 'tesouros' && /leitura da b[ií]blia/i.test(assignment.partTitle)) {
    return true;
  }
  return false;
}
