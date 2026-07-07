export const DISCOURSE_SCRIPT_TAG = 'discourse-script';

export function isDiscourseScriptNote(note: { tags?: string[] }) {
  return note.tags?.includes(DISCOURSE_SCRIPT_TAG) ?? false;
}

/** Remove saudações que o presidente já fez na abertura. */
export function sanitizeDiscourseOpening(body: string) {
  let text = body.trim();
  text = text.replace(/^\[(?:Abertura|Introdução|INTRODUÇÃO)\]\s*/i, '');
  text = text.replace(
    /^(?:Bom\s+(?:dia|noite)|Boa\s+(?:noite|tarde))[^\n]*[.!?]?\s*(?:\n+|$)/i,
    '',
  );
  text = text.replace(
    /^(?:Queridos\s+)?(?:irmãos\s+e\s+irmãs|irmãos)[,!]?[^\n]*[.!?]?\s*(?:\n+|$)/i,
    '',
  );
  text = text.replace(/^É\s+um\s+privilégio[^\n]*[.!?]?\s*(?:\n+|$)/i, '');
  return text.trim();
}
