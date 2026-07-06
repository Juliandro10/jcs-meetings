import fs from 'node:fs/promises';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type PDFPage,
} from 'pdf-lib';
import { compareMonthKeys, monthKey, parseMonthKey, serviceYearStart } from '../shared/hourglass/month-utils';
import {
  referenceDateFromVisit,
  type VisitPeriodOptions,
} from '../shared/hourglass/period';
import {
  indexReportsByMonth,
  isAuxiliaryPioneer,
  isFieldMissionary,
  isPublisherReported,
  isRegularPioneer,
  isSpecialPioneer,
  publisherDisplayName,
  reportHoursForS21,
} from '../shared/hourglass/parse';
import type { HourglassExport, HourglassPublisher, HourglassReport } from '../shared/hourglass/types';

/** Índice de linha S-21 (set=20 … ago=31). */
const SERVICE_MONTH_ROW: Record<number, number> = {
  9: 20,
  10: 21,
  11: 22,
  12: 23,
  1: 24,
  2: 25,
  3: 26,
  4: 27,
  5: 28,
  6: 29,
  7: 30,
  8: 31,
};

function decodePdfFieldName(raw: string): string {
  const inner = raw.startsWith('(') && raw.endsWith(')') ? raw.slice(1, -1) : raw;
  const bytes = [...inner].map((ch) => ch.charCodeAt(0));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    }
    return out;
  }
  return inner;
}

type WidgetMap = Map<string, PDFDict>;

function decodeUtf16BeHex(hexRaw: string): string {
  const hex = hexRaw.replace(/^<|>$/g, '').replace(/\s/g, '');
  let out = '';
  for (let i = 0; i + 3 < hex.length; i += 4) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  }
  return out.replace(/^\uFEFF/, '');
}

function fieldNameFromPdfObject(value: PDFString | PDFHexString): string {
  if (value instanceof PDFHexString) {
    return decodeUtf16BeHex(value.asString());
  }
  return decodePdfFieldName(value.asString());
}

function buildWidgetMap(pdf: PDFDocument, page: PDFPage): WidgetMap {
  const ctx = pdf.context;
  const annotsRef = page.node.get(PDFName.of('Annots'));
  if (!annotsRef) return new Map();
  const annots = ctx.lookup(annotsRef, PDFArray);
  const map = new Map<string, PDFDict>();

  for (let i = 0; i < annots.size(); i += 1) {
    const annot = ctx.lookup(annots.get(i), PDFDict);
    const t = annot.get(PDFName.of('T'));
    if (!t) continue;
    const nameObj = ctx.lookup(t);
    if (!(nameObj instanceof PDFString || nameObj instanceof PDFHexString)) continue;
    const decoded = fieldNameFromPdfObject(nameObj);
    map.set(decoded, annot);
  }
  return map;
}

/** O modelo S-21 usa DA com fonte tamanho 0 — texto fica invisível sem corrigir. */
const S21_TEXT_FONT_SIZE = 10;

function encodePdfTextValue(value: string): PDFString | PDFHexString {
  if (/[^\u0000-\u00ff]/.test(value)) {
    let hex = 'FEFF';
    for (const ch of value) {
      hex += ch.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase();
    }
    return PDFHexString.of(hex);
  }
  return PDFString.of(value);
}

function normalizeWidgetDa(ctx: PDFDocument['context'], widget: PDFDict): string {
  const daRef = widget.get(PDFName.of('DA'));
  const fallback = `/JWKnoll-Medium ${S21_TEXT_FONT_SIZE} Tf 0 g`;
  if (!daRef) return fallback;
  const da = ctx.lookup(daRef, PDFString);
  return da.asString().replace(/ 0 Tf /g, ` ${S21_TEXT_FONT_SIZE} Tf `);
}

function applyWidgetText(ctx: PDFDocument['context'], widget: PDFDict, value: string) {
  widget.set(PDFName.of('V'), encodePdfTextValue(value));
  widget.set(PDFName.of('DA'), PDFString.of(normalizeWidgetDa(ctx, widget)));
}

function decodeWidgetValue(ctx: PDFDocument['context'], widget: PDFDict): string | null {
  const vRef = widget.get(PDFName.of('V'));
  if (!vRef) return null;
  const v = ctx.lookup(vRef);
  if (v instanceof PDFString) return v.decodeText();
  if (v instanceof PDFHexString) return decodeUtf16BeHex(v.asString());
  return null;
}

function widgetRect(ctx: PDFDocument['context'], widget: PDFDict) {
  const rectRef = widget.get(PDFName.of('Rect'));
  if (!rectRef) return null;
  const rect = ctx.lookup(rectRef, PDFArray);
  return {
    x0: rect.get(0).asNumber(),
    y0: rect.get(1).asNumber(),
    x1: rect.get(2).asNumber(),
    y1: rect.get(3).asNumber(),
  };
}

function widgetIsCentered(widget: PDFDict): boolean {
  return widget.get(PDFName.of('Q'))?.asNumber?.() === 1;
}

function isTextWidget(widget: PDFDict): boolean {
  const ft = widget.get(PDFName.of('FT'));
  return Boolean(ft && String(ft).includes('Tx'));
}

function textPosition(
  rect: { x0: number; y0: number; x1: number; y1: number },
  value: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  centered: boolean,
) {
  const width = rect.x1 - rect.x0;
  const height = rect.y1 - rect.y0;
  const textWidth = font.widthOfTextAtSize(value, S21_TEXT_FONT_SIZE);
  const x = centered ? rect.x0 + Math.max(0, (width - textWidth) / 2) : rect.x0 + 2;
  const y = rect.y0 + Math.max(0, (height - S21_TEXT_FONT_SIZE) / 2);
  return { x, y };
}

function isCheckboxWidget(widget: PDFDict): boolean {
  const ft = widget.get(PDFName.of('FT'));
  return Boolean(ft && String(ft).includes('Btn'));
}

function isWidgetChecked(ctx: PDFDocument['context'], widget: PDFDict): boolean {
  const vRef = widget.get(PDFName.of('V'));
  if (!vRef) return false;
  const v = ctx.lookup(vRef);
  if (v instanceof PDFName) {
    const state = v.asString();
    return state === 'Yes' || state === '/Yes';
  }
  return false;
}

function drawCheckboxMark(
  page: PDFPage,
  rect: { x0: number; y0: number; x1: number; y1: number },
) {
  const pad = Math.min(rect.x1 - rect.x0, rect.y1 - rect.y0) * 0.22;
  const line = { thickness: 1.2, color: rgb(0, 0, 0) };
  page.drawLine({
    start: { x: rect.x0 + pad, y: rect.y0 + pad },
    end: { x: rect.x1 - pad, y: rect.y1 - pad },
    ...line,
  });
  page.drawLine({
    start: { x: rect.x1 - pad, y: rect.y0 + pad },
    end: { x: rect.x0 + pad, y: rect.y1 - pad },
    ...line,
  });
}

/**
 * Acrobat ignora /V em widgets órfãos sem /AP válido.
 * Desenha texto e marcas de checkbox no conteúdo da página e remove todos os widgets
 * (evita manchas azuis em campos vazios e conflito de nomes ao juntar páginas).
 */
async function flattenS21FormFieldsToPage(pdf: PDFDocument) {
  const textFont = await pdf.embedFont(StandardFonts.Helvetica);
  const ctx = pdf.context;

  for (const page of pdf.getPages()) {
    const annotsRef = page.node.get(PDFName.of('Annots'));
    if (!annotsRef) continue;
    const annots = ctx.lookup(annotsRef, PDFArray);

    for (let i = 0; i < annots.size(); i += 1) {
      const widget = ctx.lookup(annots.get(i), PDFDict);
      const rect = widgetRect(ctx, widget);
      if (!rect) continue;

      if (isTextWidget(widget)) {
        const value = decodeWidgetValue(ctx, widget);
        if (value) {
          const { x, y } = textPosition(rect, value, textFont, widgetIsCentered(widget));
          page.drawText(value, {
            x,
            y,
            size: S21_TEXT_FONT_SIZE,
            font: textFont,
            color: rgb(0, 0, 0),
          });
        }
        continue;
      }

      if (isCheckboxWidget(widget) && isWidgetChecked(ctx, widget)) {
        drawCheckboxMark(page, rect);
      }
    }

    page.node.delete(PDFName.of('Annots'));
  }

  pdf.catalog.delete(PDFName.of('AcroForm'));
}

async function saveS21Pdf(pdf: PDFDocument): Promise<Uint8Array> {
  await flattenS21FormFieldsToPage(pdf);
  return pdf.save({ useObjectStreams: false });
}

let applyWidgetTextFn: ((widget: PDFDict, value: string) => void) | null = null;

function setWidgetText(widget: PDFDict, value: string) {
  if (applyWidgetTextFn) {
    applyWidgetTextFn(widget, value);
    return;
  }
  widget.set(PDFName.of('V'), encodePdfTextValue(value));
}

function setWidgetCheck(widget: PDFDict, checked: boolean) {
  const onName = PDFName.of('Yes');
  widget.set(PDFName.of('V'), checked ? onName : PDFName.of('Off'));
  widget.set(PDFName.of('AS'), checked ? onName : PDFName.of('Off'));
}

function formatDatePt(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Ano impresso nos formulários: ano civil em que o ano de serviço termina (ago). Ex.: set/2025→2026. */
function serviceYearPdfLabel(syStartYear: number): number {
  return syStartYear + 1;
}

function serviceYearsForExport(reference = new Date()): [number, number] {
  const start = serviceYearStart(reference);
  return [start.getFullYear(), start.getFullYear() - 1];
}

function reportsForPublisher(data: HourglassExport, publisherId: number): HourglassReport[] {
  return data.reports
    .filter((r) => r.user.id === publisherId)
    .sort((a, b) => compareMonthKeys(a.submitted_month!, b.submitted_month!));
}

function reportForMonth(reports: HourglassReport[], month: string): HourglassReport | undefined {
  return reports.find((r) => r.submitted_month === month);
}

function monthKeysForServiceYear(year: number): string[] {
  const keys: string[] = [];
  for (let m = 9; m <= 12; m += 1) keys.push(monthKey(year, m));
  for (let m = 1; m <= 8; m += 1) keys.push(monthKey(year + 1, m));
  return keys;
}

function fillS21MonthRow(
  widgets: WidgetMap,
  row: number,
  report: HourglassReport | undefined,
  pub: HourglassPublisher,
) {
  const participated = report ? isPublisherReported(report) : false;
  const studies = report?.studies ?? 0;
  const hours = report ? reportHoursForS21(report, pub) : 0;
  const aux = report ? isAuxiliaryPioneer(pub.status, report.pioneer) : false;
  const remarks = report?.remarks ?? '';

  const participatedWidget = widgets.get(`901_${row}_CheckBox`);
  if (participatedWidget) setWidgetCheck(participatedWidget, participated);

  const studiesWidget = widgets.get(`902_${row}_Text_C_SanSerif`);
  if (studiesWidget && studies > 0) setWidgetText(studiesWidget, String(studies));

  const auxWidget = widgets.get(`903_${row}_CheckBox`);
  if (auxWidget) setWidgetCheck(auxWidget, aux);

  const hoursWidget = widgets.get(`904_${row}_S21_Value`);
  if (hoursWidget && hours > 0) setWidgetText(hoursWidget, String(hours));

  const remarksWidget = widgets.get(`905_${row}_Text_SanSerif`);
  if (remarksWidget && remarks) setWidgetText(remarksWidget, remarks);
}

/**
 * Mapeamento dos checkboxes do cabeçalho S-21-T (coordenadas do modelo JW).
 *
 * y≈747: 900_3 Masculino, 900_4 Feminino
 * y≈730: 900_6 Outras ovelhas, 900_7 Ungido
 * y≈714: 900_8 Ancião, 900_9 Servo ministerial, 900_10 Pioneiro regular,
 *         900_11 Pioneiro especial, 900_12 Missionário em campo
 */
function fillS21Header(widgets: WidgetMap, pub: HourglassPublisher, displayName: string) {
  const nameWidget = widgets.get('900_1_Text_SanSerif');
  if (nameWidget) setWidgetText(nameWidget, displayName);

  const birthWidget = widgets.get('900_2_Text_SanSerif');
  if (birthWidget) setWidgetText(birthWidget, formatDatePt(pub.birth));

  const baptismWidget = widgets.get('900_5_Text_SanSerif');
  if (baptismWidget) setWidgetText(baptismWidget, formatDatePt(pub.baptism));

  const isMale = pub.sex?.toLowerCase() === 'male';
  const isAnointed = Boolean(pub.anointed);
  const headerChecks: Array<[string, boolean]> = [
    ['900_3_CheckBox', isMale],
    ['900_4_CheckBox', !isMale],
    ['900_6_CheckBox', !isAnointed],
    ['900_7_CheckBox', isAnointed],
    ['900_8_CheckBox', pub.appt === 'Elder'],
    ['900_9_CheckBox', pub.appt === 'MS'],
    ['900_10_CheckBox', pub.status === 'Regular Pioneer'],
    ['900_11_CheckBox', isSpecialPioneer(pub.status)],
    ['900_12_CheckBox', isFieldMissionary(pub.status)],
  ];

  for (const [field, checked] of headerChecks) {
    const widget = widgets.get(field);
    if (widget) setWidgetCheck(widget, checked);
  }
}

async function fillS21FromTemplate(
  templatePath: string,
  fill: (widgets: WidgetMap) => void,
): Promise<Uint8Array> {
  const bytes = await fs.readFile(templatePath);
  const pdf = await PDFDocument.load(bytes);
  const ctx = pdf.context;
  const page = pdf.getPage(0);
  const widgets = buildWidgetMap(pdf, page);
  applyWidgetTextFn = (widget, value) => applyWidgetText(ctx, widget, value);
  try {
    fill(widgets);
  } finally {
    applyWidgetTextFn = null;
  }
  return saveS21Pdf(pdf);
}

async function writeFilledS21(templatePath: string, outputPath: string, fill: (widgets: WidgetMap) => void) {
  const out = await fillS21FromTemplate(templatePath, fill);
  await fs.writeFile(outputPath, out);
}

async function writeFilledS21MultiPage(
  templatePath: string,
  outputPath: string,
  fills: Array<(widgets: WidgetMap) => void>,
) {
  const templateBytes = await fs.readFile(templatePath);
  const merged = await PDFDocument.create();

  for (const fill of fills) {
    const filledBytes = await fillS21FromTemplate(templatePath, fill);
    const flatPdf = await PDFDocument.load(filledBytes);
    const [copied] = await merged.copyPages(flatPdf, [0]);
    merged.addPage(copied);
  }

  await fs.writeFile(outputPath, await merged.save({ useObjectStreams: false }));
}

export async function writePublisherS21Pdf(params: {
  templatePath: string;
  outputPath: string;
  data: HourglassExport;
  publisher: HourglassPublisher;
}) {
  const { templatePath, outputPath, data, publisher } = params;
  const displayName = publisherDisplayName(publisher);
  const reports = reportsForPublisher(data, publisher.id);
  const [currentSy, previousSy] = serviceYearsForExport();

  await writeFilledS21MultiPage(
    templatePath,
    outputPath,
    [currentSy, previousSy].map((serviceYear) => (widgets) => {
      fillS21Header(widgets, publisher, displayName);

      const yearWidget = widgets.get('900_13_Text_C_SanSerif');
      if (yearWidget) setWidgetText(yearWidget, String(serviceYearPdfLabel(serviceYear)));

      for (const month of monthKeysForServiceYear(serviceYear)) {
        const { month: m } = parseMonthKey(month);
        fillS21MonthRow(
          widgets,
          SERVICE_MONTH_ROW[m]!,
          reportForMonth(reports, month),
          publisher,
        );
      }
    }),
  );
}

type TotalsKind = 'publishers' | 'regular' | 'auxiliary';

function filterReportsForTotals(
  data: HourglassExport,
  kind: TotalsKind,
): Map<string, { count: number; hours: number; studies: number }> {
  const byMonth = indexReportsByMonth(data.reports);
  const result = new Map<string, { count: number; hours: number; studies: number }>();

  for (const [month, list] of byMonth.entries()) {
    let count = 0;
    let hours = 0;
    let studies = 0;
    for (const report of list) {
      const pub = data.publishers.find((p) => p.id === report.user.id);
      const match =
        kind === 'regular'
          ? isRegularPioneer(pub?.status, report.pioneer)
          : kind === 'auxiliary'
            ? isAuxiliaryPioneer(pub?.status, report.pioneer)
            : !isRegularPioneer(pub?.status, report.pioneer) &&
              !isAuxiliaryPioneer(pub?.status, report.pioneer) &&
              isPublisherReported(report);

      if (!match) continue;
      count += 1;
      studies += report.studies ?? 0;
      if (kind !== 'publishers') {
        hours += reportHoursForS21(report, pub);
      }
    }
    if (count > 0 || hours > 0 || studies > 0) {
      result.set(month, { count, hours, studies });
    }
  }
  return result;
}

function aggregateLabel(kind: TotalsKind): string {
  if (kind === 'regular') return 'Pioneiros Regulares e Especiais e Missionários em Campo';
  if (kind === 'auxiliary') return 'Pioneiros Auxiliares';
  return 'Publicadores';
}

export async function writeTotalsS21Pdf(params: {
  templatePath: string;
  outputPath: string;
  data: HourglassExport;
  kind: TotalsKind;
  serviceYears: number[];
}) {
  const label = aggregateLabel(params.kind);

  await writeFilledS21MultiPage(
    params.templatePath,
    params.outputPath,
    params.serviceYears.map((serviceYear) => (widgets) => {
      const totals = filterReportsForTotals(params.data, params.kind);
      const nameWidget = widgets.get('900_1_Text_SanSerif');
      if (nameWidget) setWidgetText(nameWidget, label);
      const yearWidget = widgets.get('900_13_Text_C_SanSerif');
      if (yearWidget) setWidgetText(yearWidget, String(serviceYearPdfLabel(serviceYear)));

      let totalHours = 0;

      for (const month of monthKeysForServiceYear(serviceYear)) {
        const { month: m } = parseMonthKey(month);
        const row = SERVICE_MONTH_ROW[m]!;
        const agg = totals.get(month);
        if (!agg) continue;

        const participatedWidget = widgets.get(`901_${row}_CheckBox`);
        if (participatedWidget) setWidgetCheck(participatedWidget, false);

        if (params.kind === 'auxiliary') {
          const auxWidget = widgets.get(`903_${row}_CheckBox`);
          if (auxWidget) setWidgetCheck(auxWidget, agg.count > 0);
        }

        const studiesWidget = widgets.get(`902_${row}_Text_C_SanSerif`);
        if (studiesWidget && agg.studies > 0) {
          setWidgetText(studiesWidget, String(agg.studies));
        }

        const remarksWidget = widgets.get(`905_${row}_Text_SanSerif`);
        if (remarksWidget) {
          setWidgetText(remarksWidget, `#${agg.count}`);
        }

        const hoursWidget = widgets.get(`904_${row}_S21_Value`);
        if (hoursWidget && agg.hours > 0) setWidgetText(hoursWidget, String(agg.hours));

        totalHours += agg.hours;
      }

      const totalHoursWidget = widgets.get('904_32_S21_Value');
      if (totalHoursWidget && totalHours > 0) setWidgetText(totalHoursWidget, String(totalHours));
    }),
  );
}

function s88BlockFor(year: number, currentSy: number, meeting: 'mw' | 'we'): number {
  const isCurrent = year === currentSy;
  if (meeting === 'mw') return isCurrent ? 1 : 2;
  return isCurrent ? 3 : 4;
}

function s88MonthIndex(calendarMonth: number): number {
  if (calendarMonth === 9) return 1;
  if (calendarMonth === 10) return 2;
  if (calendarMonth === 11) return 3;
  if (calendarMonth === 12) return 4;
  return calendarMonth + 4;
}

function monthInServiceYear(monthKeyStr: string, sy: number): boolean {
  const y = Number(monthKeyStr.slice(0, 4));
  const m = Number(monthKeyStr.slice(5));
  return (y === sy && m >= 9) || (y === sy + 1 && m <= 8);
}

export async function writeS88Pdf(params: {
  templatePath: string;
  outputPath: string;
  data: HourglassExport;
  period?: VisitPeriodOptions;
}) {
  const bytes = await fs.readFile(params.templatePath);
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const reference = params.period
    ? referenceDateFromVisit(params.data, params.period)
    : new Date();
  const [currentSy, previousSy] = serviceYearsForExport(reference);

  for (const sy of [currentSy, previousSy]) {
    for (const meeting of ['mw', 'we'] as const) {
      const block = s88BlockFor(sy, currentSy, meeting);
      setText(form, `Service Year_${block}`, String(serviceYearPdfLabel(sy)));

      const rows = params.data.attendance.filter(
        (row) => row.month && monthInServiceYear(row.month, sy),
      );

      let totalMeetings = 0;
      let totalAttendance = 0;

      for (const row of rows) {
        const monthNum = Number(row.month.slice(5));
        const idx = s88MonthIndex(monthNum);
        const count = meeting === 'mw' ? row.mwCount ?? 0 : row.weCount ?? 0;
        const total = meeting === 'mw' ? row.mwTotal ?? 0 : row.weTotal ?? 0;
        const avg = meeting === 'mw' ? row.mwAvg ?? 0 : row.weAvg ?? 0;

        if (count > 0) {
          setText(form, `${block}-Meeting_${idx}`, String(count));
          setText(form, `${block}-Attendance_${idx}`, String(total));
          setText(form, `${block}-Average_${idx}`, String(avg));
          totalMeetings += count;
          totalAttendance += total;
        }
      }

      if (totalMeetings > 0) {
        const avgTotal = Math.round(totalAttendance / totalMeetings);
        setText(form, `${block}-Average_Total`, String(avgTotal));
      }
    }
  }

  form.updateFieldAppearances();
  await fs.writeFile(params.outputPath, await pdf.save({ useObjectStreams: false }));
}

function setText(form: ReturnType<PDFDocument['getForm']>, name: string, value: string) {
  try {
    form.getTextField(name).setText(value);
  } catch {
    // campo ausente no modelo
  }
}

export function bundledFormTemplatePath(fileName: string, appRoot: string): string {
  return `${appRoot}/assets/forms/${fileName}`;
}
