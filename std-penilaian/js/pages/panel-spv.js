// panel-spv.js — Halaman Panel Standar Penilaian (Tahap 3A).
// Ringkasan kegiatan penilaian: total, dibuka, draft; daftar kegiatan aktif
// dengan tautan kelola / progres / peserta.
// Hak: standar_penilaian & admin.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { chip } from '../komponen.js';
import { navigasi } from '../router.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  idTa: null,
  kegiatanAktif: [],
  total: 0,
  jumlahDibuka: 0,
  jumlahDraft: 0,
  jumlahDikunci: 0,
  jumlahDiarsipkan: 0
};

// =========================== UTIL ===========================

/** ISO yyyy-MM-dd → dd/mm/yyyy. */
function formatTanggal(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** Chip status kegiatan. */
function chipStatus(s) {
  if (s === 'dibuka') return chip('Dibuka', 'ok');
  if (s === 'dikunci') return chip('Dikunci', 'warn');
  if (s === 'diarsipkan') return chip('Diarsipkan', 'netral');
  return chip('Draft', 'netral');
}

// =========================== ENTRY ===========================

export async function renderPanelSpn(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  document.getElementById('topbar-judul').textContent = 'Panel Standar Penilaian';
  const main = document.getElementById('main');

  // Hanya standar_penilaian (termasuk admin) yang boleh mengakses panel.
  if (!boleh(sesi.peran, 'standar_penilaian')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i>
      <h3>Akses ditolak</h3>
      <p>Panel ini khusus Standar Penilaian / Administrator.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat panel...');
  try {
    const d = await panggil('panel_spn', {}, state.token);
    state.idTa = d.id_ta || null;
    state.kegiatanAktif = d.kegiatan_aktif || [];
    state.total = Number(d.total) || 0;
    // Hitung jumlah per status dari daftar aktif (draft + dibuka).
    state.jumlahDibuka = state.kegiatanAktif.filter(k => k.status === 'dibuka').length;
    state.jumlahDraft = state.kegiatanAktif.filter(k => k.status === 'draft').length;
    state.jumlahDikunci = 0;
    state.jumlahDiarsipkan = 0;
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
    return;
  }
  renderIsi();
  renderIkon();
  pasangListener();
}

// =========================== RENDER ISI ===========================

function renderIsi() {
  const main = document.getElementById('main');
  const ringkasan = `
    <div class="dasbor-grid">
      <div class="dasbor-kartu">
        <div class="angka">${state.total}</div>
        <div class="label">Total Kegiatan</div>
      </div>
      <div class="dasbor-kartu">
        <div class="angka" style="color:var(--ok)">${state.jumlahDibuka}</div>
        <div class="label">Dibuka</div>
      </div>
      <div class="dasbor-kartu">
        <div class="angka">${state.jumlahDraft}</div>
        <div class="label">Draft</div>
      </div>
      <div class="dasbor-kartu">
        <div class="angka" style="color:var(--warn)">${state.kegiatanAktif.length}</div>
        <div class="label">Aktif (draft + dibuka)</div>
      </div>
    </div>`;

  const daftar = state.kegiatanAktif.length
    ? `<div class="beranda-grid">${state.kegiatanAktif.map(kartuKegiatan).join('')}</div>`
    : `<div class="kosong"><i data-lucide="calendar-days"></i>
        <h3>Belum ada kegiatan aktif</h3>
        <p>Buat kegiatan di halaman <a href="#/kegiatan">Kegiatan</a>.</p></div>`;

  main.innerHTML = `
    <h1 class="page-judul">Panel Standar Penilaian</h1>
    ${ringkasan}
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Kegiatan Aktif</div>
      ${daftar}
    </div>
    <div class="kartu" style="background:var(--permukaan-2)">
      <div class="kartu-title">Progres Input Nilai</div>
      <p style="margin:0; font-size:.88rem; color:var(--teks-ringan)">
        Progres input nilai per kegiatan, guru, dan kelas akan terisi otomatis pada
        <strong>Tahap 3B</strong>. Sementara, Anda dapat membuka halaman Progres
        (kosong) lewat tombol di tiap kartu kegiatan di atas.
      </p>
      <button class="btn btn-kecil btn-sekunder" id="btn-progres-semua" style="margin-top:.75rem">
        <i data-lucide="activity"></i> Buka Halaman Progres</button>
    </div>
  `;
}

/** Kartu kecil kegiatan aktif dengan tombol aksi. */
function kartuKegiatan(k) {
  const jadwal = (k.tanggal_buka || k.tanggal_tutup)
    ? `${formatTanggal(k.tanggal_buka)} – ${formatTanggal(k.tanggal_tutup)}`
    : '<span style="color:var(--teks-ringan)">Jadwal belum diatur</span>';
  return `<div class="beranda-kartu">
    <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap">
      ${chipStatus(k.status)}
      ${chip(escape(k.jenis || '-'), 'info')}
      ${chip('Semester ' + escape(k.semester || '-'), 'netral')}
    </div>
    <h3>${escape(k.nama || '(tanpa nama)')}</h3>
    <p>${(k.tingkat_peserta || []).length
      ? 'Tingkat ' + k.tingkat_peserta.map(Number).join(', ')
      : '<span style="color:var(--teks-ringan)">—</span>'}</p>
    <p style="margin:0">Jadwal: ${jadwal}</p>
    <div class="badge-kedepan" style="display:flex; gap:.4rem; flex-wrap:wrap; border-top:1px dashed var(--border); padding-top:.6rem">
      <button class="btn btn-kecil btn-sekunder" data-kelola><i data-lucide="calendar-days"></i> Kelola</button>
      <button class="btn btn-kecil btn-sekunder" data-progres><i data-lucide="activity"></i> Progres</button>
      <button class="btn btn-kecil" data-peserta="${escape(k.id_kegiatan)}"><i data-lucide="users"></i> Peserta</button>
    </div>
  </div>`;
}

// =========================== LISTENER ===========================

function pasangListener() {
  const main = document.getElementById('main');
  // Delegasi klik pada daftar kartu.
  main?.querySelectorAll('.beranda-kartu').forEach(kartu => {
    kartu.addEventListener('click', (e) => {
      // Ambil id_kegiatan dari tombol Peserta pada kartu ini.
      const pe = e.target.closest('[data-peserta]');
      if (pe) {
        navigasi('#/peserta/' + encodeURIComponent(pe.dataset.peserta));
        return;
      }
      if (e.target.closest('[data-kelola]')) {
        navigasi('#/kegiatan');
        return;
      }
      if (e.target.closest('[data-progres]')) {
        navigasi('#/progres');
        return;
      }
    });
  });

  // Tombol "Buka Halaman Progres" di catatan.
  document.getElementById('btn-progres-semua')?.addEventListener('click', () => navigasi('#/progres'));
}
