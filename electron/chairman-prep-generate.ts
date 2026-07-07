import {
  buildFieldPromptLines,
  extractDocumentStructure,
  type MeetingPart,
} from './document-structure';
import { loadBibleReadingText } from './bible-reading-context';
import { enrichAiContext } from './ai-context';
import { buildAiSystemPrompt, JW_AI_GROUNDING_RULES, JW_CHAIRMAN_PREP_RULES } from './ai-prompts';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { ChairmanPrepRecord, ChairmanGeneratedContent, ChairmanOpeningPreview } from '../shared/chairman-prep-types';
import {
  buildStudentLessonBriefs,
  formatStudentLessonContextForPrompt,
} from './student-lesson-context';
import { isStudentAssignment } from '../shared/chairman-student-part';
import {
  composeOpeningSummary,
  openingPreviewFromAssignments,
  resolveOpeningPartHints,
} from '../shared/chairman-opening-preview';
import type { MeetingWeek } from './types';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const CHAIRMAN_MODEL = process.env.OPENAI_CHAIRMAN_MODEL?.trim() || 'gpt-4o';

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    const end = trimmed.lastIndexOf('}');
    if (end > 0) return trimmed.slice(0, end + 1);
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}

function partConsiderationHint(part: MeetingPart, documentText: string) {
  const titleLower = part.title.toLowerCase();
  const block = documentText.match(
    new RegExp(`\\[p${part.blockId}\\][\\s\\S]{0,1200}`, 'i'),
  )?.[0];
  if (!block) return '';

  if (part.kind === 'reading') return 'Leitura bíblica da semana.';
  if (part.kind === 'ministry' || part.kind === 'life') {
    const consider = block.match(/consider(?:e|ação)[:\s]+([\s\S]{0,400})/i)?.[1]?.trim();
    if (consider) return consider.slice(0, 400);
  }
  if (titleLower.includes('joias')) return 'Joias espirituais — versículos da leitura.';
  return part.noteAnchorText.slice(0, 200);
}

export async function generateChairmanPrepContent(
  cacheDir: string,
  week: MeetingWeek,
  record: ChairmanPrepRecord,
): Promise<{ ok: boolean; content?: ChairmanGeneratedContent; error?: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: 'Configure OPENAI_API_KEY no arquivo .env.' };
  }

  if (!record.assignments.length) {
    return { ok: false, error: 'Importe a folha de designações antes de gerar.' };
  }

  if (!week.mwbDocumentId || !week.mwbIssue) {
    return { ok: false, error: 'Apostila da semana não disponível.' };
  }

  const filePath = await resolveCachedPubPath(cacheDir, 'mwb', week.mwbIssue);
  if (!filePath) {
    return { ok: false, error: 'Baixe a apostila Vida e Ministério desta semana antes de gerar.' };
  }

  const html = await getDocumentHtml(filePath, week.mwbDocumentId);
  const structure = extractDocumentStructure(html);
  if (structure.blocks.length === 0) {
    return { ok: false, error: 'Não foi possível analisar a apostila da semana.' };
  }

  const documentFull = structure.blocks.map((b) => `[p${b.blockId}] ${b.text}`).join('\n\n');
  const documentExcerpt = documentFull.slice(0, 72_000);

  const bibleText = await loadBibleReadingText(
    cacheDir,
    structure.bibleReadingHref,
    week.bibleReading,
  );

  const context = await enrichAiContext(cacheDir, {
    weekLabel: week.label,
    publicationTitle: week.label,
    bibleReading: week.bibleReading,
    sourcePub: 'mwb',
    sourceIssue: week.mwbIssue,
    sourceDocumentId: week.mwbDocumentId,
    documentText: documentExcerpt,
  });

  const assignmentsList = record.assignments
    .map((item) => {
      const names = item.assignees.length ? item.assignees.join(' / ') : '—';
      const min = item.durationMin ? ` (${item.durationMin} min)` : '';
      return `- id: ${item.id} | ${item.section} | ${item.partTitle}${min} | designado(s): ${names}`;
    })
    .join('\n');

  const mwbPartsList = structure.parts
    .map((part) => {
      const hint = partConsiderationHint(part, documentFull);
      return `- ${part.title} (${part.kind})${hint ? ` | considerar: ${hint}` : ''}`;
    })
    .join('\n');

  const fieldsList = buildFieldPromptLines(structure).join('\n');

  const { treasuresDiscourse, lifeChristian } = resolveOpeningPartHints(record.assignments);
  const openingHints = [
    treasuresDiscourse
      ? `- Discurso Tesouros (parte 1): "${treasuresDiscourse.partTitle}"${treasuresDiscourse.durationMin ? ` (${treasuresDiscourse.durationMin} min)` : ''}`
      : '',
    lifeChristian
      ? `- Vida cristã (destaque na abertura): "${lifeChristian.partTitle}"${lifeChristian.durationMin ? ` (${lifeChristian.durationMin} min)` : ''}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const studentLessons = await buildStudentLessonBriefs(cacheDir, structure, record.assignments);
  const studentLessonContext = formatStudentLessonContextForPrompt(studentLessons);
  const lessonBriefByAssignment = new Map(studentLessons.map((b) => [b.assignmentId, b]));

  const system = [
    buildAiSystemPrompt(context),
    '',
    JW_AI_GROUNDING_RULES,
    JW_CHAIRMAN_PREP_RULES,
    '',
    `Semana: ${week.label}`,
    `Leitura bíblica: ${week.bibleReading}`,
    record.chairmanName ? `Presidente: ${record.chairmanName}` : '',
    '',
    '### Designações importadas (use os ids exatos em parts)',
    assignmentsList,
    '',
    '### Partes da apostila (referência)',
    mwbPartsList,
    openingHints ? `\n### Partes para visão inicial da reunião\n${openingHints}` : '',
    studentLessonContext ? `\n### Lições das partes de estudante (use na transição)\n${studentLessonContext}` : '',
    fieldsList ? `\n### Campos da apostila\n${fieldsList}` : '',
    bibleText ? `\n### Leitura bíblica\n${bibleText.slice(0, 6000)}` : '',
    '',
    'Devolva APENAS JSON válido (sem markdown):',
    '{"openingPreview":{"intro":"...","treasuresHighlight":"Em Tesouros da Palavra de Deus...","lifeChristianHighlight":"Em Nossa vida cristã..."},"parts":[{"assignmentId":"UUID","transition":"...","highlight":"...","privateSuggestion":"..."}],"closingSummary":"...","finalQuestion":"Que pontos os irmãos mais gostaram nesta reunião?","finalQuestionOptions":["...","...","..."]}',
    '',
    '- openingPreview: visão inicial (~1 min) com seção identificada em cada destaque.',
    '- Uma entrada em "parts" para CADA assignmentId listado (mesma ordem).',
    '- "privateSuggestion" só para partes de estudante (ministério e leitura da Bíblia); omita nos demais.',
    '- "highlight" obrigatório para ministerio, vida e leitura da bíblia; opcional para tesouros.',
    '- "transition" = o que o presidente diz ao encerrar aquela parte (~2-4 frases).',
    '- "closingSummary" visão geral da reunião (~1 min).',
    '- finalQuestionOptions: exatamente 3 opções distintas de pontos que a congregação pode ter apreciado.',
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
        model: CHAIRMAN_MODEL,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Gere a folha completa do presidente para esta reunião.\n\nApostila (trecho):\n${documentExcerpt.slice(0, 50000)}`,
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
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, error: 'Resposta vazia da IA.' };

    const jsonText = extractJsonObject(reply);
    if (!jsonText) return { ok: false, error: 'IA não retornou JSON válido.' };

    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    const previewRaw =
      parsed.openingPreview && typeof parsed.openingPreview === 'object'
        ? (parsed.openingPreview as Record<string, unknown>)
        : null;
    const legacyOpening =
      typeof parsed.openingSummary === 'string' ? parsed.openingSummary.trim() : '';

    let openingPreview: ChairmanOpeningPreview;
    if (previewRaw) {
      openingPreview = openingPreviewFromAssignments(record.assignments, {
        intro: typeof previewRaw.intro === 'string' ? previewRaw.intro.trim() : undefined,
        treasuresHighlight:
          typeof previewRaw.treasuresHighlight === 'string'
            ? previewRaw.treasuresHighlight.trim()
            : '',
        lifeChristianHighlight:
          typeof previewRaw.lifeChristianHighlight === 'string'
            ? previewRaw.lifeChristianHighlight.trim()
            : '',
      });
    } else if (legacyOpening) {
      openingPreview = {
        ...openingPreviewFromAssignments(record.assignments, {
          treasuresHighlight: '',
          lifeChristianHighlight: '',
        }),
        intro: legacyOpening,
      };
    } else {
      openingPreview = openingPreviewFromAssignments(record.assignments, {
        treasuresHighlight: '',
        lifeChristianHighlight: '',
      });
    }

    const openingSummary = composeOpeningSummary(openingPreview);
    const closingSummary =
      typeof parsed.closingSummary === 'string' ? parsed.closingSummary.trim() : '';
    const finalQuestion =
      typeof parsed.finalQuestion === 'string' && parsed.finalQuestion.trim()
        ? parsed.finalQuestion.trim()
        : 'Que pontos os irmãos mais gostaram nesta reunião?';

    const optionsRaw = Array.isArray(parsed.finalQuestionOptions) ? parsed.finalQuestionOptions : [];
    const finalQuestionOptions = optionsRaw
      .map((opt) => (typeof opt === 'string' ? opt.trim() : ''))
      .filter(Boolean)
      .slice(0, 3) as [string, string, string];
    while (finalQuestionOptions.length < 3) {
      finalQuestionOptions.push('…');
    }

    const partsRaw = Array.isArray(parsed.parts) ? parsed.parts : [];
    const parts = record.assignments.map((assignment, index) => {
      const match =
        partsRaw.find(
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            (entry as { assignmentId?: string }).assignmentId === assignment.id,
        ) ?? partsRaw[index];
      const row = match && typeof match === 'object' ? (match as Record<string, unknown>) : {};
      const transition = typeof row.transition === 'string' ? row.transition.trim() : '';
      const highlight = typeof row.highlight === 'string' ? row.highlight.trim() : undefined;
      const privateSuggestion =
        typeof row.privateSuggestion === 'string' ? row.privateSuggestion.trim() : undefined;
      const brief = lessonBriefByAssignment.get(assignment.id);
      const student = isStudentAssignment(assignment);
      return {
        assignmentId: assignment.id,
        transition,
        highlight: student ? highlight || brief?.consideracao : highlight || undefined,
        lessonRef: brief?.lessonRef?.label,
        lessonSummary: brief?.lessonSummary,
        privateSuggestion: student ? privateSuggestion || undefined : undefined,
      };
    });

    if (!openingSummary && !parts.some((p) => p.transition)) {
      return { ok: false, error: 'IA não gerou conteúdo utilizável.' };
    }

    const content: ChairmanGeneratedContent = {
      openingSummary,
      openingPreview,
      parts,
      closingSummary,
      finalQuestion,
      finalQuestionOptions,
      generatedAt: new Date().toISOString(),
    };

    return { ok: true, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar folha do presidente';
    return { ok: false, error: message };
  }
}
