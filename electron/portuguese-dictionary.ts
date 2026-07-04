import fsp from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import initSqlJs, { type Database } from 'sql.js';
import { normalizeForSearch } from '../shared/text-normalize';
import { dictionaryLookupTerm } from '../shared/selection-text';

const require = createRequire(import.meta.url);
const SQL_WASM_DIR = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));

/** Wiktionário (pt) — dados abertos via Wiktextract/Kaikki (CC BY-SA). */
export const PORTUGUESE_DICTIONARY_SOURCE_URL = 'https://kaikki.org/ptwiktionary/raw-wiktextract-data.jsonl.gz';
export const PORTUGUESE_DICTIONARY_ATTRIBUTION =
  'Dicionário baseado no Wiktionário (edição em português), via Kaikki.org — licença CC BY-SA 3.0.';

export type DictionarySense = {
  word: string;
  pos: string;
  posLabel: string;
  definitions: string[];
  examples: string[];
};

export type DictionaryLookupResult = {
  ok: boolean;
  installed: boolean;
  query?: string;
  senses?: DictionarySense[];
  error?: string;
};

export type DictionaryStatus = {
  installed: boolean;
  entryCount?: number;
  sourceUrl: string;
  attribution: string;
};

export type DictionaryDownloadProgress = {
  phase: 'download' | 'import' | 'done';
  percent: number;
};

const POS_LABELS: Record<string, string> = {
  noun: 'substantivo',
  verb: 'verbo',
  adj: 'adjetivo',
  adv: 'advérbio',
  pron: 'pronome',
  prep: 'preposição',
  conj: 'conjunção',
  intj: 'interjeição',
  article: 'artigo',
  name: 'nome próprio',
  phrase: 'locução',
  prefix: 'prefixo',
  suffix: 'sufixo',
  character: 'caractere',
  symbol: 'símbolo',
  num: 'numeral',
  det: 'determinante',
  particle: 'partícula',
  proverb: 'provérbio',
};

let sqlInit: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let dictionaryDb: Database | null = null;
let dictionaryDbPath: string | null = null;

async function getSql() {
  if (!sqlInit) {
    sqlInit = await initSqlJs({
      locateFile: (file) => path.join(SQL_WASM_DIR, file),
    });
  }
  return sqlInit;
}

export function getDictionaryDir(userDataRoot: string) {
  return path.join(userDataRoot, 'dictionary');
}

export function getDictionaryDbPath(userDataRoot: string) {
  return path.join(getDictionaryDir(userDataRoot), 'pt-wiktionary.sqlite');
}

function posLabel(pos: string) {
  return POS_LABELS[pos] ?? pos;
}

function extractGlosses(sense: Record<string, unknown>): string[] {
  const glosses: string[] = [];
  const fromGlosses = sense.glosses;
  if (Array.isArray(fromGlosses)) {
    for (const item of fromGlosses) {
      if (typeof item === 'string' && item.trim()) glosses.push(item.trim());
    }
  }
  const fromRaw = sense.raw_glosses;
  if (Array.isArray(fromRaw)) {
    for (const item of fromRaw) {
      if (typeof item === 'string' && item.trim()) glosses.push(item.trim());
    }
  }
  return glosses;
}

function extractExamples(sense: Record<string, unknown>): string[] {
  const examples: string[] = [];
  const raw = sense.examples;
  if (!Array.isArray(raw)) return examples;
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      examples.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object' && 'text' in item) {
      const text = String((item as { text?: string }).text ?? '').trim();
      if (text) examples.push(text);
    }
  }
  return examples.slice(0, 3);
}

function createEmptyDb(SQL: Awaited<ReturnType<typeof initSqlJs>>) {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE entries (
      word TEXT NOT NULL,
      word_norm TEXT NOT NULL,
      pos TEXT NOT NULL,
      definitions TEXT NOT NULL,
      examples TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (word_norm, pos)
    );
    CREATE INDEX idx_entries_word_norm ON entries(word_norm);
  `);
  return db;
}

async function saveDb(db: Database, dbPath: string) {
  await fsp.mkdir(path.dirname(dbPath), { recursive: true });
  const buffer = Buffer.from(db.export());
  await fsp.writeFile(dbPath, buffer);
}

async function loadDb(dbPath: string) {
  const SQL = await getSql();
  const buffer = await fsp.readFile(dbPath);
  return new SQL.Database(buffer);
}

async function ensureDictionaryDb(userDataRoot: string): Promise<Database | null> {
  const dbPath = getDictionaryDbPath(userDataRoot);
  if (dictionaryDb && dictionaryDbPath === dbPath) return dictionaryDb;

  try {
    await fsp.access(dbPath);
  } catch {
    dictionaryDb = null;
    dictionaryDbPath = null;
    return null;
  }

  dictionaryDb?.close();
  dictionaryDb = await loadDb(dbPath);
  dictionaryDbPath = dbPath;
  return dictionaryDb;
}

export async function getDictionaryStatus(userDataRoot: string): Promise<DictionaryStatus> {
  const dbPath = getDictionaryDbPath(userDataRoot);
  try {
    await fsp.access(dbPath);
    const db = await ensureDictionaryDb(userDataRoot);
    const count = db?.exec('SELECT COUNT(*) FROM entries')[0]?.values?.[0]?.[0];
    return {
      installed: true,
      entryCount: typeof count === 'number' ? count : Number(count ?? 0),
      sourceUrl: PORTUGUESE_DICTIONARY_SOURCE_URL,
      attribution: PORTUGUESE_DICTIONARY_ATTRIBUTION,
    };
  } catch {
    return {
      installed: false,
      sourceUrl: PORTUGUESE_DICTIONARY_SOURCE_URL,
      attribution: PORTUGUESE_DICTIONARY_ATTRIBUTION,
    };
  }
}

function mergeJsonArrays(currentJson: string, incoming: string[]) {
  const current = JSON.parse(currentJson) as string[];
  const merged = [...new Set([...current, ...incoming].map((item) => item.trim()).filter(Boolean))];
  return JSON.stringify(merged);
}

function upsertEntry(
  db: Database,
  word: string,
  wordNorm: string,
  pos: string,
  definitions: string[],
  examples: string[],
) {
  if (definitions.length === 0) return;

  const stmt = db.prepare(
    'SELECT definitions, examples FROM entries WHERE word_norm = ? AND pos = ? LIMIT 1',
  );
  stmt.bind([wordNorm, pos]);
  const hasRow = stmt.step();
  const existing = hasRow
    ? (stmt.getAsObject() as { definitions?: string; examples?: string })
    : null;
  stmt.free();

  if (existing?.definitions) {
    const mergedDefs = mergeJsonArrays(existing.definitions, definitions);
    const mergedExamples = mergeJsonArrays(existing.examples ?? '[]', examples);
    db.run('UPDATE entries SET word = ?, definitions = ?, examples = ? WHERE word_norm = ? AND pos = ?', [
      word,
      mergedDefs,
      mergedExamples,
      wordNorm,
      pos,
    ]);
    return;
  }

  db.run(
    'INSERT INTO entries (word, word_norm, pos, definitions, examples) VALUES (?, ?, ?, ?, ?)',
    [word, wordNorm, pos, JSON.stringify(definitions), JSON.stringify(examples)],
  );
}

export async function downloadPortugueseDictionary(
  userDataRoot: string,
  onProgress?: (progress: DictionaryDownloadProgress) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const dictDir = getDictionaryDir(userDataRoot);
  const dbPath = getDictionaryDbPath(userDataRoot);
  const tempGz = path.join(dictDir, `_download_${Date.now()}.jsonl.gz`);

  await fsp.mkdir(dictDir, { recursive: true });

  try {
    onProgress?.({ phase: 'download', percent: 2 });
    const response = await fetch(PORTUGUESE_DICTIONARY_SOURCE_URL);
    if (!response.ok) {
      return { ok: false, error: `Download falhou (${response.status}). Tente novamente mais tarde.` };
    }

    const totalBytes = Number(response.headers.get('content-length')) || 0;
    const reader = response.body?.getReader();
    if (!reader) {
      return { ok: false, error: 'Não foi possível baixar o dicionário.' };
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.length;
      if (totalBytes > 0) {
        const ratio = received / totalBytes;
        onProgress?.({ phase: 'download', percent: Math.min(38, Math.round(2 + ratio * 36)) });
      }
    }

    await fsp.writeFile(tempGz, Buffer.concat(chunks));
    onProgress?.({ phase: 'import', percent: 40 });

    const SQL = await getSql();
    const db = createEmptyDb(SQL);
    let imported = 0;
    let processedLines = 0;
    db.run('BEGIN');

    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(tempGz).pipe(createGunzip());
      const rl = createInterface({ input, crlfDelay: Infinity });

      rl.on('line', (line) => {
        processedLines += 1;
        if (processedLines % 4000 === 0) {
          onProgress?.({
            phase: 'import',
            percent: Math.min(96, 40 + Math.floor(processedLines / 900)),
          });
        }

        if (!line.trim()) return;

        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        if (entry.lang_code !== 'pt') return;

        const word = String(entry.word ?? '').trim();
        const pos = String(entry.pos ?? 'unknown').trim();
        if (!word || !pos) return;

        const senses = Array.isArray(entry.senses) ? entry.senses : [];
        const definitions: string[] = [];
        const examples: string[] = [];

        for (const sense of senses) {
          if (!sense || typeof sense !== 'object') continue;
          definitions.push(...extractGlosses(sense as Record<string, unknown>));
          examples.push(...extractExamples(sense as Record<string, unknown>));
        }

        if (definitions.length === 0) return;

        const wordNorm = normalizeForSearch(word);
        if (wordNorm.length < 2) return;

        upsertEntry(db, word, wordNorm, pos, [...new Set(definitions)], [...new Set(examples)].slice(0, 3));
        imported += 1;
      });

      rl.on('close', () => {
        db.run('COMMIT');
        resolve();
      });
      rl.on('error', reject);
      input.on('error', reject);
    });

    if (imported === 0) {
      db.close();
      return { ok: false, error: 'Arquivo do dicionário veio vazio ou ilegível.' };
    }

    await saveDb(db, dbPath);
    db.close();

    dictionaryDb?.close();
    dictionaryDb = null;
    dictionaryDbPath = null;

    onProgress?.({ phase: 'done', percent: 100 });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao instalar dicionário';
    return { ok: false, error: message };
  } finally {
    await fsp.unlink(tempGz).catch(() => undefined);
  }
}

function queryEntries(db: Database, sql: string, params: string[]) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Array<[string, string, string, string]> = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      word: string;
      pos: string;
      definitions: string;
      examples: string;
    };
    rows.push([row.word, row.pos, row.definitions, row.examples]);
  }
  stmt.free();
  return rows;
}

export async function lookupPortugueseDictionary(
  userDataRoot: string,
  rawQuery: string,
): Promise<DictionaryLookupResult> {
  const query = dictionaryLookupTerm(rawQuery);
  const wordNorm = normalizeForSearch(query);
  if (wordNorm.length < 2) {
    return { ok: false, installed: false, error: 'Digite ao menos 2 caracteres.' };
  }

  const db = await ensureDictionaryDb(userDataRoot);
  if (!db) {
    return {
      ok: false,
      installed: false,
      query,
      error: 'Dicionário não instalado. Baixe em Estudo pessoal → Dicionário.',
    };
  }

  let rows = queryEntries(
    db,
    'SELECT word, pos, definitions, examples FROM entries WHERE word_norm = ? ORDER BY pos',
    [wordNorm],
  );

  if (rows.length === 0) {
    rows = queryEntries(
      db,
      'SELECT word, pos, definitions, examples FROM entries WHERE word_norm LIKE ? ORDER BY word, pos LIMIT 12',
      [`${wordNorm}%`],
    );
  }

  if (rows.length === 0) {
    return {
      ok: true,
      installed: true,
      query,
      senses: [],
    };
  }

  const senses: DictionarySense[] = rows.map(([word, pos, definitionsJson, examplesJson]) => ({
    word: String(word),
    pos: String(pos),
    posLabel: posLabel(String(pos)),
    definitions: JSON.parse(String(definitionsJson)) as string[],
    examples: JSON.parse(String(examplesJson || '[]')) as string[],
  }));

  return {
    ok: true,
    installed: true,
    query,
    senses,
  };
}
