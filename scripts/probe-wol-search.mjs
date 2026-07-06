const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function stripHtml(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWolSearchResults(html, query) {
  if (
    html.includes('Nenhum documento contém os termos pesquisados') ||
    html.includes('Não foi possível pesquisar por')
  ) {
    return [];
  }

  const results = [];
  for (const block of html.matchAll(/<ul class="results resultContentDocument">([\s\S]*?)<\/ul>/gi)) {
    const section = block[1] ?? '';
    const titleMatch = section.match(
      /<li class="caption">[\s\S]*?<a class="lnk"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const excerptMatch = section.match(
      /<li class="searchResult[^"]*"[\s\S]*?<div class="document">([\s\S]*?)<\/div>/i,
    );
    const refMatch = section.match(/<li class="ref">([\s\S]*?)<\/li>/i);

    const title = stripHtml(titleMatch?.[1] ?? '');
    if (!title) continue;

    let excerpt = stripHtml(excerptMatch?.[1] ?? '').replace(/\s+/g, ' ').trim();
    if (!excerpt) excerpt = `Pesquisa: ${query}`;

    const pubRef = stripHtml(refMatch?.[1] ?? '');
    const source = pubRef ? `Biblioteca On-line — ${pubRef}` : 'Biblioteca On-line (wol.jw.org)';

    results.push({ title, excerpt: excerpt.slice(0, 400), source });
  }
  return results;
}

const url = `https://wol.jw.org/pt/wol/s/r5/lp-t?q=${encodeURIComponent('serviço de campo')}&p=par&r=newest`;
const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
const html = await response.text();
const results = parseWolSearchResults(html, 'serviço de campo').slice(0, 5);
console.log('status', response.status, 'results', results.length);
for (const item of results) {
  console.log('---');
  console.log(item.title);
  console.log(item.excerpt.slice(0, 100));
  console.log(item.source);
}
