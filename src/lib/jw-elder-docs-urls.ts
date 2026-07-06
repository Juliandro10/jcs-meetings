export const JW_ELDER_DOCS_URLS = {
  outlines: 'https://docs.jw.org/pt/-/cds-cat-docs-outlines',
  guidelines: 'https://docs.jw.org/pt/-/cds-cat-docs-instructions',
} as const;

export type JwElderDocsCatalog = keyof typeof JW_ELDER_DOCS_URLS;
