// peserta.js — Halaman Peserta Kegiatan (Tahap 3A).
// Daftar peserta efektif sebuah kegiatan: ikut / susulan / tidak_terdaftar.
// Filter cari + kelas + status_efektif; ubah status per siswa (kirim hanya baris berubah).
// Hak: standar_penilaian & admin mengubah; guru & kepsek lihat.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import {
  renderTabel, renderPaginasi, chip, pasangModalTutupGlobal
} from '../komponen.js';
import { navigasi } from '../router.js';

// Catatan: halaman ini tidak menggunakan modal; pasangModalTutupGlobal tetap
// dipanggil agar konsisten dengan halaman lain dan aman bila halaman lain
// sebelumnya memasang modal (idempoten).
pasangModalTutupGlobal();

const PER_HALAMAN = 25;
const STATUS_EFEKTIF = ['ikut', 'susulan', 'tidak_terdaftar'];

// State halaman.
const state = {
  sesi: null,
  token: null,
  bisaUbah: false,
  idKeg: null,
  kegiatan: null,        // info kegiatan (dari kegiatan_daftar, opsional)
  peserta: [],           // hasil kegiatan_peserta_ambil
  bisa_ubah_server: false,
  filter: { q: '', id_kelas: '', status_efektif: '' },
  halaman: 1,
  perubahan: new Map(),  // id_siswa → status baru
  simpanBerjalan: false
};

// =========================== UTIL ===========================

/** ISO yyyy-MM-dd → dd/mm/yyyy. */
function formatTanggal(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** Debounce. */
function debung(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Chip status_efektif. */
function chipStatusEfektif(s) {
  if (s === 'ikut') return chip('Ikut', 'ok');
  if (s === 'susulan') return chip('Susulan', 'warn');
  if (s === 'tidak_terdaftar') return chip('Tidak Terdaftar', 'netral');
  return chip(s || '-', 'netral');
}

/** Badge sumber peserta (turunan/manual). */
function badgeSumber(s) {
  if (s === 'manual') return `<span class="chip chip-info">manual</span>`;
  return `<span class="chip chip-netral">turunan</span>`;
}

// =========================== ENTRY ===========================

export async function renderPesertaKegiatan(sesi, params) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.idKeg = params && params[0] ? decodeURIComponent(params[0]) : null;
  state.bisaUbah = boleh(sesi.peran, 'standar_penilaian');
  state.peserta = [];
  state.bisa_ubah_server = false;
  state.filter = { q: '', id_kelas: '', status_efektif: '' };
  state.halaman = 1;
  state.perubahan = new Map();
  state.kegiatan = null;

  document.getElementById('topbar-judul').textContent = 'Peserta Kegiatan';
  const main = document.getElementById('main');

  if (!state.idKeg) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>ID kegiatan tidak ditemukan</h3>
      <p>Buka melalui halaman <a href="#/kegiatan">Kegiatan</a>.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat peserta...');

  // Cari info kegiatan (nama) untuk ditampilkan di judul.
  // Tidak ada aksi "kegiatan_ambil satu"; kita manfaatkan kegiatan_daftar TA aktif.
  try {
    const d = await panggil('kegiatan_daftar', {}, state.token);
    state.kegiatan = (d.kegiatan || []).find(k => k.id_kegiatan === state.idKeg) || null;
  } catch (e) { /* non-fatal: judul pakai id */ }

  await muatPeserta();
}

// =========================== MUAT PESERTA ===========================

async function muatPeserta() {
  const main = document.getElementById('main');
  main.innerHTML = spin('Memuat peserta...');
  try {
    const d = await panggil('kegiatan_peserta_ambil', { id_kegiatan: state.idKeg }, state.token);
    state.peserta = d.peserta || [];
    state.bisa_ubah_server = !!d.bisa_ubah;
    // Hak ubah efektif: server bilang bisa_ubah DAN klien mengizinkan (spn/admin).
    state.bisaUbah = state.bisa_ubah_server && boleh(state.sesi.peran, 'standar_penilaian');
    // Reset perubahan lokal ketika data dimuat ulang dari server.
    state.perubahan = new Map();
    state.halaman = 1;
  } catch (err) {
    state.peserta = [];
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat peserta</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
    return;
  }
  renderKerangka();
  renderIsi();
  renderIkon();
  pasangListener();
}

// =========================== RENDER KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  // Daftar kelas unik dari peserta untuk filter.
  const kelasUnik = [];
  const seenKelas = new Set();
  state.peserta.forEach(p => {
    const key = p.id_kelas || ('_/' + (p.nama_kelas || ''));
    if (!seenKelas.has(key)) {
      seenKelas.add(key);
      kelasUnik.push({ id_kelas: p.id_kelas || '', nama_kelas: p.nama_kelas || '(tanpa kelas)' });
    }
  });
  kelasUnik.sort((a, b) => (a.nama_kelas < b.nama_kelas ? -1 : 1));

  const judulKeg = state.kegiatan
    ? `${escape(state.kegiatan.nama)} — ${chipStatusKegiatan(state.kegiatan.status)}`
    : `<code>${escape(state.idKeg)}</code>`;

  const tombolSimpan = state.bisaUbah
    ? `<button class="btn btn-kecil" id="btn-simpan" disabled><i data-lucide="save"></i> Simpan Perubahan</button>`
    : '';

  main.innerHTML = `
    <h1 class="page-judul">Peserta Kegiatan</h1>
    <div class="kartu" style="margin-bottom:1rem">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap">
        <div>
          <div style="font-size:.78rem; color:var(--teks-ringan)">Kegiatan</div>
          <div style="font-size:1.05rem; font-weight:600">${judulKeg}</div>
          ${state.kegiatan ? `<div style="font-size:.82rem; color:var(--teks-ringan); margin-top:.2rem">
              ${chip(state.kegiatan.jenis || '-', 'info')}
              ${chip('Semester ' + (state.kegiatan.semester || '-'), 'netral')}
              ${(state.kegiatan.tingkat_peserta || []).map(t => chip('Tingkat ' + t, 'netral')).join(' ')}
              <span style="margin-left:.4rem">Jadwal: ${escape(formatTanggal(state.kegiatan.tanggal_buka))} – ${escape(formatTanggal(state.kegiatan.tanggal_tutup))}</span>
            </div>` : ''}
        </div>
        <div class="kelompok-aksi">
          <button class="btn btn-kecil btn-sekunder" id="btn-kembali"><i data-lucide="arrow-left"></i> Kembali</button>
          ${tombolSimpan}
        </div>
      </div>
    </div>
    <div class="toolbar">
      <div class="tumbal">
        <label class="label" for="flt-q">Cari</label>
        <input class="input" id="flt-q" placeholder="Nama / NISN / NIS" autocomplete="off" />
      </div>
      <div class="tumbal">
        <label class="label" for="flt-kelas">Kelas</label>
        <select class="select" id="flt-kelas">
          <option value="">Semua</option>
          ${kelasUnik.map(k =>
            `<option value="${escape(k.id_kelas)}">${escape(k.nama_kelas)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="tumbal">
        <label class="label" for="flt-status">Status Efektif</label>
        <select class="select" id="flt-status">
          <option value="">Semua</option>
          <option value="ikut">Ikut</option>
          <option value="susulan">Susulan</option>
          <option value="tidak_terdaftar">Tidak Terdaftar</option>
        </select>
      </div>
      ${state.bisaUbah ? `<div class="tumbal"><label class="label" style="visibility:hidden">.</label>
        <span class="chip ${state.perubahan.size ? 'chip-warn' : 'chip-netral'}" id="perubahan-jml">${state.perubahan.size} perubahan</span></div>` : ''}
    </div>
    <div id="tabel-peserta"></div>
    <div id="paginasi-peserta"></div>
  `;
}

/** Chip status kegiatan di kartu header. */
function chipStatusKegiatan(s) {
  if (s === 'dibuka') return chip('Dibuka', 'ok');
  if (s === 'dikunci') return chip('Dikunci', 'warn');
  if (s === 'diarsipkan') return chip('Diarsipkan', 'netral');
  return chip('Draft', 'netral');
}

// =========================== RENDER ISI ===========================

function renderIsi() {
  const wadah = document.getElementById('tabel-peserta');
  const pagin = document.getElementById('paginasi-peserta');
  if (!wadah) return;

  // Filter sisi klien.
  const q = (state.filter.q || '').toLowerCase();
  const fk = state.filter.id_kelas;
  const fs = state.filter.status_efektif;
  const fil = state.peserta.filter(p => {
    if (fk && (p.id_kelas || '') !== fk) return false;
    if (fs && p.status_efektif !== fs) return false;
    if (q) {
      const teks = (p.nama + ' ' + p.nisn + ' ' + p.nis + ' ' + (p.nama_kelas || '')).toLowerCase();
      if (!teks.includes(q)) return false;
    }
    return true;
  });

  if (!fil.length) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="users"></i>
      <h3>Tidak ada peserta</h3><p>Tidak ada peserta yang cocok dengan filter ini.</p></div>`;
    pagin.innerHTML = '';
    renderIkon();
    return;
  }

  // Paginasi sisi klien.
  const total = fil.length;
  const jmlHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));
  if (state.halaman > jmlHalaman) state.halaman = jmlHalaman;
  const awal = (state.halaman - 1) * PER_HALAMAN;
  const potong = fil.slice(awal, awal + PER_HALAMAN);

  const kolom = [
    { k: 'nama', judul: 'Nama' },
    { k: 'nisn', judul: 'NISN', render: v => v ? escape(v) : '<span style="color:var(--teks-ringan)">—</span>' },
    { k: 'nama_kelas', judul: 'Kelas', render: v => v ? escape(v) : '<span style="color:var(--teks-ringan)">—</span>' },
    {
      k: 'status_efektif', judul: 'Status',
      render: (v, r) => {
        // Jika ada perubahan lokal, tampilkan status baru (chip-warn) + indikator.
        if (state.perubahan.has(r.id_siswa)) {
          return chipStatusEfektif(state.perubahan.get(r.id_siswa)) +
            ` <span class="chip chip-warn" title="Belum disimpan">·</span>`;
        }
        return chipStatusEfektif(v);
      }
    },
    { k: 'sumber', judul: 'Sumber', render: v => badgeSumber(v) }
  ];

  if (state.bisaUbah) {
    kolom.push({
      k: 'id_siswa', judul: 'Ubah', kelas: 'aksi',
      render: (id, r) => {
        const val = state.perubahan.has(id) ? state.perubahan.get(id) : r.status_efektif;
        return `<select class="select select-padat" data-ubah="${escape(id)}">
          ${STATUS_EFEKTIF.map(s =>
            `<option value="${s}"${s === val ? ' selected' : ''}>${s === 'tidak_terdaftar' ? 'tidak terdaftar' : s}</option>`
          ).join('')}
        </select>`;
      }
    });
  }

  wadah.innerHTML = renderTabel(kolom, potong, {
    kosongPesan: 'Tidak ada peserta pada halaman ini.', padat: true
  });
  pagin.innerHTML = renderPaginasi(total, state.halaman, PER_HALAMAN);
  renderIkon();
}

// =========================== LISTENER ===========================

function pasangListener() {
  // Tombol kembali.
  document.getElementById('btn-kembali')?.addEventListener('click', () => navigasi('#/kegiatan'));

  // Filter cari.
  const q = document.getElementById('flt-q');
  if (q) q.addEventListener('input', debung(() => {
    state.filter.q = q.value.trim();
    state.halaman = 1;
    renderIsi();
  }, 300));

  // Filter kelas & status.
  document.getElementById('flt-kelas')?.addEventListener('change', (e) => {
    state.filter.id_kelas = e.target.value;
    state.halaman = 1;
    renderIsi();
  });
  document.getElementById('flt-status')?.addEventListener('change', (e) => {
    state.filter.status_efektif = e.target.value;
    state.halaman = 1;
    renderIsi();
  });

  // Paginasi.
  document.getElementById('paginasi-peserta')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-halaman]');
    if (!b || b.disabled) return;
    state.halaman = Number(b.dataset.halaman);
    renderIsi();
  });

  // Ubah status per siswa (delegasi).
  document.getElementById('tabel-peserta')?.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-ubah]');
    if (!sel) return;
    const id = sel.dataset.ubah;
    const statusBaru = sel.value;
    // Cari status asli siswa.
    const p = state.peserta.find(x => x.id_siswa === id);
    const asli = p ? p.status_efektif : null;
    if (statusBaru === asli) {
      state.perubahan.delete(id);
    } else {
      state.perubahan.set(id, statusBaru);
    }
    perbaruiBadgePerubahan();
    // Render ulang hanya baris ini agar chip status & badge berubah.
    renderIsi();
  });

  // Simpan perubahan.
  document.getElementById('btn-simpan')?.addEventListener('click', simpanPerubahan);
}

/** Perbarui tampilan badge jumlah perubahan + tombol simpan. */
function perbaruiBadgePerubahan() {
  const badge = document.getElementById('perubahan-jml');
  if (badge) {
    badge.textContent = `${state.perubahan.size} perubahan`;
    badge.className = 'chip ' + (state.perubahan.size ? 'chip-warn' : 'chip-netral');
  }
  const btn = document.getElementById('btn-simpan');
  if (btn) btn.disabled = state.perubahan.size === 0;
}

async function simpanPerubahan() {
  if (!state.perubahan.size || state.simpanBerjalan) return;
  const btn = document.getElementById('btn-simpan');
  const perubahan = Array.from(state.perubahan.entries()).map(([id_siswa, status]) => ({
    id_siswa, status
  }));
  state.simpanBerjalan = true;
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    await panggil('kegiatan_peserta_simpan', {
      id_kegiatan: state.idKeg, perubahan
    }, state.token);
    toast(`${perubahan.length} perubahan peserta disimpan.`, 'ok');
    state.perubahan = new Map();
    // Muat ulang untuk mendapatkan status efektif & sumber terbaru.
    await muatPeserta();
  } catch (err) {
    toast(pesanGalat(err), 'err');
    // Tetap pertahankan perubahan agar pengguna bisa mencoba lagi.
    perbaruiBadgePerubahan();
  } finally {
    state.simpanBerjalan = false;
    if (btn) {
      btn.disabled = state.perubahan.size === 0;
      btn.innerHTML = `<i data-lucide="save"></i> Simpan Perubahan`;
      renderIkon();
    }
  }
}
