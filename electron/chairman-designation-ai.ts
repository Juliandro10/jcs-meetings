import type {
  ChairmanAssignmentSection,
  ParsedChairmanDesignation,
} from '../shared/chairman-prep-types';
import {
  buildDesignationTargetPrompt,
  pickDesignationForWeek,
  type ChairmanDesignationWeekTarget,
} from '../shared/chairman-designation-week-pick';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const VISION_MODEL = 'gpt-4o';

const DESIGNATION_AI_SYSTEM = `Você extrai a folha de DESIGNAÇÕES da reunião do meio de semana das Testemunhas de Jeová (VMM).

Entrada: texto OCR, PDF, Word ou imagem da folha (ex.: NW Scheduler, Organized, impresso da congregação).
Muitas folhas trazem DUAS semanas seguidas — cada bloco começa com data + leitura bíblica (ex.: "16 de julho de 2026 | JEREMIAS 16-17").

Saída preferida — APENAS a semana pedida pelo usuário (JSON válido, sem markdown):
{
  "congregation": "nome ou vazio",
  "meetingDate": "ex.: 16 de julho de 2026",
  "bibleReading": "ex.: JEREMIAS 16-17",
  "openingSong": "número da música inicial ou vazio",
  "closingSong": "número da música final ou vazio",
  "chairmanName": "presidente",
  "openingPrayer": "nome oração inicial",
  "closingPrayer": "nome oração final",
  "assignments": [
    {
      "section": "abertura|tesouros|ministerio|vida|encerramento|musica",
      "partTitle": "título exato da parte",
      "durationMin": 10,
      "assignees": ["Nome Completo"]
    }
  ]
}

Saída alternativa (se não conseguir isolar uma semana no prompt):
{
  "weeks": [ { ...mesmo formato de uma semana... }, { ... } ]
}

Regras:
- section "tesouros" = Tesouros da Palavra de Deus.
- section "ministerio" = Faça seu melhor no ministério.
- section "vida" = Nossa vida cristã.
- section "musica" = cânticos intermediários quando listados como parte.
- Presidente e orações nos campos chairmanName/openingPrayer/closingPrayer.
- Preserve ordem; uma entrada por parte com designado.
- assignees = nomes à direita; duplas no ministério = dois nomes.
- Português do Brasil; não invente partes.
- NUNCA misture designações de semanas diferentes.`;

export type { ChairmanDesignationWeekTarget };
export {
  bibleReadingsMatch,
  normalizeBibleReading,
  weekTargetMismatch,
} from '../shared/chairman-designation-week-pick';

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    const end = trimmed.lastIndexOf('}');
    if (end > 0) return trimmed.slice(0, end + 1);
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}

const VALID_SECTIONS = new Set<ChairmanAssignmentSection>([
  'abertura',
  'tesouros',
  'ministerio',
  'vida',
  'encerramento',
  'musica',
]);

function sanitizeSection(value: unknown): ChairmanAssignmentSection {
  if (typeof value === 'string' && VALID_SECTIONS.has(value as ChairmanAssignmentSection)) {
    return value as ChairmanAssignmentSection;
  }
  return 'tesouros';
}

function sanitizeDesignation(parsed: unknown): ParsedChairmanDesignation | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const str = (key: string) => (typeof obj[key] === 'string' ? (obj[key] as string).trim() : '');

  const rawAssignments = Array.isArray(obj.assignments) ? obj.assignments : [];
  const assignments = rawAssignments
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const partTitle = typeof row.partTitle === 'string' ? row.partTitle.trim() : '';
      if (!partTitle) return null;
      const assigneesRaw = Array.isArray(row.assignees) ? row.assignees : [];
      const assignees = assigneesRaw
        .map((name) => (typeof name === 'string' ? name.trim() : ''))
        .filter(Boolean);
      const durationMin =
        typeof row.durationMin === 'number' && Number.isFinite(row.durationMin)
          ? Math.round(row.durationMin)
          : undefined;
      return {
        section: sanitizeSection(row.section),
        partTitle,
        durationMin,
        assignees,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (assignments.length === 0 && !str('chairmanName') && !str('bibleReading')) return null;

  return {
    congregation: str('congregation') || undefined,
    meetingDate: str('meetingDate') || undefined,
    bibleReading: str('bibleReading') || undefined,
    openingSong: str('openingSong') || undefined,
    closingSong: str('closingSong') || undefined,
    chairmanName: str('chairmanName') || undefined,
    openingPrayer: str('openingPrayer') || undefined,
    closingPrayer: str('closingPrayer') || undefined,
    assignments,
  };
}

function extractWeekCandidates(parsed: unknown): ParsedChairmanDesignation[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.weeks)) {
    return obj.weeks
      .map((entry) => sanitizeDesignation(entry))
      .filter((entry): entry is ParsedChairmanDesignation => Boolean(entry));
  }

  const single = sanitizeDesignation(parsed);
  return single ? [single] : [];
}

function resolveDesignationForTarget(
  parsed: unknown,
  target: ChairmanDesignationWeekTarget,
): ParsedChairmanDesignation | null {
  const candidates = extractWeekCandidates(parsed);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  const picked = pickDesignationForWeek(target, candidates);
  return picked?.document ?? null;
}

async function callOpenAiJson(
  messages: Array<{ role: string; content: unknown }>,
  target: ChairmanDesignationWeekTarget,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false as const, error: 'IA indisponível: configure OPENAI_API_KEY no .env.' };
  }

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false as const, error: `OpenAI retornou ${response.status}: ${body.slice(0, 180)}` };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) return { ok: false as const, error: 'Resposta vazia da IA.' };

  const jsonText = extractJsonObject(reply);
  if (!jsonText) return { ok: false as const, error: 'IA não retornou JSON válido.' };

  const rawParsed = JSON.parse(jsonText) as unknown;
  const document = resolveDesignationForTarget(rawParsed, target);
  if (!document) {
    return {
      ok: false as const,
      error: `Não encontrei designações para a semana com leitura "${target.bibleReading}". Verifique se a folha contém essa semana.`,
    };
  }

  return { ok: true as const, document, weeksFound: extractWeekCandidates(rawParsed).length };
}

export async function parseChairmanDesignationFromText(
  rawText: string,
  target: ChairmanDesignationWeekTarget,
) {
  const clipped = rawText.trim().slice(0, 14000);
  if (!clipped) {
    return { ok: false as const, error: 'Texto vazio.' };
  }

  try {
    return await callOpenAiJson(
      [
        { role: 'system', content: DESIGNATION_AI_SYSTEM },
        {
          role: 'user',
          content: `${buildDesignationTargetPrompt(target)}\n\nExtraia as designações da semana alvo:\n\n${clipped}`,
        },
      ],
      target,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao contactar a IA';
    return { ok: false as const, error: message };
  }
}

function mimeForImage(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export async function parseChairmanDesignationFromImage(
  fileName: string,
  buffer: Buffer,
  target: ChairmanDesignationWeekTarget,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false as const, error: 'IA indisponível: configure OPENAI_API_KEY no .env.' };
  }

  const mime = mimeForImage(fileName);
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DESIGNATION_AI_SYSTEM },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${buildDesignationTargetPrompt(target)}\n\nExtraia as designações da semana alvo nesta folha (pode haver duas semanas — ignore a outra).`,
              },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false as const, error: `OpenAI retornou ${response.status}: ${body.slice(0, 180)}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false as const, error: 'Resposta vazia da IA.' };

    const jsonText = extractJsonObject(reply);
    if (!jsonText) return { ok: false as const, error: 'IA não retornou JSON válido.' };

    const rawParsed = JSON.parse(jsonText) as unknown;
    const document = resolveDesignationForTarget(rawParsed, target);
    if (!document) {
      return {
        ok: false as const,
        error: `Não encontrei designações para a semana com leitura "${target.bibleReading}".`,
      };
    }

    return {
      ok: true as const,
      document,
      usedVision: true,
      weeksFound: extractWeekCandidates(rawParsed).length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao contactar a IA';
    return { ok: false as const, error: message };
  }
}
