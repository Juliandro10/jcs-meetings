import { buildAiSystemPrompt } from './ai-prompts';
import type { AiChatParams, AiChatResult } from './types';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export async function runAiChat(params: AiChatParams): Promise<AiChatResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'Configure OPENAI_API_KEY no arquivo .env na pasta do projeto.',
    };
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: buildAiSystemPrompt(params.context) },
  ];

  for (const item of params.history ?? []) {
    messages.push({ role: item.role, content: item.content });
  }

  messages.push({ role: 'user', content: params.message.trim() });

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.35,
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `OpenAI retornou ${response.status}: ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return { ok: false, error: 'Resposta vazia da OpenAI.' };
    }

    return { ok: true, reply };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao contactar a OpenAI';
    return { ok: false, error: message };
  }
}
