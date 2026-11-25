// app.js — Titik masuk aplikasi E-Nilai (Tahap 1).
import { initTema } from './tema.js';
import { getToken, bersihkanSesi, getSesiCache } from './auth.js';
import { renderLogin, renderShell, renderGantiPassword } from './halaman.js';
import { panggil } from './api.js';
import { jalan, setSesiAktif } from './router.js';

async function init() {
  initTema();
  const token = getToken();
  if (!token) { renderLogin(); return; }

  // Validasi token ke server.
  try {
    const sesi = await panggil('info_sesi', {}, token);
    if (sesi.wajib_ganti_password) { renderGantiPassword(true); return; }
    await renderShell(sesi);
    jalan();
  } catch (err) {
    if (err.kode === 'SESI') {
      bersihkanSesi();
      renderLogin('Sesi berakhir. Silakan login lagi.');
    } else if (err.kode === 'KONFIGURASI') {
      renderLogin(err.pesan);
    } else {
      // Galat non-fatal sesi: tetap coba tampilkan shell dari cache agar bisa logout.
      const cache = getSesiCache();
      if (cache) {
        try { await renderShell(cache); jalan(); return; } catch (e) {}
      }
      renderLogin('Tidak dapat memuat sesi. Silakan login lagi.');
    }
  }
}

init();
