/** Normaliza símbolo de publicação para comparação (ex.: s-27b_s-ba → s-27b-ba). */
export function canonicalPubSymbol(symbol: string): string {
  return symbol
    .toLowerCase()
    .replace(/_s-([a-z]{2})$/i, '-$1')
    .replace(/_/g, '-');
}

export function pubSymbolsMatch(a: string, b: string): boolean {
  return canonicalPubSymbol(a) === canonicalPubSymbol(b);
}

export function isPubSymbolAvailable(pub: string, availablePubs: Set<string>): boolean {
  for (const cached of availablePubs) {
    if (pubSymbolsMatch(pub, cached)) return true;
  }
  return false;
}
