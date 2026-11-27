// panduan.js — Halaman Panduan Pengguna (Tahap 6B).
// Menampilkan panduan kontekstual sesuai peran utama pengguna:
//   admin → PANDUAN admin
//   standar_penilaian → PANDUAN spn
//   kepsek → PANDUAN kepsek
//   guru (murni, bukan spn/kepsek/admin) → gabungan guru + wali
//     (seorang guru dapat juga merangkap wali kelas; kedua panduan relevan)
//
// Isi tiap panduan: judul, langkah bernomor (<ol>), FAQ (<details>), dan
// kontak sekolah dari pengaturan_ambil.
//
// Konvensi: import relatif '../panduan/*.js' & '../api.js'; token localStorage;
// escape() untuk data dinamis; renderIkon() setelah innerHTML; komentar Indonesia.
import { renderIkon, escape, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { PANDUAN as P_ADMIN } from '../panduan/admin.js';
import { PANDUAN as P_SPN } from '../panduan/spn.js';
import { PANDUAN as P_GURU } from '../panduan/guru.js';
import { PANDUAN as P_WALI } from '../panduan/wali.js';
import { PANDUAN as P_KEPSEK } from '../panduan/kepsek.js';

// =========================== UTIL ===========================

/**
 * Pilih daftar panduan yang relevan untuk sesi.
 * Mengembalikan array objek PANDUAN (boleh lebih dari satu saat multi-peran).
 */
function pilihPanduan(peran) {
  // Urutkan dari peran paling tinggi/spesifik.
  if (boleh(peran, 'admin')) return [P_ADMIN];
  if (boleh(peran, 'standar_penilaian')) return [P_SPN];
  if (boleh(peran, 'kepsek')) return [P_KEPSEK];
  if (boleh(peran, 'guru')) {
    // Guru murni: panduan guru + wali (seorang guru dapat juga wali kelas).
    return [P_GURU, P_WALI];
  }
  // Tidak dikenali → kosong (akan ditampilkan pesan).
  return [];
}

/** Render satu panduan menjadi blok HTML (judul + ol langkah + details FAQ). */
function renderBlokPanduan(p, idPrefix) {
  const idLangkah = `${idPrefix}-langkah`;
  const langkah = (p.langkah || []).map(l => `<li>${escape(l)}</li>`).join('');
  const faq = (p.faq || []).map((f, i) => `
    <details class="kelompok-impor" ${i === 0 ? 'open' : ''}>
      <summary>${escape(f.q)}</summary>
      <div style="padding:.6rem .85rem .85rem; font-size:.9rem; color:var(--teks)">${escape(f.a)}</div>
    </details>`).join('');
  return `<section class="kartu" style="margin-bottom:1rem">
    <h2 style="margin:0 0 .65rem; font-size:1.15rem">${escape(p.judul || 'Panduan')}</h2>
    <h3 style="font-size:.78rem; text-transform:uppercase; letter-spacing:.05em; color:var(--teks-ringan); margin:0 0 .4rem">Langkah</h3>
    <ol id="${escape(idLangkah)}" style="margin:0 0 1.25rem; padding-left:1.4rem; line-height:1.55; font-size:.92rem">${langkah || '<li>(belum ada langkah)</li>'}</ol>
    <h3 style="font-size:.78rem; text-transform:uppercase; letter-spacing:.05em; color:var(--teks-ringan); margin:0 0 .4rem">FAQ</h3>
    <div style="display:flex; flex-direction:column; gap:.5rem">${faq || '<p class="petunjuk">(belum ada FAQ)</p>'}</div>
  </section>`;
}

/** Render blok kontak sekolah dari pengaturan. */
function renderKontak(pengaturan) {
  if (!pengaturan) return '';
  const baris = [];
  if (pengaturan.nama_sekolah) baris.push(['Sekolah', pengaturan.nama_sekolah]);
  if (pengaturan.nama_dinas) baris.push(['Dinas', pengaturan.nama_dinas]);
  if (pengaturan.alamat) baris.push(['Alamat', pengaturan.alamat]);
  if (pengaturan.kontak) baris.push(['Kontak', pengaturan.kontak]);
  if (pengaturan.kepsek_nama) baris.push(['Kepala Sekolah', pengaturan.kepsek_nama + (pengaturan.kepsek_nip ? ' · NIP ' + pengaturan.kepsek_nip : '')]);
  if (!baris.length) return '';
  const isi = baris.map(([k, v]) => `<div class="field" style="margin:0">
    <div class="label">${escape(k)}</div>
    <div>${escape(v)}</div>
  </div>`).join('');
  return `<section class="kartu" style="margin-bottom:1rem">
    <h2 style="margin:0 0 .65rem; font-size:1.05rem">Kontak Sekolah</h2>
    <div class="field-row">${isi}</div>
    <div class="petunjuk" style="margin-top:.5rem">Data diatur oleh admin pada menu Pengaturan.</div>
  </section>`;
}

// =========================== ENTRY ===========================

export async function renderPanduan(sesi) {
  document.getElementById('topbar-judul').textContent = 'Panduan';
  const main = document.getElementById('main');

  // Semua peran yang dikenal boleh melihat panduan; jika peran tidak dikenali,
  // tampilkan pesan ramah.
  const panduanList = pilihPanduan(sesi.peran);
  if (!panduanList.length) {
    main.innerHTML = `<div class="kosong"><i data-lucide="help-circle"></i>
      <h3>Belum ada panduan</h3>
      <p>Akun Anda belum memiliki panduan khusus. Hubungi admin untuk informasi penggunaan sistem.</p></div>`;
    renderIkon();
    return;
  }

  // Render kerangka lebih dulu; kontak dimuat asynchronous.
  main.innerHTML = `
    <h1 class="page-judul">Panduan</h1>
    <p class="petunjuk" style="margin:0 0 1rem">
      Ikuti langkah berikut sesuai peran Anda. Perluas tiap pertanyaan pada FAQ untuk membaca jawaban.
    </p>
    <div id="panduan-kontak">${spin('Memuat kontak sekolah...')}</div>
    <div id="panduan-isi"></div>
  `;
  renderIkon();

  // Tampilkan blok panduan.
  const wadahIsi = document.getElementById('panduan-isi');
  if (wadahIsi) {
    wadahIsi.innerHTML = panduanList.map((p, i) => renderBlokPanduan(p, 'panduan-' + i)).join('');
  }
  renderIkon();

  // Muat kontak dari pengaturan_ambil (best-effort: gagal →sembunyikan blok).
  const wadahKontak = document.getElementById('panduan-kontak');
  if (wadahKontak) {
    try {
      const pengaturan = await panggil('pengaturan_ambil', {}, localStorage.getItem('enilai_token'));
      const html = renderKontak(pengaturan);
      wadahKontak.innerHTML = html || '<!-- kontak kosong: data pengaturan belum diisi -->';
    } catch (err) {
      // Kontak opsional; jika gagal (mis. sesi berakhir), tampilkan pesan singkat.
      wadahKontak.innerHTML = `<div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
        <span>Kontak sekolah tidak dapat dimuat: ${escape(pesanGalat(err))}</span></div>`;
    }
    renderIkon();
  }
}
