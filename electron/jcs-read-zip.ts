import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export const JCS_READ_ZIP_NAME = 'jcs-read.zip';

async function addDirectoryToZip(zip: JSZip, dir: string, zipPrefix: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === JCS_READ_ZIP_NAME) continue;
    const fullPath = path.join(dir, entry.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, zipPath);
    } else {
      const data = await fs.readFile(fullPath);
      zip.file(zipPath.replace(/\\/g, '/'), data);
    }
  }
}

/** Compacta catalog.json + weeks/ em jcs-read.zip (mesmo nível da pasta exportada). */
export async function writeJcsReadZip(exportRoot: string): Promise<string> {
  const zip = new JSZip();
  await addDirectoryToZip(zip, exportRoot, '');
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const zipPath = path.join(exportRoot, JCS_READ_ZIP_NAME);
  await fs.writeFile(zipPath, buffer);
  return zipPath;
}
