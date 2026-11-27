// log.js — Halaman Log Aktivitas (Tahap 6A).
//
// Penampil log aktivitas pengguna (waktu, id_pengguna, aksi, rincian) dengan
// filter (q, aksi, rentang tanggal, id_kegiatan), paginasi, dan ekspor Excel.
//
// Hak akses: admin & standar_penilaian (boleh(peran,'standar_penilaian')).
//
// Pustaka: SheetJS (import langsung, versi dipatok 0.18.5). Token dari
// localStorage.getItem('enilai_token'). escape() untuk semua data dinamis;
// renderIkon() dipanggil setelah setiap innerHTML.
import { renderIkon, escape, spin, pesanGalat, toast } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { renderTabel, renderPaginasi, pasangModalTutupGlobal } from '../komponen.js';
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';

// Pasang listener global tombol [data-modal-tutup] sekali saat modul dimuat
// (tidak ada modal di sini, tapi aman dipanggil).
pasangModalTutupGlobal();

// =========================== STATE ===========================

const state = {
  sesi: null,
  token: null,
  // Filter.
  filter: { q: '', aksi: '', dari: '', sampai: '', id_kegiatan: '' },
  // Hasil.
  log: [],
  total: 0,
  halaman: 1,
  perHalaman: 50,
  // Sedang memuat?
  memuat: false
};

// =========================== UTIL ===========================

/** Format timestamp ISO "yyyy-MM-dd HH:mm:ss" → "dd/MM/yyyy HH:mm:ss". */
function formatWaktu(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return String(iso);
  let out = `${m[3]}/${m[2]}/${m[1]}`;
  if (m[4]) out += ` ${m[4]}:${m[5]}${m[6] ? ':' + m[6] : ''}`;
  return out;
}

/** Potong teks panjang untuk tampilan tabel (judul tooltip tetap penuh). */
function ringkas(teks, maks) {
  const s = String(teks ?? '');
  if (s.length <= (maks || 80)) return s;
  return s.slice(0, (maks || 80)) + '…';
}

/** Susun parameter filter + pagination untuk dikirim ke server. */
function paramLog(halaman, perHalaman) {
  return {
    q: state.filter.q,
    aksi: state.filter.aksi,
    dari: state.filter.dari,
    sampai: state.filter.sampai,
    id_kegiatan: state.filter.id_kegiatan,
    halaman: halaman || state.halaman,
    per_halaman: perHalaman || state.perHalaman
  };
}

// =========================== ENTRY ===========================

export async function renderLog(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.halaman = 1;
  state.log = [];
  state.total = 0;

  document.getElementById('topbar-judul').textContent = 'Log Aktivitas';
  const main = document.getElementById('main');

  // Akses: admin & standar_penilaian.
  if (!boleh(sesi.peran, 'standar_penilaian')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini khusus admin atau standar penilaian.</p></div>`;
    renderIkon();
    return;
  }

  renderKerangka();
  pasangListener();
  renderIkon();
  // Muat halaman pertama.
  await muatLog(1);
}

// =========================== KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Log Aktivitas</h1>
    <p class="petunjuk" style="margin:0 0 1rem">
      Catatan aktivitas pengguna: waktu, pelaku, aksi, dan rincian.
      Gunakan filter untuk mempersempit hasil.
    </p>
    <div class="toolbar" style="align-items:flex-end">
      <div class="tumbal" style="min-width:200px">
        <label class="label" for="log-q">Cari</label>
        <input class="input" id="log-q" type="search" value="${escape(state.filter.q)}"
          placeholder="kata kunci (waktu/pengguna/aksi/rincian)..." />
      </div>
      <div class="tumbal" style="min-width:160px">
        <label class="label" for="log-aksi">Aksi</label>
        <input class="input" id="log-aksi" type="text" value="${escape(state.filter.aksi)}"
          placeholder="mis. login, nilai_simpan..." />
      </div>
      <div class="tumbal" style="min-width:140px">
        <label class="label" for="log-dari">Dari</label>
        <input class="input" id="log-dari" type="date" value="${escape(state.filter.dari)}" />
      </div>
      <div class="tumbal" style="min-width:140px">
        <label class="label" for="log-sampai">Sampai</label>
        <input class="input" id="log-sampai" type="date" value="${escape(state.filter.sampai)}" />
      </div>
      <div class="tumbal" style="min-width:160px">
        <label class="label" for="log-idkeg">ID Kegiatan</label>
        <input class="input" id="log-idkeg" type="text" value="${escape(state.filter.id_kegiatan)}"
          placeholder="mis. KG-2024-001" />
      </div>
      <div class="kelompok-aksi">
        <button class="btn" id="log-cari"><i data-lucide="search"></i> Cari</button>
        <button class="btn btn-sekunder" id="log-reset"><i data-lucide="rotate-ccw"></i> Reset</button>
        <button class="btn btn-sekunder" id="log-ekspor"><i data-lucide="file-spreadsheet"></i> Ekspor Excel</button>
      </div>
    </div>
    <div id="log-ringkas" style="margin:.5rem 0; font-size:.82rem; color:var(--teks-ringan)"></div>
    <div id="log-tabel"></div>
    <div id="log-paginasi"></div>
    <div id="log-ekspor-status"></div>
  `;
}

// =========================== MUAT LOG ===========================

async function muatLog(halaman) {
  state.halaman = halaman || 1;
  const wadah = document.getElementById('log-tabel');
  const pag = document.getElementById('log-paginasi');
  if (wadah) wadah.innerHTML = spin('Memuat log...');
  if (pag) pag.innerHTML = '';
  state.memuat = true;
  try {
    const d = await panggil('log_daftar', paramLog(state.halaman, state.perHalaman), state.token);
    state.log = d.log || [];
    state.total = d.total || 0;
    state.halaman = d.halaman || state.halaman;
    state.perHalaman = d.per_halaman || state.perHalaman;
    renderTabelLog();
    renderRingkas();
  } catch (err) {
    if (wadah) wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    toast(pesanGalat(err), 'err');
  } finally {
    state.memuat = false;
  }
}

function renderRingkas() {
  const wadah = document.getElementById('log-ringkas');
  if (!wadah) return;
  const mulai = (state.halaman - 1) * state.perHalaman + 1;
  const akhir = Math.min(state.halaman * state.perHalaman, state.total);
  if (!state.total) {
    wadah.textContent = 'Tidak ada log yang cocok dengan filter.';
    return;
  }
  wadah.innerHTML = `Menampilkan <strong>${escape(mulai)}–${escape(akhir)}</strong> dari
    <strong>${escape(state.total)}</strong> log · halaman ${escape(state.halaman)}`;
}

function renderTabelLog() {
  const wadah = document.getElementById('log-tabel');
  const pag = document.getElementById('log-paginasi');
  if (!wadah) return;
  const kolom = [
    { k: 'waktu', judul: 'Waktu', kelas: 'th-no', render: (v) => `<span style="white-space:nowrap">${escape(formatWaktu(v))}</span>` },
    { k: 'id_pengguna', judul: 'Pengguna', render: (v) => `<code style="font-family:ui-monospace,monospace">${escape(v || '-')}</code>` },
    { k: 'aksi', judul: 'Aksi', render: (v) => `<span class="chip chip-info">${escape(v || '-')}</span>` },
    { k: 'rincian', judul: 'Rincian', render: (v) => {
        const s = String(v ?? '');
        if (!s) return '<span style="color:var(--teks-ringan)">—</span>';
        return `<span title="${escape(s)}">${escape(ringkas(s, 120))}</span>`;
      }
    }
  ];
  wadah.innerHTML = renderTabel(kolom, state.log, {
    kosongPesan: 'Tidak ada log yang cocok dengan filter saat ini.',
    padat: true
  });
  if (pag) pag.innerHTML = renderPaginasi(state.total, state.halaman, state.perHalaman);
  renderIkon();
}

// =========================== EKSPOR EXCEL ===========================

async function eksporExcel() {
  const status = document.getElementById('log-ekspor-status');
  if (status) status.innerHTML = spin('Mengambil log untuk ekspor...');
  renderIkon();
  const btn = document.getElementById('log-ekspor');
  if (btn) btn.disabled = true;
  try {
    // Ambil semua baris yang cocok filter (per_halaman besar).
    const perHalamanBesar = 100000;
    const d = await panggil('log_daftar', paramLog(1, perHalamanBesar), state.token);
    const log = d.log || [];
    if (!log.length) {
      toast('Tidak ada log untuk diekspor (filter kosong).', 'warn');
      if (status) status.innerHTML = '';
      return;
    }
    // Bangun workbook: satu sheet "Log" dengan header + baris.
    const header = ['Waktu', 'Pengguna', 'Aksi', 'Rincian'];
    const aoa = [header].concat(log.map(r => [
      formatWaktu(r.waktu), r.id_pengguna || '', r.aksi || '', r.rincian || ''
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Lebar kolom ringkas.
    ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Log');
    const tgl = new Date().toISOString().slice(0, 10);
    const namaFile = `log_e-nilai_${tgl}.xlsx`;
    XLSX.writeFile(wb, namaFile);
    if (status) status.innerHTML = `<div class="banner banner-ok"><i data-lucide="check-circle"></i>
      <span>${escape(String(log.length))} baris diekspor ke <strong>${escape(namaFile)}</strong>.</span></div>`;
    renderIkon();
    toast('Log diekspor ke Excel.', 'ok');
  } catch (err) {
    if (status) status.innerHTML = `<div class="kosong" style="padding:.8rem"><i data-lucide="alert-triangle"></i>
      <p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =========================== LISTENER ===========================

function pasangListener() {
  const bacaFilter = () => {
    state.filter.q = String(document.getElementById('log-q')?.value || '').trim();
    state.filter.aksi = String(document.getElementById('log-aksi')?.value || '').trim();
    state.filter.dari = String(document.getElementById('log-dari')?.value || '').trim();
    state.filter.sampai = String(document.getElementById('log-sampai')?.value || '').trim();
    state.filter.id_kegiatan = String(document.getElementById('log-idkeg')?.value || '').trim();
  };

  document.getElementById('log-cari')?.addEventListener('click', async () => {
    bacaFilter();
    await muatLog(1);
  });

  // Enter pada input filter → cari.
  ['log-q', 'log-aksi', 'log-dari', 'log-sampai', 'log-idkeg'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        bacaFilter();
        await muatLog(1);
      }
    });
  });

  document.getElementById('log-reset')?.addEventListener('click', async () => {
    state.filter = { q: '', aksi: '', dari: '', sampai: '', id_kegiatan: '' };
    if (document.getElementById('log-q')) document.getElementById('log-q').value = '';
    if (document.getElementById('log-aksi')) document.getElementById('log-aksi').value = '';
    if (document.getElementById('log-dari')) document.getElementById('log-dari').value = '';
    if (document.getElementById('log-sampai')) document.getElementById('log-sampai').value = '';
    if (document.getElementById('log-idkeg')) document.getElementById('log-idkeg').value = '';
    await muatLog(1);
  });

  document.getElementById('log-ekspor')?.addEventListener('click', eksporExcel);

  // Paginasi (delegasi).
  document.getElementById('log-paginasi')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-halaman]');
    if (!btn) return;
    const no = Number(btn.dataset.halaman);
    if (!no || no === state.halaman || state.memuat) return;
    await muatLog(no);
  });
}
