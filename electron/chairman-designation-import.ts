import { extractPautaFileText } from './elder-meeting-pauta';
import {
  parseChairmanDesignationFromImage,
  parseChairmanDesignationFromText,
  type ChairmanDesignationWeekTarget,
} from './chairman-designation-ai';
import type { ParsedChairmanDesignation } from '../shared/chairman-prep-types';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function isImageFile(fileName: string) {
  const lower = fileName.toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export async function parseChairmanDesignationFile(
  fileName: string,
  buffer: Buffer,
  target: ChairmanDesignationWeekTarget,
): Promise<{
  ok: boolean;
  document?: ParsedChairmanDesignation;
  rawText?: string;
  parseMethod?: 'text' | 'vision';
  parseMethodLabel?: string;
  usedVision?: boolean;
  weeksFound?: number;
  error?: string;
}> {
  if (isImageFile(fileName)) {
    const result = await parseChairmanDesignationFromImage(fileName, buffer, target);
    if (!result.ok) return result;
    return {
      ok: true,
      document: result.document,
      parseMethod: 'vision',
      parseMethodLabel: 'IA — imagem',
      usedVision: true,
      weeksFound: result.weeksFound,
    };
  }

  const text = await extractPautaFileText(fileName, buffer);
  if (!text.trim()) {
    return {
      ok: false,
      error: 'Não foi possível extrair texto do arquivo. Tente uma imagem (PNG/JPG) da folha.',
    };
  }

  const result = await parseChairmanDesignationFromText(text, target);
  if (!result.ok) return { ...result, rawText: text };
  return {
    ok: true,
    document: result.document,
    rawText: text,
    parseMethod: 'text',
    parseMethodLabel: 'IA — documento',
    weeksFound: result.weeksFound,
  };
}
