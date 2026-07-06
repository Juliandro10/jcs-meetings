import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HourglassExport } from '../shared/hourglass/types';

export type CircuitVisitRecord = {
  id: string;
  title: string;
  visitDate: string;
  congregation: string;
  hourglassData: HourglassExport | null;
  fixedMonths: string[];
  templateS21Path: string;
  templateS88Path: string;
  importFileName: string;
  createdAt: string;
  updatedAt: string;
};

type CircuitVisitsStore = {
  visits: Record<string, CircuitVisitRecord>;
};

function storePath(userDataRoot: string) {
  return path.join(userDataRoot, 'elder', 'circuit-visits.json');
}

async function loadStore(userDataRoot: string): Promise<CircuitVisitsStore> {
  try {
    const raw = await fs.readFile(storePath(userDataRoot), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CircuitVisitsStore>;
    return { visits: parsed.visits ?? {} };
  } catch {
    return { visits: {} };
  }
}

async function saveStore(userDataRoot: string, store: CircuitVisitsStore) {
  const file = storePath(userDataRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), 'utf8');
}

export function newCircuitVisitId() {
  return randomUUID();
}

export function defaultVisitTitle(dateIso: string) {
  const d = new Date(`${dateIso}T12:00:00`);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return `Visita ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export async function listCircuitVisits(userDataRoot: string) {
  const store = await loadStore(userDataRoot);
  const items = Object.values(store.visits).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { ok: true as const, items };
}

export async function getCircuitVisit(userDataRoot: string, id: string) {
  const store = await loadStore(userDataRoot);
  const item = store.visits[id];
  if (!item) return { ok: false as const, error: 'Visita não encontrada.' };
  return { ok: true as const, item };
}

export async function createCircuitVisit(
  userDataRoot: string,
  params?: {
    visitDate?: string;
    title?: string;
    congregation?: string;
    templateS21Path?: string;
    templateS88Path?: string;
  },
) {
  const store = await loadStore(userDataRoot);
  const visitDate = params?.visitDate ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const item: CircuitVisitRecord = {
    id: newCircuitVisitId(),
    title: params?.title ?? defaultVisitTitle(visitDate),
    visitDate,
    congregation: params?.congregation ?? '',
    hourglassData: null,
    fixedMonths: [],
    periodStartMonth: '',
    periodLengthMonths: 6,
    templateS21Path: params?.templateS21Path ?? '',
    templateS88Path: params?.templateS88Path ?? '',
    importFileName: '',
    createdAt: now,
    updatedAt: now,
  };
  store.visits[item.id] = item;
  await saveStore(userDataRoot, store);
  return { ok: true as const, item };
}

export async function saveCircuitVisit(userDataRoot: string, record: CircuitVisitRecord) {
  const store = await loadStore(userDataRoot);
  if (!store.visits[record.id]) {
    return { ok: false as const, error: 'Visita não encontrada.' };
  }
  const item = { ...record, updatedAt: new Date().toISOString() };
  store.visits[record.id] = item;
  await saveStore(userDataRoot, store);
  return { ok: true as const, item };
}

export async function deleteCircuitVisit(userDataRoot: string, id: string) {
  const store = await loadStore(userDataRoot);
  if (!store.visits[id]) return { ok: false as const, error: 'Visita não encontrada.' };
  delete store.visits[id];
  await saveStore(userDataRoot, store);
  return { ok: true as const };
}
