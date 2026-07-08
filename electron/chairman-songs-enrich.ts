import type { ChairmanPrepRecord } from '../shared/chairman-prep-types';
import type { ChairmanSongLinks, ChairmanSongRef } from '../shared/chairman-song-links';
import {
  extractMiddleSongAnchorsFromMwb,
  extractMwbSongAnchors,
  findMiddleSongNumberInContent,
  isLessonLikeLabel,
  isSongAssignment,
  looksLikeSongLabel,
  parseSongNumber,
  pickMiddleMwbAnchor,
} from '../shared/chairman-song-links';
import type { DocumentStructure } from './document-structure';
import { resolveSongDigitalLink } from './song-digital-link';

async function resolveSongRef(songNumber: number): Promise<ChairmanSongRef | undefined> {
  const link = await resolveSongDigitalLink(songNumber);
  if (!link) return undefined;
  return {
    songNumber: link.songNumber,
    title: link.title,
    documentId: link.documentId,
  };
}

function songRefFromAnchor(anchor: {
  documentId: number;
  songNumber: number;
  label: string;
}): ChairmanSongRef {
  const rawTitle = anchor.label.replace(/^\d{1,3}\.\s*/, '').trim();
  const title =
    rawTitle && looksLikeSongLabel(anchor.label) && !isLessonLikeLabel(rawTitle)
      ? rawTitle
      : anchor.songNumber > 0
        ? `Cântico ${anchor.songNumber}`
        : 'Cântico';
  return {
    songNumber: anchor.songNumber,
    title,
    documentId: anchor.documentId,
  };
}

async function resolveSongRefFromAnchor(anchor: {
  documentId: number;
  songNumber: number;
  label: string;
}): Promise<ChairmanSongRef> {
  const number = anchor.songNumber > 0 ? anchor.songNumber : null;
  if (number) {
    const resolved = await resolveSongRef(number);
    if (resolved) return resolved;
  }
  return songRefFromAnchor(anchor);
}

export async function buildChairmanSongLinks(
  record: ChairmanPrepRecord,
  mwbHtml?: string,
  structure?: DocumentStructure,
): Promise<ChairmanSongLinks | undefined> {
  const links: ChairmanSongLinks = { byAssignmentId: {} };
  let hasAny = false;

  const openingNum = parseSongNumber(record.openingSong ?? '');
  if (openingNum) {
    const opening = await resolveSongRef(openingNum);
    if (opening) {
      links.opening = opening;
      hasAny = true;
    }
  }

  let middleNum = parseSongNumber(record.middleSong ?? '');
  if (!middleNum) {
    middleNum = findMiddleSongNumberInContent(record);
  }
  if (middleNum) {
    const middle = await resolveSongRef(middleNum);
    if (middle) {
      links.middle = middle;
      hasAny = true;
    }
  }

  const closingNum = parseSongNumber(record.closingSong ?? '');
  if (closingNum) {
    const closing = await resolveSongRef(closingNum);
    if (closing) {
      links.closing = closing;
      hasAny = true;
    }
  }

  const mwbAnchors = mwbHtml ? extractMwbSongAnchors(mwbHtml) : [];
  const usedDocIds = new Set<number>();
  if (links.opening) usedDocIds.add(links.opening.documentId);
  if (links.middle) usedDocIds.add(links.middle.documentId);
  if (links.closing) usedDocIds.add(links.closing.documentId);
  const intermediateAnchors = mwbAnchors.filter((anchor) => !usedDocIds.has(anchor.documentId));

  const musicaAssignments = record.assignments.filter(isSongAssignment);
  let anchorIndex = 0;

  for (const assignment of musicaAssignments) {
    const fromTitle = parseSongNumber(assignment.partTitle);
    if (fromTitle) {
      const resolved = await resolveSongRef(fromTitle);
      if (resolved) {
        links.byAssignmentId![assignment.id] = resolved;
        usedDocIds.add(resolved.documentId);
        hasAny = true;
        continue;
      }
    }

    const anchor = intermediateAnchors[anchorIndex];
    if (anchor && looksLikeSongLabel(anchor.label)) {
      anchorIndex += 1;
      const resolved = await resolveSongRefFromAnchor(anchor);
      links.byAssignmentId![assignment.id] = resolved;
      usedDocIds.add(resolved.documentId);
      hasAny = true;
    }
  }

  const musicaHasLink = musicaAssignments.some(
    (assignment) => links.byAssignmentId?.[assignment.id] != null,
  );

  if (!links.middle && !musicaHasLink) {
    const middleFromSlice =
      mwbHtml && structure
        ? extractMiddleSongAnchorsFromMwb(mwbHtml, structure.parts)[0]
        : undefined;
    const middleAnchor =
      middleFromSlice ??
      pickMiddleMwbAnchor(
        intermediateAnchors.filter((_, index) => index >= anchorIndex),
        links.opening,
        links.closing,
      );
    if (middleAnchor) {
      links.middle = await resolveSongRefFromAnchor(middleAnchor);
      hasAny = true;
    }
  }

  return hasAny ? links : undefined;
}
