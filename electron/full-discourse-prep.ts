import crypto from 'node:crypto';
import { loadBibleReadingText } from './bible-reading-context';
import {
  extractDocumentStructure,
  findAnchorInBlock,
  getPartBlockRanges,
  resolveNoteTitle,
  type DocumentField,
  type DocumentStructure,
  type MeetingPart,
} from './document-structure';
import {
  buildAiSystemPrompt,
  JW_AI_GROUNDING_RULES,
  JW_FULL_DISCOURSE_RULES,
  JW_MWB_FIELD_RULES,
  JW_TRIBUNE_NOTE_RULES,
} from './ai-prompts';
import { enrichAiContext } from './ai-context';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { AutoPrepField, AutoPrepParams, AutoPrepResult } from './types';
import {
  documentPrepPrefix,
  fieldKey,
  getFieldValues,
  replaceTaggedNotes,
  setFieldValue,
} from './user-prep-store';
import { sanitizeDiscourseOpening } from '../shared/discourse-script';
import { formatDiscourseManuscriptHtml } from '../shared/discourse-manuscript-html';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DISCOURSE_PREP_MODEL =
  process.env.OPENAI_DISCOURSE_PREP_MODEL?.trim() ||
  process.env.OPENAI_MWB_PREP_MODEL?.trim() ||
  'gpt-4.1';

const DISCOURSE_TAG = 'discourse-script';

type TargetPart = {
  part: MeetingPart;
  kind: 'treasures-discourse' | 'life';
  durationMin?: number;
  blockIds: string[];
  plainText: string;
  htmlExcerpt: string;
  fields: DocumentField[];
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function simplifyHtmlForPrompt(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, '\n[IMAGEM: $1]\n')
    .replace(/<img[^>]*>/gi, '\n[IMAGEM na apostila]\n')
    .replace(/\bdata-video="([^"]+)"/gi, '\n[VÍDEO: $1]\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseDurationMin(text: string) {
  const match = text.match(/\((\d+)\s*min\)/i);
  return match ? Number(match[1]) : undefined;
}

function isTreasuresDiscoursePart(part: MeetingPart) {
  if (part.kind !== 'treasures') return false;
  if (/joias|leitura|gemas/i.test(part.title)) return false;
  return /^\s*1[\.)]\s/.test(part.title.trim()) || /discurso/i.test(part.title);
}

function isLifeConsiderationPart(part: MeetingPart) {
  if (part.kind !== 'life') return false;
  return !/estudo bíblico|congregação|congregacao|\bebc\b|\bcbs\b/i.test(part.title);
}

function extractHtmlSlice(html: string, blockIds: string[], allBlockIds: string[]) {
  if (blockIds.length === 0) return '';

  const firstId = blockIds[0]!;
  const firstGlobalIdx = allBlockIds.indexOf(firstId);
  const nextGlobalId =
    firstGlobalIdx >= 0 && firstGlobalIdx + blockIds.length < allBlockIds.length
      ? allBlockIds[firstGlobalIdx + blockIds.length]
      : null;

  const startMatch = html.search(new RegExp(`data-pid="${firstId}"`, 'i'));
  if (startMatch < 0) {
    return simplifyHtmlForPrompt(blockIds.map((id) => html.match(new RegExp(`data-pid="${id}"[\\s\\S]*?(?=data-pid="|$)`, 'i'))?.[0] ?? '').join('\n'));
  }

  let endIdx = html.length;
  if (nextGlobalId) {
    const nextPos = html.indexOf(`data-pid="${nextGlobalId}"`, startMatch + 1);
    if (nextPos > startMatch) endIdx = nextPos;
  }

  return simplifyHtmlForPrompt(html.slice(startMatch, endIdx));
}

function fieldsForPart(
  structure: DocumentStructure,
  blockIds: string[],
): DocumentField[] {
  const ids = new Set(blockIds);
  return structure.fields.filter((field) => field.afterBlockId && ids.has(field.afterBlockId));
}

function buildTargetParts(structure: DocumentStructure, html: string): TargetPart[] {
  const ranges = getPartBlockRanges(structure.parts, structure.blocks);
  const allBlockIds = structure.blocks.map((block) => block.blockId);
  const targets: TargetPart[] = [];

  const treasures = structure.parts.find(isTreasuresDiscoursePart);
  if (treasures) {
    const blockIds = ranges.get(treasures.blockId) ?? [treasures.blockId];
    targets.push({
      part: treasures,
      kind: 'treasures-discourse',
      durationMin: parseDurationMin(treasures.text) ?? 10,
      blockIds,
      plainText: blockIds.map((id) => structure.blocks.find((b) => b.blockId === id)?.text ?? '').join('\n\n'),
      htmlExcerpt: extractHtmlSlice(html, blockIds, allBlockIds),
      fields: fieldsForPart(structure, blockIds),
    });
  }

  for (const part of structure.parts) {
    if (part.kind !== 'life') continue;
    if (!isLifeConsiderationPart(part)) continue;
    const blockIds = ranges.get(part.blockId) ?? [part.blockId];
    targets.push({
      part,
      kind: 'life',
      durationMin: parseDurationMin(part.text),
      blockIds,
      plainText: blockIds.map((id) => structure.blocks.find((b) => b.blockId === id)?.text ?? '').join('\n\n'),
      htmlExcerpt: extractHtmlSlice(html, blockIds, allBlockIds),
      fields: fieldsForPart(structure, blockIds),
    });
  }

  return targets;
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}

async function generatePartDiscourse(params: {
  apiKey: string;
  contextSystem: string;
  target: TargetPart;
  bibleReading?: string;
  bibleText?: string;
  existingFields: Record<string, string>;
  pub: string;
  issue: string;
  documentId: number;
}) {
  const { target, existingFields, pub, issue, documentId } = params;

  const emptyFields = target.fields.filter((field) => {
    const key = fieldKey(pub, issue, documentId, field.fieldId);
    return !existingFields[key]?.trim();
  });

  const filledFields = target.fields
    .map((field) => {
      const key = fieldKey(pub, issue, documentId, field.fieldId);
      const value = existingFields[key]?.trim();
      if (!value) return null;
      const question = (field.questionText ?? '').replace(/\s+/g, ' ').trim();
      return `- ${field.fieldId} (${question || 'campo'}): ${value.slice(0, 1200)}`;
    })
    .filter(Boolean);

  const durationHint =
    target.durationMin != null
      ? `${target.durationMin} minutos (~${Math.round(target.durationMin * 110)}–${Math.round(target.durationMin * 140)} palavras)`
      : target.kind === 'treasures-discourse'
        ? '10 minutos (~1.100–1.400 palavras)'
        : 'tempo indicado na matéria';

  const system = [
    params.contextSystem,
    '',
    JW_FULL_DISCOURSE_RULES,
    JW_TRIBUNE_NOTE_RULES,
    target.kind === 'life' ? JW_MWB_FIELD_RULES : '',
    '',
    `Parte: ${target.part.title}`,
    `Tipo: ${target.kind === 'treasures-discourse' ? 'Discurso Tesouros (parte 1)' : 'Nossa vida cristã'}`,
    `Tempo-alvo: ${durationHint}`,
    params.bibleReading ? `Leitura bíblica da semana: ${params.bibleReading}` : '',
    filledFields.length ? `\nCampos já preenchidos (incorpore no roteiro):\n${filledFields.join('\n')}` : '',
    emptyFields.length
      ? `\nCampos vazios (preencha em "fields" com respostas-modelo para a assistência):\n${emptyFields
          .map((field) => {
            const question = (field.questionText ?? '').replace(/\s+/g, ' ').trim();
            const label = question.length > 160 ? `${question.slice(0, 157).trim()}…` : question;
            return `- ${field.fieldId}: "${label || 'campo editável'}"`;
          })
          .join('\n')}`
      : '',
    '',
    'Devolva APENAS JSON válido (sem markdown):',
    '{"body":"roteiro completo...","fields":[{"fieldId":"tt20","value":"Resposta principal: ..."}]}',
    '- "body": roteiro COMPLETO para proferir (com seções claras, versículos, imagens/vídeos e perguntas à assistência).',
    '- "fields": só para campos vazios listados acima; omita se não houver.',
  ]
    .filter(Boolean)
    .join('\n');

  const userContent = [
    '### Texto da parte (parágrafos)',
    target.plainText.slice(0, 12_000),
    '',
    '### Matéria com mídia (imagens/vídeos)',
    target.htmlExcerpt.slice(0, 14_000),
    params.bibleText ? `\n### Leitura bíblica\n${params.bibleText.slice(0, 6000)}` : '',
    '',
    `Prepare o roteiro completo para proferir em ${durationHint}.`,
    'IMPORTANTE: não inclua saudação nem cumprimento — comece direto no discurso.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DISCOURSE_PREP_MODEL,
      temperature: 0.3,
      max_tokens: 10_000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 180)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Resposta vazia da IA.');

  const jsonText = extractJsonObject(raw);
  if (!jsonText) throw new Error('IA não retornou JSON válido.');

  const parsed = JSON.parse(jsonText) as {
    body?: string;
    fields?: AutoPrepField[];
  };

  const rawBody =
    typeof parsed.body === 'string' ? sanitizeDiscourseOpening(parsed.body.trim()) : '';
  if (!rawBody) throw new Error(`Roteiro vazio para ${target.part.title}.`);
  const body = formatDiscourseManuscriptHtml(rawBody);

  const fields = (parsed.fields ?? [])
    .filter((field) => field.fieldId && field.value?.trim())
    .filter((field) => emptyFields.some((empty) => empty.fieldId === field.fieldId))
    .map((field) => ({ fieldId: field.fieldId, value: field.value.trim() }));

  return { body, fields };
}

export async function runFullDiscoursePrep(
  cacheDir: string,
  userDataDir: string,
  params: AutoPrepParams,
): Promise<AutoPrepResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: 'Configure OPENAI_API_KEY no arquivo .env.' };
  }

  if (params.pub !== 'mwb') {
    return { ok: false, error: 'Preparação completa disponível apenas para a apostila VMM.' };
  }

  const filePath = await resolveCachedPubPath(cacheDir, params.pub, params.issue);
  if (!filePath) {
    return { ok: false, error: 'Publicação não baixada.' };
  }

  const html = await getDocumentHtml(filePath, params.documentId);
  const structure = extractDocumentStructure(html);
  if (structure.blocks.length === 0) {
    return { ok: false, error: 'Não foi possível analisar a apostila.' };
  }

  const targets = buildTargetParts(structure, html);
  if (targets.length === 0) {
    return { ok: false, error: 'Nenhuma parte de Tesouros (discurso) ou Vida Cristã encontrada.' };
  }

  const bibleText = await loadBibleReadingText(
    cacheDir,
    structure.bibleReadingHref,
    params.bibleReading,
  );

  const documentExcerpt = structure.blocks.map((b) => `[p${b.blockId}] ${b.text}`).join('\n\n');

  const context = await enrichAiContext(cacheDir, {
    weekLabel: params.weekLabel,
    publicationTitle: params.publicationTitle,
    bibleReading: params.bibleReading,
    sourcePub: params.pub,
    sourceIssue: params.issue,
    sourceDocumentId: params.documentId,
    documentText: documentExcerpt.slice(0, 50_000),
  });

  const contextSystem = [buildAiSystemPrompt(context), '', JW_AI_GROUNDING_RULES].join('\n');

  const prepPrefix = documentPrepPrefix(params.pub, params.issue, params.documentId);
  const existingFields = await getFieldValues(userDataDir, prepPrefix);

  const notes: Array<{
    id: string;
    title: string;
    body: string;
    blockId: string;
    anchorText: string;
    startOffset: number;
    endOffset: number;
    tags: string[];
  }> = [];
  const filledFields: AutoPrepField[] = [];

  for (const target of targets) {
    const generated = await generatePartDiscourse({
      apiKey,
      contextSystem,
      target,
      bibleReading: params.bibleReading,
      bibleText,
      existingFields,
      pub: params.pub,
      issue: params.issue,
      documentId: params.documentId,
    });

    const anchorBlockId = target.blockIds[0] ?? target.part.blockId;
    const anchorBlock = structure.blocks.find((block) => block.blockId === anchorBlockId);
    const anchorText = anchorBlock
      ? findAnchorInBlock(anchorBlock.text, target.part.noteAnchorText)
      : target.part.noteAnchorText;

    const title =
      resolveNoteTitle(structure, anchorBlockId) ?? target.part.title.replace(/^\d+\.\s*/, '');
    const noteTitle = `ROTEIRO — ${title}`;

    notes.push({
      id: crypto.randomUUID(),
      title: noteTitle,
      body: generated.body,
      blockId: anchorBlockId,
      anchorText,
      startOffset: 0,
      endOffset: anchorText.length,
      tags: [DISCOURSE_TAG],
    });

    for (const field of generated.fields) {
      filledFields.push(field);
      await setFieldValue(
        userDataDir,
        fieldKey(params.pub, params.issue, params.documentId, field.fieldId),
        field.value,
      );
    }
  }

  await replaceTaggedNotes(
    userDataDir,
    params.pub,
    params.issue,
    params.documentId,
    DISCOURSE_TAG,
    notes,
  );

  return {
    ok: true,
    notes: notes.map((note) => ({
      blockId: note.blockId,
      anchorText: note.anchorText,
      title: note.title,
      body: note.body,
      tags: note.tags,
    })),
    fields: filledFields,
  };
}
