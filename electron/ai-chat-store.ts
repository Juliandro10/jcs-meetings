import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AI_CHAT_MAX_SESSIONS,
  AI_CHAT_MAX_STORED_MESSAGES,
  buildAiChatSessionPreview,
  trimAiChatMessages,
} from '../shared/ai-chat-session';
import type { AiChatMessage, AiChatSession } from './types';

type StoreFile = {
  sessions: AiChatSession[];
};

function storePath(userDataDir: string) {
  return path.join(userDataDir, 'ai-chat-sessions.json');
}

function sanitizeMessage(value: unknown): AiChatMessage | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as { role?: unknown; content?: unknown };
  if (item.role !== 'user' && item.role !== 'assistant') return null;
  if (typeof item.content !== 'string') return null;
  const content = item.content.trim();
  if (!content) return null;
  return { role: item.role, content };
}

function sanitizeSession(value: unknown): AiChatSession | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<AiChatSession>;
  if (typeof item.id !== 'string' || !item.id.trim()) return null;
  if (typeof item.key !== 'string' || !item.key.trim()) return null;
  const messages = Array.isArray(item.messages)
    ? trimAiChatMessages(item.messages.map(sanitizeMessage).filter((msg): msg is AiChatMessage => Boolean(msg)))
    : [];
  if (messages.length === 0) return null;
  const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString();
  return {
    id: item.id.trim(),
    key: item.key.trim(),
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Assistente IA',
    preview: typeof item.preview === 'string' && item.preview.trim() ? item.preview.trim() : buildAiChatSessionPreview(messages),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : updatedAt,
    updatedAt,
    messages,
  };
}

async function loadStore(userDataDir: string): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath(userDataDir), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.map(sanitizeSession).filter((item): item is AiChatSession => Boolean(item))
      : [];
    return { sessions };
  } catch {
    return { sessions: [] };
  }
}

async function saveStore(userDataDir: string, data: StoreFile) {
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(storePath(userDataDir), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function sortSessions(sessions: AiChatSession[]) {
  return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAiChatSessions(userDataDir: string): Promise<AiChatSession[]> {
  const store = await loadStore(userDataDir);
  return sortSessions(store.sessions).slice(0, AI_CHAT_MAX_SESSIONS);
}

export async function saveAiChatSession(
  userDataDir: string,
  params: { key: string; title: string; messages: AiChatMessage[] },
): Promise<AiChatSession[]> {
  const key = params.key.trim();
  const messages = trimAiChatMessages(params.messages, AI_CHAT_MAX_STORED_MESSAGES);
  const store = await loadStore(userDataDir);

  if (!key || messages.length === 0) {
    store.sessions = store.sessions.filter((item) => item.key !== key);
    await saveStore(userDataDir, store);
    return sortSessions(store.sessions).slice(0, AI_CHAT_MAX_SESSIONS);
  }

  const now = new Date().toISOString();
  const title = params.title.trim() || 'Assistente IA';
  const preview = buildAiChatSessionPreview(messages);
  const existing = store.sessions.find((item) => item.key === key);

  if (existing) {
    existing.title = title;
    existing.preview = preview;
    existing.messages = messages;
    existing.updatedAt = now;
  } else {
    store.sessions.push({
      id: randomUUID(),
      key,
      title,
      preview,
      createdAt: now,
      updatedAt: now,
      messages,
    });
  }

  const kept = sortSessions(store.sessions).slice(0, AI_CHAT_MAX_SESSIONS);
  await saveStore(userDataDir, { sessions: kept });
  return kept;
}

export async function deleteAiChatSession(userDataDir: string, id: string): Promise<AiChatSession[]> {
  const store = await loadStore(userDataDir);
  store.sessions = store.sessions.filter((item) => item.id !== id);
  await saveStore(userDataDir, store);
  return sortSessions(store.sessions).slice(0, AI_CHAT_MAX_SESSIONS);
}
