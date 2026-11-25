// mapel.js — Halaman Mapel & Slot (Tahap 2A).
// Daftar slot mapel per TA + tingkat; tambah/edit slot+varian; muat contoh 11 slot;
// salin slot dari tahun ajaran lain.
// Hak: admin menulis; standar_penilaian (spn) lihat.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { renderTabel, renderModal, modalBuka, modalTutup, chip, tombolAksi } from '../komponen.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  bolehTulis: false,
  taDaftar: [],
  idTa: null,
  tingkat: 7,
  slot: [],
  slotEdit: null
};

// =========================== ENTRY ===========================

export async function renderMapel(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.bolehTulis = boleh(sesi.peran, 'admin');

  document.getElementById('topbar-judul').textContent = 'Mapel & Slot';
  const main = document.getElementById('main');

  if (!state.bolehTulis && !boleh(sesi.peran, 'standar_penilaian')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini untuk admin / standar penilaian.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat...');
  try {
    const ta = await panggil('ta_daftar', {}, state.token);
    state.taDaftar = ta.ta || [];
    state.idTa = (ta.aktif && ta.aktif.id_ta) || (state.taDaftar[0] && state.taDaftar[0].id_ta) || null;
    state.tingkat = state.tingkat || 7;
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat</h3>
      <p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
    return;
  }
  await muat();
}

// =========================== MUAT DATA ===========================

async function muat() {
  const main = document.getElementById('main');
  if (!state.idTa) {
    main.innerHTML = `
      <h1 class="page-judul">Mapel & Slot</h1>
      <div class="kosong"><i data-lucide="calendar-x"></i><h3>Belum ada tahun ajaran</h3>
        <p>Tambah tahun ajaran dahulu.</p></div>`;
    renderIkon();
    return;
  }
  main.innerHTML = spin('Memuat mapel...');
  try {
    const d = await panggil('mapel_daftar', { id_ta: state.idTa, tingkat: state.tingkat }, state.token);
    state.slot = d.slot || [];
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

// =========================== RENDER KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  const opsiTa = state.taDaftar.map(t =>
    `<option value="${escape(t.id_ta)}" ${state.idTa === t.id_ta ? 'selected' : ''}>${escape(t.nama)}${t.aktif ? ' (aktif)' : ''}</option>`
  ).join('');
  const opsiTingkat = [7, 8, 9].map(t =>
    `<option value="${t}" ${state.tingkat === t ? 'selected' : ''}>Tingkat ${t}</option>`
  ).join('');
  const opsiSalpin = state.taDaftar.filter(t => t.id_ta !== state.idTa).map(t =>
    `<option value="${escape(t.id_ta)}">${escape(t.nama)}</option>`
  ).join('');

  const btnTambah = state.bolehTulis ? `<button class="btn btn-kecil" id="btn-tambah"><i data-lucide="plus"></i> Tambah Slot</button>` : '';
  const btnContoh = state.bolehTulis ? `<button class="btn btn-kecil btn-sekunder" id="btn-muat-contoh"><i data-lucide="sparkles"></i> Muat Contoh 11 Slot</button>` : '';
  const btnSalpin = (state.bolehTulis && opsiSalpin) ? `<button class="btn btn-kecil btn-sekunder" id="btn-salpin"><i data-lucide="copy"></i> Salin dari Tahun Ajaran Lain</button>` : '';

  main.innerHTML = `
    <h1 class="page-judul">Mapel & Slot</h1>
    <div class="toolbar">
      <div class="tumbal"><label class="label" for="pilih-ta">Tahun Ajaran</label>
        <select class="select" id="pilih-ta">${opsiTa}</select></div>
      <div class="tumbal"><label class="label" for="pilih-tingkat">Tingkat</label>
        <select class="select" id="pilih-tingkat">${opsiTingkat}</select></div>
      <div class="kelompok-aksi">${btnTambah}${btnContoh}${btnSalpin}</div>
    </div>
    <div id="mapel-isi"></div>

    ${state.bolehTulis ? renderModal('modal-slot', 'Slot Mapel', `
      <input type="hidden" id="s-id" />
      <div class="field-row">
        <div class="field"><label class="label" for="s-kode">Kode</label>
          <input class="input" id="s-kode" maxlength="12" placeholder="MAT" autocomplete="off" /></div>
        <div class="field"><label class="label" for="s-singkatan">Singkatan</label>
          <input class="input" id="s-singkatan" maxlength="16" placeholder="MAT" autocomplete="off" /></div>
        <div class="field"><label class="label" for="s-urutan">Urutan</label>
          <input class="input" id="s-urutan" type="number" min="0" value="1" /></div>
      </div>
      <div class="field"><label class="label" for="s-nama">Nama Mapel</label>
        <input class="input" id="s-nama" placeholder="Matematika" autocomplete="off" /></div>
      <div class="field"><label class="label" style="display:inline-flex;align-items:center;gap:.4rem">
        <input type="checkbox" id="s-aktif" checked /> Aktif</label></div>
      <div class="field">
        <label class="label">Varian</label>
        <div class="petunjuk" style="margin-bottom:.5rem">
          Varian untuk pembagian (mis. Seni Budaya, Prakarya). Jika hanya satu varian, biarkan kosong —
          varian bawaan = nama mapel.
        </div>
        <div id="s-varian-list"></div>
        <button class="btn btn-sekunder btn-kecil" id="s-tambah-varian" type="button">
          <i data-lucide="plus"></i> Tambah Varian
        </button>
      </div>
      <div id="s-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-slot">Batal</button>
      <button class="btn" id="btn-simpan-slot"><i data-lucide="save"></i> Simpan</button>
    `) : ''}

    ${state.bolehTulis ? renderModal('modal-salpin', 'Salin Slot dari Tahun Ajaran Lain', `
      <p style="margin:0 0 .75rem">
        Salin seluruh slot mapel dari tahun ajaran lain ke tahun ajaran aktif
        (<strong>${escape(state.taDaftar.find(t => t.id_ta === state.idTa)?.nama || '')}</strong>).
      </p>
      <div class="field"><label class="label" for="sp-sumber">Tahun Ajaran Sumber</label>
        <select class="select" id="sp-sumber">${opsiSalpin}</select></div>
      <div id="sp-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-salpin">Batal</button>
      <button class="btn" id="btn-salin"><i data-lucide="copy"></i> Salin</button>
    `) : ''}
  `;
}

// =========================== RENDER ISI ===========================

function renderIsi() {
  const wadah = document.getElementById('mapel-isi');
  if (!wadah) return;
  const kolom = [
    { k: 'urutan', judul: '#', render: v => escape(v ?? '') },
    { k: 'kode', judul: 'Kode', render: v => `<strong>${escape(v)}</strong>` },
    { k: 'nama', judul: 'Nama' },
    { k: 'singkatan', judul: 'Singkatan' },
    { k: 'aktif', judul: 'Status', render: v => (v ? chip('Aktif', 'ok') : chip('Nonaktif', 'netral')) },
    {
      k: 'varian', judul: 'Varian',
      render: (v, r) => ((r.varian && r.varian.length)
        ? r.varian.map(x => chip(x.nama, 'info')).join(' ')
        : chip('-', 'netral'))
    }
  ];
  if (state.bolehTulis) {
    kolom.push({
      k: 'id_slot', judul: 'Aksi', kelas: 'aksi',
      render: (v) => tombolAksi('pencil', 'Edit Slot', 'edit', v)
    });
  }
  wadah.innerHTML = renderTabel(kolom, state.slot, { kosongPesan: 'Belum ada slot mapel untuk tingkat ini.' });
}

// =========================== LISTENER ===========================

function pasangListener() {
  const main = document.getElementById('main');
  // Ganti TA / tingkat.
  const selTa = document.getElementById('pilih-ta');
  selTa?.addEventListener('change', () => { state.idTa = selTa.value; muat(); });
  const selT = document.getElementById('pilih-tingkat');
  selT?.addEventListener('change', () => { state.tingkat = Number(selT.value); muat(); });
  // Tambah slot.
  document.getElementById('btn-tambah')?.addEventListener('click', () => bukaFormSlot(null));
  // Simpan slot.
  document.getElementById('btn-simpan-slot')?.addEventListener('click', simpanSlot);
  // Tambah baris varian.
  document.getElementById('s-tambah-varian')?.addEventListener('click', () => tambahBarisVarian('', '', null));
  // Hapus baris varian (delegasi).
  document.getElementById('s-varian-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hapus-varian]');
    if (b) b.closest('.field-row')?.remove();
  });
  // Muat contoh.
  document.getElementById('btn-muat-contoh')?.addEventListener('click', muatContoh);
  // Salpin.
  document.getElementById('btn-salpin')?.addEventListener('click', () => {
    document.getElementById('sp-galat').textContent = '';
    modalBuka('modal-salpin');
  });
  document.getElementById('btn-salin')?.addEventListener('click', salpin);
  // Edit baris (delegasi).
  main?.querySelector('#mapel-isi')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (!b) return;
    const s = state.slot.find(x => x.id_slot === b.dataset.edit);
    if (s) bukaFormSlot(s);
  });
}

// =========================== FORM SLOT ===========================

function bukaFormSlot(slot) {
  state.slotEdit = slot || null;
  document.getElementById('s-id').value = slot ? slot.id_slot : '';
  document.getElementById('s-kode').value = slot ? slot.kode : '';
  document.getElementById('s-nama').value = slot ? slot.nama : '';
  document.getElementById('s-singkatan').value = slot ? (slot.singkatan || '') : '';
  document.getElementById('s-urutan').value = slot ? (slot.urutan ?? 1) : 1;
  document.getElementById('s-aktif').checked = slot ? slot.aktif : true;
  const list = document.getElementById('s-varian-list');
  list.innerHTML = '';
  if (slot && slot.varian && slot.varian.length) {
    slot.varian.forEach(v => tambahBarisVarian(v.nama, v.singkatan || '', v.id_varian || null));
  }
  document.getElementById('s-galat').textContent = '';
  // Judul modal.
  const judul = document.querySelector('#modal-slot .modal-head h3');
  if (judul) judul.textContent = slot ? 'Edit Slot' : 'Tambah Slot';
  modalBuka('modal-slot');
}

/** Tambah satu baris varian ke daftar varian di modal slot. */
function tambahBarisVarian(nama, singkatan, idVarian) {
  const list = document.getElementById('s-varian-list');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'field-row';
  div.style.marginBottom = '.5rem';
  div.dataset.varianId = idVarian || '';
  div.innerHTML = `
    <div class="field" style="margin:0"><input class="input v-nama" placeholder="Nama varian" value="${escape(nama)}" autocomplete="off" /></div>
    <div class="field" style="margin:0"><input class="input v-sing" placeholder="Singkatan" maxlength="16" value="${escape(singkatan)}" autocomplete="off" /></div>
    <button class="btn btn-kecil btn-sekunder ikon-btn" data-hapus-varian="1" type="button" title="Hapus varian">
      <i data-lucide="trash-2"></i>
    </button>
  `;
  list.appendChild(div);
  renderIkon();
}

/** Kumpulkan varian dari form. Baris kosong (tanpa nama & singkatan) dilewati. */
function kumpulkanVarian() {
  const arr = [];
  document.querySelectorAll('#s-varian-list .field-row').forEach(div => {
    const nama = (div.querySelector('.v-nama')?.value || '').trim();
    const sing = (div.querySelector('.v-sing')?.value || '').trim();
    const idVarian = div.dataset.varianId || null;
    if (nama || sing) arr.push({ id_varian: idVarian, nama, singkatan: sing });
  });
  return arr;
}

async function simpanSlot() {
  const galatEl = document.getElementById('s-galat');
  galatEl.textContent = '';
  const id_slot = document.getElementById('s-id').value || null;
  const kode = document.getElementById('s-kode').value.trim();
  const nama = document.getElementById('s-nama').value.trim();
  const singkatan = document.getElementById('s-singkatan').value.trim();
  const urutan = Number(document.getElementById('s-urutan').value) || 0;
  const aktif = document.getElementById('s-aktif').checked;
  const varian = kumpulkanVarian();
  if (!kode) { galatEl.textContent = 'Kode wajib diisi.'; return; }
  if (!nama) { galatEl.textContent = 'Nama wajib diisi.'; return; }

  const btn = document.getElementById('btn-simpan-slot');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    await panggil('mapel_simpan', {
      slot: {
        id_slot, id_ta: state.idTa, tingkat: state.tingkat,
        kode, nama, singkatan, urutan, aktif, varian
      }
    }, state.token);
    toast('Slot tersimpan.', 'ok');
    modalTutup('modal-slot');
    await muat();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan`;
    renderIkon();
  }
}

// ===================== MUAT CONTOH & SALPIN =====================

async function muatContoh() {
  if (!confirm(`Muat 11 slot mapel contoh untuk tingkat ${state.tingkat}? Ini menambah slot baru.`)) return;
  try {
    const d = await panggil('mapel_muat_contoh', { id_ta: state.idTa, tingkat: state.tingkat }, state.token);
    toast(`${d.jumlah} slot contoh dimuat.`, 'ok');
    await muat();
  } catch (err) {
    toast(pesanGalat(err), 'err');
  }
}

async function salpin() {
  const sumber = document.getElementById('sp-sumber').value;
  const galatEl = document.getElementById('sp-galat');
  galatEl.textContent = '';
  if (!sumber) { galatEl.textContent = 'Pilih sumber.'; return; }
  const btn = document.getElementById('btn-salin');
  btn.disabled = true; btn.innerHTML = spin('Menyalin...');
  try {
    const d = await panggil('mapel_salpin', { id_ta_sumber: sumber, id_ta_tujuan: state.idTa }, state.token);
    toast(`${d.jumlah} slot disalin.`, 'ok');
    modalTutup('modal-salpin');
    await muat();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="copy"></i> Salin`;
    renderIkon();
  }
}
