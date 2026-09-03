export const AI_CHAT_MAX_SESSIONS = 4;
export const AI_CHAT_MAX_STORED_MESSAGES = 24;
export const AI_CHAT_MAX_MODEL_MESSAGES = 12;
export const AI_CHAT_MODEL_MESSAGE_MAX_CHARS = 2000;

export type AiChatSessionContext = {
  contentKind?: 'meeting' | 'elder-outline';
  weekLabel?: string;
  publicationTitle?: string;
  sourcePub?: string;
  sourceIssue?: string;
  sourceDocumentId?: number;
};

export type AiChatSessionMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function normalizePart(value: string | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Chave estável da matéria — ignora seleção e referência do painel. */
export function buildAiChatSessionKey(context: AiChatSessionContext): string {
  const kind = context.contentKind === 'elder-outline' ? 'outline' : 'meeting';
  const pub = normalizePart(context.sourcePub);
  const issue = (context.sourceIssue ?? '').trim();
  const doc = context.sourceDocumentId != null ? String(context.sourceDocumentId) : '';
  if (pub) return `${kind}:${pub}:${issue}:${doc}`;
  return `${kind}:${normalizePart(context.weekLabel)}:${normalizePart(context.publicationTitle)}`;
}

export function buildAiChatSessionTitle(context: AiChatSessionContext): string {
  const week = context.weekLabel?.trim() ?? '';
  const pub = context.publicationTitle?.trim() ?? '';
  if (week && pub && pub !== week && !pub.startsWith(`${week} `) && !week.includes(pub)) {
    const shortPub = pub.length > 42 ? `${pub.slice(0, 39)}…` : pub;
    return `${week} · ${shortPub}`;
  }
  return week || pub || 'Assistente IA';
}

export function buildAiChatSessionPreview(messages: AiChatSessionMessage[]): string {
  const lastUser = [...messages].reverse().find((item) => item.role === 'user' && item.content.trim());
  const text = (lastUser?.content ?? messages.at(-1)?.content ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Conversa vazia';
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

function startOnUser(messages: AiChatSessionMessage[]): AiChatSessionMessage[] {
  if (messages[0]?.role === 'assistant') return messages.slice(1);
  return messages;
}

export function trimAiChatMessages(
  messages: AiChatSessionMessage[],
  max = AI_CHAT_MAX_STORED_MESSAGES,
): AiChatSessionMessage[] {
  const cleaned = messages.filter((item) => item.content.trim());
  if (cleaned.length <= max) return startOnUser(cleaned);
  return startOnUser(cleaned.slice(-max));
}

function stripOutlineFence(content: string) {
  return content.replace(/```jcs-outline\s*[\s\S]*?```/gi, '[esboço já aplicado no editor]').trim();
}

/** Histórico enviado ao modelo: só as trocas recentes, recortadas. */
export function historyForAiModel(messages: AiChatSessionMessage[]): AiChatSessionMessage[] {
  const recent = trimAiChatMessages(messages, AI_CHAT_MAX_MODEL_MESSAGES);
  return recent.map((item, index) => {
    const content = stripOutlineFence(item.content) || item.content;
    const max = index === recent.length - 1 ? AI_CHAT_MODEL_MESSAGE_MAX_CHARS * 2 : AI_CHAT_MODEL_MESSAGE_MAX_CHARS;
    if (content.length <= max) return content === item.content ? item : { ...item, content };
    return { ...item, content: `${content.slice(0, max)}…` };
  });
}
