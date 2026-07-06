import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHourglassExport } from '../shared/hourglass/parse';
import { writePublisherS21Pdf, writeTotalsS21Pdf } from '../electron/visit-form-pdf';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const jsonPath = process.argv[2] ?? 'C:/Users/julia/Downloads/hourglass-export (4).json';
const outDir = process.argv[3] ?? 'C:/Users/julia/Downloads/jcs-test-export';

const raw = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
const data = parseHourglassExport(raw);
const template = path.join(root, 'assets/forms/S-21-T.pdf');

await fs.mkdir(outDir, { recursive: true });

await writeTotalsS21Pdf({
  templatePath: template,
  outputPath: path.join(outDir, 'Total-Publicadores.pdf'),
  data,
  kind: 'publishers',
  serviceYears: [2025, 2024],
});

const pub = data.publishers[0]!;
await writePublisherS21Pdf({
  templatePath: template,
  outputPath: path.join(outDir, 'test-publisher.pdf'),
  data,
  publisher: pub,
});

console.log('OK', outDir, pub.descriptor);
