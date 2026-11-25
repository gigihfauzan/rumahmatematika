// excel.js — Pustaka baca/tulis Excel via SheetJS (versi dipatok 0.18.5).
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';

/** Baca berkas Excel/CSV menjadi array objek (baris pertama = header). */
export async function bacaFileKeBaris(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
}

/** Unduh array objek sebagai berkas .xlsx. */
export function unduhExcel(namaFile, namaSheet, barisArrayOfObjects) {
  const ws = XLSX.utils.json_to_sheet(barisArrayOfObjects);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, namaSheet.slice(0, 31));
  XLSX.writeFile(wb, namaFile);
}

/** Unduh template: baris pertama = header (kolomContoh), baris berikut = contoh. */
export function unduhTemplate(namaFile, namaSheet, kolomContoh, barisContoh) {
  const aoa = [kolomContoh].concat(barisContoh || []);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, namaSheet.slice(0, 31));
  XLSX.writeFile(wb, namaFile);
}
