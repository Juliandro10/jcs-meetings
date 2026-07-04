import { isElderOutlinePubSymbol } from './elder-pub-classify';
import { listCachedJwpubs } from './jw-download';
import { outlineHtmlToPlainText, truncateOutlineText } from './outline-text';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { AiChatContext, AiChatParams } from './types';

const OUTLINE_SECTION_CHAR_LIMIT = 14_000;

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOutlineContext(context: AiChatContext) {
  return context.contentKind === 'elder-outline' || Boolean(context.sourcePub && isElderOutlinePubSymbol(context.sourcePub));
}

export async function enrichAiContext(
  cacheDir: string,
  context: AiChatContext,
): Promise<AiChatContext> {
  const cachedPublications = await listCachedJwpubs(cacheDir);
  const outlineMode = isOutlineContext(context);

  let documentText = context.documentText;
  const issueRequired = context.sourcePub === 'mwb' || context.sourcePub === 'w';
  if (
    !documentText &&
    context.sourcePub &&
    context.sourceDocumentId != null &&
    (!issueRequired || context.sourceIssue)
  ) {
    const filePath = await resolveCachedPubPath(
      cacheDir,
      context.sourcePub,
      context.sourceIssue ?? '',
    );
    if (filePath) {
      try {
        const html = await getDocumentHtml(filePath, context.sourceDocumentId);
        documentText = outlineMode
          ? truncateOutlineText(outlineHtmlToPlainText(html), OUTLINE_SECTION_CHAR_LIMIT)
          : stripHtml(html).slice(0, 8000);
      } catch {
        // Matéria indisponível — o prompt pedirá mais contexto ao usuário.
      }
    }
  } else if (documentText && outlineMode) {
    documentText = truncateOutlineText(documentText, OUTLINE_SECTION_CHAR_LIMIT);
  }

  let preparedOutlineText = context.preparedOutlineText?.trim();
  if (preparedOutlineText) {
    preparedOutlineText = truncateOutlineText(
      isRichOutlineContent(preparedOutlineText)
        ? outlineHtmlToPlainText(preparedOutlineText)
        : preparedOutlineText,
      OUTLINE_SECTION_CHAR_LIMIT,
    );
  }

  return {
    ...context,
    contentKind: outlineMode ? 'elder-outline' : context.contentKind ?? 'meeting',
    cachedPublications,
    documentText,
    preparedOutlineText,
  };
}

function isRichOutlineContent(value: string) {
  return /<(p|div|span|strong|em|u|mark|br|a)\b/i.test(value);
}

export async function prepareAiChatParams(
  cacheDir: string,
  params: AiChatParams,
): Promise<AiChatParams> {
  return {
    ...params,
    context: await enrichAiContext(cacheDir, params.context),
  };
}
