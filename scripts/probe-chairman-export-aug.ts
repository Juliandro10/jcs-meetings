import fs from 'node:fs/promises';
import path from 'node:path';
import { exportWeekForJcsRead } from '../electron/jcs-read-export';
import { loadMeetingWeeks } from '../electron/jwpub-reader';
import { loadChairmanPrep } from '../electron/chairman-prep-store';

const userDataRoot = path.join(process.env.APPDATA ?? '', 'JCS Meetings');
const cacheDir = path.join(userDataRoot, 'publications');
const userDataDir = path.join(userDataRoot, 'prep');
const exportRoot =
  process.argv[2] ?? path.join(process.env.USERPROFILE ?? '', 'Documents', 'JCS');

async function main() {
  const { weeks } = await loadMeetingWeeks(cacheDir, userDataRoot);
  const week =
    weeks.find((w) => /JEREMIAS 24-25/i.test(w.bibleReading)) ??
    weeks.find((w) => /10-16/i.test(w.label)) ??
    weeks.find((w) => w.isCurrentWeek);

  if (!week) {
    console.error('Semana não encontrada');
    process.exit(1);
  }

  console.log('Week:', week.id, week.label, week.bibleReading);

  const chairman = await loadChairmanPrep(userDataRoot, week.id);
  console.log('Chairman:', {
    assignments: chairman?.assignments?.length ?? 0,
    hasContent: Boolean(chairman?.content),
    chairmanName: chairman?.chairmanName,
  });

  await fs.mkdir(exportRoot, { recursive: true });
  const result = await exportWeekForJcsRead({
    exportRoot,
    cacheDir,
    userDataRoot,
    userDataDir,
    week,
  });
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok || !result.folderPath) return;

  const manifest = JSON.parse(
    await fs.readFile(path.join(result.folderPath, 'week.json'), 'utf8'),
  ) as { documents: Array<{ id: string; title: string }> };

  console.log(
    'Documents:',
    manifest.documents.map((doc) => `${doc.id}: ${doc.title}`).join(', '),
  );

  const chairmanDoc = manifest.documents.find((doc) => doc.id === 'chairman');
  console.log('Has chairman:', Boolean(chairmanDoc));
  if (chairmanDoc) {
    const html = await fs.readFile(path.join(result.folderPath, 'chairman.html'), 'utf8');
    console.log('chairman.html bytes:', html.length);
    console.log('Contains presidente:', /Juliandro/i.test(html));
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
