import { normalizePlainText } from '../shared/text-normalize';
import type { ChairmanAssignment } from '../shared/chairman-prep-types';
import { isStudentAssignment } from '../shared/chairman-student-part';
import type { DocumentStructure } from './document-structure';
import { getPartBlockRanges } from './document-structure';
import { parsePreachingTopics } from './preaching';
import { getDocumentHtml, listDocuments, resolveCachedPubPath } from './jwpub-reader';

export type ParsedLessonRef = {
  pub: string;
  lesson: number;
  point?: number;
  label: string;
};

export type StudentLessonBrief = {
  assignmentId: string;
  partTitle: string;
  lessonRef?: ParsedLessonRef;
  lessonSummary?: string;
  consideracao?: string;
  pubMissing?: string;
};

const LESSON_REF_RE =
  /(?:^|[\s(])[\*]*([a-z]{2,5})[\*]*\s+li[çc][ãa]o\s+(\d+)(?:\s+ponto\s+(\d+))?/gi;

const APPENDIX_REF_RE =
  /(?:^|[\s(])[\*]*([a-z]{2,5})[\*]*\s+ap[êe]ndice\s+([A-Z])(?:\s+ponto\s+(\d+))?/gi;

const PUB_LABELS: Record<string, string> = {
  lmd: 'Ame as Pessoas — Faça Discípulos (lmd)',
  lff: 'Curso bíblico (lff)',
  th: 'Aprenda do Grande Instrutor (th)',
};

const MINISTRY_TITLE_ALIASES: Record<string, string[]> = {
  revisitas: ['cultivando o interesse', 'revisitas', 'seguindo'],
  'estudo bíblico': ['fazendo discípulos', 'estudo bíblico', 'discurso'],
  'iniciando conversas': ['iniciando conversas'],
  'cultivando o interesse': ['cultivando o interesse', 'revisitas'],
  'fazendo discípulos': ['fazendo discípulos', 'estudo bíblico', 'discurso'],
};

type LessonPoint = { number: number; plainText: string };

type PubLessonCache = {
  filePath: string | null;
  docIds: Map<string, number>;
  htmlCache: Map<number, string>;
};

function stripHtml(value: string) {
  return normalizePlainText(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

function isQuizStylePoint(plainText: string): boolean {
  const body = plainText.replace(/^\d+\.\s+/, '').trim();
  if (body.length >= 80) return false;
  if (/^['"].*['"]\s*\??$/.test(body)) return true;
  if (body.length < 70 && /\?\s*$/.test(body)) return true;
  return false;
}

function parseNumberedParagraphPoints(body: string): LessonPoint[] {
  const points: LessonPoint[] = [];
  const seen = new Set<number>();
  const pMatches = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];

  for (let index = 0; index < pMatches.length; index += 1) {
    const plainText = stripHtml(pMatches[index]![1]!);
    const numberMatch = plainText.match(/^(\d+)\.\s+/);
    if (!numberMatch) continue;
    const number = Number(numberMatch[1]);
    if (!Number.isFinite(number) || number > 20 || seen.has(number)) continue;

    let fullText = plainText;
    for (let next = index + 1; next < pMatches.length; next += 1) {
      const nextPlain = stripHtml(pMatches[next]![1]!);
      if (/^(\d+)\.\s+/.test(nextPlain)) break;
      if (!nextPlain.trim()) continue;
      fullText += ` ${nextPlain}`;
    }

    seen.add(number);
    points.push({ number, plainText: fullText.replace(/\s+/g, ' ').trim() });
  }

  return points.sort((a, b) => a.number - b.number);
}

function parseNumberedListPoints(body: string): LessonPoint[] {
  const points: LessonPoint[] = [];
  const seen = new Set<number>();

  for (const match of body.matchAll(/<li[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/li>/gi)) {
    const plainText = stripHtml(match[1]!);
    const numberMatch = plainText.match(/^(\d+)\.\s+/);
    if (!numberMatch) continue;
    const number = Number(numberMatch[1]);
    if (!Number.isFinite(number) || seen.has(number)) continue;
    seen.add(number);
    points.push({ number, plainText });
  }

  return points.sort((a, b) => a.number - b.number);
}

function formatLessonLabel(pub: string, lesson: number, point?: number) {
  const base = `${pub} lição ${lesson}`;
  return point ? `${base} ponto ${point}` : base;
}

function normalizeRefSource(text: string) {
  return text.replace(/\*([a-z]{2,5})\*/gi, '$1');
}

export function parseLessonRefs(text: string): ParsedLessonRef[] {
  const normalized = normalizeRefSource(text);
  const refs: ParsedLessonRef[] = [];
  const seen = new Set<string>();

  const re = new RegExp(LESSON_REF_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized))) {
    const pub = match[1]!.toLowerCase();
    const lesson = Number(match[2]);
    const point = match[3] ? Number(match[3]) : undefined;
    if (!Number.isFinite(lesson)) continue;
    const key = `${pub}:${lesson}:${point ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      pub,
      lesson,
      point,
      label: formatLessonLabel(pub, lesson, point),
    });
  }

  const appendixRe = new RegExp(APPENDIX_REF_RE.source, 'gi');
  while ((match = appendixRe.exec(normalized))) {
    const pub = match[1]!.toLowerCase();
    const letter = match[2]!.toUpperCase();
    const point = match[3] ? Number(match[3]) : undefined;
    const key = `${pub}:appendix-${letter}:${point ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      pub,
      lesson: 0,
      point,
      label: point
        ? `${pub} apêndice ${letter} ponto ${point}`
        : `${pub} apêndice ${letter}`,
    });
  }

  return refs;
}

/** Referência que a apostila pede para considerar (prefere a que tem ponto). */
export function pickEvaluationLessonRef(text: string, refs: ParsedLessonRef[]): ParsedLessonRef | undefined {
  if (refs.length === 0) return undefined;

  const withPoint = refs.filter((ref) => ref.point != null);
  if (withPoint.length > 0) return withPoint[withPoint.length - 1];

  const normalized = normalizeRefSource(text);
  const parenMatches = [...normalized.matchAll(/\(\s*([^)]+)\)/g)];
  for (let index = parenMatches.length - 1; index >= 0; index -= 1) {
    const innerRefs = parseLessonRefs(parenMatches[index]![1]!);
    if (innerRefs[0]) return innerRefs[0];
  }

  return refs[0];
}

function partNumber(title: string) {
  const match = title.trim().match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

function normalizeTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function titleMatchesAssignment(partTitle: string, assignmentTitle: string) {
  const partNorm = normalizeTitle(partTitle.replace(/^\d+\.\s*/, ''));
  const assignNorm = normalizeTitle(assignmentTitle);
  if (partNorm.includes(assignNorm) || assignNorm.includes(partNorm)) return true;

  const aliases = MINISTRY_TITLE_ALIASES[assignNorm];
  if (aliases?.some((alias) => partNorm.includes(normalizeTitle(alias)))) return true;

  return false;
}

/** Mapeia designações de estudante → bloco da apostila (por ordem e título). */
export function mapStudentAssignmentsToBlocks(
  structure: DocumentStructure,
  assignments: ChairmanAssignment[],
): Map<string, string> {
  const map = new Map<string, string>();
  const readingParts = structure.parts.filter((part) => part.kind === 'reading');
  const ministryParts = structure.parts.filter((part) => part.kind === 'ministry');

  const tesourosStudents = assignments.filter(
    (item) => isStudentAssignment(item) && item.section === 'tesouros',
  );
  const ministerioStudents = assignments.filter(
    (item) => isStudentAssignment(item) && item.section === 'ministerio',
  );

  for (const [index, assignment] of tesourosStudents.entries()) {
    const byNumber = readingParts.find((part) => partNumber(part.title) === partNumber(assignment.partTitle));
    const byTitle = readingParts.find((part) => titleMatchesAssignment(part.title, assignment.partTitle));
    const byIndex = readingParts[index];
    const blockId = (byNumber ?? byTitle ?? byIndex)?.blockId;
    if (blockId) map.set(assignment.id, blockId);
  }

  for (const [index, assignment] of ministerioStudents.entries()) {
    const byNumber = ministryParts.find(
      (part) => partNumber(part.title) === partNumber(assignment.partTitle),
    );
    const byTitle = ministryParts.find((part) => titleMatchesAssignment(part.title, assignment.partTitle));
    const byIndex = ministryParts[index];
    const blockId = (byNumber ?? byTitle ?? byIndex)?.blockId;
    if (blockId) map.set(assignment.id, blockId);
  }

  return map;
}

function extractConsideracao(text: string) {
  const plain = stripHtml(text);
  const match = plain.match(/consider(?:e|ação)[:\s]+([\s\S]{0,500})/i);
  return match?.[1]?.trim().slice(0, 400);
}

function summarizePointText(text: string, max = 520) {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const slice = plain.slice(0, max);
  const stop = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  if (stop >= max * 0.55) return slice.slice(0, stop + 1).trim();
  return `${slice.trim()}…`;
}

function parseNumberedLessonPoints(html: string): LessonPoint[] {
  const bodyMatch = html.match(/<div class="bodyTxt">([\s\S]*?)<\/div>\s*(?:<\/article|<div class="pubRefs|$)/i);
  const body = bodyMatch?.[1] ?? html;

  const paragraphPoints = parseNumberedParagraphPoints(body);
  if (paragraphPoints.length > 0) return paragraphPoints;

  const listPoints = parseNumberedListPoints(body).filter((point) => !isQuizStylePoint(point.plainText));
  if (listPoints.length > 0) return listPoints;

  return parseNumberedListPoints(body);
}

function summaryFromPoints(points: LessonPoint[], point?: number, fallbackTitle?: string) {
  if (point != null) {
    const pt = points.find((item) => item.number === point) ?? points[point - 1];
    if (pt?.plainText) return summarizePointText(pt.plainText);
  }
  const combined = points.map((item) => item.plainText).filter(Boolean).join(' ');
  if (combined) return summarizePointText(combined);
  return fallbackTitle ? summarizePointText(fallbackTitle) : undefined;
}

function extractLffSectionSummary(html: string) {
  const bodyMatch = html.match(/<div class="bodyTxt">([\s\S]*?)<\/div>\s*(?:<\/article|<div class="pubRefs|$)/i);
  const body = bodyMatch?.[1] ?? html;
  const chunks: string[] = [];

  const resumoMatch = body.match(
    /<h2[^>]*>\s*(?:<[^>]+>\s*)*RESUMO[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|$)/i,
  );
  if (resumoMatch?.[1]) {
    const resumoText = stripHtml(resumoMatch[1]).replace(/\s+/g, ' ').trim();
    if (resumoText) chunks.push(`Resumo: ${summarizePointText(resumoText, 280)}`);
  }

  for (const heading of ['Revisão', 'Tente o Seguinte']) {
    const sectionMatch = body.match(
      new RegExp(
        `<h[23][^>]*>\\s*(?:<[^>]+>\\s*)*${heading}[\\s\\S]*?<\\/h[23]>([\\s\\S]*?)(?=<h[234]|$)`,
        'i',
      ),
    );
    if (sectionMatch?.[1]) {
      const sectionText = stripHtml(sectionMatch[1]).replace(/\s+/g, ' ').trim();
      if (sectionText) chunks.push(`${heading}: ${summarizePointText(sectionText, 220)}`);
    }
  }

  if (chunks.length > 0) return chunks.join('\n\n');

  const principleMatch = html.match(/<em>Princípio:<\/em>\s*([^<]+)/i);
  if (principleMatch?.[1]) return summarizePointText(stripHtml(principleMatch[1]));

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]) return summarizePointText(stripHtml(h1Match[1]));

  return undefined;
}

async function getPubCache(cacheDir: string, pub: string, caches: Map<string, PubLessonCache>) {
  if (caches.has(pub)) return caches.get(pub)!;

  const filePath = await resolveCachedPubPath(cacheDir, pub, '');
  const entry: PubLessonCache = {
    filePath,
    docIds: new Map(),
    htmlCache: new Map(),
  };
  caches.set(pub, entry);
  return entry;
}

async function findLessonDocumentId(
  pubCache: PubLessonCache,
  lesson: number,
): Promise<number | null> {
  const cacheKey = String(lesson);
  if (pubCache.docIds.has(cacheKey)) return pubCache.docIds.get(cacheKey)!;

  if (!pubCache.filePath) {
    pubCache.docIds.set(cacheKey, -1);
    return null;
  }

  const docs = await listDocuments(pubCache.filePath);
  for (const doc of docs) {
    const html = await getDocumentHtml(pubCache.filePath, doc.documentId);
    pubCache.htmlCache.set(doc.documentId, html);
    if (new RegExp(`LI[ÇC]ÃO\\s*${lesson}\\b`, 'i').test(html)) {
      pubCache.docIds.set(cacheKey, doc.documentId);
      return doc.documentId;
    }
  }

  for (const doc of docs) {
    const title = doc.title ?? '';
    const padded = String(lesson).padStart(2, '0');
    if (
      title.startsWith(`${lesson} `) ||
      title.startsWith(`${padded} `) ||
      new RegExp(`\\bLição\\s+0?${lesson}\\b`, 'i').test(title)
    ) {
      pubCache.docIds.set(cacheKey, doc.documentId);
      return doc.documentId;
    }
  }

  pubCache.docIds.set(cacheKey, -1);
  return null;
}

async function loadLessonHtml(pubCache: PubLessonCache, documentId: number) {
  if (pubCache.htmlCache.has(documentId)) return pubCache.htmlCache.get(documentId)!;
  if (!pubCache.filePath) return '';
  const html = await getDocumentHtml(pubCache.filePath, documentId);
  pubCache.htmlCache.set(documentId, html);
  return html;
}

async function resolveLmdSummary(
  cacheDir: string,
  ref: ParsedLessonRef,
  pubCaches: Map<string, PubLessonCache>,
) {
  const pubCache = await getPubCache(cacheDir, 'lmd', pubCaches);
  if (!pubCache.filePath) {
    return { summary: undefined, pubMissing: PUB_LABELS.lmd };
  }

  const docId = await findLessonDocumentId(pubCache, ref.lesson);
  if (docId == null || docId < 0) return { summary: undefined, pubMissing: undefined };

  const html = await loadLessonHtml(pubCache, docId);
  const points = parseNumberedLessonPoints(html);
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const lessonTitle = titleMatch?.[1] ? stripHtml(titleMatch[1]) : undefined;

  const summary = summaryFromPoints(points, ref.point, lessonTitle);
  return { summary, pubMissing: undefined };
}

async function resolveLffSummary(
  cacheDir: string,
  ref: ParsedLessonRef,
  pubCaches: Map<string, PubLessonCache>,
) {
  const pubCache = await getPubCache(cacheDir, 'lff', pubCaches);
  if (!pubCache.filePath) {
    return { summary: undefined, pubMissing: PUB_LABELS.lff };
  }

  const docId = await findLessonDocumentId(pubCache, ref.lesson);
  if (docId == null || docId < 0) return { summary: undefined, pubMissing: undefined };

  const html = await loadLessonHtml(pubCache, docId);
  const summary = extractLffSectionSummary(html);
  if (summary) return { summary, pubMissing: undefined };

  const points = parseNumberedLessonPoints(html);
  return {
    summary: summaryFromPoints(points, ref.point),
    pubMissing: undefined,
  };
}

async function resolveThSummary(
  cacheDir: string,
  ref: ParsedLessonRef,
  pubCaches: Map<string, PubLessonCache>,
) {
  const pubCache = await getPubCache(cacheDir, 'th', pubCaches);
  if (!pubCache.filePath) {
    return { summary: undefined, pubMissing: PUB_LABELS.th };
  }

  const docId = await findLessonDocumentId(pubCache, ref.lesson);
  if (docId == null || docId < 0) return { summary: undefined, pubMissing: undefined };

  const html = await loadLessonHtml(pubCache, docId);
  const parsed = parsePreachingTopics(html);
  if (parsed.topics.length > 0) {
    const topic = parsed.topics[0];
    if (topic) {
      const summary = summaryFromPoints(
        topic.points.map((point) => ({ number: point.number, plainText: point.plainText })),
        ref.point,
        topic.title,
      );
      if (summary) return { summary, pubMissing: undefined };
    }
  }

  const points = parseNumberedLessonPoints(html);
  return {
    summary: summaryFromPoints(points, ref.point),
    pubMissing: undefined,
  };
}

async function resolveLessonSummary(
  cacheDir: string,
  ref: ParsedLessonRef,
  pubCaches: Map<string, PubLessonCache>,
) {
  if (ref.label.includes('apêndice')) {
    return { summary: undefined, pubMissing: undefined };
  }

  switch (ref.pub) {
    case 'lmd':
      return resolveLmdSummary(cacheDir, ref, pubCaches);
    case 'lff':
      return resolveLffSummary(cacheDir, ref, pubCaches);
    case 'th':
      return resolveThSummary(cacheDir, ref, pubCaches);
    default:
      return {
        summary: undefined,
        pubMissing: PUB_LABELS[ref.pub] ?? ref.pub.toUpperCase(),
      };
  }
}

export async function buildStudentLessonBriefs(
  cacheDir: string,
  structure: DocumentStructure,
  assignments: ChairmanAssignment[],
): Promise<StudentLessonBrief[]> {
  const blockMap = new Map(structure.blocks.map((block) => [block.blockId, block.text]));
  const ranges = getPartBlockRanges(structure.parts, structure.blocks);
  const assignmentBlocks = mapStudentAssignmentsToBlocks(structure, assignments);
  const pubCaches = new Map<string, PubLessonCache>();
  const briefs: StudentLessonBrief[] = [];

  for (const assignment of assignments) {
    if (!isStudentAssignment(assignment)) continue;

    const blockId = assignmentBlocks.get(assignment.id);
    const blockIds = blockId ? ranges.get(blockId) ?? [blockId] : [];
    const partText = blockIds.map((id) => blockMap.get(id) ?? '').join('\n');
    const consideracao = partText ? extractConsideracao(partText) : undefined;

    const refs = partText ? parseLessonRefs(partText) : [];
    const lessonRef = partText ? pickEvaluationLessonRef(partText, refs) : undefined;

    let lessonSummary: string | undefined;
    let pubMissing: string | undefined;

    if (lessonRef) {
      const resolved = await resolveLessonSummary(cacheDir, lessonRef, pubCaches);
      lessonSummary = resolved.summary;
      pubMissing = resolved.pubMissing;
    }

    if (!lessonSummary && consideracao) {
      lessonSummary = consideracao;
    }

    briefs.push({
      assignmentId: assignment.id,
      partTitle: assignment.partTitle,
      lessonRef,
      lessonSummary,
      consideracao,
      pubMissing,
    });
  }

  return briefs;
}

export function formatStudentLessonContextForPrompt(briefs: StudentLessonBrief[]) {
  if (briefs.length === 0) return '';
  return briefs
    .map((brief) => {
      const lines = [
        `- assignmentId: ${brief.assignmentId} | ${brief.partTitle}`,
        brief.lessonRef ? `  lição: ${brief.lessonRef.label}` : '  lição: (não detectada na apostila)',
      ];
      if (brief.lessonSummary) lines.push(`  pontos principais: ${brief.lessonSummary}`);
      if (brief.consideracao && brief.consideracao !== brief.lessonSummary) {
        lines.push(`  consideração apostila: ${brief.consideracao}`);
      }
      if (brief.pubMissing) {
        lines.push(
          `  aviso: publicação ${brief.pubMissing} não baixada — use só a consideração da apostila`,
        );
      }
      return lines.join('\n');
    })
    .join('\n');
}
