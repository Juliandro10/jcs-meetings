export type WcgBlock = {
  pid: string;
  html: string;
  text: string;
};

export type WcgSectionKind =
  | 'narrative'
  | 'bible-account'
  | 'para-considerar'
  | 'analise'
  | 'medite'
  | 'quadro-completo'
  | 'aprenda-mais'
  | 'body';

export type WcgChapterSection = {
  kind: WcgSectionKind;
  title: string;
  blocks: WcgBlock[];
  /** false = não usar na reunião (ex.: Aprenda mais) */
  meetingRelevant: boolean;
  conductorStep?: number;
};

export type WcgChapterStructure = {
  chapterNumber: number | null;
  title: string;
  blocks: WcgBlock[];
  sections: WcgChapterSection[];
};

const SECTION_MARKERS: Array<{
  kind: WcgSectionKind;
  pattern: RegExp;
  title: string;
  meetingRelevant: boolean;
  conductorStep?: number;
}> = [
  {
    kind: 'bible-account',
    pattern: /^leia o relato na b[ií]blia/i,
    title: 'Leia o relato na Bíblia',
    meetingRelevant: true,
    conductorStep: 2,
  },
  {
    kind: 'para-considerar',
    pattern: /^para considerar/i,
    title: 'Para considerar',
    meetingRelevant: true,
    conductorStep: 2,
  },
  {
    kind: 'analise',
    pattern: /^an[aá]lise mais a fundo/i,
    title: 'Análise mais a fundo',
    meetingRelevant: true,
    conductorStep: 4,
  },
  {
    kind: 'medite',
    pattern: /^medite no que aprendeu/i,
    title: 'Medite no que aprendeu',
    meetingRelevant: true,
    conductorStep: 4,
  },
  {
    kind: 'quadro-completo',
    pattern: /^pense no quadro completo/i,
    title: 'Pense no quadro completo',
    meetingRelevant: true,
    conductorStep: 4,
  },
  {
    kind: 'aprenda-mais',
    pattern: /^aprenda mais/i,
    title: 'Aprenda mais',
    meetingRelevant: false,
    conductorStep: 6,
  },
];

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractBlocks(html: string): WcgBlock[] {
  const blocks: WcgBlock[] = [];
  const blockRe = /<(p|li|h[1-6]|div)[^>]*\bdata-pid="(\d+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html))) {
    const text = stripHtml(match[3]);
    if (!text && !/img|figure|svg/i.test(match[3])) continue;
    blocks.push({ pid: match[2], html: match[3], text });
  }
  return blocks;
}

function chapterNumberFromBlocks(blocks: WcgBlock[]) {
  const first = blocks[0]?.text ?? '';
  const match = first.match(/^(\d+)\s+/);
  return match ? Number(match[1]) : null;
}

function chapterTitleFromBlocks(blocks: WcgBlock[]) {
  if (blocks.length < 2) return blocks[0]?.text ?? 'Capítulo';
  const line = blocks[1]?.text?.trim();
  if (line && !/^leia o relato/i.test(line)) return line;
  return blocks[0]?.text ?? 'Capítulo';
}

function classifySectionHeader(text: string) {
  const normalized = text.trim();
  for (const marker of SECTION_MARKERS) {
    if (marker.pattern.test(normalized)) return marker;
  }
  return null;
}

function isImageBlock(block: WcgBlock) {
  return /^imagem\s+[a-z0-9]/i.test(block.text) || /photograph|figure|img/i.test(block.html);
}

const QUESTION_SECTION_KINDS = new Set<WcgSectionKind>([
  'para-considerar',
  'analise',
  'medite',
  'quadro-completo',
]);

function isSectionHeaderText(text: string) {
  return SECTION_MARKERS.some((marker) => marker.pattern.test(text.trim()));
}

function isScriptureList(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^Gênesis|^Êxodo|^Levítico|^Números|^Deuteronômio|^Josué|^Juízes|^Rute|^Atos/i.test(trimmed)) {
    return !trimmed.includes('?');
  }
  return /^[1-3]\s+[A-ZÁÉÍÓÚ]/.test(trimmed) && !trimmed.includes('?');
}

export type WcgChapterQuestion = {
  id: string;
  blockId: string;
  sectionKind: WcgSectionKind;
  sectionTitle: string;
  text: string;
};

export function extractWcgChapterQuestions(structure: WcgChapterStructure): WcgChapterQuestion[] {
  const questions: WcgChapterQuestion[] = [];

  for (const section of structure.sections) {
    if (!QUESTION_SECTION_KINDS.has(section.kind)) continue;

    for (const block of section.blocks) {
      const text = block.text.trim();
      if (!text || text.length < 12) continue;
      if (isSectionHeaderText(text)) continue;
      if (/^sua resposta$/i.test(text)) continue;
      if (isImageBlock(block) && !text.includes('?')) continue;
      if (isScriptureList(text)) continue;
      if (/^wp\d+|^g\s+\d|^w\d{2}\./i.test(text) && !text.includes('?')) continue;

      const isPrompt =
        text.includes('?') ||
        /^\d+\.\s/.test(text) ||
        /^Compare\s/i.test(text) ||
        /^O que\s/i.test(text) ||
        /^Como você\s/i.test(text);

      if (!isPrompt) continue;

      questions.push({
        id: `wcg-q-${block.pid}`,
        blockId: block.pid,
        sectionKind: section.kind,
        sectionTitle: section.title,
        text,
      });
    }
  }

  return questions;
}

export function buildWcgPrepExcerpt(structure: WcgChapterStructure, charLimit = 48_000) {
  const lines: string[] = [];
  for (const section of structure.sections) {
    if (!section.meetingRelevant) continue;
    lines.push(`\n## ${section.title} (${section.kind})`);
    for (const block of section.blocks) {
      if (isImageBlock(block)) {
        lines.push(`[p${block.pid}] (imagem) ${block.text.slice(0, 80)}`);
        continue;
      }
      if (!block.text.trim()) continue;
      lines.push(`[p${block.pid}] ${block.text}`);
    }
  }
  return lines.join('\n').slice(0, charLimit);
}

export function parseWcgChapterStructure(html: string): WcgChapterStructure {
  const blocks = extractBlocks(html);
  const chapterNumber = chapterNumberFromBlocks(blocks);
  const title = chapterTitleFromBlocks(blocks);

  const sections: WcgChapterSection[] = [];
  let current: WcgChapterSection = {
    kind: 'narrative',
    title: 'Leitura da narrativa',
    blocks: [],
    meetingRelevant: true,
    conductorStep: 1,
  };

  for (const block of blocks) {
    const header = classifySectionHeader(block.text);
    if (header) {
      if (current.blocks.length > 0) sections.push(current);
      current = {
        kind: header.kind,
        title: header.title,
        blocks: [block],
        meetingRelevant: header.meetingRelevant,
        conductorStep: header.conductorStep,
      };
      continue;
    }
    current.blocks.push(block);
  }
  if (current.blocks.length > 0) sections.push(current);

  return { chapterNumber, title, blocks, sections };
}

export const WCG_BIBLE_READING_FIELD_ID = 'wcg-bible-reading';

export function extractWcgBibleAccountRefs(structure: WcgChapterStructure) {
  const section = structure.sections.find((item) => item.kind === 'bible-account');
  if (!section) return { headingBlockId: '1', refs: '' };

  const heading =
    section.blocks.find((block) => /^leia o relato na b[ií]blia/i.test(block.text)) ?? section.blocks[0];
  const refs = section.blocks
    .filter((block) => block !== heading)
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join(' ');

  return { headingBlockId: heading?.pid ?? '1', refs };
}

export function injectWcgBibleReadingField(html: string) {
  if (html.includes(`id="${WCG_BIBLE_READING_FIELD_ID}"`)) return html;

  const heading = html.match(
    /(<(?:h[1-6]|p)\b[^>]*\bdata-pid="[^"]*"[^>]*>[\s\S]*?Leia o relato na B[ií]blia:?[\s\S]*?<\/(?:h[1-6]|p)>)/i,
  );
  if (!heading || heading.index == null) return html;

  const field = `
<div class="jcs-wcg-bible-reading gen-field" data-pid="${WCG_BIBLE_READING_FIELD_ID}">
  <label for="${WCG_BIBLE_READING_FIELD_ID}">Quais desses textos vou ler</label>
  <textarea id="${WCG_BIBLE_READING_FIELD_ID}" name="textarea-bible" class="jcs-editable-field" rows="3" data-jcs-stable-field="1" autocomplete="off" placeholder="Ex.: Gên. 32:6-12; 33:1-4"></textarea>
</div>`;

  const insertAt = heading.index + heading[0].length;
  return `${html.slice(0, insertAt)}${field}${html.slice(insertAt)}`;
}

export function stripWcgAprendaMais(html: string) {
  const wrapped = html.match(
    /<div\b[^>]*>\s*<(h[1-6]|p)\b[^>]*\bdata-pid="\d+"[^>]*>\s*(?:<span\b[^>]*>[\s\S]*?<\/span>\s*)?<strong>\s*Aprenda mais\s*<\/strong>[\s\S]*$/i,
  );
  if (wrapped?.index != null) return html.slice(0, wrapped.index).trimEnd();

  const heading = html.match(
    /<(h[1-6]|p)\b[^>]*\bdata-pid="\d+"[^>]*>\s*(?:<span\b[^>]*>[\s\S]*?<\/span>\s*)?<strong>\s*Aprenda mais\s*<\/strong>[\s\S]*$/i,
  );
  if (heading?.index != null) return html.slice(0, heading.index).trimEnd();

  return html;
}

export function wcgConductorGuideHtml() {
  return `<aside class="jcs-wcg-conductor-guide">
  <h2 class="jcs-wcg-conductor-guide-title">Como conduzir o estudo</h2>
  <p class="jcs-wcg-conductor-guide-intro">Livro <strong>Ande Corajosamente com Deus</strong> — siga esta ordem na reunião.</p>
  <ol class="jcs-wcg-conductor-steps">
    <li><strong>Leitura da narrativa</strong> — leia as duas primeiras páginas do capítulo (parte narrativa).</li>
    <li><strong>Leia o relato na Bíblia</strong> — leiam e comentem os textos principais da seção. Não é preciso ler todos os versículos; escolha os que ajudam a responder a <em>Para considerar</em>.</li>
    <li><strong>Controle do tempo</strong> — administre o tempo para caber as perguntas da segunda metade do capítulo.</li>
    <li><strong>Perguntas do capítulo</strong> — use as seções <em>Análise mais a fundo</em>, <em>Medite no que aprendeu</em> e <em>Pense no quadro completo</em>.</li>
    <li><strong>Comentários sobre as imagens</strong> — reserve tempo para a congregação comentar as ilustrações.</li>
    <li><strong>Aprenda mais</strong> — <span class="jcs-wcg-skip">não considere na reunião</span> (pesquisa individual dos publicadores).</li>
  </ol>
</aside>`;
}

export function buildWcgChapterMeetingHtml(rawHtml: string, options?: { includeAprendaMais?: boolean }) {
  const structure = parseWcgChapterStructure(rawHtml);
  const includeAprendaMais = options?.includeAprendaMais ?? false;
  const body = injectWcgBibleReadingField(includeAprendaMais ? rawHtml : stripWcgAprendaMais(rawHtml));

  const aprendaOmitted =
    !includeAprendaMais && structure.sections.some((s) => s.kind === 'aprenda-mais')
      ? '<p class="jcs-wcg-aprenda-omitted">A seção <strong>Aprenda mais</strong> foi omitida — use só em pesquisa pessoal, não na reunião.</p>'
      : '';

  return `${wcgConductorGuideHtml()}
${aprendaOmitted}
<div class="jcs-wcg-original">${body}</div>`;
}
