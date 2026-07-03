import { loadBibleReadingText } from './bible-reading-context';
import { extractDocumentStructure, findAnchorInBlock, formatJoiasField, resolveNoteTitle, type DocumentStructure, type MeetingPart } from './document-structure';
import { buildAiSystemPrompt, JW_AI_GROUNDING_RULES, JW_HIGHLIGHT_RULES, JW_JOIAS_RULES, JW_TRIBUNE_NOTE_RULES } from './ai-prompts';
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
  const block = blockText.replace(/\s+/g, ' ').trim();
  const text = needle.replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (block.includes(text)) return true;
  const snippet = text.slice(0, Math.min(24, text.length));
  return snippet.length >= 10 && block.includes(snippet);
}

function refineHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  parts: MeetingPart[],
  blocks: Array<{ blockId: string; text: string }>,
) {
  const blockById = new Map(blocks.map((block) => [block.blockId, block.text]));
  const partBlockIds = new Set(parts.map((part) => part.blockId));

  const valid = highlights.filter((highlight) => {
    const block = blockById.get(highlight.blockId);
    if (!block) return false;
    if (!blockContainsText(block, highlight.text)) return false;
    const wordCount = highlight.text.trim().split(/\s+/).length;
    if (wordCount > 22) return false;
    if (/^\(?\d+\s*min\)?$/i.test(highlight.text.trim())) return false;
    return true;
  });

  const sorted = [...valid].sort((a, b) => {
    const aScore = partBlockIds.has(a.blockId) ? 0 : 1;
    const bScore = partBlockIds.has(b.blockId) ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return a.text.length - b.text.length;
  });

  const byBlock = new Map<string, (typeof sorted)[number]>();
  for (const highlight of sorted) {
    if (!byBlock.has(highlight.blockId)) byBlock.set(highlight.blockId, highlight);
  }

  return [...byBlock.values()]
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
            'Complete notas de preparação da reunião. APENAS JSON.',
            '{"notes":[{"blockId":"20","anchorText":"trecho EXATO","title":"título EXATO da parte (copie da lista abaixo)","body":"roteiro de tribuna","tags":["auto-prep"]}]}',
            JW_AI_GROUNDING_RULES,
            JW_TRIBUNE_NOTE_RULES,
            'Use o title EXATO de cada parte listada abaixo — nunca só "(10 min)" ou trecho parcial.',
            'Para EBC: roteiro de condução do estudo (sem respostas das 3 perguntas — essas ficam no livro lfb).',
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

  const fieldsList = structure.fields.map((field) => field.fieldId).join(', ') || 'nenhum';

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
    '{"highlights":[{"blockId":"8","text":"trecho EXATO curto","color":"yellow"}],"fields":[{"fieldId":"tt20","value":"resposta curta"}],"notes":[{"blockId":"20","anchorText":"trecho EXATO","title":"4. Iniciando conversas","body":"roteiro de condução..."}],"joiasOptions":["Jer. 11:4 — Sobre Jeová: ..."]}',
    '',
    JW_HIGHLIGHT_RULES,
    '',
    'Regras para fields:',
    '- Preencha campos editáveis EXCETO joias espirituais.',
    `- Campos: ${fieldsList}`,
    joiasFieldId ? `- NÃO use "fields" para ${joiasFieldId} (joias) — só "joiasOptions".` : '',
    treasuresFieldId ? `- Campo ${treasuresFieldId}: resposta à pergunta de Tesouros.` : '',
    '',
    JW_TRIBUNE_NOTE_RULES,
    '',
    'Regras para notes (OBRIGATÓRIO — uma por parte abaixo):',
    '- "notes" deve ter UMA entrada para CADA parte listada.',
    '- "anchorText" = trecho EXATO copiado do parágrafo (use o anchor sugerido quando possível).',
    '- "body" = roteiro para conduzir da tribuna (não bullets secos).',
    '- Parte EBC: roteiro de condução do estudo bíblico de congregação (NÃO inclua respostas às 3 perguntas oficiais — use o botão Preparar lições no livro lfb).',
    '- Partes sem campo editável: respostas completas na nota.',
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
              'Prepare esta semana: grifos, campos (exceto joias), nota para CADA parte, e 3 joias com versículos específicos.',
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
          startOffset: 0,
          endOffset: h.text.length,
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
