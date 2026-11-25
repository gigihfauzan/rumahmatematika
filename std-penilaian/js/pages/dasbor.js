// dasbor.js — Halaman Dasbor Admin (Tahap 2A).
// Ringkasan angka Data Master + tautan cepat ke modul lain.
// Hak: hanya admin.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { chip } from '../komponen.js';
import { navigasi } from '../router.js';

// State halaman.
const state = { sesi: null, token: null, data: null };

// =========================== ENTRY ===========================

export async function renderDasbor(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  document.getElementById('topbar-judul').textContent = 'Dasbor';
  const main = document.getElementById('main');

  // Hanya admin.
  if (!boleh(sesi.peran, 'admin')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman dasbor hanya untuk administrator.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat dasbor...');
  try {
    state.data = await panggil('dasbor', {}, state.token);
    renderIsi();
    renderIkon();
    pasangListener();
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat</h3>
      <p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
  }
}

// =========================== RENDER ===========================

function renderIsi() {
  const main = document.getElementById('main');
  const d = state.data || {};
  const taAktif = d.ta_aktif;

  main.innerHTML = `
    <h1 class="page-judul">Dasbor Data Master</h1>
    <p style="color:var(--teks-ringan);margin:0 0 1.25rem">
      Tahun ajaran aktif:
      ${taAktif ? chip(taAktif.nama, 'info') : '<span class="chip chip-warn">belum ada</span>'}
    </p>
    <div class="dasbor-grid">
      ${kartuAngka(d.pengguna_aktif ?? 0, 'Pengguna Aktif', 'users')}
      ${kartuAngka(d.kelas ?? 0, 'Kelas (TA Aktif)', 'school')}
      ${kartuAngka(d.slot ?? 0, 'Slot Mapel (TA Aktif)', 'book-open')}
      ${kartuAngka(d.penugasan_belum_lengkap ?? 0, 'Penugasan Belum Lengkap', 'clipboard-list')}
    </div>
    <div class="kartu">
      <div class="kartu-title">Tautan Cepat</div>
      <div class="beranda-grid">
        ${tautanCepat('Tahun Ajaran', 'calendar-days', '#/ta')}
        ${tautanCepat('Akun Pengguna', 'users', '#/pengguna')}
        ${tautanCepat('Kelas & Rombel', 'school', '#/kelas')}
        ${tautanCepat('Mapel & Slot', 'book-open', '#/mapel')}
        ${tautanCepat('Penugasan', 'clipboard-list', '#/penugasan')}
        ${tautanCepat('Data Siswa', 'graduation-cap', '#/siswa')}
      </div>
    </div>`;
}

/** Kartu angka ringkasan. */
function kartuAngka(angka, label, ikon) {
  return `<div class="dasbor-kartu">
    <div style="display:flex;align-items:center;gap:.5rem;color:var(--teks-ringan);margin-bottom:.5rem">
      <i data-lucide="${escape(ikon)}"></i>
      <span class="label" style="margin:0">${escape(label)}</span>
    </div>
    <div class="angka">${escape(angka)}</div>
  </div>`;
}

/** Kartu tautan cepat (dapat diklik untuk navigasi). */
function tautanCepat(judul, ikon, hash) {
  return `<button class="beranda-kartu taut" data-taut="${escape(hash)}" type="button">
    <span class="iko"><i data-lucide="${escape(ikon)}"></i></span>
    <h3>${escape(judul)}</h3>
    <div class="badge-kedepan">Buka &rarr;</div>
  </button>`;
}

// =========================== LISTENER ===========================

function pasangListener() {
  document.querySelectorAll('[data-taut]').forEach(b =>
    b.addEventListener('click', () => navigasi(b.dataset.taut))
  );
}
