import fs from 'node:fs/promises';
import path from 'node:path';

/** Grava .jwpub de forma atômica (.part → rename). */
export async function writeJwpubFile(filePath: string, data: Buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.part`;

  await fs.writeFile(tempPath, data);

  const handle = await fs.open(tempPath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }

  await fs.rename(tempPath, filePath);
}
