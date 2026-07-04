import {
  formatAtaItemTitle,
  repairCommonMojibake,
  splitAgendaTitleNotes,
} from './elder-meeting-text';

export type MeetingAtaInput = {
  meetingDate: string;
  congregation: string;
  attendees: string;
  openingPrayer?: string;
  closingPrayer?: string;
  items: Array<{ title: string; notes: string }>;
};

function escapeHtml(value: string) {
  return repairCommonMojibake(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripPlainText(value: string) {
  return repairCommonMojibake(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function isRichHtml(value: string) {
  return /<(p|div|span|strong|em|u|mark|br|font)\b/i.test(value);
}

export function formatMeetingDateLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function renderAgendaItem(index: number, title: string, notesHtml: string) {
  const notesPlain = stripPlainText(notesHtml);
  const split = splitAgendaTitleNotes(title, notesPlain);
  const itemTitle = formatAtaItemTitle(split.title || title || `Item ${index + 1}`);
  const decisionPlain = split.notes.trim() || notesPlain;
  const useRichNotes = Boolean(notesHtml.trim()) && isRichHtml(notesHtml) && !split.notes.trim();

  const parts: string[] = [];
  parts.push(`<p class="jcs-ata-item"><strong>${index + 1}. ${escapeHtml(itemTitle)}</strong></p>`);

  if (useRichNotes) {
    parts.push(`<div class="jcs-ata-item-body">${notesHtml.trim()}</div>`);
  } else if (decisionPlain) {
    parts.push(`<div class="jcs-ata-item-body">${escapeHtml(decisionPlain)}</div>`);
  }

  parts.push('<p class="jcs-ata-item-gap">&nbsp;</p>');
  return parts.join('\n');
}

export function composeMeetingAtaHtml(record: MeetingAtaInput): string {
  const dateLabel = formatMeetingDateLabel(record.meetingDate);
  const parts: string[] = [];

  parts.push('<p class="jcs-ata-title"><strong>ATA de reunião de anciãos</strong></p>');
  parts.push(`<p class="jcs-ata-subtitle"><em>${escapeHtml(dateLabel)}</em></p>`);

  const congregation = record.congregation.trim();
  if (congregation) {
    parts.push(`<p class="jcs-ata-meta"><strong>Congregação:</strong> ${escapeHtml(congregation)}</p>`);
  }
  parts.push(`<p class="jcs-ata-meta"><strong>Data:</strong> ${escapeHtml(dateLabel)}</p>`);

  const attendees = record.attendees.trim();
  if (attendees) {
    parts.push(`<p class="jcs-ata-meta"><strong>Presentes:</strong> ${escapeHtml(attendees)}</p>`);
  }

  parts.push('<p class="jcs-ata-spacer">&nbsp;</p>');

  const openingPrayer = record.openingPrayer?.trim();
  if (openingPrayer) {
    parts.push(`<p class="jcs-ata-meta"><strong>Oração inicial:</strong> ${escapeHtml(openingPrayer)}</p>`);
  }

  parts.push('<p class="jcs-ata-section"><strong>PAUTA E DELIBERAÇÕES</strong></p>');

  if (record.items.length === 0) {
    parts.push('<p><em>Nenhum item de pauta registrado.</em></p>');
  } else {
    record.items.forEach((item, index) => {
      parts.push(renderAgendaItem(index, item.title, item.notes));
    });
  }

  const closingPrayer = record.closingPrayer?.trim();
  if (closingPrayer) {
    parts.push(`<p class="jcs-ata-closing"><strong>Oração final:</strong> ${escapeHtml(closingPrayer)}</p>`);
  }

  parts.push(
    '<p class="jcs-ata-footer"><em>Documento gerado pelo JCS Meetings — revisar antes de arquivar.</em></p>',
  );

  return parts.join('\n');
}

export const MEETING_ATA_EDITOR_STYLES = `
  .jcs-ata-title { font-size: 16pt; font-weight: 700; color: #1a1a1a; margin: 0 0 0.35em; }
  .jcs-ata-subtitle { font-size: 11pt; color: #555; font-style: italic; margin: 0 0 1.25em; }
  .jcs-ata-meta { margin: 0 0 0.35em; line-height: 1.55; }
  .jcs-ata-spacer { margin: 0 0 0.85em; }
  .jcs-ata-section { margin: 0.5em 0 0.75em; font-weight: 700; }
  .jcs-ata-item { margin: 0 0 0.25em; line-height: 1.55; }
  .jcs-ata-item-body { margin: 0 0 0.15em 0; line-height: 1.55; }
  .jcs-ata-item-gap { margin: 0 0 0.65em; font-size: 1pt; line-height: 0; }
  .jcs-ata-closing { margin-top: 0.75em; }
  .jcs-ata-footer { font-size: 10pt; color: #777; font-style: italic; margin-top: 1.5em; }
`;
