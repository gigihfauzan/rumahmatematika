// kegiatan.js — Halaman Kegiatan Penilaian (Tahap 3A).
// Daftar kegiatan per tahun ajaran, tambah/edit, ubah status (draft/dibuka/dikunci/diarsipkan),
// duplikat, kelola peserta (taut), dan atur KKTP (sekolah / per mapel).
// Hak: standar_penilaian & admin mengelola; guru & kepsek lihat saja (read-only).
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import {
  renderModal, modalBuka, modalTutup, chip,
  pasangModalTutupGlobal
} from '../komponen.js';
import { navigasi } from '../router.js';

// Pasang listener global tombol [data-modal-tutup] sekali saat modul dimuat.
pasangModalTutupGlobal();

const SEMESTER = [1, 2];
const TINGKAT_PILIHAN = [7, 8, 9];
const STATUS_KEGIATAN = ['draft', 'dibuka', 'dikunci', 'diarsipkan'];

// State halaman.
const state = {
  sesi: null,
  token: null,
  bolehKelola: false,        // admin / standar_penilaian
  taDaftar: [],              // hasil ta_daftar
  idTa: null,                // TA yang sedang dipilih
  kegiatan: [],              // hasil kegiatan_daftar (TA terpilih)
  jenisList: [],             // daftar jenis bawaan dari pengaturan
  kegiatanEdit: null,        // kegiatan yang sedang diedit (null = tambah)
  kegiatanStatus: null,      // kegiatan yang akan diubah statusnya
  kegiatanKktp: null,        // kegiatan yang kktp-nya sedang dibuka/diedit
  slotMapelForm: [],         // slot mapel gabungan per tingkat untuk form (mode mapel)
  slotMapelKktp: [],         // slot mapel untuk modal KKTP
  kktpMapelLoaded: [],       // hasil kegiatan_kktp_ambil (mode + kktp_mapel)
  modeKktpForm: 'sekolah'    // mode sementara di form
};

// =========================== UTIL ===========================

/** ISO yyyy-MM-dd → dd/mm/yyyy (ramah dibaca). */
function formatTanggal(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** Ambil bagian yyyy-MM-dd dari ISO untuk nilai input[type=date]. */
function tanggalInputValue(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Debounce input. */
function debung(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Warna chip status kegiatan. */
function chipStatus(status) {
  if (status === 'dibuka') return chip('Dibuka', 'ok');
  if (status === 'dikunci') return chip('Dikunci', 'warn');
  if (status === 'diarsipkan') return chip('Diarsipkan', 'netral');
  return chip('Draft', 'netral');
}

/** Render ringkas daftar tingkat peserta: [7,8] → "Tingkat 7, 8". */
function ringkasTingkat(arr) {
  const a = (arr || []).map(Number).filter(n => TINGKAT_PILIHAN.includes(n));
  if (!a.length) return '<span style="color:var(--teks-ringan)">—</span>';
  return 'Tingkat ' + a.join(', ');
}

/** Susun sugesti nama default "{jenis} Semester {sem} {ta.nama}". */
function sugestiNama(jenis, semester, idTa) {
  const ta = state.taDaftar.find(t => t.id_ta === idTa);
  const j = jenis && jenis !== '__lainnya__' ? jenis : '';
  const sem = semester || 1;
  const namaTa = ta ? ta.nama : '';
  return `${j} Semester ${sem} ${namaTa}`.trim();
}

// =========================== ENTRY ===========================

export async function renderKegiatan(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.bolehKelola = boleh(sesi.peran, 'standar_penilaian');
  state.kegiatanEdit = null;
  state.kegiatanStatus = null;
  state.kegiatanKktp = null;
  state.slotMapelForm = [];
  state.slotMapelKktp = [];
  state.kktpMapelLoaded = [];
  state.modeKktpForm = 'sekolah';

  document.getElementById('topbar-judul').textContent = 'Kegiatan Penilaian';
  const main = document.getElementById('main');
  main.innerHTML = spin('Memuat tahun ajaran...');

  // Ambil daftar TA (untuk pilihan filter & sugesti nama).
  try {
    const ta = await panggil('ta_daftar', {}, state.token);
    state.taDaftar = ta.ta || [];
    state.idTa = (ta.aktif && ta.aktif.id_ta) || (state.taDaftar[0] && state.taDaftar[0].id_ta) || null;
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat</h3>
      <p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
    return;
  }

  if (!state.idTa) {
    main.innerHTML = `
      <h1 class="page-judul">Kegiatan Penilaian</h1>
      <div class="kosong"><i data-lucide="calendar-x"></i><h3>Belum ada tahun ajaran</h3>
        <p>Tambah tahun ajaran dahulu di menu Administrasi.</p></div>`;
    renderIkon();
    return;
  }

  await muatDaftar();
}

// =========================== MUAT DAFTAR ===========================

async function muatDaftar() {
  const main = document.getElementById('main');
  main.innerHTML = spin('Memuat kegiatan...');
  try {
    const d = await panggil('kegiatan_daftar', { id_ta: state.idTa }, state.token);
    state.kegiatan = d.kegiatan || [];
    state.jenisList = d.jenis || [];
    // Bisa kelola ditentukan server (bisa_kelola) namun juga dicek klien.
    if (d.bisa_kelola === false) state.bolehKelola = false;
  } catch (err) {
    state.kegiatan = [];
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat</h3>
      <p>${escape(pesanGalat(err))}</p></div>`;
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
  const tombolTambah = state.bolehKelola
    ? `<button class="btn btn-kecil" id="btn-tambah"><i data-lucide="plus"></i> Tambah Kegiatan</button>`
    : '';

  main.innerHTML = `
    <h1 class="page-judul">Kegiatan Penilaian</h1>
    <div class="toolbar">
      <div class="tumbal">
        <label class="label" for="flt-ta">Tahun Ajaran</label>
        <select class="select" id="flt-ta">
          ${state.taDaftar.map(t =>
            `<option value="${escape(t.id_ta)}"${t.id_ta === state.idTa ? ' selected' : ''}>${escape(t.nama)}${t.aktif ? ' (aktif)' : ''}</option>`
          ).join('')}
        </select>
      </div>
      <div class="tumbal">
        <label class="label" for="flt-status">Status</label>
        <select class="select" id="flt-status">
          <option value="">Semua</option>
          ${STATUS_KEGIATAN.map(s => `<option value="${escape(s)}">${escape(s)}</option>`).join('')}
        </select>
      </div>
      <div class="tumbal">
        <label class="label" for="flt-q">Cari</label>
        <input class="input" id="flt-q" placeholder="Nama / jenis kegiatan" autocomplete="off" />
      </div>
      <div class="kelompok-aksi">${tombolTambah}</div>
    </div>
    <div id="kegiatan-list"></div>

    <!-- Modal Form Tambah/Edit Kegiatan -->
    ${renderModal('modal-kegiatan', 'Kegiatan', `
      <form id="form-kegiatan" autocomplete="off">
        <input type="hidden" id="k-id" />
        <div class="field-row">
          <div class="field">
            <label class="label" for="k-jenis">Jenis</label>
            <select class="select" id="k-jenis">
              ${state.jenisList.map(j => `<option value="${escape(j)}">${escape(j)}</option>`).join('')}
              <option value="__lainnya__">— Lainnya —</option>
            </select>
            <div class="petunjuk">Pilih jenis yang sudah tersedia atau ketik jenis baru.</div>
          </div>
          <div class="field" id="k-jenis-lain-field" style="display:none">
            <label class="label" for="k-jenis-lain">Jenis Baru</label>
            <input class="input" id="k-jenis-lain" placeholder="mis. PTS, PAT, Try Out" />
          </div>
          <div class="field">
            <label class="label" for="k-semester">Semester</label>
            <select class="select" id="k-semester">
              ${SEMESTER.map(s => `<option value="${s}">Semester ${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label class="label" for="k-nama">Nama Kegiatan</label>
          <input class="input" id="k-nama" placeholder="Kosongkan untuk dibuat otomatis" />
          <div class="petunjuk" id="k-nama-saran"></div>
        </div>
        <div class="field">
          <label class="label">Tingkat Peserta</label>
          <div style="display:flex; gap:1rem; flex-wrap:wrap">
            ${TINGKAT_PILIHAN.map(t =>
              `<label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
                <input type="checkbox" class="k-tingkat" value="${t}" /> Tingkat ${t}</label>`
            ).join('')}
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label class="label" for="k-buka">Tanggal Buka Input</label>
            <input class="input" id="k-buka" type="date" /></div>
          <div class="field"><label class="label" for="k-tutup">Tanggal Tutup Input</label>
            <input class="input" id="k-tutup" type="date" /></div>
          <div class="field"><label class="label" for="k-dokumen">Tanggal Dokumen</label>
            <input class="input" id="k-dokumen" type="date" />
            <div class="petunjuk">Tanggal acuan cetak daftar/legkap nilai.</div></div>
        </div>
        <div class="kartu" style="background:var(--permukaan-2); margin-bottom:1rem">
          <div class="kartu-title">KKTP (Kriteria Ketuntasan)</div>
          <div class="field">
            <label class="label">Mode KKTP</label>
            <div style="display:flex; gap:1rem; flex-wrap:wrap">
              <label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
                <input type="radio" name="k-mode-kktp" value="sekolah" checked /> Sekolah (seragam)</label>
              <label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
                <input type="radio" name="k-mode-kktp" value="mapel" /> Per Mapel</label>
            </div>
          </div>
          <div class="field" id="k-kktp-sekolah-field">
            <label class="label" for="k-kktp-sekolah">KKTP Sekolah</label>
            <input class="input" id="k-kktp-sekolah" type="number" min="0" max="100" value="75" style="max-width:140px" />
            <div class="petunjuk">Nilai ambang seragam untuk semua mapel.</div>
          </div>
          <div id="k-kktp-mapel-bungkus" style="display:none">
            <div class="petunjuk" style="margin-bottom:.5rem">Pilih tingkat peserta untuk memuat slot mapel.</div>
            <div id="k-kktp-mapel-tabel"></div>
          </div>
        </div>
        <div class="kartu" style="background:var(--permukaan-2); margin-bottom:1rem">
          <div class="kartu-title">Publikasi Hasil</div>
          <div class="field">
            <label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
              <input type="checkbox" id="k-publikasi" /> Dipublikasikan ke siswa</label>
          </div>
          <div class="field-row" id="k-publikasi-tgl-bungkus" style="display:none">
            <div class="field"><label class="label" for="k-publikasi-buka">Publikasi Buka</label>
              <input class="input" id="k-publikasi-buka" type="date" /></div>
            <div class="field"><label class="label" for="k-publikasi-tutup">Publikasi Tutup</label>
              <input class="input" id="k-publikasi-tutup" type="date" /></div>
          </div>
          <div class="field" id="k-publikasi-tampil-bungkus" style="display:none">
            <label class="label">Tampilan Publikasi</label>
            <div style="display:flex; gap:1rem; flex-wrap:wrap">
              <label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
                <input type="checkbox" id="k-tampil-peringkat" /> Tampilkan peringkat siswa</label>
              <label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
                <input type="checkbox" id="k-tampil-pembanding" /> Tampilkan nilai pembanding</label>
            </div>
          </div>
        </div>
        <div id="k-galat" class="galat-field"></div>
      </form>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-kegiatan">Batal</button>
      <button class="btn" id="btn-simpan-kegiatan"><i data-lucide="save"></i> Simpan</button>
    `, true)}

    <!-- Modal Ubah Status -->
    ${renderModal('modal-status', 'Ubah Status Kegiatan', `
      <p style="margin:0 0 .75rem">Kegiatan: <strong id="status-nama"></strong></p>
      <p style="margin:0 0 .75rem; font-size:.85rem; color:var(--teks-ringan)">
        Status saat ini: <span id="status-saat-ini"></span></p>
      <div style="display:flex; gap:.6rem; flex-wrap:wrap; margin-bottom:.75rem">
        <button class="btn btn-sekunder btn-kecil" data-status-tgt="draft"><i data-lucide="file-edit"></i> Draft</button>
        <button class="btn btn-sekunder btn-kecil" data-status-tgt="dibuka"><i data-lucide="unlock"></i> Buka</button>
        <button class="btn btn-sekunder btn-kecil" data-status-tgt="dikunci"><i data-lucide="lock"></i> Kunci</button>
        <button class="btn btn-sekunder btn-kecil" data-status-tgt="diarsipkan"><i data-lucide="archive"></i> Arsipkan</button>
      </div>
      <div class="field">
        <label class="label" for="status-alasan">Alasan (opsional)</label>
        <textarea class="textarea" id="status-alasan" placeholder="Catatan transisi (wajib saat membuka kembali dari status dikunci)"></textarea>
        <div class="petunjuk">Alasan wajib diisi untuk transisi <strong>dikunci → dibuka</strong>.</div>
      </div>
      <div id="status-galat" class="galat-field"></div>
    `, `<button class="btn btn-sekunder" data-modal-tutup="modal-status">Tutup</button>`)}

    <!-- Modal KKTP -->
    ${renderModal('modal-kktp', 'Atur KKTP Kegiatan', `
      <p style="margin:0 0 .75rem">Kegiatan: <strong id="kktp-nama"></strong></p>
      <div class="field">
        <label class="label">Mode KKTP</label>
        <div style="display:flex; gap:1rem; flex-wrap:wrap">
          <label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
            <input type="radio" name="kktp-mode" value="sekolah" checked /> Sekolah (seragam)</label>
          <label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
            <input type="radio" name="kktp-mode" value="mapel" /> Per Mapel</label>
        </div>
      </div>
      <div class="field" id="kktp-sekolah-field">
        <label class="label" for="kktp-sekolah">KKTP Sekolah</label>
        <input class="input" id="kktp-sekolah" type="number" min="0" max="100" value="75" style="max-width:140px" />
      </div>
      <div id="kktp-mapel-bungkus" style="display:none">
        <div class="petunjuk" style="margin-bottom:.5rem">Ambang per slot mapel. Kosongkan untuk memakai KKTP sekolah.</div>
        <div id="kktp-mapel-tabel"></div>
      </div>
      <div id="kktp-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-kktp">Batal</button>
      <button class="btn" id="btn-simpan-kktp"><i data-lucide="save"></i> Simpan KKTP</button>
    `, true)}

    <!-- Modal Duplikat -->
    ${renderModal('modal-duplikat', 'Duplikat Kegiatan', `
      <p style="margin:0 0 .75rem">Salin kegiatan <strong id="dup-nama"></strong> ke tahun ajaran lain?</p>
      <div class="field">
        <label class="label" for="dup-ta-tujuan">Tahun Ajaran Tujuan</label>
        <select class="select" id="dup-ta-tujuan">
          ${state.taDaftar.map(t =>
            `<option value="${escape(t.id_ta)}">${escape(t.nama)}${t.aktif ? ' (aktif)' : ''}</option>`
          ).join('')}
        </select>
        <div class="petunjuk">Salinan berstatus <em>draft</em>; publikasi direset.</div>
      </div>
      <div id="dup-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-duplikat">Batal</button>
      <button class="btn" id="btn-jalankan-duplikat"><i data-lucide="copy"></i> Salin</button>
    `)}
  `;
}

// =========================== RENDER ISI (DAFTAR KARTU) ===========================

function renderIsi() {
  const wadah = document.getElementById('kegiatan-list');
  if (!wadah) return;
  const q = (document.getElementById('flt-q')?.value || '').trim().toLowerCase();
  const statusFlt = document.getElementById('flt-status')?.value || '';

  const fil = state.kegiatan.filter(k => {
    if (statusFlt && k.status !== statusFlt) return false;
    if (q) {
      const teks = (k.nama + ' ' + k.jenis + ' ' + (k.semester || '')).toLowerCase();
      if (!teks.includes(q)) return false;
    }
    return true;
  });

  if (!fil.length) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="calendar-days"></i>
      <h3>Belum ada kegiatan</h3>
      <p>${state.bolehKelola ? 'Klik “Tambah Kegiatan” untuk membuat.' : 'Belum ada kegiatan pada tahun ajaran ini.'}</p></div>`;
    renderIkon();
    return;
  }

  wadah.innerHTML = `<div class="beranda-grid">${fil.map(kartuKegiatan).join('')}</div>`;
  renderIkon();
}

/** Kartu tunggal kegiatan. */
function kartuKegiatan(k) {
  const jadwal = (k.tanggal_buka || k.tanggal_tutup)
    ? `${formatTanggal(k.tanggal_buka)} – ${formatTanggal(k.tanggal_tutup)}`
    : '<span style="color:var(--teks-ringan)">Jadwal belum diatur</span>';
  const taNama = (state.taDaftar.find(t => t.id_ta === k.id_ta) || {}).nama || k.id_ta;

  const aksi = state.bolehKelola ? `
    <div class="badge-kedepan" style="display:flex; gap:.4rem; flex-wrap:wrap; border-top:1px dashed var(--border); padding-top:.6rem">
      <button class="btn btn-kecil btn-sekunder" data-edit="${escape(k.id_kegiatan)}"><i data-lucide="pencil"></i> Edit</button>
      <button class="btn btn-kecil btn-sekunder" data-status="${escape(k.id_kegiatan)}"><i data-lucide="flag"></i> Status</button>
      <button class="btn btn-kecil btn-sekunder" data-kktp="${escape(k.id_kegiatan)}"><i data-lucide="sliders-horizontal"></i> KKTP</button>
      <button class="btn btn-kecil btn-sekunder" data-duplikat="${escape(k.id_kegiatan)}"><i data-lucide="copy"></i> Duplikat</button>
      <button class="btn btn-kecil" data-peserta="${escape(k.id_kegiatan)}"><i data-lucide="users"></i> Peserta</button>
    </div>` : '';

  return `<div class="beranda-kartu">
    <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap">
      ${chipStatus(k.status)}
      ${chip(escape(k.jenis || '-'), 'info')}
      ${chip('Semester ' + escape(k.semester || '-'), 'netral')}
    </div>
    <h3>${escape(k.nama || '(tanpa nama)')}</h3>
    <p>${ringkasTingkat(k.tingkat_peserta)}</p>
    <p style="margin:0">Jadwal input: ${jadwal}</p>
    <p style="margin:0; font-size:.78rem; color:var(--teks-ringan)">TA: ${escape(taNama)}</p>
    ${aksi}
  </div>`;
}

// =========================== LISTENER ===========================

function pasangListener() {
  // Pilih TA.
  document.getElementById('flt-ta')?.addEventListener('change', (e) => {
    state.idTa = e.target.value;
    muatDaftar();
  });

  // Filter status & cari.
  document.getElementById('flt-status')?.addEventListener('change', renderIsi);
  const q = document.getElementById('flt-q');
  if (q) q.addEventListener('input', debung(renderIsi, 250));

  // Tambah kegiatan.
  document.getElementById('btn-tambah')?.addEventListener('click', () => bukaForm(null));

  // Delegasi klik pada daftar kartu.
  document.getElementById('kegiatan-list')?.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    const st = e.target.closest('[data-status]');
    const kk = e.target.closest('[data-kktp]');
    const du = e.target.closest('[data-duplikat]');
    const pe = e.target.closest('[data-peserta]');
    if (ed) {
      const k = state.kegiatan.find(x => x.id_kegiatan === ed.dataset.edit);
      if (k) bukaForm(k);
    } else if (st) {
      const k = state.kegiatan.find(x => x.id_kegiatan === st.dataset.status);
      if (k) bukaStatus(k);
    } else if (kk) {
      const k = state.kegiatan.find(x => x.id_kegiatan === kk.dataset.kktp);
      if (k) bukaKktp(k);
    } else if (du) {
      const k = state.kegiatan.find(x => x.id_kegiatan === du.dataset.duplikat);
      if (k) bukaDuplikat(k);
    } else if (pe) {
      navigasi('#/peserta/' + encodeURIComponent(pe.dataset.peserta));
    }
  });

  // Simpan kegiatan.
  document.getElementById('btn-simpan-kegiatan')?.addEventListener('click', simpanKegiatan);

  // Form: jenis lainnya toggle.
  document.getElementById('k-jenis')?.addEventListener('change', (e) => {
    const lain = e.target.value === '__lainnya__';
    document.getElementById('k-jenis-lain-field').style.display = lain ? '' : 'none';
    perbaruiSaranNama();
  });
  document.getElementById('k-jenis-lain')?.addEventListener('input', perbaruiSaranNama);
  document.getElementById('k-semester')?.addEventListener('change', perbaruiSaranNama);

  // Form: tingkat peserta → muat ulang tabel KKTP per mapel bila mode mapel.
  document.querySelectorAll('.k-tingkat').forEach(cb =>
    cb.addEventListener('change', () => muatSlotForm()));

  // Form: mode kktp radio.
  document.querySelectorAll('input[name="k-mode-kktp"]').forEach(r =>
    r.addEventListener('change', () => {
      state.modeKktpForm = document.querySelector('input[name="k-mode-kktp"]:checked').value;
      toggleFormModeKktp();
    }));

  // Form: publikasi checkbox.
  document.getElementById('k-publikasi')?.addEventListener('change', (e) => {
    const on = e.target.checked;
    document.getElementById('k-publikasi-tgl-bungkus').style.display = on ? '' : 'none';
    document.getElementById('k-publikasi-tampil-bungkus').style.display = on ? '' : 'none';
  });

  // Modal status: klik tombol target.
  document.querySelectorAll('[data-status-tgt]').forEach(b =>
    b.addEventListener('click', () => ubahStatus(b.dataset.statusTgt)));

  // Modal KKTP: ganti mode.
  document.querySelectorAll('input[name="kktp-mode"]').forEach(r =>
    r.addEventListener('change', toggleModalKktpMode));
  document.getElementById('btn-simpan-kktp')?.addEventListener('click', simpanKktp);

  // Modal duplikat.
  document.getElementById('btn-jalankan-duplikat')?.addEventListener('click', jalankanDuplikat);
}

// =========================== FORM TAMBAH/EDIT ===========================

function bukaForm(k) {
  state.kegiatanEdit = k || null;
  state.modeKktpForm = k?.mode_kktp === 'mapel' ? 'mapel' : 'sekolah';
  state.slotMapelForm = [];
  // Reset cache KKTP agar saat edit mode mapel kita ambil ulang dari server.
  state.kktpMapelLoaded = [];

  // Isi field dasar.
  document.getElementById('k-id').value = k ? k.id_kegiatan : '';
  // Jenis: jika jenis tidak ada di daftar → pilih "__lainnya__" & isi field lainnya.
  const selJenis = document.getElementById('k-jenis');
  const adaDiDaftar = k && state.jenisList.includes(k.jenis);
  if (adaDiDaftar) {
    selJenis.value = k.jenis;
    document.getElementById('k-jenis-lain-field').style.display = 'none';
    document.getElementById('k-jenis-lain').value = '';
  } else if (k) {
    selJenis.value = '__lainnya__';
    document.getElementById('k-jenis-lain-field').style.display = '';
    document.getElementById('k-jenis-lain').value = k.jenis || '';
  } else {
    if (state.jenisList.length) selJenis.value = state.jenisList[0];
    document.getElementById('k-jenis-lain-field').style.display = 'none';
    document.getElementById('k-jenis-lain').value = '';
  }
  document.getElementById('k-semester').value = k ? String(k.semester || 1) : '1';
  document.getElementById('k-nama').value = k ? (k.nama || '') : '';
  document.getElementById('k-buka').value = k ? tanggalInputValue(k.tanggal_buka) : '';
  document.getElementById('k-tutup').value = k ? tanggalInputValue(k.tanggal_tutup) : '';
  document.getElementById('k-dokumen').value = k ? tanggalInputValue(k.tanggal_dokumen) : '';

  // Tingkat peserta.
  document.querySelectorAll('.k-tingkat').forEach(cb => {
    cb.checked = !!(k && (k.tingkat_peserta || []).map(Number).includes(Number(cb.value)));
  });

  // Mode KKTP.
  document.querySelectorAll('input[name="k-mode-kktp"]').forEach(r => {
    r.checked = (r.value === state.modeKktpForm);
  });
  document.getElementById('k-kktp-sekolah').value = k ? (Number(k.kktp_sekolah) || 75) : 75;

  // Publikasi.
  document.getElementById('k-publikasi').checked = !!(k && k.dipublikasikan);
  document.getElementById('k-publikasi-buka').value = k ? tanggalInputValue(k.publikasi_buka) : '';
  document.getElementById('k-publikasi-tutup').value = k ? tanggalInputValue(k.publikasi_tutup) : '';
  document.getElementById('k-tampil-peringkat').checked = !!(k && k.tampil_peringkat_siswa);
  document.getElementById('k-tampil-pembanding').checked = !!(k && k.tampil_pembanding_siswa);
  // Tampilkan/sembunyikan blok publikasi lanjutan.
  const publikasiOn = !!(k && k.dipublikasikan);
  document.getElementById('k-publikasi-tgl-bungkus').style.display = publikasiOn ? '' : 'none';
  document.getElementById('k-publikasi-tampil-bungkus').style.display = publikasiOn ? '' : 'none';

  perbaruiSaranNama();
  toggleFormModeKktp();
  document.getElementById('k-galat').textContent = '';

  // Judul modal.
  const judul = document.querySelector('#modal-kegiatan .modal-head h3');
  if (judul) judul.textContent = k ? 'Edit Kegiatan' : 'Tambah Kegiatan';

  modalBuka('modal-kegiatan');
  renderIkon();
  // Muat slot mapel untuk mode mapel (asinkron, non-blokir).
  muatSlotForm();
}

/** Perbarui teks sugesti nama di form. */
function perbaruiSaranNama() {
  const el = document.getElementById('k-nama-saran');
  if (!el) return;
  const jenisVal = document.getElementById('k-jenis').value;
  const jenis = jenisVal === '__lainnya__'
    ? (document.getElementById('k-jenis-lain').value.trim() || '(jenis)')
    : jenisVal;
  const semester = document.getElementById('k-semester').value;
  el.textContent = 'Saran otomatis: ' + sugestiNama(jenis, semester, state.idTa);
}

/** Toggle tampilan blok KKTP sekolah / per-mapel pada form. */
function toggleFormModeKktp() {
  const mode = state.modeKktpForm;
  document.getElementById('k-kktp-sekolah-field').style.display = mode === 'sekolah' ? '' : 'none';
  document.getElementById('k-kktp-mapel-bungkus').style.display = mode === 'mapel' ? '' : 'none';
}

/** Ambil slot mapel untuk tingkat peserta terpilih (gabungan) dan render tabel input KKTP. */
async function muatSlotForm() {
  if (state.modeKktpForm !== 'mapel') return;
  const tingkat = Array.from(document.querySelectorAll('.k-tingkat:checked')).map(cb => Number(cb.value));
  const bungkus = document.getElementById('k-kktp-mapel-tabel');
  if (!bungkus) return;
  if (!tingkat.length) {
    state.slotMapelForm = [];
    bungkus.innerHTML = `<div class="petunjuk">Pilih minimal satu tingkat peserta.</div>`;
    return;
  }
  bungkus.innerHTML = spin('Memuat slot mapel...');
  try {
    // Ambil slot per tingkat secara paralel.
    const hasil = await Promise.all(
      tingkat.map(t => panggil('mapel_daftar', { id_ta: state.idTa, tingkat: t }, state.token))
    );
    const semua = [];
    hasil.forEach((d, i) => {
      (d.slot || []).forEach(s => semua.push({
        id_slot: s.id_slot,
        tingkat: tingkat[i],
        kode: s.kode,
        nama: s.nama,
        singkatan: s.singkatan
      }));
    });
    state.slotMapelForm = semua;
    // Untuk edit kegiatan yang sudah ada: ambil KKTP per mapel yang tersimpan
    // agar input terisi nilai saat ini.
    let existing = null;
    if (state.kegiatanEdit && state.kegiatanEdit.id_kegiatan) {
      if (!state.kktpMapelLoaded || !state.kktpMapelLoaded.length) {
        try {
          const k = await panggil('kegiatan_kktp_ambil',
            { id_kegiatan: state.kegiatanEdit.id_kegiatan }, state.token);
          state.kktpMapelLoaded = k.kktp_mapel || [];
        } catch (e) { /* abaikan: tampilkan tabel kosong */ }
      }
      existing = state.kktpMapelLoaded.length ? state.kktpMapelLoaded : null;
    }
    bungkus.innerHTML = renderTabelKktpForm(semua, existing);
    renderIkon();
  } catch (err) {
    bungkus.innerHTML = `<div class="petunjuk" style="color:var(--err)">${escape(pesanGalat(err))}</div>`;
    toast(pesanGalat(err), 'err');
  }
}

/** Render tabel slot × input KKTP (untuk form mode mapel). */
function renderTabelKktpForm(slot, existing) {
  if (!slot.length) return `<div class="petunjuk">Tidak ada slot mapel pada tingkat terpilih.</div>`;
  const head = `<tr><th>Tingkat</th><th>Kode</th><th>Nama Slot</th><th>KKTP</th></tr>`;
  const body = slot.map(s => {
    const km = existing ? existing.find(k => k.id_slot === s.id_slot) : null;
    const val = km ? (km.kktp || '') : '';
    return `<tr>
      <td>${escape(s.tingkat)}</td>
      <td><code>${escape(s.kode)}</code></td>
      <td>${escape(s.nama)}</td>
      <td><input class="input input-monospace" type="number" min="0" max="100"
        data-id-slot="${escape(s.id_slot)}" value="${escape(val)}" placeholder="75"
        style="max-width:90px" /></td>
    </tr>`;
  }).join('');
  return `<div class="tabel-bungkus" style="max-height:280px"><table class="tabel tabel-padat">
    <thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

/** Kumpulkan nilai kktp_mapel dari input pada tabel form. */
function kumpulkanKktpMapelForm() {
  const arr = [];
  document.querySelectorAll('#k-kktp-mapel-tabel input[data-id-slot]').forEach(inp => {
    const v = inp.value.trim();
    if (v !== '') arr.push({ id_slot: inp.dataset.idSlot, kktp: Number(v) || 75 });
  });
  return arr;
}

/** Baca form → objek kegiatan. */
function bacaForm() {
  const id = document.getElementById('k-id').value || null;
  const jenisVal = document.getElementById('k-jenis').value;
  let jenis;
  if (jenisVal === '__lainnya__') {
    jenis = document.getElementById('k-jenis-lain').value.trim();
    if (!jenis) throw new Error('Jenis baru wajib diisi.');
  } else {
    jenis = jenisVal;
  }
  const semester = Number(document.getElementById('k-semester').value) || 1;
  const nama = document.getElementById('k-nama').value.trim();
  const tingkat = Array.from(document.querySelectorAll('.k-tingkat:checked')).map(cb => Number(cb.value));
  if (!tingkat.length) throw new Error('Pilih minimal satu tingkat peserta.');
  const tanggal_buka = document.getElementById('k-buka').value || '';
  const tanggal_tutup = document.getElementById('k-tutup').value || '';
  const tanggal_dokumen = document.getElementById('k-dokumen').value || '';
  const mode_kktp = document.querySelector('input[name="k-mode-kktp"]:checked').value;
  const kktp_sekolah = Number(document.getElementById('k-kktp-sekolah').value) || 75;
  const dipublikasikan = document.getElementById('k-publikasi').checked;
  const publikasi_buka = document.getElementById('k-publikasi-buka').value || '';
  const publikasi_tutup = document.getElementById('k-publikasi-tutup').value || '';
  const tampil_peringkat_siswa = document.getElementById('k-tampil-peringkat').checked;
  const tampil_pembanding_siswa = document.getElementById('k-tampil-pembanding').checked;

  const kegiatan = {
    id_kegiatan: id || undefined,
    id_ta: state.idTa,
    jenis, semester, nama, tingkat_peserta: tingkat,
    tanggal_buka, tanggal_tutup, tanggal_dokumen,
    mode_kktp, kktp_sekolah,
    dipublikasikan, publikasi_buka, publikasi_tutup,
    tampil_peringkat_siswa, tampil_pembanding_siswa
  };
  if (mode_kktp === 'mapel') kegiatan.kktp_mapel = kumpulkanKktpMapelForm();
  return kegiatan;
}

async function simpanKegiatan() {
  const galatEl = document.getElementById('k-galat');
  galatEl.textContent = '';
  let kegiatan;
  try {
    kegiatan = bacaForm();
  } catch (err) {
    galatEl.textContent = err.message;
    return;
  }
  const btn = document.getElementById('btn-simpan-kegiatan');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    const d = await panggil('kegiatan_simpan', { kegiatan }, state.token);
    toast(state.kegiatanEdit ? 'Kegiatan diperbarui.' : 'Kegiatan dibuat.', 'ok');
    modalTutup('modal-kegiatan');
    // Jika jenis baru ditambahkan ke daftar, refresh daftar jenis.
    if (d && d.kegiatan && !state.jenisList.includes(d.kegiatan.jenis)) {
      state.jenisList.push(d.kegiatan.jenis);
    }
    await muatDaftar();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan`;
    renderIkon();
  }
}

// =========================== STATUS ===========================

function bukaStatus(k) {
  state.kegiatanStatus = k;
  document.getElementById('status-nama').textContent = k.nama || '(tanpa nama)';
  document.getElementById('status-saat-ini').innerHTML = chipStatus(k.status);
  document.getElementById('status-alasan').value = '';
  document.getElementById('status-galat').textContent = '';
  // Nonaktifkan tombol yang sama dengan status saat ini.
  document.querySelectorAll('[data-status-tgt]').forEach(b => {
    b.disabled = (b.dataset.statusTgt === k.status);
  });
  modalBuka('modal-status');
  renderIkon();
}

async function ubahStatus(target) {
  const k = state.kegiatanStatus;
  if (!k || !target) return;
  const alasan = document.getElementById('status-alasan').value.trim();
  const galatEl = document.getElementById('status-galat');
  galatEl.textContent = '';
  // Validasi klien: dikunci → dibuka wajib alasan.
  if (target === 'dibuka' && k.status === 'dikunci' && !alasan) {
    galatEl.textContent = 'Alasan wajib diisi untuk membuka kembali kegiatan yang terkunci.';
    return;
  }
  // Konfirmasi sederhana untuk transisi ke diarsipkan / dikunci.
  if (target === 'diarsipkan' && !confirm('Arsipkan kegiatan ini? Data tetap tersimpan.')) return;
  if (target === 'dikunci' && !confirm('Kunci kegiatan? Input nilai akan dinonaktifkan.')) return;

  try {
    await panggil('kegiatan_status', {
      id_kegiatan: k.id_kegiatan, status: target, alasan
    }, state.token);
    toast('Status kegiatan diperbarui.', 'ok');
    modalTutup('modal-status');
    await muatDaftar();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  }
}

// =========================== DUPlikat ===========================

function bukaDuplikat(k) {
  state.kegiatanStatus = k; // pinjam slot sementara
  document.getElementById('dup-nama').textContent = k.nama || '(tanpa nama)';
  document.getElementById('dup-ta-tujuan').value = k.id_ta || state.idTa;
  document.getElementById('dup-galat').textContent = '';
  modalBuka('modal-duplikat');
  renderIkon();
}

async function jalankanDuplikat() {
  const k = state.kegiatanStatus;
  if (!k) return;
  const tujuan = document.getElementById('dup-ta-tujuan').value;
  const galatEl = document.getElementById('dup-galat');
  galatEl.textContent = '';
  const btn = document.getElementById('btn-jalankan-duplikat');
  btn.disabled = true; btn.innerHTML = spin('Menyalin...');
  try {
    const d = await panggil('kegiatan_duplikat', {
      id_kegiatan: k.id_kegiatan, id_ta_tujuan: tujuan || undefined
    }, state.token);
    toast('Kegiatan disalin (status draft).', 'ok');
    modalTutup('modal-duplikat');
    // Jika tujuan = TA saat ini, refresh.
    if (!tujuan || tujuan === state.idTa) await muatDaftar();
    else {
      // Beralih ke TA tujuan agar pengguna melihat hasil salinan.
      state.idTa = tujuan;
      document.getElementById('flt-ta').value = tujuan;
      await muatDaftar();
    }
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="copy"></i> Salin`;
    renderIkon();
  }
}

// =========================== KKTP MODAL ===========================

async function bukaKktp(k) {
  state.kegiatanKktp = k;
  document.getElementById('kktp-nama').textContent = k.nama || '(tanpa nama)';
  document.getElementById('kktp-galat').textContent = '';
  modalBuka('modal-kktp');

  // Muat data KKTP saat ini dari server.
  const tabelBungkus = document.getElementById('kktp-mapel-tabel');
  tabelBungkus.innerHTML = spin('Memuat KKTP...');
  try {
    const d = await panggil('kegiatan_kktp_ambil', { id_kegiatan: k.id_kegiatan }, state.token);
    state.kktpMapelLoaded = d.kktp_mapel || [];
    // Set mode radio.
    const mode = d.mode === 'mapel' ? 'mapel' : 'sekolah';
    document.querySelectorAll('input[name="kktp-mode"]').forEach(r => { r.checked = (r.value === mode); });
    document.getElementById('kktp-sekolah').value = Number(d.kktp_sekolah) || 75;
    // Muat slot mapel dari ta × tingkat peserta.
    await muatSlotKktp(k, mode);
    toggleModalKktpMode();
  } catch (err) {
    tabelBungkus.innerHTML = `<div class="petunjuk" style="color:var(--err)">${escape(pesanGalat(err))}</div>`;
    toast(pesanGalat(err), 'err');
  }
  renderIkon();
}

/** Ambil slot mapel untuk semua tingkat peserta kegiatan & render tabel KKTP. */
async function muatSlotKktp(k, mode) {
  if (mode !== 'mapel') return;
  const tingkat = (k.tingkat_peserta || []).map(Number).filter(n => TINGKAT_PILIHAN.includes(n));
  const bungkus = document.getElementById('kktp-mapel-tabel');
  if (!tingkat.length) {
    state.slotMapelKktp = [];
    bungkus.innerHTML = `<div class="petunjuk">Kegiatan belum memiliki tingkat peserta.</div>`;
    return;
  }
  bungkus.innerHTML = spin('Memuat slot mapel...');
  try {
    const hasil = await Promise.all(
      tingkat.map(t => panggil('mapel_daftar', { id_ta: k.id_ta, tingkat: t }, state.token))
    );
    const semua = [];
    hasil.forEach((d, i) => {
      (d.slot || []).forEach(s => semua.push({
        id_slot: s.id_slot, tingkat: tingkat[i],
        kode: s.kode, nama: s.nama
      }));
    });
    state.slotMapelKktp = semua;
    bungkus.innerHTML = renderTabelKktpForm(semua, state.kktpMapelLoaded);
    renderIkon();
  } catch (err) {
    bungkus.innerHTML = `<div class="petunjuk" style="color:var(--err)">${escape(pesanGalat(err))}</div>`;
    toast(pesanGalat(err), 'err');
  }
}

/** Toggle tampilan blok KKTP sekolah / per-mapel di modal KKTP. */
function toggleModalKktpMode() {
  const mode = document.querySelector('input[name="kktp-mode"]:checked')?.value || 'sekolah';
  document.getElementById('kktp-sekolah-field').style.display = mode === 'sekolah' ? '' : 'none';
  document.getElementById('kktp-mapel-bungkus').style.display = mode === 'mapel' ? '' : 'none';
  if (mode === 'mapel' && state.kegiatanKktp && !state.slotMapelKktp.length) {
    muatSlotKktp(state.kegiatanKktp, 'mapel');
  }
}

async function simpanKktp() {
  const k = state.kegiatanKktp;
  if (!k) return;
  const galatEl = document.getElementById('kktp-galat');
  galatEl.textContent = '';
  const mode = document.querySelector('input[name="kktp-mode"]:checked')?.value || 'sekolah';
  const kktp_sekolah = Number(document.getElementById('kktp-sekolah').value) || 75;
  // Susun ulang objek kegiatan dari data terkini + perubahan KKTP.
  // Kita kirim kegiatan_simpan dengan id + bidang KKTP yang diperbarui, plus
  // bidang inti yang wajib ada (jenis, semester, tingkat_peserta, tanggal).
  const kegiatan = {
    id_kegiatan: k.id_kegiatan,
    id_ta: k.id_ta,
    jenis: k.jenis,
    nama: k.nama,
    semester: k.semester,
    tingkat_peserta: (k.tingkat_peserta || []).map(Number),
    tanggal_buka: k.tanggal_buka || '',
    tanggal_tutup: k.tanggal_tutup || '',
    tanggal_dokumen: k.tanggal_dokumen || '',
    mode_kktp: mode,
    kktp_sekolah,
    dipublikasikan: !!k.dipublikasikan,
    publikasi_buka: k.publikasi_buka || '',
    publikasi_tutup: k.publikasi_tutup || '',
    tampil_peringkat_siswa: !!k.tampil_peringkat_siswa,
    tampil_pembanding_siswa: !!k.tampil_pembanding_siswa
  };
  if (mode === 'mapel') {
    const arr = [];
    document.querySelectorAll('#kktp-mapel-tabel input[data-id-slot]').forEach(inp => {
      const v = inp.value.trim();
      if (v !== '') arr.push({ id_slot: inp.dataset.idSlot, kktp: Number(v) || 75 });
    });
    kegiatan.kktp_mapel = arr;
  }

  const btn = document.getElementById('btn-simpan-kktp');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    await panggil('kegiatan_simpan', { kegiatan }, state.token);
    toast('KKTP kegiatan disimpan.', 'ok');
    modalTutup('modal-kktp');
    await muatDaftar();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan KKTP`;
    renderIkon();
  }
}
