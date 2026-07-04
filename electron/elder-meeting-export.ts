export { composeMeetingAtaHtml, formatMeetingDateLabel } from '../shared/elder-meeting-ata';
export type { MeetingAtaInput } from '../shared/elder-meeting-ata';

import { composeMeetingAtaHtml as composeShared } from '../shared/elder-meeting-ata';
import type { ElderMeetingRecord } from './elder-meeting-store';

export function composeMeetingAtaFromRecord(record: ElderMeetingRecord): string {
  return composeShared({
    meetingDate: record.meetingDate,
    congregation: record.congregation,
    attendees: record.attendees,
    openingPrayer: record.openingPrayer,
    closingPrayer: record.closingPrayer,
    items: record.items,
  });
}
