import type { ParsedPautaDocument } from '../shared/elder-meeting-pauta-parse';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

const PAUTA_AI_SYSTEM = `Você extrai a estrutura de uma PAUTA de reunião de anciãos das Testemunhas de Jeová.

Entrada: texto bruto copiado de PDF, Word, WhatsApp ou e-mail — formatos variados.

Saída: APENAS um JSON válido (sem markdown, sem comentários) neste formato:
{
  "openingPrayer": "nome do irmão ou string vazia",
  "closingPrayer": "nome do irmão ou string vazia",
  "items": [{ "title": "assunto em pauta sem numeração" }]
}

Regras:
- "Oração inicial:" e "Oração final:" vão nos campos openingPrayer/closingPrayer, NÃO em items.
- Ignore cabeçalhos como "Pauta", rodapés de PDF ("-- 1 of 1 --"), números de página.
- Cada assunto real da reunião vira um item (bullets, numeração ou parágrafos).
- title = só o assunto; não invente deliberações.
- Mantenha referências (Sfg, par., min) no título quando existirem.
- Português do Brasil; preserve nomes próprios e acentuação.
- Se não houver oração explícita, use string vazia.
- items deve ter pelo menos 1 entrada quando houver assuntos reconhecíveis.`;

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    const end = trimmed.lastIndexOf('}');
    if (end > 0) return trimmed.slice(0, end + 1);
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
}

function sanitizeAiDocument(parsed: unknown): ParsedPautaDocument | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const openingPrayer = typeof obj.openingPrayer === 'string' ? obj.openingPrayer.trim() : '';
  const closingPrayer = typeof obj.closingPrayer === 'string' ? obj.closingPrayer.trim() : '';
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items = rawItems
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const title = typeof (entry as { title?: unknown }).title === 'string'
        ? (entry as { title: string }).title.trim()
        : '';
      return title ? { title } : null;
    })
    .filter((entry): entry is { title: string } => Boolean(entry));

  if (items.length === 0 && !openingPrayer && !closingPrayer) return null;
  return { openingPrayer, closingPrayer, items };
}

export async function parsePautaWithAi(rawText: string): Promise<{
  ok: boolean;
  document?: ParsedPautaDocument;
  error?: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'IA indisponível: configure OPENAI_API_KEY no .env do projeto.',
    };
  }

  const clipped = rawText.trim().slice(0, 12000);

  try {
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
        messages: [
          { role: 'system', content: PAUTA_AI_SYSTEM },
          {
            role: 'user',
            content: `Extraia a pauta deste texto:\n\n${clipped}`,
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

    const document = sanitizeAiDocument(JSON.parse(jsonText));
    if (!document) return { ok: false, error: 'IA não reconheceu assuntos na pauta.' };

    return { ok: true, document };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao contactar a IA';
    return { ok: false, error: message };
  }
}
