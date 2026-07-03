import { loadBibleReadingText } from './bible-reading-context';
import {
  buildFieldPromptLines,
  extractDocumentStructure,
  extractWatchtowerStudyStructure,
  findAnchorInBlock,
  formatJoiasField,
  getPartBlockRanges,
  resolveHighlightInBlock,
  resolveNoteTitle,
  type DocumentStructure,
  type MeetingPart,
  type WatchtowerStudyStructure,
} from './document-structure';
import {
  buildAiSystemPrompt,
  JW_AI_GROUNDING_RULES,
  JW_HIGHLIGHT_RULES,
  JW_JOIAS_RULES,
  JW_PERSONAL_LEARNING_NOTE_RULES,
  JW_PRACTICE_POINTS_RULES,
  JW_SENTINEL_PREP_RULES,
} from './ai-prompts';
import { enrichAiContext } from './ai-context';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { AutoPrepNote, AutoPrepParams, AutoPrepResult } from './types';
import { dedupeNotesForDocument } from './note-dedupe';
import {
  fieldKey,
  replaceTaggedNotes,
  saveHighlightsBatch,
  setFieldValue,
} from './user-prep-store';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const AUTO_PREP_MODEL = process.env.OPENAI_AUTO_PREP_MODEL?.trim() || 'gpt-4o';

const JOIA_VERSE_RE = /\b(?:[A-Za-zÀ-ú]{2,4}\.\s*)?\d{1,3}\s*:\s*\d{1,3}\b/;

const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const;

function normalizeJoiasOptions(raw: string[] | undefined, joiasFieldValue?: string) {
  const options = [...(raw ?? [])].map((item) => item.trim()).filter(Boolean);

  if (options.length < 3 && joiasFieldValue?.trim()) {
    const lines = joiasFieldValue
      .split(/\n+/)
      .map((line) => line.replace(/^\d+\)\s*/, '').trim())
      .filter(Boolean);
    options.push(...lines);
  }

  const unique: string[] = [];
  for (const option of options) {
    if (!unique.some((item) => item.toLowerCase() === option.toLowerCase())) unique.push(option);
  }
  return unique.slice(0, 3);
}

function joiaHasApplication(text: string) {
  const parts = text.split(/\s[—–-]\s/);
  if (parts.length < 2) return false;
  const body = parts.slice(1).join(' — ').trim();
  if (body.length < 20) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes('aprend') ||
    lower.includes('jeová') ||
    lower.includes('jeova') ||
    lower.includes('podemos') ||
    lower.includes('nós') ||
    lower.includes('nos ') ||
    lower.includes('minister') ||
    lower.includes('congreg') ||
    lower.includes('vida') ||
    lower.includes('ensina') ||
    lower.includes('exemplo') ||
    lower.includes('sobre jeová') ||
    lower.includes('vida crist') ||
    body.length >= 35
  );
}

function joiasLookValid(options: string[]) {
  return (
    options.length >= 3 &&
    options.every((item) => JOIA_VERSE_RE.test(item) && joiaHasApplication(item))
  );
}

function blockContainsText(blockText: string, needle: string) {
  return resolveHighlightInBlock(blockText, needle) !== null;
}

function isHighlightBodyBlock(text: string, part: MeetingPart) {
  const trimmed = text.trim();
  if (trimmed === part.text.trim()) return false;
  if (/^\d+\.\s/.test(trimmed) && trimmed.length < 120) return false;
  if (/^\(\d+\s*min\)/i.test(trimmed)) return false;
  if (trimmed.endsWith('?') && trimmed.length < 220) return false;
  return trimmed.length >= 24;
}

function refineHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  parts: MeetingPart[],
  blocks: Array<{ blockId: string; text: string }>,
) {
  const blockById = new Map(blocks.map((block) => [block.blockId, block.text]));
  const partRanges = getPartBlockRanges(parts, blocks);
  const skipKinds = new Set<MeetingPart['kind']>(['reading', 'local', 'other']);

  const resolved = highlights
    .map((highlight) => {
      const block = blockById.get(highlight.blockId);
      if (!block) return null;
      const located = resolveHighlightInBlock(block, highlight.text);
      if (!located) return null;
      const wordCount = located.text.trim().split(/\s+/).length;
      if (wordCount > 22 || wordCount < 3) return null;
      if (/^\(?\d+\s*min\)?$/i.test(located.text.trim())) return null;
      return { ...highlight, text: located.text, startOffset: located.startOffset, endOffset: located.endOffset };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const byPart = new Map<string, (typeof resolved)[number]>();
  for (const part of parts) {
    if (skipKinds.has(part.kind)) continue;
    const rangeIds = new Set(partRanges.get(part.blockId) ?? [part.blockId]);
    const candidates = resolved.filter((highlight) => rangeIds.has(highlight.blockId));
    if (candidates.length === 0) continue;

    const scored = candidates
      .map((highlight) => {
        const blockText = blockById.get(highlight.blockId) ?? '';
        const bodyScore = isHighlightBodyBlock(blockText, part) ? 0 : 2;
        const titleScore = highlight.blockId === part.blockId ? 1 : 0;
        return { highlight, score: bodyScore + titleScore };
      })
      .sort((a, b) => a.score - b.score || b.highlight.text.length - a.highlight.text.length);

    byPart.set(part.blockId, scored[0].highlight);
  }

  return [...byPart.values()]
    .slice(0, Math.min(10, Math.max(5, parts.length)))
    .map((highlight, index) => ({
      ...highlight,
      color: HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length],
    }));
}

function normalizeNotesAgainstStructure(
  notes: AutoPrepNote[],
  structure: DocumentStructure,
): AutoPrepNote[] {
  const { parts, blocks } = structure;
  const blockById = new Map(blocks.map((block) => [block.blockId, block.text]));

  const normalized = notes.map((note) => {
    const part =
      parts.find((item) => item.blockId === note.blockId) ??
      parts.find((item) => note.title.includes(item.title.slice(0, 12)));

    const blockId = part?.blockId ?? note.blockId;
    const blockText = blockById.get(blockId) ?? part?.text ?? '';
    const anchorText = findAnchorInBlock(blockText, note.anchorText || part?.noteAnchorText || note.title);
    const title = resolveNoteTitle(structure, blockId) ?? part?.title ?? note.title;

    return {
      ...note,
      blockId,
      title,
      anchorText,
      tags: note.tags?.length ? note.tags : ['auto-prep'],
    };
  });

  for (const part of parts) {
    const already = normalized.some((note) => note.blockId === part.blockId);
    if (already) continue;

    normalized.push({
      blockId: part.blockId,
      anchorText: part.noteAnchorText,
      title: part.title,
      body: '',
      tags: ['auto-prep'],
    });
  }

  return normalized.filter((note) => note.blockId && note.anchorText && note.title);
}

async function requestJoiasOptions(
  apiKey: string,
  bibleReadingLabel: string | undefined,
  bibleText: string | undefined,
  documentExcerpt: string,
): Promise<string[]> {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Você prepara Joias espirituais para a reunião Vida e Ministério.',
            JW_AI_GROUNDING_RULES,
            JW_JOIAS_RULES,
            `Leitura da semana: ${bibleReadingLabel ?? '—'}.`,
            bibleText ? `Texto bíblico:\n${bibleText.slice(0, 8000)}` : '',
            'Devolva APENAS JSON: {"joiasOptions":["...","...","..."]}',
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: `Matéria:\n${documentExcerpt.slice(0, 4000)}\n\nGere 3 joias espirituais.`,
        },
      ],
    }),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { joiasOptions?: string[] };
  return normalizeJoiasOptions(parsed.joiasOptions);
}

function refineWatchtowerHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  wtStructure: WatchtowerStudyStructure,
) {
  const blockById = new Map(wtStructure.blocks.map((block) => [block.blockId, block.text]));
  const answerBlockIds = new Set(
    wtStructure.questions.flatMap((question) =>
      question.answerBlockIds.length > 0
        ? question.answerBlockIds
        : [question.questionBlockId],
    ),
  );

  const valid = highlights
    .map((highlight) => {
      const block = blockById.get(highlight.blockId);
      if (!block) return null;
      const located = resolveHighlightInBlock(block, highlight.text);
      if (!located) return null;
      if (located.text.trim().split(/\s+/).length > 22) return null;
      return { ...highlight, text: located.text, startOffset: located.startOffset, endOffset: located.endOffset };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const sorted = [...valid].sort((a, b) => {
    const aScore = answerBlockIds.has(a.blockId) ? 0 : 1;
    const bScore = answerBlockIds.has(b.blockId) ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return b.text.length - a.text.length;
  });

  const byBlock = new Map<string, (typeof sorted)[number]>();
  for (const highlight of sorted) {
    if (!byBlock.has(highlight.blockId)) byBlock.set(highlight.blockId, highlight);
  }

  return [...byBlock.values()]
    .slice(0, Math.max(wtStructure.questions.length, 5))
    .map((highlight, index) => ({
      ...highlight,
      color: HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length],
    }));
}

function normalizeSentinelFieldValue(value: string, isReview: boolean) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const hasMain = /resposta principal/i.test(trimmed);
  const hasExtra = /resposta adicional/i.test(trimmed);
  if (hasMain && hasExtra) return trimmed;

  const lines = trimmed.split(/\n+/).filter(Boolean);
  if (lines.length >= 2 && hasMain) return trimmed;

  const main = lines[0] ?? trimmed;
  const extra = lines.slice(1).join(' ').trim();
  const prefix = isReview && !/^parágrafo/i.test(main) ? `Parágrafo(s): —\n` : '';
  return `${prefix}Resposta principal: ${main.replace(/^resposta principal:\s*/i, '')}\n\nResposta adicional: ${extra || 'Aplicação pessoal com base no parágrafo citado.'}`;
}

async function requestMissingFields(
  apiKey: string,
  structure: DocumentStructure,
  documentExcerpt: string,
  existing: Array<{ fieldId: string; value: string }>,
  excludeFieldIds: string[] = [],
): Promise<Array<{ fieldId: string; value: string }>> {
  const excluded = new Set(excludeFieldIds);
  const missing = structure.fields.filter(
    (field) => !excluded.has(field.fieldId) && !existing.some((item) => item.fieldId === field.fieldId),
  );
  if (missing.length === 0) return existing;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Complete campos editáveis da apostila. APENAS JSON.',
            '{"fields":[{"fieldId":"tt20","value":"resposta curta em 2-4 frases"}]}',
            JW_AI_GROUNDING_RULES,
            'Responda com suas palavras, vocabulário JW, sem copiar parágrafo inteiro.',
            'Campos pendentes:',
            ...missing.map((field) => {
              const question = (field.questionText ?? '').replace(/\s+/g, ' ').trim();
              return `- ${field.fieldId}: "${question}"`;
            }),
          ].join('\n'),
        },
        {
          role: 'user',
          content: documentExcerpt.slice(0, 9000),
        },
      ],
    }),
  });

  if (!response.ok) return existing;
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return existing;

  const parsed = JSON.parse(raw) as { fields?: Array<{ fieldId?: string; value?: string }> };
  const extra = (parsed.fields ?? [])
    .filter((field) => field.fieldId && field.value?.trim())
    .map((field) => ({ fieldId: field.fieldId!, value: field.value!.trim() }));

  const merged = [...existing];
  for (const field of extra) {
    if (!merged.some((item) => item.fieldId === field.fieldId)) merged.push(field);
  }
  return merged;
}

async function requestMissingNotes(
  apiKey: string,
  structure: DocumentStructure,
  documentExcerpt: string,
  existing: AutoPrepNote[],
): Promise<AutoPrepNote[]> {
  const { parts } = structure;
  const missing = parts.filter((part) => !existing.some((note) => note.blockId === part.blockId));
  if (missing.length === 0) return existing;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Complete notas de preparação pessoal da reunião. APENAS JSON.',
            '{"notes":[{"blockId":"20","anchorText":"trecho EXATO","title":"título EXATO da parte (copie da lista abaixo)","body":"aprendizado pessoal","tags":["auto-prep"]}]}',
            JW_AI_GROUNDING_RULES,
            JW_PERSONAL_LEARNING_NOTE_RULES,
            'Use o title EXATO de cada parte listada abaixo — nunca só "(10 min)" ou trecho parcial.',
            'Para EBC: resumo do estudo + proveito pessoal (sem respostas das 3 perguntas — ficam no livro lfb).',
            'anchorText = trecho EXATO copiado do parágrafo indicado.',
            'Partes pendentes:',
            ...missing.map(
              (part) =>
                `- blockId ${part.blockId} | ${part.title} | anchor sugerido: "${part.noteAnchorText}"`,
            ),
          ].join('\n'),
        },
        {
          role: 'user',
          content: documentExcerpt.slice(0, 9000),
        },
      ],
    }),
  });

  if (!response.ok) return existing;
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return existing;

  const parsed = JSON.parse(raw) as { notes?: AutoPrepNote[] };
  const extra = (parsed.notes ?? []).filter((note) => note.blockId && note.title && note.body);
  return normalizeNotesAgainstStructure([...existing, ...extra], structure).filter((note) => note.body);
}

async function runWatchtowerAutoPrep(
  cacheDir: string,
  userDataDir: string,
  params: AutoPrepParams,
  filePath: string,
): Promise<AutoPrepResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'Configure OPENAI_API_KEY no arquivo .env.' };

  const html = await getDocumentHtml(filePath, params.documentId);
  const wtStructure = extractWatchtowerStudyStructure(html);
  if (wtStructure.blocks.length === 0) {
    return { ok: false, error: 'Não foi possível analisar os parágrafos da matéria.' };
  }

  const documentExcerpt = wtStructure.blocks.map((b) => `[§${b.blockId}] ${b.text}`).join('\n\n');
  const questionsList = wtStructure.questions
    .map((question) => {
      const answerBlocks =
        question.answerBlockIds.length > 0
          ? question.answerBlockIds.join(', ')
          : 'inferir do texto da pergunta';
      return `- campo ${question.fieldId} | ${question.isReview ? 'REVISÃO' : 'estudo'} | pergunta §${question.questionBlockId} | resposta nos § ${answerBlocks}`;
    })
    .join('\n');

  const context = await enrichAiContext(cacheDir, {
    weekLabel: params.weekLabel,
    publicationTitle: params.publicationTitle,
    bibleReading: params.bibleReading,
    sourcePub: params.pub,
    sourceIssue: params.issue,
    sourceDocumentId: params.documentId,
    documentText: documentExcerpt.slice(0, 12000),
  });

  const system = [
    buildAiSystemPrompt(context),
    '',
    '## Tarefa: preparação automática — estudo de A Sentinela',
    JW_AI_GROUNDING_RULES,
    JW_SENTINEL_PREP_RULES,
    '',
    'Devolva APENAS JSON válido (sem markdown):',
    '{"highlights":[{"blockId":"5","text":"trecho EXATO curto","color":"yellow"}],"fields":[{"fieldId":"tt1","value":"Resposta principal: ...\\n\\nResposta adicional: ..."}]}',
    '',
    JW_HIGHLIGHT_RULES,
    '- Grife no parágrafo da RESPOSTA (blockId = número do § citado na pergunta).',
    '',
    'Perguntas e campos (preencha TODOS):',
    questionsList || '- detecte perguntas numeradas na matéria',
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
        model: AUTO_PREP_MODEL,
        temperature: 0.25,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content:
              'Prepare este estudo da Sentinela: grifos nas respostas, campos com resposta principal + adicional. Sem notas/resumos.',
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `OpenAI retornou ${response.status}: ${body.slice(0, 180)}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return { ok: false, error: 'Resposta vazia da IA.' };

    const parsed = JSON.parse(raw) as {
      highlights?: AutoPrepResult['highlights'];
      fields?: AutoPrepResult['fields'];
    };

    const highlights = refineWatchtowerHighlights(
      (parsed.highlights ?? []).filter((h) => h.blockId && h.text && h.color),
      wtStructure,
    );

    const questionByField = new Map(wtStructure.questions.map((q) => [q.fieldId, q]));
    const fieldValues = (parsed.fields ?? [])
      .filter((field) => field.fieldId && field.value)
      .map((field) => ({
        fieldId: field.fieldId,
        value: normalizeSentinelFieldValue(
          field.value,
          questionByField.get(field.fieldId)?.isReview ?? false,
        ),
      }));

    if (highlights.length > 0) {
      await saveHighlightsBatch(
        userDataDir,
        params.pub,
        params.issue,
        params.documentId,
        highlights.map((h) => ({
          id: crypto.randomUUID(),
          color: h.color,
          text: h.text,
          blockId: h.blockId,
          startOffset: (h as { startOffset?: number }).startOffset ?? 0,
          endOffset: (h as { endOffset?: number }).endOffset ?? h.text.length,
        })),
      );
    }

    await replaceTaggedNotes(userDataDir, params.pub, params.issue, params.documentId, 'auto-prep', []);

    for (const field of fieldValues) {
      await setFieldValue(
        userDataDir,
        fieldKey(params.pub, params.issue, params.documentId, field.fieldId),
        field.value,
      );
    }

    return { ok: true, highlights, fields: fieldValues, notes: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na preparação automática';
    return { ok: false, error: message };
  }
}

export async function runAutoPrep(
  cacheDir: string,
  userDataDir: string,
  params: AutoPrepParams,
): Promise<AutoPrepResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: 'Configure OPENAI_API_KEY no arquivo .env.' };
  }

  const filePath = await resolveCachedPubPath(cacheDir, params.pub, params.issue);
  if (!filePath) {
    return { ok: false, error: 'Publicação não baixada.' };
  }

  if (params.pub === 'w') {
    return runWatchtowerAutoPrep(cacheDir, userDataDir, params, filePath);
  }

  const html = await getDocumentHtml(filePath, params.documentId);
  const structure = extractDocumentStructure(html);
  if (structure.blocks.length === 0) {
    return { ok: false, error: 'Não foi possível analisar os parágrafos da matéria.' };
  }

  const bibleText = await loadBibleReadingText(
    cacheDir,
    structure.bibleReadingHref,
    params.bibleReading,
  );

  const joiasFieldId = structure.joiasFieldId;
  const treasuresFieldId = structure.treasuresFieldId;
  const documentExcerpt = structure.blocks.map((b) => `[p${b.blockId}] ${b.text}`).join('\n\n');

  const context = await enrichAiContext(cacheDir, {
    weekLabel: params.weekLabel,
    publicationTitle: params.publicationTitle,
    bibleReading: params.bibleReading,
    sourcePub: params.pub,
    sourceIssue: params.issue,
    sourceDocumentId: params.documentId,
    documentText: documentExcerpt.slice(0, 12000),
  });

  const partsList = structure.parts
    .map((part) => {
      const fieldHint = part.fieldId ? `campo: ${part.fieldId}` : 'sem campo — nota obrigatória';
      const ebcHint = part.kind === 'cbs' ? ' — conduza o estudo; respostas das perguntas ficam no livro lfb' : '';
      return `- blockId ${part.blockId} | ${part.title} (${part.kind}, ${fieldHint}) | anchor: "${part.noteAnchorText}"${ebcHint}`;
    })
    .join('\n');

  const fieldsList = buildFieldPromptLines(structure, {
    excludeFieldIds: joiasFieldId ? [joiasFieldId] : [],
  }).join('\n');

  const system = [
    buildAiSystemPrompt(context),
    '',
    '## Tarefa: preparação automática completa',
    JW_AI_GROUNDING_RULES,
    '',
    params.bibleReading ? `Leitura bíblica desta semana: ${params.bibleReading}.` : '',
    bibleText ? `\n### Texto da leitura bíblica\n${bibleText.slice(0, 8000)}` : '',
    '',
    'Devolva APENAS JSON válido (sem markdown):',
    '{"highlights":[{"blockId":"8","text":"trecho EXATO curto","color":"yellow"}],"fields":[{"fieldId":"tt20","value":"resposta curta"}],"notes":[{"blockId":"20","anchorText":"trecho EXATO","title":"4. Iniciando conversas","body":"o que aprendo..."}],"joiasOptions":["Jer. 11:4 — Sobre Jeová: ..."],"practiceNote":{"blockId":"40","anchorText":"trecho EXATO","body":"Pontos para prática..."}}',
    '',
    JW_HIGHLIGHT_RULES,
    '',
    'Regras para fields:',
    '- Preencha TODOS os campos editáveis listados abaixo (resposta curta: 2-4 frases).',
    '- Respostas às perguntas da apostila vão em "fields" — NÃO repita essas respostas em "notes".',
    '- Partes de Nossa Vida Cristã com várias perguntas: uma resposta por fieldId.',
    joiasFieldId ? `- NÃO use "fields" para ${joiasFieldId} (joias) — só "joiasOptions".` : '',
    treasuresFieldId ? `- Campo ${treasuresFieldId}: resposta à pergunta bíblica de Tesouros/Joias (versículo + aplicação).` : '',
    '',
    'Campos editáveis (preencha todos):',
    fieldsList || '- nenhum detectado',
    '',
    JW_PERSONAL_LEARNING_NOTE_RULES,
    JW_PRACTICE_POINTS_RULES,
    '',
    'Regras para notes (OBRIGATÓRIO — uma por parte abaixo):',
    '- "notes" deve ter UMA entrada para CADA parte listada.',
    '- "anchorText" = trecho EXATO copiado do parágrafo (use o anchor sugerido quando possível).',
    '- "body" = aprendizado pessoal (não roteiro de tribuna).',
    '- Parte EBC: resumo do estudo + proveito pessoal (NÃO inclua respostas às 3 perguntas — use o livro lfb).',
    '- Partes com campos editáveis: "notes" = aprendizado pessoal resumido (sem repetir o que já está nos fields).',
    '- Partes sem campo editável: respostas completas na nota.',
    '- "practiceNote": nota final "Pontos altos para colocar em prática" (3-5 bullets); anchor no último bloco da reunião ou EBC.',
    '',
    JW_JOIAS_RULES,
    '',
    'Partes da reunião (crie nota para cada uma):',
    partsList || '- detecte perguntas numeradas na matéria',
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
        model: AUTO_PREP_MODEL,
        temperature: 0.25,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content:
              'Prepare esta semana de meio de semana: grifos, campos (exceto joias), nota de aprendizado pessoal para CADA parte, 3 joias, e practiceNote com pontos para prática.',
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `OpenAI retornou ${response.status}: ${body.slice(0, 180)}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return { ok: false, error: 'Resposta vazia da IA.' };

    const parsed = JSON.parse(raw) as {
      highlights?: AutoPrepResult['highlights'];
      fields?: AutoPrepResult['fields'];
      notes?: AutoPrepResult['notes'];
      joiasOptions?: string[];
      practiceNote?: { blockId?: string; anchorText?: string; body?: string };
    };

    const highlights = refineHighlights(
      (parsed.highlights ?? []).filter((h) => h.blockId && h.text && h.color),
      structure.parts,
      structure.blocks,
    );
    let fieldValues = (parsed.fields ?? []).filter((f) => f.fieldId && f.value);

    if (joiasFieldId) {
      fieldValues = fieldValues.filter((field) => field.fieldId !== joiasFieldId);
    }

    const joiasFromField = parsed.fields?.find((field) => field.fieldId === joiasFieldId)?.value;
    let joiasOptions = normalizeJoiasOptions(parsed.joiasOptions, joiasFromField);

    if (!joiasLookValid(joiasOptions)) {
      const retry = await requestJoiasOptions(
        apiKey,
        params.bibleReading,
        bibleText,
        documentExcerpt,
      );
      if (retry.length >= 3) joiasOptions = retry;
    }

    if (joiasFieldId && joiasOptions.length >= 3) {
      fieldValues.push({ fieldId: joiasFieldId, value: formatJoiasField(joiasOptions) });
    }

    const excludeFromRetry = joiasFieldId ? [joiasFieldId] : [];
    if (fieldValues.length < structure.fields.length - excludeFromRetry.length) {
      fieldValues = await requestMissingFields(
        apiKey,
        structure,
        documentExcerpt,
        fieldValues,
        excludeFromRetry,
      );
    }

    let notes = normalizeNotesAgainstStructure(parsed.notes ?? [], structure);
    notes = notes.filter((note) => note.body?.trim());
    notes = dedupeNotesForDocument(notes, structure);

    if (notes.length < structure.parts.length) {
      notes = await requestMissingNotes(apiKey, structure, documentExcerpt, notes);
      notes = dedupeNotesForDocument(
        notes.filter((note) => note.body?.trim()),
        structure,
      );
    }

    const practiceBody = parsed.practiceNote?.body?.trim();
    if (practiceBody) {
      const anchorBlockId =
        parsed.practiceNote?.blockId ??
        structure.parts.find((part) => part.kind === 'cbs')?.blockId ??
        structure.parts[structure.parts.length - 1]?.blockId ??
        structure.blocks[structure.blocks.length - 1]?.blockId;
      const blockText =
        structure.blocks.find((block) => block.blockId === anchorBlockId)?.text ?? '';
      const anchorText = findAnchorInBlock(
        blockText,
        parsed.practiceNote?.anchorText ?? blockText.slice(0, 80),
      );
      notes.push({
        blockId: anchorBlockId ?? '1',
        anchorText,
        title: 'Pontos altos para colocar em prática',
        body: practiceBody,
        tags: ['auto-prep', 'practice-points'],
      });
      notes = dedupeNotesForDocument(notes, structure);
    }

    if (highlights.length > 0) {
      await saveHighlightsBatch(
        userDataDir,
        params.pub,
        params.issue,
        params.documentId,
        highlights.map((h) => ({
          id: crypto.randomUUID(),
          color: h.color,
          text: h.text,
          blockId: h.blockId,
          startOffset: (h as { startOffset?: number }).startOffset ?? 0,
          endOffset: (h as { endOffset?: number }).endOffset ?? h.text.length,
        })),
      );
    }

    if (notes.length > 0) {
      await replaceTaggedNotes(
        userDataDir,
        params.pub,
        params.issue,
        params.documentId,
        'auto-prep',
        notes.map((note) => ({
          id: crypto.randomUUID(),
          title: note.title,
          body: note.body,
          blockId: note.blockId,
          anchorText: note.anchorText,
          startOffset: 0,
          endOffset: note.anchorText.length,
          tags: note.tags?.length ? note.tags : ['auto-prep'],
        })),
      );
    }

    for (const field of fieldValues) {
      await setFieldValue(
        userDataDir,
        fieldKey(params.pub, params.issue, params.documentId, field.fieldId),
        field.value,
      );
    }

    return {
      ok: true,
      highlights,
      fields: fieldValues,
      notes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na preparação automática';
    return { ok: false, error: message };
  }
}
