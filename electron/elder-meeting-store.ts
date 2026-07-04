import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { repairCommonMojibake } from '../shared/elder-meeting-text';

export type ElderMeetingAgendaItem = {
  id: string;
  title: string;
  notes: string;
};

export type ElderMeetingRecord = {
  id: string;
  meetingDate: string;
  title: string;
  congregation: string;
  attendees: string;
  openingPrayer: string;
  closingPrayer: string;
  items: ElderMeetingAgendaItem[];
  ataHtml: string;
  createdAt: string;
  updatedAt: string;
};

type ElderMeetingsStore = {
  meetings: Record<string, ElderMeetingRecord>;
};

function storePath(userDataRoot: string) {
  return path.join(userDataRoot, 'elder', 'meetings.json');
}

function normalizeMeetingRecord(record: ElderMeetingRecord): ElderMeetingRecord {
  return {
    ...record,
    title: repairCommonMojibake(record.title),
    congregation: repairCommonMojibake(record.congregation),
    attendees: repairCommonMojibake(record.attendees),
    openingPrayer: repairCommonMojibake(record.openingPrayer ?? ''),
    closingPrayer: repairCommonMojibake(record.closingPrayer ?? ''),
    ataHtml: repairCommonMojibake(record.ataHtml),
    items: record.items.map((item) => ({
      ...item,
      title: repairCommonMojibake(item.title),
      notes: repairCommonMojibake(item.notes),
    })),
  };
}

async function loadStore(userDataRoot: string): Promise<ElderMeetingsStore> {
  try {
    const raw = await fs.readFile(storePath(userDataRoot), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ElderMeetingsStore>;
    const meetings = parsed.meetings ?? {};
    for (const [id, record] of Object.entries(meetings)) {
      meetings[id] = normalizeMeetingRecord(record);
    }
    return { meetings };
  } catch {
    return { meetings: {} };
  }
}

async function saveStore(userDataRoot: string, store: ElderMeetingsStore) {
  const file = storePath(userDataRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), 'utf8');
}

export function newMeetingId() {
  return randomUUID();
}

export function newAgendaItemId() {
  return randomUUID();
}

export function defaultMeetingTitle(dateIso: string) {
  const d = new Date(`${dateIso}T12:00:00`);
  const label = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Reunião de anciãos — ${label}`;
}

export async function listElderMeetings(userDataRoot: string) {
  const store = await loadStore(userDataRoot);
  const items = Object.values(store.meetings).sort(
    (a, b) => b.meetingDate.localeCompare(a.meetingDate) || b.updatedAt.localeCompare(a.updatedAt),
  );
  return { ok: true as const, items };
}

export async function getElderMeeting(userDataRoot: string, id: string) {
  const store = await loadStore(userDataRoot);
  const item = store.meetings[id];
  if (!item) return { ok: false as const, error: 'Reunião não encontrada.' };
  return { ok: true as const, item };
}

export async function createElderMeeting(
  userDataRoot: string,
  partial?: Partial<Pick<ElderMeetingRecord, 'meetingDate' | 'title' | 'congregation'>>,
) {
  const now = new Date().toISOString();
  const meetingDate = partial?.meetingDate ?? now.slice(0, 10);
  const id = newMeetingId();
  const item: ElderMeetingRecord = {
    id,
    meetingDate,
    title: partial?.title ?? defaultMeetingTitle(meetingDate),
    congregation: partial?.congregation ?? '',
    attendees: '',
    openingPrayer: '',
    closingPrayer: '',
    items: [],
    ataHtml: '',
    createdAt: now,
    updatedAt: now,
  };
  const store = await loadStore(userDataRoot);
  store.meetings[id] = item;
  await saveStore(userDataRoot, store);
  return { ok: true as const, item };
}

export async function saveElderMeeting(userDataRoot: string, record: ElderMeetingRecord) {
  const store = await loadStore(userDataRoot);
  if (!store.meetings[record.id]) {
    return { ok: false as const, error: 'Reunião não encontrada.' };
  }
  const updated = { ...record, updatedAt: new Date().toISOString() };
  store.meetings[record.id] = updated;
  await saveStore(userDataRoot, store);
  return { ok: true as const, item: updated };
}

export async function deleteElderMeeting(userDataRoot: string, id: string) {
  const store = await loadStore(userDataRoot);
  if (!store.meetings[id]) return { ok: false as const, error: 'Reunião não encontrada.' };
  delete store.meetings[id];
  await saveStore(userDataRoot, store);
  return { ok: true as const };
}
