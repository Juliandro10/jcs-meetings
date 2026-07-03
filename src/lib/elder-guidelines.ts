import { canonicalPubSymbol, isPubSymbolAvailable, pubSymbolsMatch } from '@/lib/jwpub-pub-symbol';

export type ElderGuidelineItem = {
  id: string;
  title: string;
  pub: string;
  label: string;
  documentId?: number;
};

export type ElderGuidelineSection = {
  id: string;
  title: string;
  items: ElderGuidelineItem[];
};

/** Catálogo de orientações — espelho do JW Library (congregação). */
export const ELDER_GUIDELINE_SECTIONS: ElderGuidelineSection[] = [
  {
    id: 'general',
    title: '',
    items: [
      {
        id: 's-27b-ba',
        title: 'Instruções para as Contas da Congregação (Brasil)',
        pub: 's-27b-ba',
        label: 'S-27b-Ba · 2021',
      },
      {
        id: 's-261',
        title: 'Instruções sobre Áudio e Vídeo para Reuniões Híbridas',
        pub: 's-261',
        label: 'S-261 · 2022',
      },
      {
        id: 's-179',
        title: 'Reuniões por videoconferência',
        pub: 's-179',
        label: 'S-179 · 2021',
      },
    ],
  },
  {
    id: 'congregation',
    title: 'CONGREGAÇÃO',
    items: [
      {
        id: 'sfga-ba',
        title: 'Adendo ao Pastoreiem o Rebanho de Deus (Brasil)',
        pub: 'sfga-ba',
        label: 'sfga-Ba · 2025',
      },
      {
        id: 'sfg',
        title: 'Pastoreiem o rebanho de Deus',
        pub: 'sfg',
        label: 'sfg · 2025',
      },
    ],
  },
  {
    id: 'assembly',
    title: 'ASSEMBLEIA E CONGRESSO',
    items: [
      {
        id: 'co-160',
        title: 'Orientações sobre Áudio e Vídeo para Assembleias e Congressos',
        pub: 'co-160',
        label: 'CO-160 · 2024',
      },
    ],
  },
  {
    id: 'meetings',
    title: 'REUNIÕES',
    items: [
      {
        id: 's-144',
        title: 'Como Reproduzir Áudio e Vídeo Durante as Reuniões',
        pub: 's-144',
        label: 'S-144 · 2022',
      },
      {
        id: 's-38',
        title: 'Instruções para a reunião Nossa Vida e Ministério Cristão',
        pub: 's-38',
        label: 'S-38 · 2025',
      },
    ],
  },
  {
    id: 'preaching',
    title: 'PREGAÇÃO',
    items: [
      {
        id: 's-148',
        title: 'Orientações para o testemunho público',
        pub: 's-148',
        label: 'S-148 · 2023',
      },
    ],
  },
];

export const KNOWN_GUIDELINE_PUBS = new Set(
  ELDER_GUIDELINE_SECTIONS.flatMap((section) => section.items.map((item) => item.pub.toLowerCase())),
);

/** Publicações de esboço — não entram em Orientações. */
export const OUTLINE_ONLY_PUBS = new Set([
  's-34',
  's-31',
  's-32',
  's-41',
  's-126',
  's-125-26',
  'ca-cotk26',
]);

export function isElderGuidelinePubCached(pub: string, availablePubs: Set<string>) {
  return isPubSymbolAvailable(pub, availablePubs);
}

export function installedToGuidelineItem(entry: {
  pub: string;
  title: string;
  label: string;
  multiDocument: boolean;
  documentId?: number;
}): ElderGuidelineItem {
  return {
    id: `installed-${entry.pub}`,
    title: entry.title,
    pub: entry.pub,
    label: entry.label,
    documentId: entry.multiDocument ? undefined : entry.documentId,
  };
}

export function buildVisibleGuidelineSections(
  availablePubs: Set<string>,
  installed: Array<{
    pub: string;
    title: string;
    label: string;
    multiDocument: boolean;
    documentId?: number;
  }>,
): ElderGuidelineSection[] {
  const sections: ElderGuidelineSection[] = ELDER_GUIDELINE_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => isElderGuidelinePubCached(item.pub, availablePubs))
      .map((item) => {
        const installedMatch = installed.find((entry) => pubSymbolsMatch(entry.pub, item.pub));
        if (installedMatch) return installedToGuidelineItem(installedMatch);
        return item;
      }),
  })).filter((section) => section.items.length > 0);

  const extras = installed
    .filter((entry) => {
      const key = canonicalPubSymbol(entry.pub);
      const alreadyShown = sections.some((section) =>
        section.items.some((item) => canonicalPubSymbol(item.pub) === key),
      );
      return !alreadyShown;
    })
    .map(installedToGuidelineItem);

  if (extras.length > 0) {
    sections.push({
      id: 'imported',
      title: 'OUTRAS ORIENTAÇÕES',
      items: extras,
    });
  }

  return sections;
}
