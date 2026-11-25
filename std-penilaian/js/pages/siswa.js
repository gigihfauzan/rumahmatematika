// siswa.js — Halaman Data Siswa (Tahap 2B).
// Fitur: daftar + filter, tambah/edit, ubah status, hapus, impor, terapkan varian ke kelas, ekspor.
// Hak: admin menulis; standar_penilaian (spn) lihat + ekspor saja.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { renderTabel, renderPaginasi, renderModal, modalBuka, modalTutup, chip, tombolAksi, pasangModalTutupGlobal } from '../komponen.js';
import { bacaFileKeBaris, unduhExcel, unduhTemplate } from '../excel.js';

const PER_HALAMAN = 25;

// Pasang listener global tombol [data-modal-tutup] sekali saat modul dimuat.
// (Tidak dijalankan oleh halaman.js Tahap 1; kita pasang sendiri agar modal bisa ditutup.)
pasangModalTutupGlobal();

// State halaman.
const state = {
  sesi: null,
  bolehTulis: false,
  token: null,
  idTa: null,
  kelasList: [],          // daftar kelas untuk id_ta aktif
  multiVarian: {},        // {tingkat: slot} slot yang punya >1 varian
  daftarVarian: [],       // gabungan varian dari slot multi-varian (untuk filter)
  siswa: [],              // hasil siswa_daftar (seluruhnya, paginasi sisi klien)
  total: 0,
  halaman: 1,
  filter: { tingkat: '', id_kelas: '', status: '', id_varian: '', q: '' },
  barisImpor: [],         // baris hasil bacaFileKeBaris untuk pratinjau impor
  siswaEdit: null,        // siswa yang sedang diedit (null = tambah)
  siswaStatus: null       // siswa yang akan diubah statusnya
};

// =========================== UTIL TANGGAL ===========================

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

/** Warna chip status siswa. */
function chipStatus(status) {
  if (status === 'aktif') return chip('Aktif', 'ok');
  if (status === 'keluar') return chip('Keluar', 'warn');
  if (status === 'lulus') return chip('Lulus', 'info');
  return chip(status || '-', 'netral');
}

/** Tunggu sebentar sebelum menjalankan handler (debounce). */
function debung(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// =========================== ENTRY ===========================

export async function renderSiswa(sesi) {
  state.sesi = sesi;
  state.bolehTulis = boleh(sesi.peran, 'admin');
  state.token = localStorage.getItem('enilai_token');

  document.getElementById('topbar-judul').textContent = 'Data Siswa';
  const main = document.getElementById('main');
  main.innerHTML = spin('Memuat data master...');
  try {
    await muatMaster();
    await muatDaftar(true);
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  renderKerangka();
  renderIsi();
  renderIkon();
  pasangListener();
}

// =========================== MUAT DATA MASTER ===========================

async function muatMaster() {
  // Ambil TA aktif, daftar kelas, dan mapel (untuk deteksi slot multi-varian).
  const [ta, kelas, mapel] = await Promise.all([
    panggil('ta_daftar', {}, state.token),
    panggil('kelas_daftar', {}, state.token),
    panggil('mapel_daftar', {}, state.token)
  ]);
  state.idTa = (ta.aktif && ta.aktif.id_ta) || (ta.ta[0] && ta.ta[0].id_ta) || null;
  state.kelasList = kelas.kelas || [];

  // Cari slot multi-varian per tingkat (varian.length > 1, biasanya Seni & Prakarya).
  state.multiVarian = {};
  (mapel.slot || []).forEach(s => {
    if ((s.varian || []).length > 1) {
      state.multiVarian[Number(s.tingkat)] = s;
    }
  });
  // Gabungkan semua varian dari slot multi-varian untuk filter varian.
  state.daftarVarian = [];
  Object.values(state.multiVarian).forEach(s => {
    (s.varian || []).forEach(v => state.daftarVarian.push({ ...v, tingkat: s.tingkat, nama_slot: s.nama }));
  });
}

// =========================== MUAT DAFTAR SISWA ===========================

async function muatDaftar(resetHalaman) {
  if (resetHalaman) state.halaman = 1;
  const wadah = document.getElementById('tabel-siswa');
  if (wadah) wadah.innerHTML = spin('Memuat siswa...');
  try {
    const hasil = await panggil('siswa_daftar', {
      id_ta: state.idTa,
      tingkat: state.filter.tingkat || undefined,
      id_kelas: state.filter.id_kelas || undefined,
      status: state.filter.status || undefined,
      id_varian: state.filter.id_varian || undefined,
      q: state.filter.q || undefined
    }, state.token);
    state.siswa = hasil.siswa || [];
    state.total = hasil.total || 0;
  } catch (err) {
    state.siswa = []; state.total = 0;
    toast(pesanGalat(err), 'err');
  }
}

// =========================== RENDER KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  const tombolAdmin = state.bolehTulis ? `
    <button class="btn btn-kecil" id="btn-tambah"><i data-lucide="user-plus"></i> Tambah Siswa</button>
    <button class="btn btn-kecil btn-sekunder" id="btn-impor"><i data-lucide="upload"></i> Impor</button>
    <button class="btn btn-kecil btn-sekunder" id="btn-varian-kelas"><i data-lucide="layers"></i> Terapkan Varian ke Kelas</button>
    <button class="btn btn-kecil btn-sekunder" id="btn-ekspor"><i data-lucide="download"></i> Ekspor</button>
  ` : `
    <button class="btn btn-kecil btn-sekunder" id="btn-ekspor"><i data-lucide="download"></i> Ekspor</button>
  `;

  main.innerHTML = `
    <h1 class="page-judul">Data Siswa</h1>
    <div class="toolbar">
      <div class="tumbal">
        <label class="label" for="flt-tingkat">Tingkat</label>
        <select class="select" id="flt-tingkat">
          <option value="">Semua</option>
          <option value="7">7</option>
          <option value="8">8</option>
          <option value="9">9</option>
        </select>
      </div>
      <div class="tumbal">
        <label class="label" for="flt-kelas">Kelas</label>
        <select class="select" id="flt-kelas">
          <option value="">Semua</option>
          ${state.kelasList.map(k => `<option value="${escape(k.id_kelas)}">${escape(k.nama_kelas)}</option>`).join('')}
        </select>
      </div>
      <div class="tumbal">
        <label class="label" for="flt-status">Status</label>
        <select class="select" id="flt-status">
          <option value="">Semua</option>
          <option value="aktif">Aktif</option>
          <option value="keluar">Keluar</option>
          <option value="lulus">Lulus</option>
        </select>
      </div>
      <div class="tumbal">
        <label class="label" for="flt-varian">Varian</label>
        <select class="select" id="flt-varian">
          <option value="">Semua</option>
          ${state.daftarVarian.map(v => `<option value="${escape(v.id_varian)}">${escape(v.nama)} (${v.tingkat})</option>`).join('')}
        </select>
      </div>
      <div class="tumbal">
        <label class="label" for="flt-q">Cari</label>
        <input class="input" id="flt-q" placeholder="Nama / NISN / NIS" />
      </div>
      <div class="kelompok-aksi">${tombolAdmin}</div>
    </div>
    <div id="tabel-siswa"></div>
    <div id="paginasi-siswa"></div>

    <!-- Modal Tambah/Edit Siswa -->
    ${renderModal('modal-siswa', 'Siswa', `
      <form id="form-siswa">
        <div class="field-row">
          <div class="field"><label class="label" for="sis-nisn">NISN</label>
            <input class="input" id="sis-nisn" autocomplete="off" /></div>
          <div class="field"><label class="label" for="sis-nis">NIS</label>
            <input class="input" id="sis-nis" autocomplete="off" /></div>
        </div>
        <div class="field"><label class="label" for="sis-nama">Nama Lengkap</label>
          <input class="input" id="sis-nama" autocomplete="off" required /></div>
        <div class="field-row">
          <div class="field"><label class="label" for="sis-jk">Jenis Kelamin</label>
            <select class="select" id="sis-jk"><option value="L">L</option><option value="P">P</option></select></div>
          <div class="field"><label class="label" for="sis-tgl-lahir">Tanggal Lahir</label>
            <input class="input" id="sis-tgl-lahir" type="date" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label class="label" for="sis-kelas">Kelas</label>
            <select class="select" id="sis-kelas">
              <option value="">— pilih —</option>
              ${state.kelasList.map(k => `<option value="${escape(k.id_kelas)}" data-tingkat="${escape(k.tingkat)}">${escape(k.nama_kelas)}</option>`).join('')}
            </select></div>
          <div class="field" id="sis-varian-bungkus" style="display:none">
            <label class="label" for="sis-varian">Varian <span style="color:var(--err)">*</span></label>
            <select class="select" id="sis-varian"><option value="">— pilih —</option></select>
            <div class="petunjuk">Kelas pada tingkat ini memiliki slot multi-varian (Seni & Prakarya). Varian wajib dipilih.</div>
          </div>
        </div>
        <div class="field"><label class="label" for="sis-catatan">Catatan (opsional)</label>
          <textarea class="textarea" id="sis-catatan"></textarea></div>
        <div id="sis-galat" class="galat-field"></div>
      </form>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-siswa">Batal</button>
      <button class="btn" id="btn-simpan-siswa"><i data-lucide="save"></i> Simpan</button>
    `)}

    <!-- Modal Ubah Status -->
    ${renderModal('modal-status', 'Ubah Status Siswa', `
      <p style="margin:0 0 .75rem">Siswa: <strong id="status-nama"></strong></p>
      <div id="status-galat" class="galat-field"></div>
      <div style="display:flex; gap:.6rem; flex-wrap:wrap">
        <button class="btn btn-sekunder" id="btn-status-keluar"><i data-lucide="log-out"></i> Tandai Keluar</button>
        <button class="btn btn-sekunder" id="btn-status-lulus"><i data-lucide="graduation-cap"></i> Tandai Lulus</button>
        <button class="btn btn-sekunder" id="btn-status-aktif"><i data-lucide="rotate-ccw"></i> Kembalikan ke Aktif</button>
      </div>
    `, `<button class="btn btn-sekunder" data-modal-tutup="modal-status">Tutup</button>`)}

    <!-- Modal Impor -->
    ${renderModal('modal-impor', 'Impor Siswa', `
      <div class="panel-impor">
        <div class="baris-tmpl">
          <button class="btn btn-sekunder btn-kecil" id="btn-unduh-template"><i data-lucide="file-down"></i> Unduh Template</button>
          <span style="font-size:.82rem; color:var(--teks-ringan)">Kolom: NISN, NIS, Nama, Jenis Kelamin, Tanggal Lahir (yyyy-MM-dd), Kelas, Varian</span>
        </div>
        <label class="drop" for="file-impor">
          <i data-lucide="file-spreadsheet"></i><br/>
          Klik untuk memilih berkas Excel/CSV
          <input type="file" id="file-impor" accept=".xlsx,.xls,.csv" />
        </label>
      </div>
      <div id="pratinjau-impor"></div>
      <div id="impor-hasil"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-impor">Tutup</button>
      <button class="btn" id="btn-jalankan-impor" disabled><i data-lucide="upload"></i> Impor</button>
    `, true)}

    <!-- Modal Terapkan Varian ke Kelas -->
    ${renderModal('modal-varian-kelas', 'Terapkan Varian ke Kelas', `
      <p style="font-size:.85rem; color:var(--teks-ringan); margin:0 0 .75rem">
        Seluruh siswa aktif di kelas terpilih akan diberi varian mapel yang dipilih.
      </p>
      <div class="field"><label class="label" for="vk-kelas">Kelas</label>
        <select class="select" id="vk-kelas">
          <option value="">— pilih —</option>
          ${state.kelasList.map(k => `<option value="${escape(k.id_kelas)}" data-tingkat="${escape(k.tingkat)}">${escape(k.nama_kelas)}</option>`).join('')}
        </select></div>
      <div class="field"><label class="label" for="vk-varian">Varian</label>
        <select class="select" id="vk-varian"><option value="">— pilih —</option></select>
        <div class="petunjuk" id="vk-petunjuk">Pilih kelas dahulu untuk menampilkan varian yang berlaku.</div></div>
      <div id="vk-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-varian-kelas">Batal</button>
      <button class="btn" id="btn-jalankan-vk"><i data-lucide="layers"></i> Terapkan</button>
    `)}
  `;
}

// =========================== RENDER ISI TABEL ===========================

function renderIsi() {
  const wadah = document.getElementById('tabel-siswa');
  const pagin = document.getElementById('paginasi-siswa');
  if (!wadah) return;

  const kolom = [
    { k: 'nisn', judul: 'NISN' },
    { k: 'nis', judul: 'NIS' },
    { k: 'nama', judul: 'Nama' },
    { k: 'jenis_kelamin', judul: 'JK', kelas: 'tengah' },
    { k: 'tanggal_lahir', judul: 'Tgl Lahir', render: v => escape(formatTanggal(v)) },
    { k: 'kelas_saat_ini', judul: 'Kelas', render: v => v ? escape(v.nama_kelas) : `<span style="color:var(--teks-ringan)">—</span>` },
    { k: 'nama_varian', judul: 'Varian', render: v => v ? escape(v) : '' },
    { k: 'status', judul: 'Status', render: v => chipStatus(v), kelas: 'tengah' },
    { k: 'id_siswa', judul: 'Aksi', render: (id, row) => aksiBaris(row), kelas: 'aksi' }
  ];

  if (!state.siswa.length) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="users"></i><h3>Belum ada siswa</h3><p>Tambah siswa baru atau impor dari berkas Excel.</p></div>`;
    pagin.innerHTML = '';
    renderIkon();
    return;
  }

  // Paginasi sisi klien.
  const awal = (state.halaman - 1) * PER_HALAMAN;
  const potong = state.siswa.slice(awal, awal + PER_HALAMAN);
  wadah.innerHTML = renderTabel(kolom, potong, { kosongPesan: 'Tidak ada siswa pada halaman ini.', padat: true });
  pagin.innerHTML = renderPaginasi(state.total, state.halaman, PER_HALAMAN);
  renderIkon();
}

/** Tombol aksi pada baris tabel (disesuaikan dengan peran). */
function aksiBaris(row) {
  if (!state.bolehTulis) {
    return `<span style="color:var(--teks-ringan); font-size:.78rem">lihat</span>`;
  }
  const edit = tombolAksi('pencil', 'Edit', 'edit', row.id_siswa);
  const status = tombolAksi('chevron-down', 'Ubah Status', 'status', row.id_siswa);
  const hapus = tombolAksi('trash-2', 'Hapus', 'hapus', row.id_siswa, 'err');
  return edit + status + hapus;
}

// =========================== LISTENER ===========================

function pasangListener() {
  // Filter change.
  ['flt-tingkat', 'flt-kelas', 'flt-status', 'flt-varian'].forEach(id => {
    const elm = document.getElementById(id);
    if (!elm) return;
    elm.addEventListener('change', () => {
      const kunci = id.replace('flt-', '');
      state.filter[kunci === 'varian' ? 'id_varian' : (kunci === 'kelas' ? 'id_kelas' : kunci)] = elm.value;
      muatDaftar(true).then(renderIsi);
    });
  });

  // Search dengan debounce.
  const q = document.getElementById('flt-q');
  if (q) {
    const handler = debung(async () => {
      state.filter.q = q.value.trim();
      await muatDaftar(true);
      renderIsi();
    }, 400);
    q.addEventListener('input', handler);
  }

  // Tombol toolbar.
  document.getElementById('btn-tambah')?.addEventListener('click', () => bukaFormSiswa(null));
  document.getElementById('btn-impor')?.addEventListener('click', () => bukaImpor());
  document.getElementById('btn-varian-kelas')?.addEventListener('click', () => bukaVarianKelas());
  document.getElementById('btn-ekspor')?.addEventListener('click', eksporSiswa);

  // Paginasi.
  document.getElementById('paginasi-siswa')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-halaman]');
    if (!btn || btn.disabled) return;
    state.halaman = Number(btn.dataset.halaman);
    renderIsi();
  });

  // Aksi baris.
  document.getElementById('tabel-siswa')?.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    const status = e.target.closest('[data-status]');
    const hapus = e.target.closest('[data-hapus]');
    if (edit) bukaFormSiswa(edit.dataset.edit);
    else if (status) bukaUbahStatus(status.dataset.status);
    else if (hapus) hapusSiswa(hapus.dataset.hapus);
  });

  // Form siswa: ganti kelas → muat varian.
  document.getElementById('sis-kelas')?.addEventListener('change', muatVarianUntukKelas);

  // Simpan siswa.
  document.getElementById('btn-simpan-siswa')?.addEventListener('click', simpanSiswa);

  // Status.
  document.getElementById('btn-status-keluar')?.addEventListener('click', () => ubahStatus('keluar'));
  document.getElementById('btn-status-lulus')?.addEventListener('click', () => ubahStatus('lulus'));
  document.getElementById('btn-status-aktif')?.addEventListener('click', () => ubahStatus('aktif'));

  // Impor.
  document.getElementById('btn-unduh-template')?.addEventListener('click', unduhTemplateSiswa);
  document.getElementById('file-impor')?.addEventListener('change', bacaBerkasImpor);
  document.getElementById('btn-jalankan-impor')?.addEventListener('click', jalankanImpor);

  // Varian ke kelas.
  document.getElementById('vk-kelas')?.addEventListener('change', muatVarianUntukVk);
  document.getElementById('btn-jalankan-vk')?.addEventListener('click', jalankanVarianKelas);
}

// =========================== FORM TAMBAH/EDIT SISWA ===========================

async function bukaFormSiswa(idSiswa) {
  state.siswaEdit = idSiswa ? state.siswa.find(s => s.id_siswa === idSiswa) : null;
  const galatEl = document.getElementById('sis-galat');
  galatEl.textContent = '';

  const s = state.siswaEdit || {};
  document.getElementById('sis-nisn').value = s.nisn || '';
  document.getElementById('sis-nis').value = s.nis || '';
  document.getElementById('sis-nama').value = s.nama || '';
  document.getElementById('sis-jk').value = s.jenis_kelamin || 'L';
  document.getElementById('sis-tgl-lahir').value = tanggalInputValue(s.tanggal_lahir);
  document.getElementById('sis-catatan').value = s.catatan || '';

  // Kelas saat ini (jika edit).
  const selKelas = document.getElementById('sis-kelas');
  selKelas.value = (s.kelas_saat_ini && s.kelas_saat_ini.id_kelas) || '';
  muatVarianUntukKelas();

  // Set varian setelah opsi dimuat.
  if (s.id_varian_pilihan) {
    const selVarian = document.getElementById('sis-varian');
    if (selVarian) selVarian.value = s.id_varian_pilihan;
  }

  // Judul modal.
  const judul = document.querySelector('#modal-siswa .modal-head h3');
  if (judul) judul.textContent = state.siswaEdit ? 'Edit Siswa' : 'Tambah Siswa';

  modalBuka('modal-siswa');
}

/** Saat kelas diubah di form, periksa apakah tingkat kelas punya slot multi-varian. */
function muatVarianUntukKelas() {
  const selKelas = document.getElementById('sis-kelas');
  const bungkus = document.getElementById('sis-varian-bungkus');
  const selVarian = document.getElementById('sis-varian');
  if (!selKelas || !bungkus || !selVarian) return;

  const opt = selKelas.options[selKelas.selectedIndex];
  const tingkat = opt ? Number(opt.dataset.tingkat) : null;
  const smv = tingkat ? state.multiVarian[tingkat] : null;

  if (smv) {
    // Tampilkan select varian dengan variannya.
    selVarian.innerHTML = '<option value="">— pilih —</option>' +
      smv.varian.map(v => `<option value="${escape(v.id_varian)}">${escape(v.nama)}</option>`).join('');
    bungkus.style.display = '';
  } else {
    // Tidak ada slot multi-varian: sembunyikan & kosongkan.
    selVarian.innerHTML = '<option value="">— pilih —</option>';
    selVarian.value = '';
    bungkus.style.display = 'none';
  }
}

async function simpanSiswa() {
  const galatEl = document.getElementById('sis-galat');
  galatEl.textContent = '';
  const btn = document.getElementById('btn-simpan-siswa');

  const kelas = document.getElementById('sis-kelas').value;
  if (!kelas) { galatEl.textContent = 'Kelas wajib dipilih.'; return; }

  const opt = document.getElementById('sis-kelas').options[document.getElementById('sis-kelas').selectedIndex];
  const tingkat = opt ? Number(opt.dataset.tingkat) : null;
  const smv = tingkat ? state.multiVarian[tingkat] : null;
  const varianVal = document.getElementById('sis-varian').value;
  if (smv && !varianVal) {
    galatEl.textContent = `Varian wajib untuk slot multi-varian: ${smv.nama}.`;
    return;
  }

  const siswa = {
    nisn: document.getElementById('sis-nisn').value.trim(),
    nis: document.getElementById('sis-nis').value.trim(),
    nama: document.getElementById('sis-nama').value.trim(),
    jenis_kelamin: document.getElementById('sis-jk').value,
    tanggal_lahir: document.getElementById('sis-tgl-lahir').value,
    id_kelas: kelas
  };
  if (state.siswaEdit) siswa.id_siswa = state.siswaEdit.id_siswa;
  if (smv) siswa.id_varian_pilihan = varianVal;
  const catatan = document.getElementById('sis-catatan').value.trim();
  if (catatan) siswa.catatan = catatan;

  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    const hasil = await panggil('siswa_simpan', { id_ta: state.idTa, siswa }, state.token);
    toast(`Siswa ${hasil.siswa.aksi === 'baru' ? 'ditambahkan' : 'diperbarui'}.`, 'ok');
    modalTutup('modal-siswa');
    await muatDaftar(false);
    renderIsi();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan`;
    renderIkon();
  }
}

// =========================== UBAH STATUS ===========================

function bukaUbahStatus(idSiswa) {
  state.siswaStatus = state.siswa.find(s => s.id_siswa === idSiswa) || null;
  const namaEl = document.getElementById('status-nama');
  if (namaEl && state.siswaStatus) namaEl.textContent = state.siswaStatus.nama;
  document.getElementById('status-galat').textContent = '';
  modalBuka('modal-status');
}

async function ubahStatus(status) {
  if (!state.siswaStatus) return;
  const galatEl = document.getElementById('status-galat');
  galatEl.textContent = '';
  const konfirmasi = status === 'aktif'
    ? `Kembalikan ${state.siswaStatus.nama} ke status Aktif?`
    : `Tandai ${state.siswaStatus.nama} sebagai ${status === 'keluar' ? 'Keluar' : 'Lulus'}?`;
  if (!confirm(konfirmasi)) return;

  try {
    const data = { id_siswa: state.siswaStatus.id_siswa, status };
    if (status === 'keluar') {
      const alasan = prompt('Alasan keluar (opsional):', '');
      if (alasan !== null && alasan.trim()) data.alasan = alasan.trim();
    }
    await panggil('siswa_status', data, state.token);
    toast('Status siswa diperbarui.', 'ok');
    modalTutup('modal-status');
    await muatDaftar(false);
    renderIsi();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
  }
}

// =========================== HAPUS ===========================

async function hapusSiswa(idSiswa) {
  const s = state.siswa.find(x => x.id_siswa === idSiswa);
  if (!s) return;
  if (!confirm(`Hapus permanen siswa "${s.nama}"?\n\nCatatan: siswa yang sudah punya data nilai atau riwayat kelas tidak dapat dihapus permanen — gunakan perubahan status (Keluar/Lulus).`)) return;
  try {
    await panggil('siswa_hapus', { id_siswa: idSiswa }, state.token);
    toast('Siswa dihapus permanen.', 'ok');
    await muatDaftar(false);
    renderIsi();
  } catch (err) {
    toast(pesanGalat(err), 'err');
  }
}

// =========================== IMPOR ===========================

function bukaImpor() {
  state.barisImpor = [];
  document.getElementById('pratinjau-impor').innerHTML = '';
  document.getElementById('impor-hasil').innerHTML = '';
  document.getElementById('file-impor').value = '';
  document.getElementById('btn-jalankan-impor').disabled = true;
  modalBuka('modal-impor');
}

function unduhTemplateSiswa() {
  unduhTemplate('template_siswa.xlsx', 'Siswa',
    ['NISN', 'NIS', 'Nama', 'Jenis Kelamin', 'Tanggal Lahir', 'Kelas', 'Varian'],
    [
      ['0098765432', '24001', 'Budi Santoso', 'L', '2010-05-15', '7A', 'Seni Budaya'],
      ['0098765433', '24002', 'Siti Aminah', 'P', '2010-08-21', '7A', 'Prakarya'],
      ['0098765434', '24003', 'Ahmad Fauzi', 'L', '2010-03-10', '7B', 'Seni Budaya']
    ]
  );
  toast('Template diunduh.', 'info');
}

async function bacaBerkasImpor(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const wadah = document.getElementById('pratinjau-impor');
  const btnImpor = document.getElementById('btn-jalankan-impor');
  wadah.innerHTML = spin('Membaca berkas...');
  btnImpor.disabled = true;
  try {
    const baris = await bacaFileKeBaris(file);
    if (!baris.length) {
      wadah.innerHTML = `<div class="kosong"><p>Berkas kosong atau tidak ada baris data.</p></div>`;
      return;
    }
    state.barisImpor = baris;
    // Normalisasi kunci header (spasi/kapital).
    const normal = baris.map(b => ({
      nisn: b.NISN || b.nisn || b.Nisn || '',
      nis: b.NIS || b.nis || b.Nis || '',
      nama: b.Nama || b.nama || b.NAMA || '',
      jenis_kelamin: b['Jenis Kelamin'] || b.jenis_kelamin || b.JK || '',
      tanggal_lahir: b['Tanggal Lahir'] || b.tanggal_lahir || '',
      kelas: b.Kelas || b.kelas || '',
      varian: b.Varian || b.varian || ''
    }));
    state.barisImpor = normal;
    wadah.innerHTML = renderTabel(
      [
        { k: 'nisn', judul: 'NISN' },
        { k: 'nis', judul: 'NIS' },
        { k: 'nama', judul: 'Nama' },
        { k: 'jenis_kelamin', judul: 'JK' },
        { k: 'tanggal_lahir', judul: 'Tgl Lahir' },
        { k: 'kelas', judul: 'Kelas' },
        { k: 'varian', judul: 'Varian' }
      ],
      normal,
      { kosongPesan: 'Tidak ada baris.', padat: true, id: 'tabel-pratinjau-impor' }
    );
    btnImpor.disabled = false;
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><p>Gagal membaca berkas: ${escape(String(err.message || err))}</p></div>`;
  }
}

async function jalankanImpor() {
  if (!state.barisImpor.length) return;
  const hasilEl = document.getElementById('impor-hasil');
  const btn = document.getElementById('btn-jalankan-impor');
  btn.disabled = true; btn.innerHTML = spin('Mengimpor...');
  hasilEl.innerHTML = '';
  try {
    const hasil = await panggil('siswa_impor', { id_ta: state.idTa, baris: state.barisImpor }, state.token);
    const diproses = hasil.diproses || [];
    const baru = diproses.filter(d => d.aksi === 'baru').length;
    const diperbarui = diproses.filter(d => d.aksi === 'diperbarui').length;
    hasilEl.innerHTML = `
      <div class="kartu" style="margin-top:1rem">
        <div class="kartu-title">Hasil Impor</div>
        <p style="margin:0 0 .5rem">Total diproses: <strong>${hasil.jumlah}</strong> siswa.</p>
        <p style="margin:0 0 .5rem">Baru: <strong>${baru}</strong> · Diperbarui: <strong>${diperbarui}</strong>.</p>
        <details><summary>Rincian</summary>
          <ul style="margin:.5rem 0 0; padding-left:1.25rem; font-size:.82rem">
            ${diproses.map(d => `<li>${escape(d.nama)} (${escape(d.nisn || '-')}) — ${escape(d.aksi)}</li>`).join('')}
          </ul>
        </details>
      </div>`;
    toast(`Impor selesai: ${hasil.jumlah} siswa.`, 'ok');
    await muatDaftar(false);
    renderIsi();
  } catch (err) {
    // VALIDASI server menyebut baris bermasalah.
    hasilEl.innerHTML = `<div class="galat-field" style="margin-top:1rem">${escape(pesanGalat(err))}</div>`;
    toast('Impor gagal. Lihat pesan galat.', 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="upload"></i> Impor`;
    renderIkon();
  }
}

// =========================== TERAPKAN VARIAN KE KELAS ===========================

function bukaVarianKelas() {
  document.getElementById('vk-kelas').value = '';
  document.getElementById('vk-varian').innerHTML = '<option value="">— pilih —</option>';
  document.getElementById('vk-petunjuk').textContent = 'Pilih kelas dahulu untuk menampilkan varian yang berlaku.';
  document.getElementById('vk-galat').textContent = '';
  modalBuka('modal-varian-kelas');
}

function muatVarianUntukVk() {
  const selKelas = document.getElementById('vk-kelas');
  const selVarian = document.getElementById('vk-varian');
  const petunjuk = document.getElementById('vk-petunjuk');
  if (!selKelas || !selVarian) return;
  const opt = selKelas.options[selKelas.selectedIndex];
  const tingkat = opt ? Number(opt.dataset.tingkat) : null;
  const smv = tingkat ? state.multiVarian[tingkat] : null;
  if (smv) {
    selVarian.innerHTML = '<option value="">— pilih —</option>' +
      smv.varian.map(v => `<option value="${escape(v.id_varian)}">${escape(v.nama)}</option>`).join('');
    petunjuk.textContent = `Slot multi-varian untuk tingkat ${tingkat}: ${smv.nama}.`;
  } else {
    selVarian.innerHTML = '<option value="">— pilih —</option>';
    petunjuk.textContent = `Tidak ada slot multi-varian untuk tingkat ${tingkat || '?'}. Varian tidak diperlukan.`;
  }
}

async function jalankanVarianKelas() {
  const galatEl = document.getElementById('vk-galat');
  galatEl.textContent = '';
  const idKelas = document.getElementById('vk-kelas').value;
  const idVarian = document.getElementById('vk-varian').value;
  if (!idKelas) { galatEl.textContent = 'Pilih kelas.'; return; }
  if (!idVarian) { galatEl.textContent = 'Pilih varian.'; return; }

  const btn = document.getElementById('btn-jalankan-vk');
  btn.disabled = true; btn.innerHTML = spin('Memproses...');
  try {
    const hasil = await panggil('siswa_varian_kelas', { id_ta: state.idTa, id_kelas: idKelas, id_varian: idVarian }, state.token);
    toast(`${hasil.diperbarui} siswa diperbarui variannya.`, 'ok');
    modalTutup('modal-varian-kelas');
    await muatDaftar(false);
    renderIsi();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="layers"></i> Terapkan`;
    renderIkon();
  }
}

// =========================== EKSPOR ===========================

async function eksporSiswa() {
  toast('Menyiapkan ekspor...', 'info');
  try {
    // Ambil seluruh siswa aktif TA ini (tanpa filter search agar lengkap).
    const hasil = await panggil('siswa_daftar', {
      id_ta: state.idTa,
      status: state.filter.status || undefined,
      tingkat: state.filter.tingkat || undefined,
      id_kelas: state.filter.id_kelas || undefined,
      id_varian: state.filter.id_varian || undefined
    }, state.token);
    const baris = (hasil.siswa || []).map(s => ({
      NISN: s.nisn || '',
      NIS: s.nis || '',
      Nama: s.nama || '',
      'Jenis Kelamin': s.jenis_kelamin || '',
      'Tgl Lahir': s.tanggal_lahir || '',
      Kelas: (s.kelas_saat_ini && s.kelas_saat_ini.nama_kelas) || '',
      Varian: s.nama_varian || '',
      Status: s.status || ''
    }));
    if (!baris.length) { toast('Tidak ada siswa untuk diekspor.', 'warn'); return; }
    unduhExcel(`siswa_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Siswa', baris);
    toast(`${baris.length} siswa diekspor.`, 'ok');
  } catch (err) {
    toast(pesanGalat(err), 'err');
  }
}
