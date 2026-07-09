import type { ChairmanAssignment, ChairmanGeneratedPart } from './chairman-prep-types';
import { isStudentAssignment } from './chairman-student-part';

export const CHAIRMAN_STUDENT_REMINDER_BASE =
  'Agradecer os participantes, mencionar um ponto positivo da parte, e destacar o ponto acima que está sendo considerado.';

export function isBibleReadingPart3(assignment: ChairmanAssignment): boolean {
  return (
    assignment.section === 'tesouros' &&
    /leitura da b[ií]blia/i.test(assignment.partTitle)
  );
}

export function buildChairmanStudentReminder(assignment: ChairmanAssignment): string {
  const announce = isBibleReadingPart3(assignment)
    ? 'Anunciar próxima seção e próxima parte.'
    : 'Anunciar próxima parte.';
  return `${CHAIRMAN_STUDENT_REMINDER_BASE}\n\n${announce}`;
}

export function resolveChairmanStudentReminder(
  part: Pick<ChairmanGeneratedPart, 'reminder'> | undefined,
  assignment: ChairmanAssignment,
): string {
  const custom = part?.reminder?.trim();
  if (custom) return custom;
  return buildChairmanStudentReminder(assignment);
}

export function isChairmanStudentReminderPart(assignment: ChairmanAssignment): boolean {
  return isStudentAssignment(assignment);
}
