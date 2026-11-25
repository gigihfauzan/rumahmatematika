// tugas-guru.js — Halaman Beranda Guru (Tahap 3B).
// Menampilkan daftar tugas input nilai untuk guru yang sedang login: kegiatan
// dibuka + penugasan miliknya, dengan progres terisi/total, status draft/final,
// dan tanggal tutup. Klik kartu → halaman input nilai.
// Hak: guru (penugasan miliknya). Spn/admin juga bisa (atas nama).
import { renderIkon, escape, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { navigasi } from '../router.js';
import { chip } from '../komponen.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  tugas: []
};

// =========================== UTIL ===========================

/** ISO yyyy-MM-dd → dd/mm/yyyy (ramah dibaca). */
function formatTanggal(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** Persen terisi (0..100); total=0 → 0. */
function persen(terisi, total) {
  if (!total) return 0;
  return Math.round((terisi / total) * 100);
}

/** Chip status_input: draft netral, final ok. */
function chipStatus(status) {
  if (status === 'final') return chip('Final', 'ok');
  return chip('Draft', 'netral');
}

// =========================== ENTRY ===========================

export async function renderTugasGuru(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  document.getElementById('topbar-judul').textContent = 'Tugas Mengajar';

  // Hanya guru/spn/admin yang boleh. Kepsek murni tidak punya tugas input.
  if (!boleh(sesi.peran, 'guru') && !boleh(sesi.peran, 'standar_penilaian')) {
    document.getElementById('main').innerHTML = `<div class="kosong">
      <i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini khusus guru dan standar penilaian.</p></div>`;
    renderIkon();
    return;
  }

  const main = document.getElementById('main');
  main.innerHTML = spin('Memuat tugas mengajar...');
  try {
    const hasil = await panggil('beranda_guru', {}, state.token);
    state.tugas = hasil.tugas || [];
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  renderIsi();
  renderIkon();
}

// =========================== RENDER ISI ===========================

function renderIsi() {
  const main = document.getElementById('main');

  if (!state.tugas.length) {
    main.innerHTML = `<h1 class="page-judul">Tugas Mengajar</h1>
      <div class="kosong">
        <i data-lucide="inbox"></i>
        <h3>Belum ada kegiatan dibuka untuk Anda</h3>
        <p>Penugasan Anda akan muncul di sini ketika kegiatan penilaian dibuka oleh standar penilaian.</p>
      </div>`;
    renderIkon();
    return;
  }

  // Kelompokkan per kegiatan agar kartu mudah dipindai.
  const perKeg = {};
  const urutKeg = [];
  state.tugas.forEach(t => {
    if (!perKeg[t.id_kegiatan]) { perKeg[t.id_kegiatan] = []; urutKeg.push(t.id_kegiatan); }
    perKeg[t.id_kegiatan].push(t);
  });

  const kelompokHtml = urutKeg.map(idKeg => {
    const tugas = perKeg[idKeg];
    const kepala = tugas[0];
    const kartu = tugas.map(renderKartuTugas).join('');
    return `<section class="kelompok-tugas">
      <div class="kelompok-tugas-head">
        <h2>${escape(kepala.nama_kegiatan)}</h2>
        <span class="petunjuk">Tenggat input: ${escape(formatTanggal(kepala.tanggal_tutup) || '-')}</span>
      </div>
      <div class="tugas-grid">${kartu}</div>
    </section>`;
  }).join('');

  main.innerHTML = `<h1 class="page-judul">Tugas Mengajar</h1>
    <p class="petunjuk" style="margin:0 0 1rem">Klik kartu untuk membuka tabel input nilai.</p>
    ${kelompokHtml}`;

  // Klik kartu → navigasi.
  main.querySelectorAll('[data-tugas]').forEach(kartu => {
    kartu.addEventListener('click', () => {
      const { keg, kelas, varian } = kartu.dataset;
      navigasi(`#/input-nilai/${keg}/${kelas}/${varian}`);
    });
  });
}

/** Render satu kartu tugas (guru+varian+kelas). */
function renderKartuTugas(t) {
  const persenIsi = persen(t.terisi, t.total);
  const labelProgres = `${t.terisi}/${t.total}`;
  return `<div class="kartu kartu-tugas" data-tugas data-keg="${escape(t.id_kegiatan)}"
        data-kelas="${escape(t.id_kelas)}" data-varian="${escape(t.id_varian)}" role="button" tabindex="0">
    <div class="kartu-tugas-head">
      <div class="kartu-tugas-title">
        <span class="kartu-tugas-varian">${escape(t.nama_varian || '-')}</span>
        ${t.nama_slot ? `<span class="kartu-tugas-slot">${escape(t.nama_slot)}</span>` : ''}
      </div>
      ${chipStatus(t.status_input)}
    </div>
    <div class="kartu-tugas-kelas"><i data-lucide="users"></i> ${escape(t.nama_kelas || '-')}</div>
    <div class="mini-bar-grup">
      <div class="mini-bar"><div class="mini-bar-isi ${persenIsi < 100 ? 'mini-bar-belum' : ''}" style="width:${persenIsi}%"></div></div>
      <span class="mini-bar-label">${escape(labelProgres)} (${persenIsi}%)</span>
    </div>
    <div class="kartu-tugas-foot">
      <i data-lucide="calendar-clock"></i>
      <span>Tutup: ${escape(formatTanggal(t.tanggal_tutup) || '-')}</span>
    </div>
  </div>`;
}
