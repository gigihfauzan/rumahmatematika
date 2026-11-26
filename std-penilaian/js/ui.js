// ui.js — Komponen UI kecil: render elemen dari string, ikon, toast, escape.
// Lucide: import createIcons + icons, lalu panggil createIcons({ icons }) agar
// semua ikon terdaftar (createIcons() tanpa argumen sering tidak merender di bundle +esm).
import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@0.460.0/+esm';

/** Buat elemen DOM dari string HTML. */
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

/** Pasang ulang ikon Lucide pada elemen yang baru dirender. */
export function renderIkon() {
  try { createIcons({ icons }); } catch (e) { /* ikon non-fatal */ }
}

/** Escape teks agar aman dimasukkan ke HTML. */
export function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Toast singkat. tipe: info|ok|err|warn. */
export function toast(pesan, tipe = 'info') {
  let wadah = document.getElementById('toast-wadah');
  if (!wadah) {
    wadah = el('<div id="toast-wadah" class="toast-wadah" aria-live="polite"></div>');
    document.body.appendChild(wadah);
  }
  const t = el(`<div class="toast toast-${tipe}" role="status">${escape(pesan)}</div>`);
  wadah.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3800);
}

/** HTML spinner. */
export function spin(teks = 'Memuat...') {
  return `<div class="spin"><div class="spin-dot"></div><span>${escape(teks)}</span></div>`;
}

/** Tampilkan pesan galat yang ramah berdasarkan kode. */
export function pesanGalat(err) {
  if (!err) return 'Galat tidak diketahui.';
  if (err.kode === 'SESI') return 'Sesi berakhir. Silakan login lagi.';
  if (err.kode === 'AKSES_DITOLAK') return 'Anda tidak berhak melakukan aksi ini.';
  if (err.kode === 'KREDENSIAL') return 'NIP/Username atau password salah.';
  if (err.kode === 'THROTTLE') return err.pesan || 'Terlalu banyak percobaan. Coba lagi nanti.';
  if (err.kode === 'VERSI_USANG') return 'Isian usang: ' + (err.pesan || 'muat ulang tabel.');
  if (err.kode === 'JARINGAN') return 'Gagal menghubungi server. Periksa koneksi atau deploy web app.';
  if (err.kode === 'KONFIGURASI') return err.pesan || 'Konfigurasi bermasalah.';
  if (err.kode === 'VALIDASI') return err.pesan || 'Data tidak valid.';
  if (err.kode === 'AKSI') return err.pesan || 'Aksi tidak dikenal.';
  if (err.kode === 'JSON') return 'Permintaan bukan JSON valid.';
  return err.pesan || err.message || 'Galat tidak diketahui.';
}
