import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';
import type { Database } from 'sql.js';

const XOR_KEY = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');

export function deriveKeyIv(db: Database): Buffer {
  const row = db.exec(
    'SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1',
  )[0]?.values?.[0];
  if (!row) throw new Error('Tabela Publication vazia');

  const [lang, symbol, year, issue] = row.map(String);
  const parts = [lang, symbol, year];
  if (issue && issue !== '0' && Number(issue) !== 0) {
    parts.push(issue);
  }

  const hash = createHash('sha256').update(parts.join('_')).digest();
  const keyIv = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR_KEY[i];
  return keyIv;
}

export function decryptContent(keyIv: Buffer, encrypted: Uint8Array | Buffer): string {
  const buf = Buffer.from(encrypted);
  const decipher = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
  return inflate(decrypted, { to: 'string' });
}
