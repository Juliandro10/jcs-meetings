/** Normaliza símbolo de publicação para comparação (ex.: s-27b_s-ba → s-27b-ba). */
export function canonicalPubSymbol(symbol: string): string {
  return symbol
    .toLowerCase()
    .replace(/_s-([a-z]{2})$/i, '-$1')
    .replace(/_/g, '-');
}

/**
 * Apostila/Sentinela no .jwpub usam símbolo com ano (mwb26, w26).
 * No cache do JCS mantemos sempre mwb / w para bater com download e cronograma.
 */
export function meetingPubCachePrefix(symbol: string): 'mwb' | 'w' | null {
  const canonical = canonicalPubSymbol(symbol);
  if (canonical === 'mwb' || /^mwb\d+$/.test(canonical)) return 'mwb';
  if (canonical === 'w' || /^w\d+$/.test(canonical)) return 'w';
  return null;
}

/** Variantes de prefixo de arquivo .jwpub para um símbolo. */
export function pubCacheKeyVariants(pub: string): string[] {
  const canonical = canonicalPubSymbol(pub);
  const variants = new Set<string>([pub.toLowerCase(), canonical]);

  const meeting = meetingPubCachePrefix(canonical);
  if (meeting === 'mwb') {
    variants.add('mwb');
    const yearSuffix = canonical.match(/^mwb(\d{2,4})$/);
    if (yearSuffix) variants.add(`mwb${yearSuffix[1]}`);
  } else if (meeting === 'w') {
    variants.add('w');
    const yearSuffix = canonical.match(/^w(\d{2,4})$/);
    if (yearSuffix) variants.add(`w${yearSuffix[1]}`);
  }

  const hyphenRegional = canonical.match(/^(.+)-([a-z]{2})$/);
  if (hyphenRegional) {
    variants.add(`${hyphenRegional[1]}_s-${hyphenRegional[2]}`);
  }

  const underscoreRegional = pub.toLowerCase().match(/^(.+)_s-([a-z]{2})$/);
  if (underscoreRegional) {
    variants.add(`${underscoreRegional[1]}-${underscoreRegional[2]}`);
  }

  // Estudo Perspicaz: a API aceita it-1/it-2, mas o .jwpub no cache usa símbolo it.
  if (/^it-[12]$/.test(canonical)) {
    variants.add('it');
  }

  return [...variants];
}

export function pubSymbolsMatch(a: string, b: string): boolean {
  return canonicalPubSymbol(a) === canonicalPubSymbol(b);
}

/** Extrai prefixo do nome de cache (parte antes de _T_ / _E_ / etc.). */
export function parseJwpubCachePrefix(fileName: string): string | null {
  const parts = parseJwpubFileNameParts(fileName);
  return parts?.prefix ?? null;
}

export function parseJwpubFileNameParts(fileName: string): {
  prefix: string;
  lang: string;
  issue: string;
} | null {
  // Formato cache: pub_lang_edição.jwpub (edição pode ser vazia)
  const withIssue = fileName.match(/^(.+?)_([A-Za-z]{1,3})_(.*)\.jwpub$/i);
  if (withIssue) {
    return {
      prefix: withIssue[1]!.toLowerCase(),
      lang: withIssue[2]!,
      issue: withIssue[3] ?? '',
    };
  }

  // Formato JW Library ao exportar/baixar: pub_lang.jwpub
  const short = fileName.match(/^(.+?)_([A-Za-z]{1,3})\.jwpub$/i);
  if (short) {
    return {
      prefix: short[1]!.toLowerCase(),
      lang: short[2]!,
      issue: '',
    };
  }

  return null;
}

/** Nome canônico de cache: símbolo normalizado + idioma + edição. */
export function buildStandardJwpubCacheFileName(symbol: string, lang: string, issue = ''): string {
  const meetingPrefix = meetingPubCachePrefix(symbol);
  const prefix = meetingPrefix ?? canonicalPubSymbol(symbol);
  return `${prefix}_${lang}_${issue}.jwpub`;
}
