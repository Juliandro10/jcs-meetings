import { normalizePlainText } from '../shared/text-normalize';
import { JW_AI_GROUNDING_RULES, JW_FIELD_SERVICE_CONSIDERATION_RULES } from './ai-prompts';
import { loadBibleReadingText } from './bible-reading-context';
import {
  extractDocumentStructure,
  extractWatchtowerStudyStructure,
  getPartBlockRanges,
} from './document-structure';
import { searchCachedPublications } from './global-search';
import { listCachedJwpubs } from './jw-download';
import { fetchWolPreachingResearch, type WolPreachingSnippet } from './jw-online-search';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import { loadPreachingContent } from './preaching';
import { buildWeekMeetingSummary } from './week-meeting-summary';
import { buildBibleHref, parseBibleCitations } from '../src/lib/bible-citation';
import type {
  FieldServiceConsiderationContextPreview,
  FieldServiceConsiderationSuggestion,
  FieldServiceConsiderationsResult,
  FieldServiceReferenceLink,
  MeetingWeek,
} from './types';
import {
  fieldKey,
  getFieldServiceSuggestions,
  getFieldValues,
  getNotes,
  setFieldServiceSuggestions,
} from './user-prep-store';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const FIELD_SERVICE_MODEL = process.env.OPENAI_FIELD_SERVICE_MODEL?.trim() || 'gpt-4o';

const PREACHING_KEYWORDS =
  /\b(prega|minist[eé]rio|servi[cç]o de campo|boas novas|testemunho|disc[ií]pulo|territ[oó]rio|visita|interesse|publicador)\b/i;

function stripHtml(value: string) {
  return normalizePlainText(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n'),
  );
}

function excerpt(text: string, max = 2400) {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trim()}…`;
}

function blockTextMap(html: string) {
  const structure = extractDocumentStructure(html);
  const map = new Map(structure.blocks.map((block) => [block.blockId, block.text]));
  return { structure, map };
}

async function loadMwbWeekExcerpt(cacheDir: string, userDataDir: string, week: MeetingWeek, label: string) {
  if (!week.mwbDownloaded || week.mwbDocumentId == null) {
    return { label, available: false as const, reason: 'Apostila da semana não baixada.' };
  }

  const filePath = await resolveCachedPubPath(cacheDir, 'mwb', week.mwbIssue ?? '');
  if (!filePath) {
    return { label, available: false as const, reason: 'Arquivo mwb não encontrado.' };
  }

  const html = await getDocumentHtml(filePath, week.mwbDocumentId);
  const { structure, map } = blockTextMap(html);
  const ranges = getPartBlockRanges(structure.parts, structure.blocks);

  const ministryParts = structure.parts.filter((part) => part.kind === 'ministry' || part.kind === 'life');
  const preachingParts = ministryParts.filter((part) => PREACHING_KEYWORDS.test(part.title));

  const selected = preachingParts.length > 0 ? preachingParts : ministryParts;
  const sections: string[] = [];

  for (const part of selected.slice(0, 4)) {
    const blockIds = ranges.get(part.blockId) ?? [part.blockId];
    const text = blockIds
      .map((id) => map.get(id) ?? '')
      .join('\n')
      .trim();
    if (text) sections.push(`### ${part.title}\n${excerpt(stripHtml(text), 900)}`);
  }

  const notes = await getNotes(userDataDir, 'mwb', week.mwbIssue ?? '', week.mwbDocumentId);
  const practiceNote = notes.find((note) => note.tags.includes('practice-points') || note.tags.includes('auto-prep'));
  if (practiceNote?.body?.trim()) {
    sections.push(`### Pontos para colocar em prática (preparação salva)\n${excerpt(stripHtml(practiceNote.body), 700)}`);
  }

  if (sections.length === 0) {
    return { label, available: false as const, reason: 'Sem partes de ministério identificadas.' };
  }

  return {
    label,
    available: true as const,
    weekLabel: week.label,
    bibleReading: week.bibleReading,
    body: sections.join('\n\n'),
  };
}

async function loadWatchtowerExcerpt(cacheDir: string, userDataDir: string, week: MeetingWeek) {
  if (!week.wDownloaded || week.wDocumentId == null) {
    return { available: false as const, reason: 'Estudo da Sentinela não baixado.' };
  }

  const filePath = await resolveCachedPubPath(cacheDir, 'w', week.wIssue ?? '');
  if (!filePath) {
    return { available: false as const, reason: 'Arquivo w não encontrado.' };
  }

  const html = await getDocumentHtml(filePath, week.wDocumentId);
  const study = extractWatchtowerStudyStructure(html);
  const prefix = `w_${week.wIssue ?? ''}_d${week.wDocumentId}_f`;
  const savedFields = await getFieldValues(userDataDir, prefix);

  const questionLines = study.questions.slice(0, 6).map((question) => {
    const key = fieldKey('w', week.wIssue ?? '', week.wDocumentId, question.fieldId);
    const answer = savedFields[key]?.trim();
    const answerText = answer ? `\nResposta preparada: ${excerpt(stripHtml(answer), 420)}` : '';
    return `- ${question.questionText}${answerText}`;
  });

  const introBlock = study.blocks.find((block) => block.text.trim().length > 80);
  const intro = introBlock ? excerpt(stripHtml(introBlock.text), 600) : '';
  const body = [
    `Título: ${week.watchtowerTitle || week.wStudyTitle || 'Estudo de A Sentinela'}`,
    intro ? `Introdução: ${intro}` : '',
    questionLines.length ? `Perguntas do estudo:\n${questionLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { available: true as const, body: excerpt(body, 2200) };
}

async function loadCachedWatchtowerPreachingArticles(cacheDir: string) {
  const search = await searchCachedPublications(
    cacheDir,
    'pregação boas novas serviço de campo testemunho',
    6,
  );
  if (!search.ok || search.results.length === 0) {
    return { available: false as const, reason: 'Nenhuma Sentinela cacheada sobre pregação.' };
  }

  const watchtowerHits = search.results.filter((hit) => hit.pub.toLowerCase() === 'w').slice(0, 4);
  if (watchtowerHits.length === 0) {
    return { available: false as const, reason: 'Nenhuma Sentinela cacheada sobre pregação.' };
  }

  const lines = watchtowerHits.map(
    (hit) => `- ${hit.documentTitle} (${hit.publicationLabel}${hit.issue ? ` · ${hit.issue}` : ''}): ${hit.snippet}`,
  );

  return { available: true as const, body: lines.join('\n') };
}

async function loadLmdExcerpt(cacheDir: string) {
  const preaching = await loadPreachingContent(cacheDir);
  if (!preaching.lmdDownloaded || preaching.topics.length === 0) {
    return { available: false as const, reason: 'Brochura lmd (Ame as Pessoas — Faça Discípulos) não baixada.' };
  }

  const lines = preaching.topics.slice(0, 8).map((topic) => {
    const points = topic.points
      .slice(0, 4)
      .map((point) => point.plainText.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
      .join(' | ');
    return `- ${topic.title}: ${excerpt(points, 280)}`;
  });

  return {
    available: true as const,
    body: lines.join('\n'),
    intro: preaching.introHtml ? excerpt(stripHtml(preaching.introHtml), 400) : undefined,
  };
}

async function buildContextPrompt(
  cacheDir: string,
  userDataDir: string,
  week: MeetingWeek,
  previousWeek?: MeetingWeek,
) {
  const [summary, currentMwb, previousMwb, watchtower, watchtowerArchive, lmd, wol] = await Promise.all([
    buildWeekMeetingSummary(cacheDir, userDataDir, week),
    loadMwbWeekExcerpt(cacheDir, userDataDir, week, 'Apostila desta semana'),
    previousWeek
      ? loadMwbWeekExcerpt(cacheDir, userDataDir, previousWeek, 'Apostila da semana anterior')
      : Promise.resolve(null),
    loadWatchtowerExcerpt(cacheDir, userDataDir, week),
    loadCachedWatchtowerPreachingArticles(cacheDir),
    loadLmdExcerpt(cacheDir),
    fetchWolPreachingResearch(5),
  ]);

  let bibleReadingText = '';
  if (week.bibleReading?.trim()) {
    try {
      bibleReadingText = excerpt(await loadBibleReadingText(cacheDir, week.bibleReading), 1200);
    } catch {
      bibleReadingText = '';
    }
  }

  const sections: string[] = [];

  if (lmd.available) {
    sections.push('## Brochura Ame as Pessoas — Faça Discípulos (lmd)');
    if (lmd.intro) sections.push(lmd.intro);
    sections.push(lmd.body);
  }

  if (currentMwb.available) {
    sections.push(`## ${currentMwb.label} (${currentMwb.weekLabel})`);
    if (currentMwb.bibleReading) sections.push(`Leitura bíblica: ${currentMwb.bibleReading}.`);
    sections.push(currentMwb.body);
  }

  if (previousMwb?.available) {
    sections.push(`## ${previousMwb.label} (${previousMwb.weekLabel})`);
    sections.push(previousMwb.body);
  }

  if (watchtower.available) {
    sections.push('## Estudo de A Sentinela desta semana');
    sections.push(watchtower.body);
  }

  if (watchtowerArchive.available) {
    sections.push('## Estudos de A Sentinela (cache — pregação)');
    sections.push(watchtowerArchive.body);
  }

  if (wol.length > 0) {
    sections.push('## Pesquisa jw.org (Biblioteca On-line — pregação)');
    sections.push(
      wol.map((item) => `- ${item.title}: ${item.excerpt} (${item.source})`).join('\n'),
    );
  }

  if (bibleReadingText) {
    sections.push('## Leitura bíblica da semana');
    sections.push(bibleReadingText);
  }

  if (summary.midweek.points.length || summary.weekend.watchtowerPoints.length) {
    sections.push('## Resumo da preparação salva no JCS');
    const points = [...summary.midweek.points, ...summary.weekend.watchtowerPoints].slice(0, 8);
    if (points.length) sections.push(points.map((point) => `- ${point}`).join('\n'));
  }

  const preview: FieldServiceConsiderationContextPreview = {
    lmd: lmd.available,
    currentMwb: currentMwb.available,
    previousMwb: Boolean(previousMwb?.available),
    watchtower: watchtower.available,
    watchtowerArchive: watchtowerArchive.available,
    jwOrg: wol.length > 0,
    bibleReading: Boolean(bibleReadingText),
    missing: [
      !lmd.available ? lmd.reason : '',
      !currentMwb.available ? currentMwb.reason : '',
      previousWeek && previousMwb && !previousMwb.available ? previousMwb.reason : '',
      !watchtower.available ? watchtower.reason : '',
      !watchtowerArchive.available ? watchtowerArchive.reason : '',
      wol.length === 0 ? 'Pesquisa jw.org indisponível no momento.' : '',
    ].filter(Boolean),
  };

  return { prompt: sections.join('\n\n'), preview, wol };
}

function enrichSuggestionLinks(
  suggestion: FieldServiceConsiderationSuggestion,
  wolItems: WolPreachingSnippet[],
): FieldServiceConsiderationSuggestion {
  const links: FieldServiceReferenceLink[] = [];
  const seen = new Set<string>();

  const addLink = (link: FieldServiceReferenceLink) => {
    const key = `${link.href}|${link.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };

  const addCitations = (text: string) => {
    for (const cite of parseBibleCitations(text)) {
      addLink({ label: cite.raw, href: buildBibleHref(cite) });
    }
  };

  if (suggestion.scripture) addCitations(suggestion.scripture);
  for (const source of suggestion.sources) {
    addCitations(source);
    const lower = source.toLowerCase();
    if (lower.includes('jw.org') || lower.includes('biblioteca')) {
      for (const item of wolItems) {
        if (!item.url) continue;
        if (
          lower.includes(item.title.toLowerCase().slice(0, 24)) ||
          source.includes(item.title) ||
          (wolItems.length === 1 && lower.includes('jw'))
        ) {
          addLink({ label: item.title, href: item.url });
        }
      }
    }
  }

  for (const item of wolItems) {
    if (!item.url) continue;
    const needle = item.title.toLowerCase().slice(0, 20);
    if (
      needle.length >= 12 &&
      (suggestion.title.toLowerCase().includes(needle) ||
        suggestion.body.toLowerCase().includes(needle))
    ) {
      addLink({ label: item.title, href: item.url });
    }
  }

  return links.length ? { ...suggestion, links } : suggestion;
}

function parseSuggestions(raw: string): FieldServiceConsiderationSuggestion[] {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      suggestions?: Array<{
        title?: string;
        scripture?: string;
        body?: string;
        sources?: string[];
        encouragement?: string;
      }>;
    };

    return (parsed.suggestions ?? [])
      .map((item, index) => ({
        id: `suggestion-${index + 1}`,
        title: item.title?.trim() ?? `Sugestão ${index + 1}`,
        scripture: item.scripture?.trim() || undefined,
        body: item.body?.trim() ?? '',
        sources: (item.sources ?? []).map((source) => source.trim()).filter(Boolean),
        encouragement: item.encouragement?.trim() || undefined,
      }))
      .filter((item) => item.body.length > 40);
  } catch {
    return [];
  }
}

export async function previewFieldServiceContext(
  cacheDir: string,
  userDataDir: string,
  week: MeetingWeek,
  previousWeek?: MeetingWeek,
): Promise<FieldServiceConsiderationContextPreview> {
  const { preview } = await buildContextPrompt(cacheDir, userDataDir, week, previousWeek);
  return preview;
}

export async function generateFieldServiceConsiderations(
  cacheDir: string,
  userDataDir: string,
  week: MeetingWeek,
  previousWeek?: MeetingWeek,
  forceRegenerate = false,
): Promise<FieldServiceConsiderationsResult> {
  const { prompt, preview, wol } = await buildContextPrompt(cacheDir, userDataDir, week, previousWeek);

  if (!forceRegenerate) {
    const cached = await getFieldServiceSuggestions(userDataDir, week.id);
    if (cached?.suggestions?.length) {
      return {
        ok: true,
        suggestions: cached.suggestions,
        fromCache: true,
        generatedAt: cached.generatedAt,
        contextPreview: preview,
      };
    }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'Configure OPENAI_API_KEY no arquivo .env na pasta do projeto.',
      contextPreview: preview,
    };
  }

  if (!prompt.trim()) {
    return {
      ok: false,
      error: 'Não há material suficiente. Baixe apostila, lmd ou Sentinela na aba Reuniões/Pregação.',
      contextPreview: preview,
    };
  }

  const cached = await listCachedJwpubs(cacheDir);
  const system = [
    JW_AI_GROUNDING_RULES,
    '',
    JW_FIELD_SERVICE_CONSIDERATION_RULES,
    '',
    '## Publicações baixadas no JCS',
    cached.length ? cached.map((key) => `- ${key}.jwpub`).join('\n') : 'Nenhuma listada.',
    '',
    '## Material para considerações de saída de campo',
    prompt,
  ].join('\n');

  const userMessage = [
    `Semana: ${week.label}.`,
    week.bibleReading ? `Leitura bíblica: ${week.bibleReading}.` : '',
    '',
    'Gere considerações bem elaboradas para a reunião de saída de campo desta semana.',
    'Responda APENAS com JSON válido, sem markdown.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: FIELD_SERVICE_MODEL,
        temperature: 0.45,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `OpenAI retornou ${response.status}: ${body.slice(0, 200)}`, contextPreview: preview };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: 'Resposta vazia da OpenAI.', contextPreview: preview };
    }

    const suggestions = parseSuggestions(content).map((item) => enrichSuggestionLinks(item, wol));
    if (suggestions.length === 0) {
      return { ok: false, error: 'Não foi possível interpretar as sugestões geradas.', contextPreview: preview };
    }

    const generatedAt = new Date().toISOString();
    await setFieldServiceSuggestions(userDataDir, week.id, { suggestions, generatedAt });

    return { ok: true, suggestions, generatedAt, contextPreview: preview };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao contactar a OpenAI.';
    return { ok: false, error: message, contextPreview: preview };
  }
}
