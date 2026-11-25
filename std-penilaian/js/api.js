// api.js — Pembungkus fetch ke web app Apps Script.
// Permintaan: POST text/plain (tanpa preflight CORS), body JSON { aksi, token, data }.
import { CONFIG } from '../config.js';

export class GalatApi extends Error {
  constructor(kode, pesan, waktuMs) {
    super(pesan);
    this.kode = kode;
    this.waktuMs = waktuMs;
  }
}

/** Kirim aksi ke server. Mengembalikan data jika ok, atau melempar GalatApi. */
export async function panggil(aksi, data = {}, token = null) {
  if (!CONFIG.URL_WEB_APP || CONFIG.URL_WEB_APP === 'PASTE_URL_DI_SINI') {
    throw new GalatApi('KONFIGURASI', 'URL web app belum diisi di config.js.');
  }
  const body = JSON.stringify({ aksi, token, data });
  let res, teks;
  try {
    res = await fetch(CONFIG.URL_WEB_APP, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow'
    });
    teks = await res.text();
  } catch (err) {
    throw new GalatApi('JARINGAN',
      'Gagal menghubungi server. Periksa koneksi atau pengaturan deploy web app ("Siapa saja").');
  }
  let obj;
  try { obj = JSON.parse(teks); }
  catch (e) { throw new GalatApi('SERVER', 'Respons server bukan JSON: ' + teks.slice(0, 160)); }
  if (obj.ok) return obj.data;
  throw new GalatApi(obj.error?.kode || 'SERVER', obj.error?.pesan || 'Galat tidak diketahui.', obj.error?.waktu_ms);
}

/** Versi GET untuk ping/debug. */
export async function pingGet() {
  const res = await fetch(CONFIG.URL_WEB_APP, { method: 'GET', redirect: 'follow' });
  return await res.text();
}
