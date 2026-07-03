export const LFB_STUDY_QUESTIONS = [
  'O que você aprendeu sobre Jeová nessa história?',
  'Que lições você aprendeu com essa história?',
  'Como colocar em prática as lições aprendidas no ministério, na família e na congregação?',
] as const;

export const LFB_STUDY_FIELD_IDS = ['study-q1', 'study-q2', 'study-q3'] as const;

export function isLfbStudyFieldId(fieldId: string): boolean {
  return (LFB_STUDY_FIELD_IDS as readonly string[]).includes(fieldId);
}

export function buildLfbStudyFieldsHtml() {
  const fields = LFB_STUDY_FIELD_IDS.map(
    (fieldId, index) => `
<label class="jcs-lfb-study-label" for="${fieldId}">${index + 1}. ${LFB_STUDY_QUESTIONS[index]}</label>
<textarea id="${fieldId}" class="jcs-editable-field jcs-lfb-study-field" rows="1" data-pid="${fieldId}"></textarea>`,
  ).join('\n');

  return `
<section class="jcs-lfb-study-prep">
  <h4 class="jcs-lfb-study-heading">Perguntas do estudo de congregação</h4>
  ${fields}
</section>`;
}
