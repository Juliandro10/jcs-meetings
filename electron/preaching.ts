import path from 'node:path';
import { downloadJwpub, isPubCached } from './jw-download';
import { getDocumentHtml, listDocuments, resolveCachedPubPath } from './jwpub-reader';
import { fetchTeachingKitPublicationCards, ensureJwpubCoverCache, resolvePublicationCoverUrl } from './publication-catalog';

const MEDIATOR_BASE = 'https://b.jw-cdn.org/apis/mediator/v1/categories';

function getCatalogDir(cacheDir: string) {
  return path.join(path.dirname(cacheDir), 'catalog');
}

export type TeachingKitItem = {
  id: string;
  kind: 'video' | 'publication';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  durationLabel?: string;
  videoUrl?: string;
  pub?: string;
  issue?: string;
  downloaded?: boolean;
};

export type PreachingTopicPoint = {
  number: number;
  html: string;
  plainText: string;
};

export type PreachingTopic = {
  id: string;
  title: string;
  imageUrl?: string;
  points: PreachingTopicPoint[];
  introduction: string;
};

export type PreachingContent = {
  ok: boolean;
  teachingKit: TeachingKitItem[];
  introHtml?: string;
  topics: PreachingTopic[];
  lmdDownloaded: boolean;
  error?: string;
};

async function fetchTeachingKitPublications(cacheDir: string, lang = 'T'): Promise<TeachingKitItem[]> {
  const cards = await fetchTeachingKitPublicationCards(getCatalogDir(cacheDir), lang);
  await ensureJwpubCoverCache(cacheDir, lang, cards);

  const items: TeachingKitItem[] = [];
  for (const card of cards) {
    const imageUrl = await resolvePublicationCoverUrl(cacheDir, lang, card);
    const key = `${card.pub}_${card.issue || 'latest'}`;
    items.push({
      id: key,
      kind: 'publication',
      title: card.cardTitle,
      subtitle: card.subtitle,
      imageUrl,
      pub: card.pub,
      issue: card.issue,
      downloaded: await isPubCached(cacheDir, card.pub, card.issue, lang),
    });
  }

  return items;
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeInlineHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/jwpub-media:\/\//g, 'https://jw.org/')
    .replace(/<(?!\/?(em|a|strong|i|b|sup)\b)[^>]+>/gi, '')
    .trim();
}

function buildTopicIntroduction(title: string, firstPointPlain: string) {
  const topic = title.toLowerCase();
  const lead = firstPointPlain.split('—')[0]?.trim() || firstPointPlain;
  if (!lead) {
    return `Você sabia que a Bíblia fala sobre ${topic}? Use um dos textos abaixo para explicar essa verdade.`;
  }
  const sentence = lead.replace(/\.$/, '');
  return `Você sabia que ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}?`;
}

async function ensureLmdPath(cacheDir: string, lang = 'T') {
  const cached = await isPubCached(cacheDir, 'lmd', '', lang);
  if (cached) return path.join(cacheDir, `lmd_${lang}_.jwpub`);

  const result = await downloadJwpub({ pub: 'lmd', issue: '', lang, cacheDir });
  if (!result.ok || !result.filePath) {
    throw new Error(result.error ?? 'Não foi possível baixar Ame as Pessoas — Faça Discípulos (lmd).');
  }
  return result.filePath;
}

async function fetchTeachingToolboxVideos(lang = 'T'): Promise<TeachingKitItem[]> {
  const response = await fetch(`${MEDIATOR_BASE}/${lang}/TeachingToolbox?detailed=1`);
  if (!response.ok) return [];

  const data = (await response.json()) as {
    category?: {
      media?: Array<{
        guid: string;
        type: string;
        title: string;
        durationFormattedHHMM?: string;
        images?: { sqr?: { md?: string }; wss?: { sm?: string }; lsr?: { xl?: string } };
        files?: Array<{ progressiveDownloadURL?: string; label?: string; mimetype?: string }>;
      }>;
    };
  };

  return (data.category?.media ?? [])
    .filter((item) => item.type === 'video')
    .map((item) => {
      const files = item.files ?? [];
      const mp4 =
        files.find((file) => file.label === '360p' && file.mimetype === 'video/mp4') ??
        files.find((file) => file.mimetype === 'video/mp4');
      return {
        id: item.guid,
        kind: 'video' as const,
        title: item.title,
        durationLabel: item.durationFormattedHHMM,
        imageUrl: item.images?.sqr?.md ?? item.images?.wss?.sm ?? item.images?.lsr?.xl,
        videoUrl: mp4?.progressiveDownloadURL,
      };
    });
}

function parsePreachingTopics(html: string): { introHtml: string; topics: PreachingTopic[] } {
  const bodyMatch = html.match(/<div class="bodyTxt">([\s\S]*?)<\/div>\s*(?:<div class="pubRefs|<\/body|$)/i);
  const body = bodyMatch?.[1] ?? html;

  const introMatch = body.match(/<p id="p3"[^>]*>([\s\S]*?)<\/p>/i);
  const introHtml = introMatch?.[1] ? sanitizeInlineHtml(introMatch[1]) : '';

  const h2Sections = [...body.matchAll(/<h2[^>]*data-pid="(\d+)"[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|$)/gi)];

  const topics: PreachingTopic[] = [];

  for (const [, pid, titleHtml, sectionHtml] of h2Sections) {
    const title = stripHtml(titleHtml);
    if (!title) continue;

    const figureMatch = sectionHtml.match(/<figure>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    const imageUrl = figureMatch?.[1]?.startsWith('jwpub-media://')
      ? undefined
      : figureMatch?.[1];

    const points: PreachingTopicPoint[] = [];
    for (const pointMatch of sectionHtml.matchAll(/<li><p id="p(\d+)"[^>]*>([\s\S]*?)<\/p>\s*<\/li>/gi)) {
      const pointHtml = sanitizeInlineHtml(pointMatch[2]);
      const plainText = stripHtml(pointHtml);
      const numberMatch = plainText.match(/^(\d+)\./);
      points.push({
        number: numberMatch ? Number(numberMatch[1]) : points.length + 1,
        html: pointHtml,
        plainText,
      });
    }

    if (points.length === 0) continue;

    topics.push({
      id: String(pid),
      title,
      imageUrl,
      points,
      introduction: buildTopicIntroduction(title, points[0].plainText.replace(/^\d+\.\s*/, '')),
    });
  }

  return { introHtml, topics };
}

export async function loadPreachingContent(cacheDir: string, lang = 'T'): Promise<PreachingContent> {
  try {
    const [videos, publications] = await Promise.all([
      fetchTeachingToolboxVideos(lang),
      fetchTeachingKitPublications(cacheDir, lang),
    ]);

    const teachingKit = [...videos, ...publications];

    let topics: PreachingTopic[] = [];
    let introHtml = '';
    let lmdDownloaded = await isPubCached(cacheDir, 'lmd', '', lang);

    if (lmdDownloaded) {
      try {
        const lmdPath = await ensureLmdPath(cacheDir, lang);
        const html = await getDocumentHtml(lmdPath, 16);
        const parsed = parsePreachingTopics(html);
        topics = parsed.topics;
        introHtml = parsed.introHtml;
      } catch {
        /* lmd cache corrupt — will retry download below */
        lmdDownloaded = false;
      }
    }

    if (!lmdDownloaded || topics.length === 0) {
      try {
        const lmdPath = await ensureLmdPath(cacheDir, lang);
        lmdDownloaded = true;
        const html = await getDocumentHtml(lmdPath, 16);
        const parsed = parsePreachingTopics(html);
        topics = parsed.topics;
        introHtml = parsed.introHtml;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar brochura lmd';
        return {
          ok: teachingKit.length > 0,
          teachingKit,
          topics: [],
          lmdDownloaded: false,
          error: message,
        };
      }
    }

    return {
      ok: true,
      teachingKit,
      introHtml,
      topics,
      lmdDownloaded,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar pregação';
    return { ok: false, teachingKit: [], topics: [], lmdDownloaded: false, error: message };
  }
}

export async function downloadTeachingKitPublication(
  cacheDir: string,
  pub: string,
  issue: string,
  lang = 'T',
) {
  return downloadJwpub({ pub, issue, lang, cacheDir });
}

export async function isTeachingKitPublicationCached(
  cacheDir: string,
  pub: string,
  issue: string,
  lang = 'T',
) {
  return isPubCached(cacheDir, pub, issue, lang);
}

export async function listPreachingPubDocuments(
  cacheDir: string,
  pub: string,
  issue: string,
  lang = 'T',
) {
  if (!(await isPubCached(cacheDir, pub, issue, lang))) {
    return { ok: false as const, error: 'Publicação não baixada.' };
  }
  const filePath = await resolveCachedPubPath(cacheDir, pub, issue);
  if (!filePath) {
    return { ok: false as const, error: 'Arquivo .jwpub não encontrado.' };
  }
  try {
    const documents = await listDocuments(filePath);
    return { ok: true as const, documents };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar documentos';
    return { ok: false as const, error: message };
  }
}
