/**
 * Browser-side file readers: PDF → text (pdf.js) and Excel → CSV (SheetJS).
 * Both libraries load only when needed, so normal pages stay light.
 */
import { pdfToText } from '@shared/pdfText.js';

export async function readPdfText(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return pdfToText(doc);
}

/** First sheet of an .xlsx / .xls file as CSV text (same format as the CSV uploads). */
export async function readExcelAsCsv(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(ws, { blankrows: false, dateNF: 'yyyy-mm-dd' });
}

/** Read any price / data sheet: .csv as text, .xlsx/.xls converted to CSV. */
export async function readSheet(file) {
  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) return readExcelAsCsv(file);
  return file.text();
}

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ''));
  r.onerror = reject; r.readAsDataURL(file);
});
