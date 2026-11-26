// laporan.js — Halaman Laporan Tahap 5A & 5B.
//
// Fitur: unduh laporan PDF & Excel untuk lembar kelas, paralel, rekap, laporan
// hasil per siswa, dan grafik (tipe gambar + dapat diedit). Pratinjau sebelum
// unduh. Peringatan jika belum_final > 0 atau ada nilai kosong. "Lihat sebagai
// siswa" untuk admin/standar penilaian.
//
// Hak akses (diputuskan server; frontend mengikuti):
// - admin & standar_penilaian: semua jenis + unduh + grafik dapat diedit.
// - wali kelas murni (guru tanpa spn/kepsek): Lembar Kelas & Laporan Hasil Siswa
//   untuk kelas perwalian saja (server memaksa filter; frontend hanya menyembunyikan
//   jenis lain).
// - kepala sekolah murni (kepsek tanpa spn): hanya tampilan grafik web, tanpa
//   tombol unduh.
// - guru biasa tanpa peran lain & tanpa perwalian: ditolak server; frontend
//   menampilkan pesan akses ditolak.
//
// Pustaka: jsPDF & autoTable (window.jspdf), SheetJS (js/excel.js), Chart.js
// (window.Chart). Token dari localStorage.getItem('enilai_token').
import { renderIkon, escape, spin, pesanGalat, toast } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil, GalatApi } from '../api.js';
import { chip, renderModal, modalBuka, modalTutup } from '../komponen.js';
import { namaFileLaporan, formatTanggal, bangunLembarKelas, bangunParalel, bangunRekap, bangunSiswa, normalisasiOsi, fmtNilai, fmtRata } from '../laporan/layout.js';
import * as pdfGen from '../laporan/pdf.js';
import * as excelGen from '../laporan/excel.js';

const Chart = (typeof window !== 'undefined') ? window.Chart : null;

// Plugin Chart.js: label nilai di atas batang (untuk grafik laporan). Daftarkan
// sekali secara global (Chart.register idempoten untuk id yang sama).
let _pluginNilaiLabelTerdaftar = false;
function daftarkanPluginNilaiLabel() {
  if (!Chart || _pluginNilaiLabelTerdaftar) return;
  _pluginNilaiLabelTerdaftar = true;
  Chart.register({
    id: 'enilaiNilaiLabel',
    afterDatasetsDraw: (chart) => {
      const ctx = chart.ctx;
      chart.data.datasets.forEach((ds, i) => {
        const meta = chart.getDatasetMeta(i);
        if (meta.hidden) return;
        meta.data.forEach((bar, idx) => {
          const v = ds.data[idx];
          if (v == null) return;
          ctx.save();
          ctx.fillStyle = '#222';
          ctx.font = '10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(v), bar.x, Math.max(bar.y - 4, 6));
          ctx.restore();
        });
      });
    }
  });
}

// =========================== STATE ===========================

const state = {
  sesi: null,
  token: null,
  pengaturan: null,
  kegiatanList: [],
  bisaSemua: false,
  idKeg: null,
  kegiatan: null,
  // Cakupan.
  kelasList: [],
  kelasListDimuat: false,
  waliKelasIds: [],
  waliKelasDitemukan: false,
  siswaList: [],         // di-cache per kelas terpilih (untuk pilih siswa)
  // Preferensi unduh per pengguna (localStorage).
  pref: muatPref(),
  // Chart aktif (untuk dihancurkan sebelum render ulang).
  charts: [],
  // Id modal unik.
  modalId: 'modal-unduh-laporan'
};

/** Muat preferensi unduh dari localStorage. */
function muatPref() {
  try {
    const raw = localStorage.getItem('enilai_unduh_pref');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    format: 'pdf',
    kertas: 'A4',
    orientasi: 'portrait',
    tampilkan_logo: true,
    nomor_halaman: true,
    tampilkan_varian_tag: true,
    tampilkan_peringkat: true,
    tampilkan_pembanding: true,
    tanda_belum_final: true,
    hanya_final: false
  };
}

/** Simpan preferensi unduh ke localStorage. */
function simpanPref() {
  try { localStorage.setItem('enilai_unduh_pref', JSON.stringify(state.pref)); }
  catch (e) { /* abaikan */ }
}

// =========================== UTIL ===========================

/** Apakah pengguna ini wali murni (guru tanpa spn/kepsek)? */
function waliMurni() {
  return boleh(state.sesi.peran, 'guru')
    && !boleh(state.sesi.peran, 'standar_penilaian')
    && !boleh(state.sesi.peran, 'kepsek');
}

/** Apakah pengguna ini kepsek murni (kepsek tanpa spn)? */
function kepsekMurni() {
  return boleh(state.sesi.peran, 'kepsek')
    && !boleh(state.sesi.peran, 'standar_penilaian');
}

/** Palet cetak (B/W distinct): tiga seri + 2 untuk ketuntasan. */
function paletCetak() {
  return ['#1f2937', '#6b7280', '#9ca3af', '#111827', '#d1d5db'];
}

/** Daftar jenis laporan yang tersedia untuk sesi ini. */
function daftarJenis() {
  if (waliMurni()) {
    return [
      { id: 'lembar_kelas', judul: 'Lembar Kelas', ikon: 'table', desc: 'Lembar nilai per kelas perwalian.' },
      { id: 'laporan_siswa', judul: 'Laporan Hasil Siswa', ikon: 'file-text', desc: 'Laporan hasil per siswa perwalian.' }
    ];
  }
  if (kepsekMurni()) {
    return [
      { id: 'grafik', judul: 'Grafik Web', ikon: 'bar-chart-3', desc: 'Tinjau grafik capaian per tingkat (tanpa unduh).' }
    ];
  }
  // admin/spn: semua.
  return [
    { id: 'lembar_kelas', judul: 'Lembar Kelas', ikon: 'table', desc: 'Lembar nilai per kelas (satu / beberapa / seluruh).' },
    { id: 'lembar_paralel', judul: 'Lembar Paralel', ikon: 'layers', desc: 'Lembar nilai per tingkat.' },
    { id: 'rekap', judul: 'Rekap', ikon: 'clipboard-list', desc: 'Rekapitulasi seluruh sekolah per tingkat.' },
    { id: 'laporan_siswa', judul: 'Laporan Hasil Siswa', ikon: 'file-text', desc: 'Laporan hasil per siswa (satu / kelas / tingkat).' },
    { id: 'grafik', judul: 'Grafik', ikon: 'bar-chart-3', desc: 'Grafik tipe gambar & dapat diedit.' },
    { id: 'lihat_siswa', judul: 'Lihat sebagai Siswa', ikon: 'eye', desc: 'Pratinjau laporan siswa seperti yang dilihat siswa.' }
  ];
}

// =========================== ENTRY ===========================

export async function renderLaporan(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.charts = [];

  document.getElementById('topbar-judul').textContent = 'Laporan';
  const main = document.getElementById('main');

  // Akses: tolak guru biasa tanpa hak laporan.
  if (!boleh(sesi.peran, 'standar_penilaian') && !boleh(sesi.peran, 'kepsek') && !boleh(sesi.peran, 'guru')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini khusus standar penilaian, kepala sekolah, atau wali kelas.</p></div>`;
    renderIkon();
    return;
  }

  // Muat pengaturan sekolah (untuk kop & format tanggal).
  try {
    state.pengaturan = await panggil('pengaturan_ambil', {}, state.token);
  } catch (e) {
    state.pengaturan = state.pengaturan || {};
  }

  main.innerHTML = spin('Memuat daftar kegiatan...');
  try {
    const d = await panggil('pemantauan_kegiatan_daftar', {}, state.token);
    state.kegiatanList = d.kegiatan || [];
    state.bisaSemua = !!d.bisa_semua;
    // Pulihkan kegiatan terakhir dari sessionStorage.
    const simpan = sessionStorage.getItem('enilai_keg_laporan');
    if (simpan && state.kegiatanList.some(k => k.id_kegiatan === simpan)) {
      state.idKeg = simpan;
    } else if (state.kegiatanList.length === 1) {
      state.idKeg = state.kegiatanList[0].id_kegiatan;
    }
    state.kegiatan = state.idKeg ? state.kegiatanList.find(k => k.id_kegiatan === state.idKeg) : null;
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }

  renderKerangka();
  pasangListenerKerangka();
  renderIkon();
}

// =========================== KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  const pref = state.pref;
  main.innerHTML = `
    <h1 class="page-judul">Laporan</h1>
    <p class="petunjuk" style="margin:0 0 1rem">Unduh lembar nilai, rekap, laporan hasil per siswa, dan grafik (PDF/Excel). Semua angka dihitung oleh mesin di server.</p>
    <div class="toolbar">
      <div class="tumbal" style="min-width:280px">
        <label class="label" for="lap-keg">Kegiatan</label>
        <select class="select" id="lap-keg">
          <option value="">— pilih kegiatan —</option>
          ${state.kegiatanList.map(k => `<option value="${escape(k.id_kegiatan)}"${k.id_kegiatan === state.idKeg ? ' selected' : ''}>${escape(k.nama)} (${escape(k.status)})</option>`).join('')}
        </select>
      </div>
      <div class="tumbal" id="lap-info-keg">${state.kegiatan ? ringkasKegiatan(state.kegiatan) : ''}</div>
    </div>
    <div id="lap-banner"></div>
    <div id="lap-jenis" class="beranda-grid">
      ${daftarJenis().map(j => `<button class="beranda-kartu taut" data-jenis="${escape(j.id)}" data-judul="${escape(j.judul)}">
        <span class="iko"><i data-lucide="${j.ikon}"></i></span>
        <h3>${escape(j.judul)}</h3>
        <p>${escape(j.desc)}</p>
        <div class="badge-kedepan">Buka &rarr;</div>
      </button>`).join('')}
    </div>
    <div id="lap-konten"></div>
    ${renderModal(state.modalId, 'Unduh Laporan', `<div id="lap-modal-isi">${spin('Menyiapkan...')}</div>`, '', true)}`;
}

function ringkasKegiatan(kg) {
  const tingkat = (kg.tingkat_peserta || []).join(', ');
  return `<div style="font-size:.78rem; color:var(--teks-ringan)">
    <span>${chipStatusKegiatan(kg.status)}</span>
    <span style="margin-left:.5rem">Tingkat: ${escape(tingkat || '-')}</span>
    ${kg.semester ? `<span style="margin-left:.5rem">Semester ${escape(kg.semester)}</span>` : ''}
  </div>`;
}

function chipStatusKegiatan(st) {
  if (st === 'dibuka') return chip('Dibuka', 'ok');
  if (st === 'draft') return chip('Draft', 'netral');
  if (st === 'dikunci') return chip('Dikunci', 'warn');
  if (st === 'diarsipkan') return chip('Diarsipkan', 'netral');
  return chip(st || '-', 'netral');
}

function pasangListenerKerangka() {
  // Ganti kegiatan.
  document.getElementById('lap-keg')?.addEventListener('change', (e) => {
    state.idKeg = e.target.value;
    sessionStorage.setItem('enilai_keg_laporan', state.idKeg || '');
    state.kegiatan = state.idKeg ? state.kegiatanList.find(k => k.id_kegiatan === state.idKeg) : null;
    state.kelasListDimuat = false;
    state.waliKelasDitemukan = false;
    state.waliKelasIds = [];
    const info = document.getElementById('lap-info-keg');
    if (info) info.innerHTML = state.kegiatan ? ringkasKegiatan(state.kegiatan) : '';
    const konten = document.getElementById('lap-konten');
    if (konten) konten.innerHTML = '';
    renderIkon();
  });

  // Klik kartu jenis.
  document.getElementById('lap-jenis')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-jenis]');
    if (!btn) return;
    const jenis = btn.dataset.jenis;
    if (!state.idKeg) { toast('Pilih kegiatan dahulu.', 'warn'); return; }
    await bukaJenis(jenis);
    renderIkon();
  });
}

// =========================== BUKA JENIS ===========================

async function bukaJenis(jenis) {
  // Untuk grafik web kepsek murni: tampilkan langsung di konten, tanpa modal.
  if (kepsekMurni() && jenis === 'grafik') {
    await renderGrafikWebDiKonten();
    return;
  }
  // Untuk "lihat_siswa": modal khusus.
  if (jenis === 'lihat_siswa') {
    await bukaLihatSebagaiSiswa();
    return;
  }
  // Untuk grafik (admin/spn): modal khusus dengan canvas + unduh.
  if (jenis === 'grafik') {
    await bukaGrafikUnduh();
    return;
  }
  // Untuk lembar_kelas/paralel/rekap/laporan_siswa: modal unduh biasa.
  await bukaModalUnduh(jenis);
}

// =========================== MODAL UNDUH ===========================

/** Buka modal unduh dengan form sesuai jenis. */
async function bukaModalUnduh(jenis) {
  const isi = document.getElementById('lap-modal-isi');
  if (!isi) return;
  isi.innerHTML = spin('Menyiapkan opsi...');

  // Pastikan kelasList dimuat untuk cakupan berbasis kelas.
  if (jenis === 'lembar_kelas' || jenis === 'laporan_siswa') {
    try { await muatKelasList(); } catch (err) {
      isi.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat kelas</h3><p>${escape(pesanGalat(err))}</p></div>`;
      return;
    }
  }

  const kg = state.kegiatan;
  const tingkatOpts = (kg.tingkat_peserta || []).map(Number);
  const pref = state.pref;
  const defaultTanggal = kg.tanggal_dokumen || '';

  // Render form.
  const cakupanHtml = renderCakupan(jenis, tingkatOpts);
  const opsiHtml = renderOpsiForm(pref, jenis);

  isi.innerHTML = `
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Opsi Unduh</div>
      <div class="toolbar" style="margin-bottom:0">
        <div class="tumbal">
          <label class="label">Format</label>
          <select class="select" id="lap-format">
            <option value="pdf" ${pref.format === 'pdf' ? 'selected' : ''}>PDF</option>
            <option value="excel" ${pref.format === 'excel' ? 'selected' : ''}>Excel (.xlsx)</option>
          </select>
        </div>
        <div class="tumbal">
          <label class="label">Kertas</label>
          <select class="select" id="lap-kertas">
            <option value="A4" ${pref.kertas === 'A4' ? 'selected' : ''}>A4</option>
            <option value="F4" ${pref.kertas === 'F4' ? 'selected' : ''}>F4 (Folio)</option>
          </select>
        </div>
        <div class="tumbal">
          <label class="label">Orientasi</label>
          <select class="select" id="lap-orientasi">
            <option value="portrait" ${pref.orientasi === 'portrait' ? 'selected' : ''}>Portrait</option>
            <option value="landscape" ${pref.orientasi === 'landscape' ? 'selected' : ''}>Landscape</option>
          </select>
        </div>
        <div class="tumbal">
          <label class="label">Tanggal Dokumen</label>
          <input class="input" id="lap-tanggal" type="date" value="${escape(defaultTanggal)}" />
        </div>
        <div class="tumbal">
          <label class="label">Filter nilai</label>
          <label class="cek-kotak">
            <input type="checkbox" id="lap-hanya-final" ${pref.hanya_final ? 'checked' : ''} />
            <span>Hanya final</span>
          </label>
        </div>
      </div>
    </div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Cakupan</div>
      ${cakupanHtml}
    </div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Opsi Penyajian</div>
      ${opsiHtml}
    </div>
    <div id="lap-peringatan"></div>
    <div id="lap-pratinjau"></div>
    <div class="kelompok-aksi" style="display:flex; gap:.6rem; justify-content:flex-end; margin-top:1rem">
      <button class="btn btn-sekunder" data-modal-tutup="${state.modalId}">Batal</button>
      <button class="btn btn-sekunder" id="btn-pratinjau"><i data-lucide="eye"></i> Pratinjau</button>
      <button class="btn" id="btn-unduh" disabled><i data-lucide="download"></i> Unduh</button>
    </div>`;
  modalBuka(state.modalId);
  renderIkon();
  pasangListenerModalUnduh(jenis);
}

/** Render pilihan cakupan sesuai jenis. */
function renderCakupan(jenis, tingkatOpts) {
  if (jenis === 'lembar_kelas') {
    if (waliMurni()) {
      // Hanya kelas perwalian.
      const opts = state.kelasList.filter(k => state.waliKelasIds.includes(k.id_kelas))
        .map(k => `<option value="${escape(k.id_kelas)}">${escape(k.nama_kelas)}</option>`).join('');
      return `<div class="field">
        <label class="label" for="lap-cakupan-kelas">Kelas Perwalian</label>
        <select class="select" id="lap-cakupan-kelas">${opts}</select>
        <div class="petunjuk">Hanya kelas perwalian Anda yang tersedia (server membatasi).</div>
      </div>`;
    }
    const kelasByTingkat = kelasByTingkatKegiatan();
    const opts = kelasByTingkat.map(k => `<option value="${escape(k.id_kelas)}">${escape(k.nama_kelas)}</option>`).join('');
    return `<div class="field">
      <label class="label" for="lap-cakupan-mode">Cakupan</label>
      <select class="select" id="lap-cakupan-mode">
        <option value="satu_kelas">Satu kelas</option>
        <option value="beberapa_kelas">Beberapa kelas (pilih di bawah)</option>
        <option value="satu_tingkat">Semua kelas satu tingkat</option>
        <option value="sekolah">Seluruh sekolah (semua tingkat)</option>
      </select>
    </div>
    <div class="field" id="lap-cakupan-tingkat-bungkus" style="display:none">
      <label class="label" for="lap-cakupan-tingkat">Tingkat</label>
      <select class="select" id="lap-cakupan-tingkat">
        ${tingkatOpts.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div class="field" id="lap-cakupan-kelas-bungkus">
      <label class="label" for="lap-cakupan-kelas">Kelas</label>
      <select class="select" id="lap-cakupan-kelas">${opts}</select>
    </div>
    <div class="field" id="lap-cakupan-kelas-multi-bungkus" style="display:none">
      <label class="label">Kelas Terpilih</label>
      <div class="cek-kotak-grid" id="lap-cakupan-kelas-multi">
        ${kelasByTingkat.map(k => `<label class="cek-kotak"><input type="checkbox" value="${escape(k.id_kelas)}" /><span>${escape(k.nama_kelas)}</span></label>`).join('')}
      </div>
    </div>`;
  }
  if (jenis === 'lembar_paralel') {
    return `<div class="field">
      <label class="label" for="lap-cakupan-mode">Cakupan</label>
      <select class="select" id="lap-cakupan-mode">
        <option value="satu_tingkat">Satu tingkat</option>
        <option value="sekolah">Semua tingkat</option>
      </select>
    </div>
    <div class="field" id="lap-cakupan-tingkat-bungkus">
      <label class="label" for="lap-cakupan-tingkat">Tingkat</label>
      <select class="select" id="lap-cakupan-tingkat">
        ${tingkatOpts.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>`;
  }
  if (jenis === 'rekap') {
    return `<div class="petunjuk">Rekap seluruh sekolah (semua tingkat peserta kegiatan).</div>`;
  }
  if (jenis === 'laporan_siswa') {
    if (waliMurni()) {
      const opts = state.kelasList.filter(k => state.waliKelasIds.includes(k.id_kelas))
        .map(k => `<option value="${escape(k.id_kelas)}">${escape(k.nama_kelas)}</option>`).join('');
      return `<div class="field">
        <label class="label" for="lap-cakupan-kelas">Kelas Perwalian</label>
        <select class="select" id="lap-cakupan-kelas">${opts}</select>
      </div>`;
    }
    const kelasByTingkat = kelasByTingkatKegiatan();
    const opts = kelasByTingkat.map(k => `<option value="${escape(k.id_kelas)}">${escape(k.nama_kelas)}</option>`).join('');
    return `<div class="field">
      <label class="label" for="lap-cakupan-mode">Cakupan</label>
      <select class="select" id="lap-cakupan-mode">
        <option value="satu_kelas">Satu kelas</option>
        <option value="satu_tingkat">Satu tingkat</option>
        <option value="sekolah">Seluruh sekolah</option>
        <option value="siswa_terpilih">Siswa terpilih</option>
      </select>
    </div>
    <div class="field" id="lap-cakupan-tingkat-bungkus" style="display:none">
      <label class="label" for="lap-cakupan-tingkat">Tingkat</label>
      <select class="select" id="lap-cakupan-tingkat">
        ${tingkatOpts.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div class="field" id="lap-cakupan-kelas-bungkus">
      <label class="label" for="lap-cakupan-kelas">Kelas</label>
      <select class="select" id="lap-cakupan-kelas">${opts}</select>
    </div>
    <div class="field" id="lap-cakupan-siswa-bungkus" style="display:none">
      <label class="label">Siswa Terpilih</label>
      <div class="petunjuk">Pilih kelas di atas untuk memuat daftar siswa, lalu centang siswa yang diinginkan.</div>
      <div class="cek-kotak-grid" id="lap-cakupan-siswa"><span class="petunjuk">— pilih kelas dahulu —</span></div>
    </div>`;
  }
  return '';
}

/** Render opsi penyajian (checkboxes). */
function renderOpsiForm(pref, jenis) {
  const tampilkanPeringkat = jenis === 'lembar_kelas' || jenis === 'laporan_siswa';
  const tampilkanPembanding = jenis === 'laporan_siswa';
  const tampilkanVarianTag = jenis === 'lembar_kelas' || jenis === 'lembar_paralel';
  return `
    <div class="cek-kotak-grid">
      <label class="cek-kotak"><input type="checkbox" id="lap-opsi-logo" ${pref.tampilkan_logo ? 'checked' : ''} /><span>Tampilkan logo</span></label>
      <label class="cek-kotak"><input type="checkbox" id="lap-opsi-halaman" ${pref.nomor_halaman ? 'checked' : ''} /><span>Nomor halaman</span></label>
      ${tampilkanVarianTag ? `<label class="cek-kotak"><input type="checkbox" id="lap-opsi-varian" ${pref.tampilkan_varian_tag ? 'checked' : ''} /><span>Tag varian (Seni/Prakarya)</span></label>` : ''}
      ${tampilkanPeringkat ? `<label class="cek-kotak"><input type="checkbox" id="lap-opsi-peringkat" ${pref.tampilkan_peringkat ? 'checked' : ''} /><span>Tampilkan peringkat</span></label>` : ''}
      ${tampilkanPembanding ? `<label class="cek-kotak"><input type="checkbox" id="lap-opsi-pembanding" ${pref.tampilkan_pembanding ? 'checked' : ''} /><span>Tampilkan rata kelas/tingkat</span></label>` : ''}
      <label class="cek-kotak"><input type="checkbox" id="lap-opsi-belum-final" ${pref.tanda_belum_final ? 'checked' : ''} /><span>Tanda "BELUM FINAL"</span></label>
    </div>`;
}

/** Pasang listener untuk perubahan cakupan & tombol. */
function pasangListenerModalUnduh(jenis) {
  // Toggle tampil bidang cakupan.
  const modeSel = document.getElementById('lap-cakupan-mode');
  if (modeSel) {
    modeSel.addEventListener('change', () => perbaruiTampilCakupan(jenis));
    perbaruiTampilCakupan(jenis);
  }
  // Ganti kelas untuk "siswa terpilih" → muat siswa.
  const kelasSel = document.getElementById('lap-cakupan-kelas');
  if (kelasSel && jenis === 'laporan_siswa') {
    kelasSel.addEventListener('change', () => muatSiswaUntukPilihan(kelasSel.value));
    if (document.getElementById('lap-cakupan-siswa-bungkus')?.style.display !== 'none') {
      muatSiswaUntukPilihan(kelasSel.value);
    }
  }
  // Tombol pratinjau.
  document.getElementById('btn-pratinjau')?.addEventListener('click', async () => {
    await pratinjau(jenis);
  });
  // Tombol unduh.
  document.getElementById('btn-unduh')?.addEventListener('click', async () => {
    await unduh(jenis);
  });
}

/** Perbarui tampil bidang cakupan sesuai mode. */
function perbaruiTampilCakupan(jenis) {
  const mode = document.getElementById('lap-cakupan-mode')?.value;
  const t = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
  const s = (id) => { const el = document.getElementById(id); if (el) el.style.display = ''; };
  if (jenis === 'lembar_kelas') {
    t('lap-cakupan-tingkat-bungkus'); t('lap-cakupan-kelas-bungkus'); t('lap-cakupan-kelas-multi-bungkus');
    if (mode === 'satu_kelas') s('lap-cakupan-kelas-bungkus');
    else if (mode === 'beberapa_kelas') s('lap-cakupan-kelas-multi-bungkus');
    else if (mode === 'satu_tingkat') s('lap-cakupan-tingkat-bungkus');
    // sekolah: semua disembunyikan.
  } else if (jenis === 'lembar_paralel') {
    t('lap-cakupan-tingkat-bungkus');
    if (mode === 'satu_tingkat') s('lap-cakupan-tingkat-bungkus');
  } else if (jenis === 'laporan_siswa') {
    t('lap-cakupan-tingkat-bungkus'); t('lap-cakupan-kelas-bungkus'); t('lap-cakupan-siswa-bungkus');
    if (mode === 'satu_kelas') s('lap-cakupan-kelas-bungkus');
    else if (mode === 'satu_tingkat') s('lap-cakupan-tingkat-bungkus');
    else if (mode === 'siswa_terpilih') {
      s('lap-cakupan-kelas-bungkus');
      s('lap-cakupan-siswa-bungkus');
      const kelasSel = document.getElementById('lap-cakupan-kelas');
      if (kelasSel) muatSiswaUntukPilihan(kelasSel.value);
    }
  }
}

// =========================== KELAS & SISWA (MUAT) ===========================

async function muatKelasList() {
  if (state.kelasListDimuat) return;
  if (state.bisaSemua) {
    const d = await panggil('kelas_daftar', {}, state.token);
    state.kelasList = d.kelas || [];
    state.kelasListDimuat = true;
  } else {
    // Wali murni: temukan via rekap.
    await temukanWaliKelas();
  }
}

async function temukanWaliKelas() {
  if (state.waliKelasDitemukan) return;
  const rk = await panggil('rekap', { id_kegiatan: state.idKeg }, state.token);
  state.waliKelasIds = [];
  if (!state.kelasListDimuat) state.kelasList = [];
  (rk.perbandingan_rombel || []).forEach(blok => {
    (blok.rombel || []).forEach(r => {
      if (!r.id_kelas) return;
      if (!state.waliKelasIds.includes(r.id_kelas)) state.waliKelasIds.push(r.id_kelas);
      if (!state.kelasList.some(k => k.id_kelas === r.id_kelas)) {
        state.kelasList.push({ id_kelas: r.id_kelas, nama_kelas: r.nama_kelas, tingkat: blok.tingkat });
      }
    });
  });
  state.kelasListDimuat = true;
  state.waliKelasDitemukan = true;
}

/** Kelas yang cocok dengan tingkat peserta kegiatan terpilih. */
function kelasByTingkatKegiatan() {
  const tk = (state.kegiatan && state.kegiatan.tingkat_peserta) || [];
  return state.kelasList.filter(k => tk.includes(Number(k.tingkat)));
}

/** Muat siswa dalam satu kelas untuk pilihan "siswa terpilih". */
async function muatSiswaUntukPilihan(idKelas) {
  const wadah = document.getElementById('lap-cakupan-siswa');
  if (!wadah) return;
  if (!idKelas) { wadah.innerHTML = '<span class="petunjuk">— pilih kelas dahulu —</span>'; return; }
  wadah.innerHTML = spin('Memuat siswa...');
  try {
    const d = await panggil('siswa_daftar', { id_kelas: idKelas }, state.token);
    state.siswaList = d.siswa || [];
    if (!state.siswaList.length) {
      wadah.innerHTML = '<span class="petunjuk">Tidak ada siswa di kelas ini.</span>';
      return;
    }
    wadah.innerHTML = state.siswaList.map(s => `<label class="cek-kotak">
      <input type="checkbox" value="${escape(s.id_siswa)}" />
      <span>${escape(s.nama)}${s.nisn ? ' · ' + escape(s.nisn) : ''}</span>
    </label>`).join('');
  } catch (err) {
    wadah.innerHTML = `<span class="petunjuk">Gagal memuat: ${escape(pesanGalat(err))}</span>`;
  }
}

// =========================== KUMPULKAN OPSI ===========================

/** Kumpulkan opsi dari form modal. */
function kumpulkanOsi() {
  const ambil = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
  // cekKembalian: undefined jika elemen tidak ada (agar default ?? berlaku);
  // boolean jika ada.
  const cekK = (id) => { const e = document.getElementById(id); return e ? e.checked : undefined; };
  const pref = {
    format: ambil('lap-format') || 'pdf',
    kertas: ambil('lap-kertas') || 'A4',
    orientasi: ambil('lap-orientasi') || 'portrait',
    tanggal_dokumen: ambil('lap-tanggal') || '',
    hanya_final: cekK('lap-hanya-final') ?? false,
    tampilkan_logo: cekK('lap-opsi-logo') ?? true,
    nomor_halaman: cekK('lap-opsi-halaman') ?? true,
    tampilkan_varian_tag: cekK('lap-opsi-varian') ?? true,
    tampilkan_peringkat: cekK('lap-opsi-peringkat') ?? true,
    tampilkan_pembanding: cekK('lap-opsi-pembanding') ?? true,
    tanda_belum_final: cekK('lap-opsi-belum-final') ?? true,
    formatTanggalPola: (state.pengaturan && state.pengaturan.format_tanggal) || 'd MMMM yyyy'
  };
  state.pref = { ...state.pref, ...pref };
  simpanPref();
  return pref;
}

/** Kumpulkan cakupan dari form. */
function kumpulkanCakupan(jenis) {
  const ambil = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
  const cekList = (id) => {
    const wadah = document.getElementById(id);
    if (!wadah) return [];
    return [...wadah.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
  };
  if (jenis === 'lembar_kelas') {
    if (waliMurni()) {
      return { mode: 'satu_kelas', id_kelas: ambil('lap-cakupan-kelas') };
    }
    const mode = ambil('lap-cakupan-mode');
    if (mode === 'satu_kelas') return { mode, id_kelas: ambil('lap-cakupan-kelas') };
    if (mode === 'beberapa_kelas') return { mode, id_kelas_list: cekList('lap-cakupan-kelas-multi') };
    if (mode === 'satu_tingkat') return { mode, tingkat: Number(ambil('lap-cakupan-tingkat')) };
    return { mode: 'sekolah' };
  }
  if (jenis === 'lembar_paralel') {
    const mode = ambil('lap-cakupan-mode');
    if (mode === 'satu_tingkat') return { mode, tingkat: Number(ambil('lap-cakupan-tingkat')) };
    return { mode: 'sekolah' };
  }
  if (jenis === 'rekap') return { mode: 'sekolah' };
  if (jenis === 'laporan_siswa') {
    if (waliMurni()) {
      return { mode: 'satu_kelas', id_kelas: ambil('lap-cakupan-kelas') };
    }
    const mode = ambil('lap-cakupan-mode');
    if (mode === 'satu_kelas') return { mode, id_kelas: ambil('lap-cakupan-kelas') };
    if (mode === 'satu_tingkat') return { mode, tingkat: Number(ambil('lap-cakupan-tingkat')) };
    if (mode === 'siswa_terpilih') return { mode, id_siswa: cekList('lap-cakupan-siswa') };
    return { mode: 'sekolah' };
  }
  return {};
}

// =========================== PRATINJAU ===========================

/** Pratinjau: ambil data (1 kelas/siswa pertama) & render HTML kop+tabel. */
async function pratinjau(jenis) {
  const wadah = document.getElementById('lap-pratinjau');
  if (!wadah) return;
  wadah.innerHTML = spin('Menyiapkan pratinjau...');
  const opsi = kumpulkanOsi();
  const cakupan = kumpulkanCakupan(jenis);
  try {
    if (jenis === 'lembar_kelas') {
      const idKelas = cakupan.id_kelas || (cakupan.id_kelas_list && cakupan.id_kelas_list[0]) || kelasByTingkatKegiatan()[0]?.id_kelas;
      if (!idKelas) throw new Error('Tidak ada kelas pada cakupan ini.');
      const data = await panggil('lembar_kelas', {
        id_kegiatan: state.idKeg, id_kelas: idKelas, hanya_final: opsi.hanya_final
      }, state.token);
      data.pengaturan = state.pengaturan;
      const hal = bangunLembarKelas(data, opsi);
      wadah.innerHTML = renderPratinjauLembar(hal);
      renderPeringatan(data.belum_final || 0, hal.baris);
    } else if (jenis === 'lembar_paralel') {
      const tingkat = cakupan.tingkat || (state.kegiatan.tingkat_peserta || [])[0];
      if (!tingkat) throw new Error('Tidak ada tingkat peserta.');
      const data = await panggil('lembar_paralel', {
        id_kegiatan: state.idKeg, tingkat: Number(tingkat), hanya_final: opsi.hanya_final
      }, state.token);
      data.pengaturan = state.pengaturan;
      const hal = bangunParalel(data, opsi);
      wadah.innerHTML = renderPratinjauLembar(hal);
      renderPeringatan(data.belum_final || 0, hal.baris);
    } else if (jenis === 'rekap') {
      const data = await panggil('rekap', {
        id_kegiatan: state.idKeg, hanya_final: opsi.hanya_final
      }, state.token);
      data.pengaturan = state.pengaturan;
      const hal = bangunRekap(data, opsi);
      wadah.innerHTML = renderPratinjauRekap(hal);
      renderPeringatan(data.belum_final || 0);
    } else if (jenis === 'laporan_siswa') {
      // Untuk pratinjau: ambil 1 siswa pertama dari cakupan.
      let idSiswa = null;
      if (cakupan.mode === 'siswa_terpilih') idSiswa = (cakupan.id_siswa || [])[0];
      else if (cakupan.mode === 'satu_kelas') {
        const d = await panggil('siswa_daftar', { id_kelas: cakupan.id_kelas }, state.token);
        idSiswa = (d.siswa || [])[0]?.id_siswa;
      } else if (cakupan.mode === 'satu_tingkat') {
        // Cari siswa di tingkat itu — gunakan laporan_siswa dengan tingkat, ambil daftar pertama.
        const d = await panggil('laporan_siswa', {
          id_kegiatan: state.idKeg, tingkat: cakupan.tingkat, hanya_final: opsi.hanya_final,
          tampilkan_peringkat: opsi.tampilkan_peringkat, tampilkan_pembanding: opsi.tampilkan_pembanding,
          tampilkan_logo: opsi.tampilkan_logo, tanggal_dokumen: opsi.tanggal_dokumen
        }, state.token);
        idSiswa = null; // sudah punya daftar; langsung pakai.
        const daftar = d.daftar || [];
        if (daftar.length) {
          const hal = bangunSiswa(daftar[0], { ...opsi });
          wadah.innerHTML = renderPratinjauSiswa(hal);
          renderPeringatan(daftar[0].belum_final || 0);
          document.getElementById('btn-unduh').disabled = false;
          return;
        }
        throw new Error('Tidak ada siswa pada cakupan ini.');
      } else {
        // sekolah: ambil 1 siswa pertama dari laporan_siswa.
        const d = await panggil('laporan_siswa', {
          id_kegiatan: state.idKeg, hanya_final: opsi.hanya_final,
          tampilkan_peringkat: opsi.tampilkan_peringkat, tampilkan_pembanding: opsi.tampilkan_pembanding,
          tampilkan_logo: opsi.tampilkan_logo, tanggal_dokumen: opsi.tanggal_dokumen
        }, state.token);
        const daftar = d.daftar || [];
        if (daftar.length) {
          const hal = bangunSiswa(daftar[0], { ...opsi });
          wadah.innerHTML = renderPratinjauSiswa(hal);
          renderPeringatan(daftar[0].belum_final || 0);
          document.getElementById('btn-unduh').disabled = false;
          return;
        }
        throw new Error('Tidak ada siswa pada cakupan ini.');
      }
      if (!idSiswa) throw new Error('Tidak ada siswa pada cakupan ini.');
      const d = await panggil('laporan_siswa', {
        id_kegiatan: state.idKeg, id_siswa: [idSiswa], hanya_final: opsi.hanya_final,
        tampilkan_peringkat: opsi.tampilkan_peringkat, tampilkan_pembanding: opsi.tampilkan_pembanding,
        tampilkan_logo: opsi.tampilkan_logo, tanggal_dokumen: opsi.tanggal_dokumen
      }, state.token);
      const daftar = d.daftar || [];
      if (!daftar.length) throw new Error('Siswa tidak ditemukan.');
      const hal = bangunSiswa(daftar[0], { ...opsi });
      wadah.innerHTML = renderPratinjauSiswa(hal);
      renderPeringatan(daftar[0].belum_final || 0);
    }
    document.getElementById('btn-unduh').disabled = false;
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal pratinjau</h3><p>${escape(pesanGalat(err))}</p></div>`;
  }
  renderIkon();
}

/** Render peringatan belum_final & nilai kosong. */
function renderPeringatan(belumFinal, baris) {
  const wadah = document.getElementById('lap-peringatan');
  if (!wadah) return;
  const jmlKosong = baris ? baris.filter(b => !b.ada_nilai || !b.lengkap).length : 0;
  if (belumFinal > 0 || jmlKosong > 0) {
    const pesan = [];
    if (belumFinal > 0) pesan.push(`${belumFinal} penugasan belum final — nilai draft ${state.pref.hanya_final ? 'TIDAK dihitung' : 'ikut dihitung'}.`);
    if (jmlKosong > 0) pesan.push(`${jmlKosong} baris dengan nilai kosong/belum lengkap.`);
    wadah.innerHTML = `<div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
      <span>${escape(pesan.join(' '))}</span></div>`;
  } else {
    wadah.innerHTML = '';
  }
}

/** Render HTML pratinjau lembar (kelas/paralel). */
function renderPratinjauLembar(hal) {
  const kop = hal.kop;
  const slot = hal.header.kolom_slot;
  const head = hal.jenis === 'lembar_paralel'
    ? `<tr><th>No</th><th>Nama</th><th>Kelas</th>${slot.map(s => `<th>${escape(s.singkatan || s.kode)}</th>`).join('')}<th>Jml</th><th>Rata</th>${hal.opsi.tampilkan_peringkat ? '<th>Per. Paralel</th>' : ''}</tr>`
    : `<tr><th>No</th><th>Nama</th>${slot.map(s => `<th>${escape(s.singkatan || s.kode)}</th>`).join('')}<th>Jml</th><th>Rata</th>${hal.opsi.tampilkan_peringkat ? '<th>Per. Kelas</th><th>Per. Paralel</th>' : ''}<th>Ket</th></tr>`;
  const body = hal.baris.slice(0, 10).map(b => {
    const selNilai = b.nilai.map(np => {
      if (np.nilai === null) return '<td class="sel-nilai sel-nilai-kosong">–</td>';
      return `<td class="sel-nilai${np.di_bawah ? ' sel-di-bawah-kktp' : ''}">${escape(fmtNilai(np.nilai))}${np.varian_tag ? ' <span class="varian-tag">' + escape(np.varian_tag) + '</span>' : ''}</td>`;
    }).join('');
    let tail = '';
    if (hal.jenis === 'lembar_paralel') {
      tail = `<td>${escape(b.nama_kelas || '-')}</td>${selNilai}<td>${b.jumlah === null ? '–' : escape(fmtNilai(b.jumlah))}</td><td>${b.rata === null ? '–' : escape(fmtRata(b.rata))}</td>${hal.opsi.tampilkan_peringkat ? `<td>${b.pp === null ? '–' : escape(b.pp)}</td>` : ''}`;
      return `<tr><td>${b.no}</td><td>${escape(b.nama)}</td>${tail}</tr>`;
    }
    tail = `${selNilai}<td>${b.jumlah === null ? '–' : escape(fmtNilai(b.jumlah))}</td><td>${b.rata === null ? '–' : escape(fmtRata(b.rata))}</td>${hal.opsi.tampilkan_peringkat ? `<td>${b.pk === null ? '–' : escape(b.pk)}</td><td>${b.pp === null ? '–' : escape(b.pp)}</td>` : ''}<td>${!b.ada_nilai ? 'belum ada' : (!b.lengkap ? 'belum lengkap' : 'lengkap')}</td>`;
    return `<tr><td>${b.no}</td><td>${escape(b.nama)}</td>${tail}</tr>`;
  }).join('');
  const lebih = hal.baris.length > 10 ? `<div class="petunjuk" style="margin-top:.5rem">… dan ${hal.baris.length - 10} baris lainnya (lihat di file unduh).</div>` : '';
  return `<div class="kop-pratinjau-laporan">${renderKopHtml(kop)}</div>
    <div class="tabel-bungkus" style="max-height:55vh; margin-top:.75rem"><table class="tabel tabel-padat"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    ${lebih}`;
}

/** Render HTML pratinjau rekap. */
function renderPratinjauRekap(hal) {
  const blokHtml = (hal.blok || []).slice(0, 2).map(bt => {
    const rows = bt.slot.slice(0, 11).map(sl => `<tr>
      <td>${escape(sl.nama)}${sl.multi ? ' *' : ''}</td>
      <td class="angka">${sl.kktp || 0}</td>
      <td class="angka">${sl.terisi || 0}</td>
      <td class="angka">${escape(fmtRata(sl.rata))}</td>
      <td class="angka">${escape(fmtNilai(sl.tertinggi))}</td>
      <td class="angka">${escape(fmtNilai(sl.terendah))}</td>
      <td class="angka">${sl.tuntas || 0}/${sl.terisi || 0}</td>
    </tr>`).join('');
    return `<div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Tingkat ${escape(bt.tingkat)}</div>
      <div class="tabel-bungkus"><table class="tabel tabel-padat">
        <thead><tr><th>Mapel</th><th>KKTP</th><th>Terisi</th><th>Rata</th><th>Tinggi</th><th>Rendah</th><th>Tuntas</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }).join('');
  return `<div class="kop-pratinjau-laporan">${renderKopHtml(hal.kop)}</div>${blokHtml}`;
}

/** Render HTML pratinjau laporan siswa. */
function renderPratinjauSiswa(hal) {
  const idn = hal.identitas;
  const r = hal.ringkasan;
  const head = hal.ringkasan.tampilkan_pembanding
    ? '<tr><th>No</th><th>Mata Pelajaran</th><th>Nilai</th><th>KKTP</th><th>Ket</th><th>Rata Kelas</th><th>Rata Tingkat</th></tr>'
    : '<tr><th>No</th><th>Mata Pelajaran</th><th>Nilai</th><th>KKTP</th><th>Ket</th></tr>';
  const body = hal.slot.map((s, i) => `<tr>
    <td>${i + 1}</td>
    <td>${escape(s.nama_mapel)}</td>
    <td class="${s.di_bawah ? 'sel-di-bawah-kktp' : ''}">${escape(fmtNilai(s.nilai))}</td>
    <td>${s.kktp || 0}</td>
    <td>${escape(s.keterangan)}</td>
    ${hal.ringkasan.tampilkan_pembanding ? `<td>${escape(fmtRata(s.rata_kelas))}</td><td>${escape(fmtRata(s.rata_tingkat))}</td>` : ''}
  </tr>`).join('');
  const ringkasan = `<div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">
    <div class="stat-kartu"><div class="stat-angka">${r.jumlah === null ? '–' : escape(fmtNilai(r.jumlah))}</div><div class="stat-label">Jumlah</div></div>
    <div class="stat-kartu"><div class="stat-angka">${r.rata_rata === null ? '–' : escape(fmtRata(r.rata_rata))}</div><div class="stat-label">Rata-rata</div></div>
    <div class="stat-kartu stat-warn"><div class="stat-angka">${r.jumlah_belum_tuntas}</div><div class="stat-label">Belum Tuntas</div></div>
    <div class="stat-kartu"><div class="stat-angka">${r.jumlah_kosong}</div><div class="stat-label">Slot Kosong</div></div>
    ${r.tampilkan_peringkat ? `<div class="stat-kartu"><div class="stat-angka">${r.peringkat_kelas === null ? '–' : escape(r.peringkat_kelas)}</div><div class="stat-label">Per. Kelas</div></div>` : ''}
    ${r.tampilkan_peringkat ? `<div class="stat-kartu"><div class="stat-angka">${r.peringkat_paralel === null ? '–' : escape(r.peringkat_paralel)}</div><div class="stat-label">Per. Paralel</div></div>` : ''}
  </div>`;
  return `<div class="kop-pratinjau-laporan">${renderKopHtml(hal.kop)}</div>
    <div class="kartu" style="margin:1rem 0">
      <div class="kartu-title">Identitas</div>
      <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">
        <div class="stat-kartu"><div class="stat-label">Nama</div><div>${escape(idn.nama)}</div></div>
        <div class="stat-kartu"><div class="stat-label">NISN/NIS</div><div>${escape(idn.nisn || '-')} / ${escape(idn.nis || '-')}</div></div>
        <div class="stat-kartu"><div class="stat-label">Kelas</div><div>${escape(idn.kelas || '-')}</div></div>
        <div class="stat-kartu"><div class="stat-label">Semester</div><div>${escape(idn.semester || '-')}</div></div>
        <div class="stat-kartu"><div class="stat-label">Tahun Ajaran</div><div>${escape(idn.tahun_ajaran || '-')}</div></div>
      </div>
    </div>
    ${ringkasan}
    <div class="tabel-bungkus" style="margin-top:1rem"><table class="tabel tabel-padat"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

/** Render kop HTML untuk pratinjau. */
function renderKopHtml(kop) {
  const logo = kop.logo_datauri ? `<img class="kop-logo" src="${escape(kop.logo_datauri)}" alt="Logo" />` : '';
  const baris = (kop.baris || []).map((b, i) => {
    if (i === 0 && kop.baris.length > 1) return `<div class="kop-instansi">${escape(String(b).toUpperCase())}</div>`;
    if (i === 1) return `<h2 class="kop-sekolah">${escape(b)}</h2>`;
    return `<div class="kop-baris">${escape(b)}</div>`;
  }).join('');
  return `<div class="kop">${logo}<div class="kop-teks">${baris}
    ${kop.judul ? `<h3 style="margin:.5rem 0 .15rem; text-align:center; font-size:1.05rem">${escape(kop.judul)}</h3>` : ''}
    ${kop.sub ? `<div class="kop-baris" style="text-align:center">${escape(kop.sub)}</div>` : ''}
  </div></div>`;
}

// =========================== UNDUH ===========================

/** Unduh file sesuai jenis & opsi. */
async function unduh(jenis) {
  const btn = document.getElementById('btn-unduh');
  if (!btn) return;
  const opsi = kumpulkanOsi();
  const cakupan = kumpulkanCakupan(jenis);
  btn.disabled = true; btn.innerHTML = `${spin('Memproses...')}`;
  try {
    if (jenis === 'lembar_kelas') {
      await unduhLembarKelas(opsi, cakupan);
    } else if (jenis === 'lembar_paralel') {
      await unduhLembarParalel(opsi, cakupan);
    } else if (jenis === 'rekap') {
      await unduhRekap(opsi);
    } else if (jenis === 'laporan_siswa') {
      await unduhLaporanSiswa(opsi, cakupan);
    }
    toast('Unduh berhasil.', 'ok');
    // Catat unduh.
    try {
      await panggil('laporan_catat_unduh', {
        jenis, format: opsi.format, cakupan: cakupan.mode || 'sekolah', id_kegiatan: state.idKeg
      }, state.token);
    } catch (e) { /* abaikan */ }
  } catch (err) {
    toast('Gagal unduh: ' + pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="download"></i> Unduh`;
    renderIkon();
  }
}

/** Unduh lembar kelas. */
async function unduhLembarKelas(opsi, cakupan) {
  // Tentukan daftar id_kelas.
  let idKelasList = [];
  if (cakupan.mode === 'satu_kelas') idKelasList = [cakupan.id_kelas];
  else if (cakupan.mode === 'beberapa_kelas') idKelasList = cakupan.id_kelas_list || [];
  else if (cakupan.mode === 'satu_tingkat') {
    idKelasList = kelasByTingkatKegiatan().filter(k => Number(k.tingkat) === cakupan.tingkat).map(k => k.id_kelas);
  } else { // sekolah
    idKelasList = kelasByTingkatKegiatan().map(k => k.id_kelas);
  }
  if (!idKelasList.length) throw new Error('Tidak ada kelas pada cakupan ini.');
  const ekstensi = opsi.format === 'excel' ? 'xlsx' : 'pdf';
  const kelasObj = state.kelasList.find(k => k.id_kelas === idKelasList[0]);
  const cakupanLabel = cakupan.mode === 'satu_kelas' ? (kelasObj ? kelasObj.nama_kelas : 'KELAS')
    : cakupan.mode === 'beberapa_kelas' ? 'BEBERAPA-KELAS'
    : cakupan.mode === 'satu_tingkat' ? 'TINGKAT-' + cakupan.tingkat : 'SEKOLAH';
  const namaFile = namaFileLaporan({
    jenis: state.kegiatan.jenis || 'LAPORAN',
    laporan: 'LEMBAR_KELAS',
    cakupan: cakupanLabel,
    semester: state.kegiatan.semester || '1',
    tahunAjaran: ambilNamaTA(),
    ext: ekstensi
  });

  if (opsi.format === 'pdf') {
    // PDF multi-kelas: satu PDF dengan satu halaman per kelas (spec: "Satu kelas
    // per halaman (addPage)").
    if (idKelasList.length === 1) {
      const data = await panggil('lembar_kelas', {
        id_kegiatan: state.idKeg, id_kelas: idKelasList[0], hanya_final: opsi.hanya_final
      }, state.token);
      data.pengaturan = state.pengaturan;
      await pdfGen.unduhPdfLembarKelas(data, opsi, namaFile);
    } else {
      // Ambil data tiap kelas lalu gabung ke satu PDF.
      const daftarData = [];
      for (const idK of idKelasList) {
        const data = await panggil('lembar_kelas', {
          id_kegiatan: state.idKeg, id_kelas: idK, hanya_final: opsi.hanya_final
        }, state.token);
        data.pengaturan = state.pengaturan;
        daftarData.push(data);
      }
      await pdfGen.unduhPdfLembarKelasMulti(daftarData, opsi, namaFile);
    }
  } else {
    // Excel: jika 1 kelas → satu file; jika multi → satu workbook multi-sheet.
    if (idKelasList.length === 1) {
      const data = await panggil('lembar_kelas', {
        id_kegiatan: state.idKeg, id_kelas: idKelasList[0], hanya_final: opsi.hanya_final
      }, state.token);
      data.pengaturan = state.pengaturan;
      excelGen.unduhExcelLembarKelas(data, opsi, namaFile);
    } else {
      const daftarData = [];
      for (const idK of idKelasList) {
        const data = await panggil('lembar_kelas', {
          id_kegiatan: state.idKeg, id_kelas: idK, hanya_final: opsi.hanya_final
        }, state.token);
        data.pengaturan = state.pengaturan;
        daftarData.push(data);
      }
      excelGen.unduhExcelLembarKelasMulti(daftarData, opsi, namaFile);
    }
  }
}

/** Unduh lembar paralel. */
async function unduhLembarParalel(opsi, cakupan) {
  const tingkatList = cakupan.mode === 'satu_tingkat'
    ? [cakupan.tingkat]
    : (state.kegiatan.tingkat_peserta || []).map(Number);
  if (!tingkatList.length) throw new Error('Tidak ada tingkat peserta.');
  const ekstensi = opsi.format === 'excel' ? 'xlsx' : 'pdf';
  for (const t of tingkatList) {
    const data = await panggil('lembar_paralel', {
      id_kegiatan: state.idKeg, tingkat: Number(t), hanya_final: opsi.hanya_final
    }, state.token);
    data.pengaturan = state.pengaturan;
    const namaFile = namaFileLaporan({
      jenis: state.kegiatan.jenis || 'LAPORAN', laporan: 'LEMBAR_PARALEL',
      cakupan: 'TINGKAT-' + t, semester: state.kegiatan.semester || '1',
      tahunAjaran: ambilNamaTA(), ext: ekstensi
    });
    if (opsi.format === 'pdf') await pdfGen.unduhPdfParalel(data, opsi, namaFile);
    else excelGen.unduhExcelParalel(data, opsi, namaFile);
  }
}

/** Unduh rekap. */
async function unduhRekap(opsi) {
  const data = await panggil('rekap', {
    id_kegiatan: state.idKeg, hanya_final: opsi.hanya_final
  }, state.token);
  data.pengaturan = state.pengaturan;
  const ekstensi = opsi.format === 'excel' ? 'xlsx' : 'pdf';
  const namaFile = namaFileLaporan({
    jenis: state.kegiatan.jenis || 'LAPORAN', laporan: 'REKAP',
    cakupan: 'SEKOLAH', semester: state.kegiatan.semester || '1',
    tahunAjaran: ambilNamaTA(), ext: ekstensi
  });
  if (opsi.format === 'pdf') await pdfGen.unduhPdfRekap(data, opsi, namaFile);
  else excelGen.unduhExcelRekap(data, opsi, namaFile);
}

/** Unduh laporan hasil per siswa. */
async function unduhLaporanSiswa(opsi, cakupan) {
  const payload = {
    id_kegiatan: state.idKeg,
    hanya_final: opsi.hanya_final,
    tampilkan_peringkat: opsi.tampilkan_peringkat,
    tampilkan_pembanding: opsi.tampilkan_pembanding,
    tampilkan_logo: opsi.tampilkan_logo,
    tanggal_dokumen: opsi.tanggal_dokumen
  };
  if (cakupan.mode === 'siswa_terpilih') payload.id_siswa = cakupan.id_siswa;
  else if (cakupan.mode === 'satu_kelas') payload.id_kelas = cakupan.id_kelas;
  else if (cakupan.mode === 'satu_tingkat') payload.tingkat = cakupan.tingkat;
  // sekolah: tanpa filter.
  const data = await panggil('laporan_siswa', payload, state.token);
  const daftar = data.daftar || [];
  if (!daftar.length) throw new Error('Tidak ada siswa pada cakupan ini.');
  const ekstensi = opsi.format === 'excel' ? 'xlsx' : 'pdf';
  let cakupanLabel = 'SEKOLAH';
  if (cakupan.mode === 'satu_kelas') {
    const k = state.kelasList.find(x => x.id_kelas === cakupan.id_kelas);
    cakupanLabel = k ? bersihkanNamaBerkas(k.nama_kelas) : 'KELAS';
  } else if (cakupan.mode === 'satu_tingkat') cakupanLabel = 'TINGKAT-' + cakupan.tingkat;
  else if (cakupan.mode === 'siswa_terpilih') cakupanLabel = 'TERPILIH-' + daftar.length + 'SISWA';
  const namaFile = namaFileLaporan({
    jenis: state.kegiatan.jenis || 'LAPORAN', laporan: 'HASIL_SISWA',
    cakupan: cakupanLabel, semester: state.kegiatan.semester || '1',
    tahunAjaran: ambilNamaTA(), ext: ekstensi
  });
  if (opsi.format === 'pdf') await pdfGen.unduhPdfSiswa(daftar, opsi, namaFile);
  else excelGen.unduhExcelSiswa(daftar, opsi, namaFile);
}

// =========================== GRAFIK UNDUH (ADMIN/SPN) ===========================

/** Buka modal grafik dengan canvas + tombol unduh. */
async function bukaGrafikUnduh() {
  const main = document.getElementById('main');
  const konten = document.getElementById('lap-konten');
  if (!konten) return;
  hancurkanCharts();
  konten.innerHTML = spin('Memuat grafik...');
  let data;
  try {
    data = await panggil('laporan_grafik_tingkat', {
      id_kegiatan: state.idKeg, hanya_final: state.pref.hanya_final
    }, state.token);
  } catch (err) {
    konten.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat grafik</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  const perTingkat = data.per_tingkat || [];
  if (!perTingkat.length) {
    konten.innerHTML = `<div class="kosong"><i data-lucide="circle-slash"></i>
      <h3>Tidak ada data</h3><p>Tidak ada tingkat peserta pada kegiatan ini.</p></div>`;
    renderIkon();
    return;
  }
  // Render kartu per tingkat dengan canvas + tombol unduh.
  const kartuHtml = perTingkat.map(bt => `
    <div class="kartu" style="margin-bottom:1rem" data-tingkat="${escape(bt.tingkat)}">
      <div class="kartu-title" style="display:flex; justify-content:space-between; align-items:center">
        <span>Grafik Nilai — Tingkat ${escape(bt.tingkat)}</span>
        <div class="kelompok-aksi">
          <button class="btn btn-kecil btn-sekunder" data-grafik-png="${escape(bt.tingkat)}"><i data-lucide="image"></i> PNG</button>
          <button class="btn btn-kecil btn-sekunder" data-grafik-pdf="${escape(bt.tingkat)}"><i data-lucide="file-text"></i> PDF</button>
          <button class="btn btn-kecil btn-sekunder" data-grafik-excel="${escape(bt.tingkat)}"><i data-lucide="table"></i> Excel</button>
        </div>
      </div>
      <div class="chart-wadah" style="height:380px"><canvas id="grafik-canvas-${escape(bt.tingkat)}"></canvas></div>
    </div>`).join('');
  const tipeEditable = boleh(state.sesi.peran, 'standar_penilaian') && !waliMurni();
  konten.innerHTML = `
    <div class="toolbar" style="margin-bottom:1rem">
      <div class="kelompok-aksi">
        <button class="btn btn-kecil btn-sekunder" id="btn-grafik-pdf-semua"><i data-lucide="file-text"></i> PDF Semua Tingkat</button>
        <button class="btn btn-kecil btn-sekunder" id="btn-grafik-excel-semua"><i data-lucide="table"></i> Excel Semua Tingkat</button>
        ${tipeEditable ? `<button class="btn btn-kecil" id="btn-grafik-editable"><i data-lucide="edit-3"></i> Grafik Dapat Diedit</button>` : ''}
      </div>
    </div>
    <div class="banner banner-warn" style="margin-bottom:1rem"><i data-lucide="info"></i>
      <span>Grafik tipe gambar memakai palet cetak (hitam/abu) agar tetap terbaca saat dicetak B/W.</span>
    </div>
    ${kartuHtml}`;
  // Gambar tiap chart.
  perTingkat.forEach(bt => {
    gambarGrafikTingkat(bt);
  });
  // Listener tombol.
  konten.querySelectorAll('[data-grafik-png]').forEach(b => {
    b.addEventListener('click', () => unduhPngGrafik(b.dataset.grafikPng));
  });
  konten.querySelectorAll('[data-grafik-pdf]').forEach(b => {
    b.addEventListener('click', () => unduhPdfSatuGrafik(b.dataset.grafikPdf));
  });
  konten.querySelectorAll('[data-grafik-excel]').forEach(b => {
    b.addEventListener('click', () => unduhExcelSatuGrafik(b.dataset.grafikExcel));
  });
  document.getElementById('btn-grafik-pdf-semua')?.addEventListener('click', unduhPdfSemuaGrafik);
  document.getElementById('btn-grafik-excel-semua')?.addEventListener('click', unduhExcelSemuaGrafik);
  document.getElementById('btn-grafik-editable')?.addEventListener('click', unduhGrafikEditable);
  renderIkon();
}

/** Gambar satu chart untuk tingkat tertentu. */
function gambarGrafikTingkat(bt) {
  const cv = document.getElementById('grafik-canvas-' + bt.tingkat);
  if (!cv || !Chart) return;
  const labels = bt.slot_labels || [];
  const palet = paletCetak();
  // Daftarkan plugin label nilai sekali.
  daftarkanPluginNilaiLabel();
  const datasets = [
    { label: 'Tertinggi', data: bt.tertinggi || [], backgroundColor: palet[0], borderColor: palet[0], borderWidth: 1, borderRadius: 3 },
    { label: 'Rata-rata', data: bt.rata_rata || [], backgroundColor: palet[1], borderColor: palet[1], borderWidth: 1, borderRadius: 3 },
    { label: 'Terendah', data: bt.terendah || [], backgroundColor: palet[2], borderColor: palet[2], borderWidth: 1, borderRadius: 3 }
  ];
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#222', font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + (ctx.parsed.y ?? '–') } }
    },
    scales: {
      x: { ticks: { color: '#222', autoSkip: false, maxRotation: 45 }, grid: { color: '#eee' } },
      y: { ticks: { color: '#222' }, grid: { color: '#eee' }, beginAtZero: true, max: 100 }
    }
  };
  const c = new Chart(cv, { type: 'bar', data: { labels, datasets }, options: opts });
  state.charts.push(c);
}

/** Ambil chart instance untuk tingkat. */
function chartUntuk(tingkat) {
  // Cari berdasarkan canvas id.
  const cv = document.getElementById('grafik-canvas-' + tingkat);
  if (!cv) return null;
  return Chart ? Chart.getChart(cv) : null;
}

/** Unduh PNG satu grafik. */
function unduhPngGrafik(tingkat) {
  const c = chartUntuk(tingkat);
  if (!c) { toast('Grafik tidak ditemukan.', 'err'); return; }
  c.canvas.toBlob((blob) => {
    if (!blob) { toast('Gagal membuat PNG.', 'err'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Grafik_Tingkat_${tingkat}_${bersihkanNamaBerkas(state.kegiatan.nama)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('PNG terunduh.', 'ok');
  }, 'image/png');
}

/** Unduh PDF satu grafik. */
async function unduhPdfSatuGrafik(tingkat) {
  const c = chartUntuk(tingkat);
  if (!c) { toast('Grafik tidak ditemukan.', 'err'); return; }
  const kop = {
    judul: 'GRAFIK NILAI — TINGKAT ' + tingkat,
    sub: state.kegiatan.nama + ' · Semester ' + (state.kegiatan.semester || '-')
  };
  const namaFile = `Grafik_Tingkat_${tingkat}_${bersihkanNamaBerkas(state.kegiatan.nama)}.pdf`;
  await pdfGen.unduhPdfGrafik([{ canvas: c.canvas, judul: 'Tingkat ' + tingkat }], {
    kertas: state.pref.kertas, kop, nomor_halaman: true
  }, namaFile);
  toast('PDF terunduh.', 'ok');
}

/** Unduh PDF semua grafik tingkat. */
async function unduhPdfSemuaGrafik() {
  const list = state.charts.filter(c => c && c.canvas).map(c => {
    // Ambil tingkat dari id canvas.
    const id = c.canvas.id || '';
    const t = (id.match(/grafik-canvas-(\d+)/) || [])[1] || '';
    return { canvas: c.canvas, judul: 'Tingkat ' + t };
  });
  if (!list.length) { toast('Tidak ada grafik.', 'err'); return; }
  const kop = {
    judul: 'GRAFIK NILAI — ' + (state.kegiatan.nama || ''),
    sub: 'Semua Tingkat · Semester ' + (state.kegiatan.semester || '-')
  };
  const namaFile = `Grafik_Semua_Tingkat_${bersihkanNamaBerkas(state.kegiatan.nama)}.pdf`;
  await pdfGen.unduhPdfGrafik(list, {
    kertas: state.pref.kertas, kop, nomor_halaman: true
  }, namaFile);
  toast('PDF terunduh.', 'ok');
}

/** Unduh Excel satu grafik (tabel data). */
function unduhExcelSatuGrafik(tingkat) {
  const bt = (state.kegiatan && state.pref) && null; // placeholder
  // Cari data tingkat dari state.charts (data disimpan di chart).
  const c = chartUntuk(tingkat);
  if (!c) { toast('Grafik tidak ditemukan.', 'err'); return; }
  const grafik = {
    judul: 'Tingkat ' + tingkat,
    labels: c.data.labels || [],
    datasets: c.data.datasets.map(ds => ({ label: ds.label, data: ds.data }))
  };
  const namaFile = `Grafik_Tingkat_${tingkat}_${bersihkanNamaBerkas(state.kegiatan.nama)}.xlsx`;
  excelGen.unduhExcelGrafikSisipan([grafik], {}, namaFile);
  toast('Excel terunduh.', 'ok');
}

/** Unduh Excel semua grafik. */
function unduhExcelSemuaGrafik() {
  const list = state.charts.filter(c => c && c.canvas).map(c => {
    const id = c.canvas.id || '';
    const t = (id.match(/grafik-canvas-(\d+)/) || [])[1] || '';
    return {
      judul: 'Tingkat ' + t,
      labels: c.data.labels || [],
      datasets: c.data.datasets.map(ds => ({ label: ds.label, data: ds.data }))
    };
  });
  if (!list.length) { toast('Tidak ada grafik.', 'err'); return; }
  const namaFile = `Grafik_Semua_Tingkat_${bersihkanNamaBerkas(state.kegiatan.nama)}.xlsx`;
  excelGen.unduhExcelGrafikSisipan(list, {}, namaFile);
  toast('Excel terunduh.', 'ok');
}

/** Unduh grafik dapat diedit (Google Sheets export). */
async function unduhGrafikEditable() {
  const btn = document.getElementById('btn-grafik-editable');
  if (!btn) return;
  btn.disabled = true; btn.innerHTML = `${spin('Memroses di server...')}`;
  try {
    const res = await panggil('grafik_editable', {
      id_kegiatan: state.idKeg, hanya_final: state.pref.hanya_final
    }, state.token);
    if (res && res.url) {
      const a = document.createElement('a');
      a.href = res.url;
      a.download = res.nama_file || `Grafik_Editable_${bersihkanNamaBerkas(state.kegiatan.nama)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      toast('Grafik dapat diedit terunduh.', 'ok');
      // Catat unduh.
      try {
        await panggil('laporan_catat_unduh', {
          jenis: 'grafik_editable', format: 'xlsx', cakupan: 'sekolah', id_kegiatan: state.idKeg
        }, state.token);
      } catch (e) { /* abaikan */ }
    } else {
      throw new Error('Respons server tidak berisi URL berkas.');
    }
  } catch (err) {
    // Tawarkan tipe gambar sebagai cadangan.
    const msg = pesanGalat(err);
    toast('Grafik dapat diedit gagal: ' + msg, 'err');
    const lanjut = confirm('Grafik dapat diedit gagal dibuat di server.\n\nPesan: ' + msg + '\n\nApakah Anda ingin mengunduh sebagai tipe gambar (PDF semua tingkat) sebagai gantinya?');
    if (lanjut) await unduhPdfSemuaGrafik();
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="edit-3"></i> Grafik Dapat Diedit`;
    renderIkon();
  }
}

// =========================== GRAFIK WEB KEPSEK ===========================

/** Render grafik web langsung di konten (kepsek murni, tanpa unduh). */
async function renderGrafikWebDiKonten() {
  const konten = document.getElementById('lap-konten');
  if (!konten) return;
  hancurkanCharts();
  konten.innerHTML = spin('Memuat grafik...');
  let data;
  try {
    data = await panggil('laporan_grafik_tingkat', {
      id_kegiatan: state.idKeg, hanya_final: state.pref.hanya_final
    }, state.token);
  } catch (err) {
    konten.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  const perTingkat = data.per_tingkat || [];
  if (!perTingkat.length) {
    konten.innerHTML = `<div class="kosong"><i data-lucide="circle-slash"></i><h3>Tidak ada data</h3></div>`;
    renderIkon();
    return;
  }
  const kartuHtml = perTingkat.map(bt => `
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Grafik Nilai — Tingkat ${escape(bt.tingkat)}</div>
      <div class="chart-wadah" style="height:380px"><canvas id="grafik-canvas-${escape(bt.tingkat)}"></canvas></div>
    </div>`).join('');
  konten.innerHTML = `<div class="banner banner-warn" style="margin-bottom:1rem"><i data-lucide="info"></i>
    <span>Anda masuk sebagai kepala sekolah. Tampilan ini hanya untuk tinjauan; unduh diaktifkan untuk admin & standar penilaian.</span>
  </div>${kartuHtml}`;
  perTingkat.forEach(bt => gambarGrafikTingkat(bt));
  renderIkon();
}

// =========================== LIHAT SEBAGAI SISWA ===========================

/** Buka modal "lihat sebagai siswa" (admin/spn only). */
async function bukaLihatSebagaiSiswa() {
  // Pakai modal yang sama; ganti isinya.
  const isi = document.getElementById('lap-modal-isi');
  if (!isi) return;
  // Form pilih kelas & siswa.
  try {
    await muatKelasList();
  } catch (err) {
    isi.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat kelas</h3><p>${escape(pesanGalat(err))}</p></div>`;
    modalBuka(state.modalId);
    renderIkon();
    return;
  }
  const kelasByTingkat = kelasByTingkatKegiatan();
  const opts = kelasByTingkat.map(k => `<option value="${escape(k.id_kelas)}">${escape(k.nama_kelas)}</option>`).join('');
  // Opsi publikasi default mengikuti kegiatan.
  const kg = state.kegiatan;
  isi.innerHTML = `
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Pilih Siswa</div>
      <div class="toolbar" style="margin-bottom:0">
        <div class="tumbal">
          <label class="label" for="lihat-kelas">Kelas</label>
          <select class="select" id="lihat-kelas">${opts}</select>
        </div>
        <div class="tumbal">
          <label class="label" for="lihat-siswa">Siswa</label>
          <select class="select" id="lihat-siswa"><option value="">— pilih kelas dahulu —</option></select>
        </div>
      </div>
    </div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Opsi Tampilan Publik</div>
      <div class="cek-kotak-grid">
        <label class="cek-kotak"><input type="checkbox" id="lihat-peringkat" ${kg.tampil_peringkat_siswa ? 'checked' : ''} /><span>Tampilkan peringkat</span></label>
        <label class="cek-kotak"><input type="checkbox" id="lihat-pembanding" ${kg.tampil_pembanding_siswa ? 'checked' : ''} /><span>Tampilkan rata kelas/tingkat</span></label>
        <label class="cek-kotak"><input type="checkbox" id="lihat-logo" checked /><span>Tampilkan logo</span></label>
      </div>
    </div>
    <div id="lihat-hasil"></div>
    <div class="kelompok-aksi" style="display:flex; gap:.6rem; justify-content:flex-end; margin-top:1rem">
      <button class="btn btn-sekunder" data-modal-tutup="${state.modalId}">Tutup</button>
      <button class="btn" id="btn-lihat"><i data-lucide="eye"></i> Lihat</button>
    </div>`;
  modalBuka(state.modalId);
  renderIkon();
  // Listener.
  document.getElementById('lihat-kelas')?.addEventListener('change', async (e) => {
    const idKelas = e.target.value;
    const siswaSel = document.getElementById('lihat-siswa');
    if (!siswaSel) return;
    siswaSel.innerHTML = '<option value="">— memuat... —</option>';
    try {
      const d = await panggil('siswa_daftar', { id_kelas: idKelas }, state.token);
      const list = d.siswa || [];
      siswaSel.innerHTML = list.length
        ? list.map(s => `<option value="${escape(s.id_siswa)}">${escape(s.nama)}${s.nisn ? ' · ' + escape(s.nisn) : ''}</option>`).join('')
        : '<option value="">— tidak ada siswa —</option>';
    } catch (err) {
      siswaSel.innerHTML = `<option value="">— gagal: ${escape(pesanGalat(err))} —</option>`;
    }
  });
  // Memicu change sekali agar siswa terisi.
  document.getElementById('lihat-kelas')?.dispatchEvent(new Event('change'));
  document.getElementById('btn-lihat')?.addEventListener('click', async () => {
    const idSiswa = document.getElementById('lihat-siswa').value;
    if (!idSiswa) { toast('Pilih siswa dahulu.', 'warn'); return; }
    const opsi = {
      tampilkan_peringkat: document.getElementById('lihat-peringkat').checked,
      tampilkan_pembanding: document.getElementById('lihat-pembanding').checked,
      tampilkan_logo: document.getElementById('lihat-logo').checked,
      tanggal_dokumen: kg.tanggal_dokumen || '',
      format: 'pdf',
      hanya_final: state.pref.hanya_final
    };
    const wadah = document.getElementById('lihat-hasil');
    if (!wadah) return;
    wadah.innerHTML = spin('Memuat laporan siswa...');
    try {
      const d = await panggil('laporan_siswa', {
        id_kegiatan: state.idKeg, id_siswa: [idSiswa],
        hanya_final: opsi.hanya_final,
        tampilkan_peringkat: opsi.tampilkan_peringkat,
        tampilkan_pembanding: opsi.tampilkan_pembanding,
        tampilkan_logo: opsi.tampilkan_logo,
        tanggal_dokumen: opsi.tanggal_dokumen
      }, state.token);
      const daftar = d.daftar || [];
      if (!daftar.length || !daftar[0].ada) {
        wadah.innerHTML = `<div class="kosong"><i data-lucide="circle-slash"></i><h3>Tidak ada laporan</h3>
          <p>Siswa ini tidak terdaftar pada kegiatan.</p></div>`;
        renderIkon();
        return;
      }
      const hal = bangunSiswa(daftar[0], opsi);
      wadah.innerHTML = renderPratinjauSiswa(hal);
      renderIkon();
    } catch (err) {
      wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal</h3><p>${escape(pesanGalat(err))}</p></div>`;
      renderIkon();
    }
  });
}

// =========================== INTERNAL ===========================

/** Hancurkan semua chart aktif. */
function hancurkanCharts() {
  state.charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  state.charts = [];
}

/** Ambil nama tahun ajaran aktif (dari kegiatan.id_ta — tidak selalu ada nama; fallback '-'). */
function ambilNamaTA() {
  // Saat ini kegiatan.id_ta tidak punya nama di model frontend; gunakan '-'
  // agar nama berkas tetap valid. Jika di masa depan ditambahkan, ganti di sini.
  return (state.kegiatan && state.kegiatan._nama_ta) || '-';
}

/** Bersihkan karakter tidak valid untuk nama berkas. */
function bersihkanNamaBerkas(s) {
  return String(s == null ? '' : s).replace(/[\\/]/g, '-').replace(/[\\?\*\[\]:]/g, '_').trim();
}
