// ta.js — Halaman Tahun Ajaran (Tahap 2A).
// Daftar, tambah, edit nama, set aktif.
// Hak: admin menulis; standar_penilaian (spn) lihat saja.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { renderTabel, renderModal, modalBuka, modalTutup, chip, tombolAksi } from '../komponen.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  bolehTulis: false,
  daftar: [],
  idAktif: null
};

// =========================== ENTRY ===========================

export async function renderTahunAjaran(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.bolehTulis = boleh(sesi.peran, 'admin');

  document.getElementById('topbar-judul').textContent = 'Tahun Ajaran';
  const main = document.getElementById('main');

  // Spn boleh lihat; peran lain ditolak.
  if (!state.bolehTulis && !boleh(sesi.peran, 'standar_penilaian')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini untuk admin / standar penilaian.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat tahun ajaran...');
  await muat();
}

// =========================== MUAT DATA ===========================

async function muat() {
  const main = document.getElementById('main');
  try {
    const d = await panggil('ta_daftar', {}, state.token);
    state.daftar = d.ta || [];
    state.idAktif = (d.aktif && d.aktif.id_ta) || null;
  } catch (err) {
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

// =========================== RENDER ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  const btnTambah = state.bolehTulis
    ? `<button class="btn btn-kecil" id="btn-tambah"><i data-lucide="plus"></i> Tambah Tahun Ajaran</button>`
    : '';

  main.innerHTML = `
    <h1 class="page-judul">Tahun Ajaran</h1>
    <div class="toolbar">
      <div class="kelompok-aksi">${btnTambah}</div>
    </div>
    <div id="tabel-ta"></div>

    ${state.bolehTulis ? renderModal('modal-ta', 'Tahun Ajaran', `
      <input type="hidden" id="ta-id" />
      <div class="field">
        <label class="label" for="ta-nama">Nama Tahun Ajaran</label>
        <input class="input" id="ta-nama" placeholder="mis. 2025/2026" autocomplete="off" />
        <div class="petunjuk">Format bebas, tetapi sebaiknya konsisten (mis. 2025/2026).</div>
      </div>
      <div id="ta-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-ta">Batal</button>
      <button class="btn" id="btn-simpan"><i data-lucide="save"></i> Simpan</button>
    `) : ''}
  `;
}

function renderIsi() {
  const wadah = document.getElementById('tabel-ta');
  if (!wadah) return;
  const kolom = [
    { k: 'nama', judul: 'Nama Tahun Ajaran' },
    { k: 'aktif', judul: 'Status', render: (v, r) => (r.id_ta === state.idAktif ? chip('Aktif', 'ok') : chip('Nonaktif', 'netral')) }
  ];
  if (state.bolehTulis) {
    kolom.push({
      k: 'id_ta', judul: 'Aksi', kelas: 'aksi',
      render: (v, r) => `
        ${r.id_ta === state.idAktif
          ? ''
          : `<button class="btn btn-kecil btn-sekunder" data-aktif="${escape(r.id_ta)}"><i data-lucide="check"></i> Set Aktif</button>`}
        ${tombolAksi('pencil', 'Edit Nama', 'edit', r.id_ta)}
      `
    });
  }
  wadah.innerHTML = renderTabel(kolom, state.daftar, { kosongPesan: 'Belum ada tahun ajaran. Klik "Tambah Tahun Ajaran" untuk membuat.' });
}

// =========================== LISTENER ===========================

function pasangListener() {
  const main = document.getElementById('main');
  // Tambah.
  document.getElementById('btn-tambah')?.addEventListener('click', () => bukaForm(null));
  // Simpan.
  document.getElementById('btn-simpan')?.addEventListener('click', simpan);
  // Aksi baris (delegasi).
  main?.querySelector('#tabel-ta')?.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    const aktif = e.target.closest('[data-aktif]');
    if (edit) {
      const r = state.daftar.find(x => x.id_ta === edit.dataset.edit);
      if (r) bukaForm(r);
    } else if (aktif) {
      setAktif(aktif);
    }
  });
}

// =========================== FORM ===========================

function bukaForm(ta) {
  document.getElementById('ta-id').value = ta ? ta.id_ta : '';
  document.getElementById('ta-nama').value = ta ? ta.nama : '';
  document.getElementById('ta-galat').textContent = '';
  // Ubah judul modal.
  const judul = document.querySelector('#modal-ta .modal-head h3');
  if (judul) judul.textContent = ta ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran';
  modalBuka('modal-ta');
}

async function simpan() {
  const galatEl = document.getElementById('ta-galat');
  galatEl.textContent = '';
  const id = document.getElementById('ta-id').value || null;
  const nama = document.getElementById('ta-nama').value.trim();
  if (!nama) { galatEl.textContent = 'Nama wajib diisi.'; return; }

  const btn = document.getElementById('btn-simpan');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    await panggil('ta_simpan', { id_ta: id, nama }, state.token);
    toast('Tahun ajaran tersimpan.', 'ok');
    modalTutup('modal-ta');
    await muat();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan`;
    renderIkon();
  }
}

async function setAktif(btn) {
  const id = btn.dataset.aktif;
  btn.disabled = true;
  try {
    await panggil('ta_aktif', { id_ta: id }, state.token);
    toast('Tahun ajaran diaktifkan.', 'ok');
    await muat();
  } catch (err) {
    toast(pesanGalat(err), 'err');
    btn.disabled = false;
  }
}
