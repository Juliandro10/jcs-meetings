import { listCachedJwpubs } from './jw-download';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { AiChatContext, AiChatParams } from './types';

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function enrichAiContext(
  cacheDir: string,
  context: AiChatContext,
): Promise<AiChatContext> {
  const cachedPublications = await listCachedJwpubs(cacheDir);

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
        documentText = stripHtml(html).slice(0, 8000);
      } catch {
        // Matéria indisponível — o prompt pedirá mais contexto ao usuário.
      }
    }
  }

  return {
    ...context,
    cachedPublications,
    documentText,
  };
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
