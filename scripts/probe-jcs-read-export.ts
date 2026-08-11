import fs from 'node:fs/promises';
import path from 'node:path';
import { exportWeekForJcsRead } from '../electron/jcs-read-export';
import { loadMeetingWeeks } from '../electron/jwpub-reader';
import { loadChairmanPrep } from '../electron/chairman-prep-store';
import { buildChairmanPrepHtml } from '../shared/chairman-prep-html';

const userDataRoot = path.join(process.env.APPDATA ?? '', 'JCS Meetings');
const cacheDir = path.join(userDataRoot, 'publications');
const userDataDir = path.join(userDataRoot, 'prep');
const exportRoot =
  process.argv[2] ?? path.join(process.env.TEMP ?? '.', 'jcs-read-probe');

async function main() {
  const { weeks } = await loadMeetingWeeks(cacheDir, userDataRoot);
  const week =
    weeks.find((w) => /13.*19.*jul/i.test(w.label) || w.label.includes('13-19')) ??
    weeks.find((w) => w.isCurrentWeek) ??
    weeks[0];
  if (!week) {
    console.error('Nenhuma semana encontrada');
    process.exit(1);
  }
  console.log('Semana:', week.id, week.label, 'mwb:', week.mwbDownloaded, 'w:', week.wDownloaded);
  await fs.mkdir(exportRoot, { recursive: true });
  const result = await exportWeekForJcsRead({
    exportRoot,
    cacheDir,
    userDataRoot,
    userDataDir,
    week,
  });
  console.log(JSON.stringify(result, null, 2));

  const chairmanRaw = await loadChairmanPrep(userDataRoot, week.id);
  if (chairmanRaw?.content) {
    const html = buildChairmanPrepHtml(chairmanRaw, { tablet: true });
    console.log('chairman html bytes', html.length);
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
