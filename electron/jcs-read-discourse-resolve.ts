import { parseTalkTheme } from '../shared/talk-theme-parse';
import { listDocuments, resolveCachedPubPath } from './jwpub-reader';
import type { PreparedElderOutline } from './user-prep-store';
import {
  findPreparedElderOutlineByName,
  listPreparedElderOutlines,
} from './user-prep-store';

export async function resolvePreparedDiscourseOutline(params: {
  cacheDir: string;
  userDataDir: string;
  themeNumber: number;
  themeTitle: string;
}): Promise<PreparedElderOutline | null> {
  const fullTitle = `${params.themeNumber}. ${params.themeTitle}`;

  const preparedList = await listPreparedElderOutlines(params.userDataDir);
  const prepared = preparedList.find((item) => {
    const parsed = parseTalkTheme(item.sourceTitle, item.name);
    return parsed.themeNumber === params.themeNumber && item.value?.trim();
  });
  if (prepared) return prepared;

  const filePath = await resolveCachedPubPath(params.cacheDir, 's-34', '');
  if (!filePath) return null;

  const documents = await listDocuments(filePath);
  const doc =
    documents.find((item) => parseTalkTheme(item.title).themeNumber === params.themeNumber) ??
    documents.find((item) => item.title.trim().startsWith(`${params.themeNumber}.`));
  if (!doc) return null;

  const byName = await findPreparedElderOutlineByName(
    params.userDataDir,
    's-34',
    doc.documentId,
    fullTitle,
  );
  if (byName?.value?.trim()) return byName;

  return null;
}
