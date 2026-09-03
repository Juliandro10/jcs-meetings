import type { OutlineResearchItem, OutlineSupportPub } from '../../electron/types';

export type OutlinePrepDownload = {
  pub: string;
  issue: string;
  label: string;
  fallbackPub?: string;
};

function downloadKey(pub: string, issue: string) {
  return `${pub.toLowerCase()}|${issue}`;
}

/** Publicações que faltam no cache para o esboço aberto (pesquisa + Melhore/Beneficie-se). */
export function collectMissingOutlinePrepDownloads(
  research: OutlineResearchItem[],
  supportPubs: OutlineSupportPub[],
): OutlinePrepDownload[] {
  const unique = new Map<string, OutlinePrepDownload>();

  for (const item of research) {
    if (item.downloaded !== false) continue;
    const pub = item.downloadPub ?? item.sourceSymbol;
    if (!pub) continue;
    const issue = item.downloadIssue ?? item.sourceIssue ?? '';
    unique.set(downloadKey(pub, issue), {
      pub,
      issue,
      label: item.sourceTitle || item.caption,
      fallbackPub: item.sourceSymbol && item.sourceSymbol !== pub ? item.sourceSymbol : undefined,
    });
  }

  for (const item of supportPubs) {
    if (item.downloaded) continue;
    const pub = item.downloadPub ?? item.pub;
    const issue = item.downloadIssue ?? '';
    unique.set(downloadKey(pub, issue), {
      pub,
      issue,
      label: item.title,
    });
  }

  return [...unique.values()];
}
