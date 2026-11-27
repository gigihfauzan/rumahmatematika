// sistem.js — Halaman Pemeriksaan Sistem (Tahap 6B).
// Menampilkan temuan kesehatan data, kapasitas tab, status backup/trigger/
// maintenance/versi, dan hasil uji mesin perhitungan.
//
// Hak akses: hanya admin.
//
// Kontrak aksi (Operasi.gs):
//   sistem_cek {} → {temuan:[{kode,ringan,jumlah,pesan,perbaikan}],
//                     backup_terakhir, trigger_aktif, maintenance, versi,
//                     kapasitas:[{tab,baris}], uji_mesin}
//
// Konvensi: import relatif '../api.js' dll; token localStorage.getItem('enilai_token');
// escape() untuk data dinamis; renderIkon() setelah innerHTML; komentar Indonesia.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { chip } from '../komponen.js';
import { navigasi } from '../router.js';

// =========================== STATE ===========================

const state = {
  sesi: null,
  token: null,
  hasil: null,            // hasil sistem_cek terakhir
  sedangUji: false        // flag tombol "Jalankan uji mesin"
};

/**
 * Peta kode temuan → tautan perbaikan (hash & label).
 * Label ditampilkan sebagai teks tautan; navigasi('#/hash') dipanggil saat klik.
 */
const KODE_LINK = {
  siswa_tanpa_kelas: { hash: '#/siswa', label: 'Buka Siswa' },
  kelas_tanpa_wali: { hash: '#/kelas', label: 'Buka Kelas' },
  nisn_ganda: { hash: '#/siswa', label: 'Buka Siswa' }
};

/** Default tautan jika kode temuan tidak dikenal. */
const LINK_DEFAULT = { hash: '#/beranda', label: 'Buka Beranda' };

// =========================== ENTRY ===========================

export async function renderSistem(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  document.getElementById('topbar-judul').textContent = 'Sistem';
  const main = document.getElementById('main');

  // Hak akses: hanya admin.
  if (!boleh(sesi.peran, 'admin')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i>
      <h3>Akses ditolak</h3>
      <p>Hanya admin yang dapat menjalankan pemeriksaan sistem.</p></div>`;
    renderIkon();
    return;
  }

  renderKerangka();
  pasangListenerKerangka();
  await muatDanRender();
  renderIkon();
}

// =========================== KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Pemeriksaan Sistem</h1>
    <p class="petunjuk" style="margin:0 0 1rem">
      Periksa kesehatan data, kapasitas tab, status backup/trigger, dan jalankan uji mesin perhitungan.
    </p>
    <div class="toolbar">
      <div class="kelompok-aksi" style="margin-left:auto">
        <button class="btn btn-kecil btn-sekunder" id="sistem-muat-ulang"><i data-lucide="refresh-cw"></i> Muat ulang</button>
        <button class="btn btn-kecil" id="sistem-uji-mesin"><i data-lucide="play"></i> Jalankan uji mesin</button>
      </div>
    </div>
    <div id="sistem-isi">${spin('Memeriksa sistem...')}</div>
  `;
}

function pasangListenerKerangka() {
  document.getElementById('sistem-muat-ulang')?.addEventListener('click', () => muatDanRender());
  document.getElementById('sistem-uji-mesin')?.addEventListener('click', () => jalankanUjiMesin());
}

// =========================== MUAT & RENDER ===========================

async function muatDanRender() {
  const wadah = document.getElementById('sistem-isi');
  if (!wadah) return;
  wadah.innerHTML = spin('Memeriksa sistem...');
  try {
    state.hasil = await panggil('sistem_cek', {}, state.token);
    renderIsi();
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memeriksa</h3><p>${escape(pesanGalat(err))}</p></div>`;
  }
  renderIkon();
}

function renderIsi() {
  const wadah = document.getElementById('sistem-isi');
  const h = state.hasil;
  if (!h) return;

  // Bagian: status (backup, trigger, maintenance, versi).
  const htmlStatus = renderStatus(h);

  // Bagian: temuan.
  const htmlTemuan = renderTemuan(h.temuan || []);

  // Bagian: kapasitas tab.
  const htmlKapasitas = renderKapasitas(h.kapasitas || []);

  // Bagian: hasil uji mesin.
  const htmlUji = renderUjiMesin(h.uji_mesin);

  wadah.innerHTML = `
    ${htmlStatus}
    ${htmlTemuan}
    ${htmlKapasitas}
    ${htmlUji}
  `;
  // Pasang listener tautan perbaikan (data-href).
  wadah.querySelectorAll('[data-href]').forEach(a => {
    a.addEventListener('click', () => navigasi(a.dataset.href));
  });
  renderIkon();
}

// =========================== STATUS ===========================

function renderStatus(h) {
  const backup = h.backup_terakhir || '-';
  const trigger = h.trigger_aktif
    ? chip('Aktif', 'ok')
    : chip('Tidak aktif', 'warn');
  const maintenance = h.maintenance
    ? chip('ON', 'err')
    : chip('OFF', 'ok');
  const versi = h.versi || '-';
  const baris = [
    { label: 'Backup terakhir', nilai: escape(backup), ikon: 'hard-drive' },
    { label: 'Trigger backup', nilai: trigger, ikon: 'zap' },
    { label: 'Mode pemeliharaan', nilai: maintenance, ikon: 'settings' },
    { label: 'Versi aplikasi', nilai: escape(versi), ikon: 'tag' }
  ];
  const isi = baris.map(b => `<div class="stat-kartu">
    <div class="stat-angka" style="font-size:.95rem; display:flex; align-items:center; gap:.4rem">
      <i data-lucide="${b.ikon}"></i> <span>${b.nilai}</span>
    </div>
    <div class="stat-label">${escape(b.label)}</div>
  </div>`).join('');
  return `<section class="kartu" style="margin-bottom:1rem">
    <h2 style="margin:0 0 .75rem; font-size:1.1rem">Status Sistem</h2>
    <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${isi}</div>
  </section>`;
}

// =========================== TEMUAN ===========================

function renderTemuan(temuan) {
  if (!temuan.length) {
    return `<section class="kartu" style="margin-bottom:1rem">
      <h2 style="margin:0 0 .65rem; font-size:1.1rem">Temuan</h2>
      <div class="banner banner-ok"><i data-lucide="check-circle-2"></i>
        <span>Tidak ada temuan. Semua data dalam kondisi sehat.</span></div>
    </section>`;
  }
  const daftar = temuan.map(t => {
    // ringan=true → kuning (warn); ringan=false → merah (err).
    const level = t.ringan ? chip('Ringan', 'warn') : chip('Berat', 'err');
    const link = KODE_LINK[t.kode] || LINK_DEFAULT;
    return `<div class="banner ${t.ringan ? 'banner-warn' : 'banner-info'}" style="${t.ringan ? '' : 'background:var(--err-bg); border-color:color-mix(in srgb, var(--err) 35%, transparent); color:var(--err)'}">
      <i data-lucide="${t.ringan ? 'alert-triangle' : 'circle-alert'}"></i>
      <div style="flex:1; min-width:0">
        <div style="display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; margin-bottom:.15rem">
          ${level}
          <strong>${escape(t.pesan || t.kode)}</strong>
        </div>
        <div class="petunjuk" style="margin:0; color:inherit; opacity:.85">
          ${escape(t.perbaikan || '')}${t.jumlah != null ? ' · jumlah: ' + escape(t.jumlah) : ''}
        </div>
        <div style="margin-top:.4rem">
          <a href="javascript:void(0)" data-href="${escape(link.hash)}"
             style="font-size:.82rem; font-weight:600">${escape(link.label)} <i data-lucide="external-link" style="width:13px;height:13px;vertical-align:middle"></i></a>
        </div>
      </div>
    </div>`;
  }).join('');
  return `<section class="kartu" style="margin-bottom:1rem">
    <h2 style="margin:0 0 .75rem; font-size:1.1rem">Temuan (${escape(temuan.length)})</h2>
    <div style="display:flex; flex-direction:column; gap:.5rem">${daftar}</div>
    <div class="petunjuk" style="margin-top:.6rem">Temuan "berat" (merah) perlu segera ditindaklanjuti; "ringan" (kuning) dapat ditunda tetapi tetap perlu diperbaiki.</div>
  </section>`;
}

// =========================== KAPASITAS TAB ===========================

function renderKapasitas(kapasitas) {
  if (!kapasitas.length) {
    return `<section class="kartu" style="margin-bottom:1rem">
      <h2 style="margin:0 0 .5rem; font-size:1.1rem">Kapasitas Tab</h2>
      <div class="kosong" style="padding:1.5rem 1rem"><i data-lucide="inbox"></i>
        <p>Belum ada tab dengan baris terisi.</p></div>
    </section>`;
  }
  // Urutkan descending berdasarkan jumlah baris.
  const arr = [...kapasitas].sort((a, b) => Number(b.baris) - Number(a.baris));
  const maks = Math.max(...arr.map(k => Number(k.baris) || 0), 1);
  const baris = arr.map(k => {
    const n = Number(k.baris) || 0;
    const persen = Math.max(2, Math.round((n / maks) * 100));
    return `<tr>
      <td><code>${escape(k.tab)}</code></td>
      <td class="angka">${escape(n)}</td>
      <td style="min-width:160px">
        <div class="mini-bar-grup">
          <div class="mini-bar"><div class="mini-bar-isi" style="width:${persen}%"></div></div>
        </div>
      </td>
    </tr>`;
  }).join('');
  return `<section class="kartu" style="margin-bottom:1rem">
    <h2 style="margin:0 0 .65rem; font-size:1.1rem">Kapasitas Tab</h2>
    <div class="tabel-bungkus" style="max-height:340px">
      <table class="tabel tabel-padat">
        <thead><tr><th>Tab</th><th class="angka">Baris</th><th>Relatif</th></tr></thead>
        <tbody>${baris}</tbody>
      </table>
    </div>
    <div class="petunjuk" style="margin-top:.5rem">Bar relatif membandingkan jumlah baris antar tab (yang terbanyak = 100%). Spreadsheet Apps Script standar menampung ±50.000–200.000 baris per tab.</div>
  </section>`;
}

// =========================== UJI MESIN ===========================

function renderUjiMesin(ujiMesin) {
  const teks = String(ujiMesin || '(uji mesin belum dijalankan)');
  // Jika teks diawali "Gagal:", tampilkan dengan gaya error.
  const gagal = teks.toLowerCase().startsWith('gagal');
  return `<section class="kartu" style="margin-bottom:1rem">
    <h2 style="margin:0 0 .65rem; font-size:1.1rem">Hasil Uji Mesin</h2>
    <div class="banner ${gagal ? 'banner-warn' : 'banner-ok'}"><i data-lucide="${gagal ? 'alert-triangle' : 'check-circle-2'}"></i>
      <span style="white-space:pre-wrap; word-break:break-word">${escape(teks)}</span>
    </div>
    <div class="petunjuk" style="margin-top:.5rem">Uji mesin memeriksa konsistensi fungsi perhitungan (rerata, peringkat, ketuntasan). Tekan tombol "Jalankan uji mesin" di atas untuk menjalankan ulang.</div>
  </section>`;
}

// =========================== JALANKAN UJI MESIN ===========================

/** Jalankan ulang sistem_cek (yang memanggil ujiMesinPerhitungan di server). */
async function jalankanUjiMesin() {
  if (state.sedangUji) return;
  state.sedangUji = true;
  const btn = document.getElementById('sistem-uji-mesin');
  if (btn) { btn.disabled = true; btn.innerHTML = `${spin('Menguji...')}`; }
  try {
    state.hasil = await panggil('sistem_cek', {}, state.token);
    renderIsi();
    toast('Uji mesin selesai.', 'ok');
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    state.sedangUji = false;
    if (btn) { btn.disabled = false; btn.innerHTML = `<i data-lucide="play"></i> Jalankan uji mesin`; }
    renderIkon();
  }
}
