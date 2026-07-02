export type DailyTextResult = {
  ok: boolean;
  dateLabel?: string;
  scriptureHtml?: string;
  bodyHtml?: string;
  wolUrl?: string;
  error?: string;
};

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeInlineHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(?!\/?(em|a|strong|i|b)\b)[^>]+>/gi, '')
    .trim();
}

function localePath(lang: string) {
  if (lang === 'T' || lang.startsWith('pt')) return 'lp-t';
  if (lang === 'E' || lang.startsWith('en')) return 'lp-e';
  return 'lp-t';
}

function acceptLanguage(lang: string) {
  if (lang === 'T' || lang.startsWith('pt')) return 'pt-BR,pt;q=0.9';
  if (lang === 'E' || lang.startsWith('en')) return 'en-US,en;q=0.9';
  return 'pt-BR,pt;q=0.9';
}

/** WOL inclui vários dias na mesma página; extrai só o bloco da data pedida. */
function extractTabForDate(html: string, isoDate: string): string | null {
  const openTag = `<div class="tabContent" data-date="${isoDate}`;
  const start = html.indexOf(openTag);
  if (start < 0) return null;

  const fromTag = html.slice(start);
  const contentStart = fromTag.indexOf('>');
  if (contentStart < 0) return null;

  const rest = fromTag.slice(contentStart + 1);
  const nextTab = rest.indexOf('<div class="tabContent" data-date="');
  return nextTab >= 0 ? rest.slice(0, nextTab) : rest;
}

export async function fetchDailyText(lang = 'T', date = new Date()): Promise<DailyTextResult> {
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;
    const locale = localePath(lang);
    const wolUrl = `https://wol.jw.org/wol/dt/r1/${locale}/${year}/${month}/${day}`;

    const response = await fetch(wolUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': acceptLanguage(lang),
      },
    });

    const html = await response.text();
    const tabHtml = extractTabForDate(html, isoDate);
    if (!tabHtml?.includes('themeScrp')) {
      return { ok: false, error: 'Texto diário não disponível para esta data.', wolUrl };
    }

    const dateLabel = stripTags(tabHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '');
    const scriptureRaw = tabHtml.match(/<p[^>]*class="themeScrp"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
    const bodyRaw =
      tabHtml.match(/<div class="bodyTxt">[\s\S]*?<p[^>]*class="sb"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';

    const scriptureHtml = sanitizeInlineHtml(scriptureRaw);
    const bodyHtml = sanitizeInlineHtml(bodyRaw);

    if (!scriptureHtml && !bodyHtml) {
      return { ok: false, error: 'Não foi possível ler o texto diário.', wolUrl };
    }

    return {
      ok: true,
      dateLabel: dateLabel || undefined,
      scriptureHtml,
      bodyHtml,
      wolUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar texto diário';
    return { ok: false, error: message };
  }
}
