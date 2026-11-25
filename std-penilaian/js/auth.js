// auth.js — Manajemen sesi & peran di sisi klien.
// Token disimpan di localStorage (seminimal mungkin); info sesi di sessionStorage.
import { panggil } from './api.js';

const KUNCI_TOKEN = 'enilai_token';
const KUNCI_SESI = 'enilai_sesi';

// Hirarki peran (harus sama dengan server).
const HIRARKI = {
  admin: ['admin', 'standar_penilaian', 'guru', 'kepsek'],
  standar_penilaian: ['standar_penilaian', 'guru', 'kepsek'],
  guru: ['guru'],
  kepsek: ['kepsek']
};

export function hakEfektif(peranList) {
  const set = new Set();
  (peranList || []).forEach(p => (HIRARKI[p] || []).forEach(r => set.add(r)));
  return [...set];
}

export function boleh(peranList, diperlukan) {
  return hakEfektif(peranList).includes(diperlukan);
}

export function getToken() { return localStorage.getItem(KUNCI_TOKEN); }

export function getSesiCache() {
  const raw = sessionStorage.getItem(KUNCI_SESI);
  return raw ? JSON.parse(raw) : null;
}

function simpanSesi(token, sesi) {
  localStorage.setItem(KUNCI_TOKEN, token);
  sessionStorage.setItem(KUNCI_SESI, JSON.stringify(sesi));
}

export function bersihkanSesi() {
  localStorage.removeItem(KUNCI_TOKEN);
  sessionStorage.removeItem(KUNCI_SESI);
}

export async function login(username, password) {
  const data = await panggil('login', { username, password });
  simpanSesi(data.token, {
    username: data.username,
    nama_lengkap: data.nama_lengkap,
    peran: data.peran,
    wajib_ganti_password: data.wajib_ganti_password
  });
  return data;
}

export async function logout() {
  try { await panggil('logout', {}, getToken()); } catch (e) { /* abaikan */ }
  bersihkanSesi();
}

export async function infoSesi() {
  const data = await panggil('info_sesi', {}, getToken());
  sessionStorage.setItem(KUNCI_SESI, JSON.stringify(data));
  return data;
}

export async function gantiPassword(lama, baru) {
  return panggil('ganti_password', { password_lama: lama, password_baru: baru }, getToken());
}
