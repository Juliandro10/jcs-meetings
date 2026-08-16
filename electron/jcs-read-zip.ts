import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export const JCS_READ_ZIP_NAME = 'jcs-read.zip';
const CATALOG_FILE = 'catalog.json';
const WEEKS_DIR = 'weeks';
const PREACHING_DIR = 'preaching';

async function addDirectoryToZip(zip: JSZip, dir: string, zipPrefix: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
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

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Compacta catalog.json + weeks/ (+ preaching/ se existir) — ignora APK, backup, jwpub etc. */
export async function writeJcsReadZip(exportRoot: string): Promise<string> {
  const zip = new JSZip();

  const catalogPath = path.join(exportRoot, CATALOG_FILE);
  if (await pathExists(catalogPath)) {
    const catalogData = await fs.readFile(catalogPath);
    zip.file(CATALOG_FILE, catalogData);
  }

  const weeksPath = path.join(exportRoot, WEEKS_DIR);
  if (await pathExists(weeksPath)) {
    await addDirectoryToZip(zip, weeksPath, WEEKS_DIR);
  }

  const preachingPath = path.join(exportRoot, PREACHING_DIR);
  if (await pathExists(preachingPath)) {
    await addDirectoryToZip(zip, preachingPath, PREACHING_DIR);
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const zipPath = path.join(exportRoot, JCS_READ_ZIP_NAME);
  await fs.writeFile(zipPath, buffer);
  return zipPath;
}
