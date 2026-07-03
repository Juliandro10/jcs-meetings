export type ElderOutlineItem = {
  id: string;
  title: string;
  /** Símbolo da publicação (ex.: s-34). */
  pub: string;
  label: string;
  icon: 'podium' | 'document';
  /** Se definido, abre direto este documento (publicações de doc único). */
  documentId?: number;
};

export type ElderOutlineSection = {
  id: string;
  title: string;
  items: ElderOutlineItem[];
};

/** Catálogo de esboços — espelho do JW Library (congregação). */
export const ELDER_OUTLINE_SECTIONS: ElderOutlineSection[] = [
  {
    id: 'congregation',
    title: 'CONGREGAÇÃO',
    items: [
      {
        id: 's-34-2025',
        title: 'Esboços de Discursos Públicos',
        pub: 's-34',
        label: 'S-34 · 2025',
        icon: 'podium',
      },
      {
        id: 's-31',
        title: 'Mostre gratidão pelo que Deus e Cristo fizeram por você',
        pub: 's-31',
        label: 'S-31',
        icon: 'podium',
        documentId: 0,
      },
      {
        id: 's-32',
        title: 'Discurso Fúnebre',
        pub: 's-32',
        label: 'S-32',
        icon: 'podium',
        documentId: 0,
      },
      {
        id: 's-41',
        title: 'Casamento honroso à vista de Deus',
        pub: 's-41',
        label: 'S-41',
        icon: 'podium',
        documentId: 0,
      },
      {
        id: 's-126-2025',
        title: 'Presidente da Celebração',
        pub: 's-126',
        label: 'S-126 · 2025',
        icon: 'podium',
      },
      {
        id: 's-125-26-2026',
        title: 'Presidente do discurso especial de 2026',
        pub: 's-125-26',
        label: 'S-125-26 · 2026',
        icon: 'podium',
      },
      {
        id: 's-34-talk-60',
        title: 'Esboços de Discursos Públicos 60. Você tem um objetivo na vida?',
        pub: 's-34',
        label: 'S-34',
        icon: 'podium',
        documentId: 59,
      },
    ],
  },
  {
    id: 'circuit-assembly',
    title: 'ASSEMBLEIA DE CIRCUITO',
    items: [
      {
        id: 'ca-talks-2025-2026',
        title: '2025-2026 Discursos da Assembleia de Circuito com o Superintendente de Circuito',
        pub: 'ca-cotk26',
        label: '2025-2026',
        icon: 'document',
      },
    ],
  },
];

export function isElderOutlinePubCached(pub: string, availablePubs: Set<string>) {
  return availablePubs.has(pub.toLowerCase());
}

const KNOWN_CATALOG_PUBS = new Set(
  ELDER_OUTLINE_SECTIONS.flatMap((section) => section.items.map((item) => item.pub.toLowerCase())),
);

export function installedToOutlineItem(entry: {
  pub: string;
  title: string;
  label: string;
  multiDocument: boolean;
  documentId?: number;
}): ElderOutlineItem {
  return {
    id: `installed-${entry.pub}`,
    title: entry.title,
    pub: entry.pub,
    label: entry.label,
    icon: entry.pub.startsWith('ca-') ? 'document' : 'podium',
    documentId: entry.multiDocument ? undefined : entry.documentId,
  };
}

/** Seções do catálogo com itens instalados + esboços importados fora da lista fixa. */
export function buildVisibleOutlineSections(
  availablePubs: Set<string>,
  installed: Array<{
    pub: string;
    title: string;
    label: string;
    multiDocument: boolean;
    documentId?: number;
  }>,
): ElderOutlineSection[] {
  const sections: ElderOutlineSection[] = ELDER_OUTLINE_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => isElderOutlinePubCached(item.pub, availablePubs)),
  })).filter((section) => section.items.length > 0);

  const extras = installed
    .filter((entry) => !KNOWN_CATALOG_PUBS.has(entry.pub.toLowerCase()))
    .map(installedToOutlineItem);

  if (extras.length > 0) {
    sections.push({
      id: 'imported',
      title: 'OUTROS ESBOÇOS',
      items: extras,
    });
  }

  return sections;
}
