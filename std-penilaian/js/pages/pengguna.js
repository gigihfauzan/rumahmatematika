// pengguna.js — Halaman Akun Pengguna (Tahap 2A).
// Daftar + filter, tambah/edit multi-peran, status aktif/nonaktif, reset password,
// impor massal dengan pratinjau & unduh daftar akun awal.
// Hak: hanya admin.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { renderTabel, renderPaginasi, renderModal, modalBuka, modalTutup, chip, tombolAksi } from '../komponen.js';
import { bacaFileKeBaris, unduhExcel, unduhTemplate } from '../excel.js';

const PERAN_LIST = ['admin', 'standar_penilaian', 'guru', 'kepsek'];
const PER_HALAMAN = 20;

// State halaman.
const state = {
  sesi: null,
  token: null,
  semua: [],         // hasil pengguna_daftar (seluruhnya, paginasi sisi klien)
  filter: { q: '', peran: '', status: '' },
  halaman: 1,
  barisImpor: [],    // baris hasil baca berkas untuk pratinjau
  hasilImpor: null,  // hasil pengguna_impor {dibuat, jumlah}
  passwordSaatIni: [], // password akun baru untuk diunduh dari modal password
  penggunaEdit: null
};

/** Debounce input pencarian. */
function debung(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// =========================== ENTRY ===========================

export async function renderPengguna(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.filter = { q: '', peran: '', status: '' };
  state.halaman = 1;
  state.barisImpor = [];
  state.hasilImpor = null;
  state.passwordSaatIni = [];
  state.penggunaEdit = null;

  document.getElementById('topbar-judul').textContent = 'Akun Pengguna';
  const main = document.getElementById('main');

  if (!boleh(sesi.peran, 'admin')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini khusus administrator.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat pengguna...');
  await muatDaftar();
  renderKerangka();
  renderIsi();
  renderIkon();
  pasangListener();
}

// =========================== MUAT DAFTAR ===========================

async function muatDaftar() {
  try {
    const d = await panggil('pengguna_daftar', {
      q: state.filter.q, peran: state.filter.peran, status: state.filter.status
    }, state.token);
    state.semua = d.pengguna || [];
  } catch (err) {
    state.semua = [];
    toast(pesanGalat(err), 'err');
  }
}

// =========================== RENDER KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Akun Pengguna</h1>
    <div class="toolbar">
      <div class="tumbal"><label class="label" for="flt-q">Cari</label>
        <input class="input" id="flt-q" placeholder="Nama / username / NIP" autocomplete="off" /></div>
      <div class="tumbal"><label class="label" for="flt-peran">Peran</label>
        <select class="select" id="flt-peran">
          <option value="">Semua</option>
          ${PERAN_LIST.map(p => `<option value="${escape(p)}">${escape(p)}</option>`).join('')}
        </select></div>
      <div class="tumbal"><label class="label" for="flt-status">Status</label>
        <select class="select" id="flt-status">
          <option value="">Semua</option>
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
        </select></div>
      <div class="kelompok-aksi">
        <button class="btn btn-kecil" id="btn-tambah"><i data-lucide="user-plus"></i> Tambah Akun</button>
      </div>
    </div>
    <div id="tabel-pengguna"></div>
    <div id="paginasi-pengguna"></div>

    <div class="kartu" style="margin-top:1.5rem">
      <div class="kartu-title">Impor Massal</div>
      <div class="panel-impor">
        <div class="baris-tmpl">
          <button class="btn btn-sekunder btn-kecil" id="btn-template"><i data-lucide="download"></i> Unduh Template</button>
          <button class="btn btn-sekunder btn-kecil" id="btn-pilih-file"><i data-lucide="upload"></i> Pilih Berkas Excel</button>
          <input type="file" id="file-impor" accept=".xlsx,.xls,.csv" />
          <button class="btn btn-kecil" id="btn-impor" disabled><i data-lucide="file-up"></i> Impor</button>
        </div>
        <div id="pratinjau-impor"></div>
      </div>
    </div>

    <!-- Modal Tambah/Edit Pengguna -->
    ${renderModal('modal-pengguna', 'Akun Pengguna', `
      <input type="hidden" id="p-id" />
      <div class="field"><label class="label" for="p-nama">Nama Lengkap</label>
        <input class="input" id="p-nama" autocomplete="off" /></div>
      <div class="field"><label class="label" for="p-nip">NIP</label>
        <input class="input" id="p-nip" autocomplete="off" /></div>
      <div class="field" id="p-username-field">
        <label class="label" for="p-username">Username (opsional)</label>
        <input class="input" id="p-username" placeholder="kosongkan untuk dibuat otomatis" autocomplete="off" />
        <div class="petunjuk">Hanya saat tambah akun. Jika dikosongkan, dibuat dari nama lengkap.</div>
      </div>
      <div class="field">
        <label class="label">Peran</label>
        <div style="display:flex; gap:1rem; flex-wrap:wrap">
          ${PERAN_LIST.map(p => `<label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.35rem">
            <input type="checkbox" value="${escape(p)}" class="p-peran" /> ${escape(p)}</label>`).join('')}
        </div>
        <div class="petunjuk">Centang satu atau beberapa peran.</div>
      </div>
      <div id="p-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-pengguna">Batal</button>
      <button class="btn" id="btn-simpan"><i data-lucide="save"></i> Simpan</button>
    `)}

    <!-- Modal Password Awal (akun baru / reset) -->
    ${renderModal('modal-password', 'Password Awal', `
      <p style="margin:0 0 .75rem">Password ditampilkan <strong>sekali saja</strong>. Salin segera dan berikan kepada pengguna.</p>
      <div id="password-isi"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-password">Tutup</button>
      <button class="btn" id="btn-unduh-password"><i data-lucide="download"></i> Unduh Excel</button>
    `)}

    <!-- Modal Hasil Impor -->
    ${renderModal('modal-impor-hasil', 'Daftar Akun Awal', `
      <p style="margin:0 0 .75rem">Berikut daftar akun baru dan password awalnya. Unduh untuk dibagikan kepada pengguna.</p>
      <div id="impor-hasil-isi"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-impor-hasil">Tutup</button>
      <button class="btn" id="btn-unduh-impor"><i data-lucide="download"></i> Unduh Excel</button>
    `, true)}
  `;
}

// =========================== RENDER ISI ===========================

function renderIsi() {
  const wadah = document.getElementById('tabel-pengguna');
  const pagin = document.getElementById('paginasi-pengguna');
  if (!wadah) return;

  const total = state.semua.length;
  const jmlHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));
  if (state.halaman > jmlHalaman) state.halaman = jmlHalaman;
  const awal = (state.halaman - 1) * PER_HALAMAN;
  const potong = state.semua.slice(awal, awal + PER_HALAMAN);

  const kolom = [
    { k: 'username', judul: 'Username' },
    { k: 'nama_lengkap', judul: 'Nama Lengkap' },
    { k: 'nip', judul: 'NIP', render: v => escape(v || '-') },
    {
      k: 'peran', judul: 'Peran',
      render: v => (String(v || '').split(',').map(p => p.trim()).filter(Boolean).map(p => chip(p, 'info')).join(' ') || chip('-', 'netral'))
    },
    {
      k: 'status', judul: 'Status',
      render: v => (v === 'aktif' ? chip('Aktif', 'ok') : chip('Nonaktif', 'netral'))
    },
    { k: 'login_terakhir', judul: 'Login Terakhir', render: v => escape(v || '-') },
    {
      k: 'id_pengguna', judul: 'Aksi', kelas: 'aksi',
      render: (v, r) => `
        ${tombolAksi('pencil', 'Edit', 'edit', r.id_pengguna)}
        ${tombolAksi('key-round', 'Reset Password', 'reset', r.id_pengguna)}
        ${r.status === 'aktif'
          ? `<button class="btn btn-kecil btn-sekunder ikon-btn" data-status="${escape(r.id_pengguna)}" data-val="nonaktif" title="Nonaktifkan"><i data-lucide="circle-slash"></i></button>`
          : `<button class="btn btn-kecil btn-sekunder ikon-btn" data-status="${escape(r.id_pengguna)}" data-val="aktif" title="Aktifkan"><i data-lucide="circle-check"></i></button>`}`
    }
  ];

  wadah.innerHTML = renderTabel(kolom, potong, { kosongPesan: 'Tidak ada pengguna yang cocok.', padat: true });
  pagin.innerHTML = renderPaginasi(total, state.halaman, PER_HALAMAN);
  renderIkon();
}

// =========================== LISTENER ===========================

function pasangListener() {
  // Filter.
  const q = document.getElementById('flt-q');
  if (q) {
    const handler = debung(async () => {
      state.filter.q = q.value.trim();
      state.halaman = 1;
      await muatDaftar();
      renderIsi();
    }, 300);
    q.addEventListener('input', handler);
  }
  document.getElementById('flt-peran')?.addEventListener('change', (e) => {
    state.filter.peran = e.target.value;
    state.halaman = 1;
    muatDaftar().then(renderIsi);
  });
  document.getElementById('flt-status')?.addEventListener('change', (e) => {
    state.filter.status = e.target.value;
    state.halaman = 1;
    muatDaftar().then(renderIsi);
  });

  // Paginasi.
  document.getElementById('paginasi-pengguna')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-halaman]');
    if (!b || b.disabled) return;
    state.halaman = Number(b.dataset.halaman);
    renderIsi();
  });

  // Aksi baris (delegasi).
  document.getElementById('tabel-pengguna')?.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    const reset = e.target.closest('[data-reset]');
    const status = e.target.closest('[data-status]');
    if (edit) {
      const r = state.semua.find(x => x.id_pengguna === edit.dataset.edit);
      if (r) bukaForm(r);
    } else if (reset) {
      resetPassword(reset);
    } else if (status) {
      ubahStatus(status);
    }
  });

  // Tombol toolbar.
  document.getElementById('btn-tambah')?.addEventListener('click', () => bukaForm(null));
  document.getElementById('btn-simpan')?.addEventListener('click', simpan);

  // Impor.
  document.getElementById('btn-template')?.addEventListener('click', unduhTemplatePengguna);
  document.getElementById('btn-pilih-file')?.addEventListener('click', () => document.getElementById('file-impor').click());
  document.getElementById('file-impor')?.addEventListener('change', (e) => bacaBerkasImpor(e));
  document.getElementById('btn-impor')?.addEventListener('click', jalankanImpor);

  // Unduh hasil.
  document.getElementById('btn-unduh-password')?.addEventListener('click', unduhPasswordSaatIni);
  document.getElementById('btn-unduh-impor')?.addEventListener('click', unduhHasilImpor);
}

// =========================== FORM TAMBAH/EDIT ===========================

function bukaForm(pengguna) {
  state.penggunaEdit = pengguna || null;
  document.getElementById('p-id').value = pengguna ? pengguna.id_pengguna : '';
  document.getElementById('p-nama').value = pengguna ? pengguna.nama_lengkap : '';
  document.getElementById('p-nip').value = pengguna ? (pengguna.nip || '') : '';
  document.getElementById('p-username').value = pengguna ? pengguna.username : '';
  // Saat edit: username dikunci.
  const uj = document.getElementById('p-username');
  uj.disabled = !!pengguna;
  // Set checkbox peran.
  const dipilih = pengguna ? String(pengguna.peran || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  document.querySelectorAll('.p-peran').forEach(cb => { cb.checked = dipilih.includes(cb.value); });
  document.getElementById('p-galat').textContent = '';
  // Judul modal.
  const judul = document.querySelector('#modal-pengguna .modal-head h3');
  if (judul) judul.textContent = pengguna ? 'Edit Pengguna' : 'Tambah Pengguna';
  modalBuka('modal-pengguna');
}

async function simpan() {
  const galatEl = document.getElementById('p-galat');
  galatEl.textContent = '';
  const id = document.getElementById('p-id').value || null;
  const nama = document.getElementById('p-nama').value.trim();
  const nip = document.getElementById('p-nip').value.trim();
  const username = document.getElementById('p-username').value.trim();
  const peran = Array.from(document.querySelectorAll('.p-peran:checked')).map(cb => cb.value).join(',');
  if (!nama) { galatEl.textContent = 'Nama lengkap wajib diisi.'; return; }
  if (!peran) { galatEl.textContent = 'Pilih minimal satu peran.'; return; }

  const btn = document.getElementById('btn-simpan');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    const d = await panggil('pengguna_simpan', {
      id_pengguna: id, username, nama_lengkap: nama, nip, peran
    }, state.token);
    if (d.password_awal) {
      // Akun baru → tampilkan password sekali.
      state.passwordSaatIni = [{ username: d.pengguna.username, password_awal: d.password_awal }];
      tampilkanPassword(state.passwordSaatIni);
      toast('Akun baru dibuat. Password awal ditampilkan.', 'ok');
    } else {
      toast('Pengguna diperbarui.', 'ok');
    }
    modalTutup('modal-pengguna');
    await muatDaftar();
    renderIsi();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan`;
    renderIkon();
  }
}

// =========================== STATUS & RESET ===========================

async function ubahStatus(btn) {
  const id = btn.dataset.status;
  const val = btn.dataset.val;
  btn.disabled = true;
  try {
    await panggil('pengguna_status', { id_pengguna: id, status: val }, state.token);
    toast('Status diperbarui.', 'ok');
    await muatDaftar();
    renderIsi();
  } catch (err) {
    toast(pesanGalat(err), 'err');
    btn.disabled = false;
  }
}

async function resetPassword(btn) {
  const id = btn.dataset.reset;
  if (!confirm('Reset password pengguna ini? Password baru akan ditampilkan sekali.')) return;
  btn.disabled = true;
  try {
    const d = await panggil('pengguna_reset_password', { id_pengguna: id }, state.token);
    state.passwordSaatIni = [{ username: d.username, password_awal: d.password_awal }];
    tampilkanPassword(state.passwordSaatIni);
    toast('Password direset. Password baru ditampilkan.', 'ok');
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false;
  }
}

// =========================== PASSWORD AWAL ===========================

/** Kolom password dengan input hanya-baca + tombol salin (menjamin hasil salin persis). */
function kolomPassword(v) {
  const aman = escape(v);
  return `<div class="pwd-salin">
    <input class="input input-monospace" readonly value="${aman}" data-pwd="${aman}" />
    <button type="button" class="btn btn-kecil btn-sekunder ikon-btn" data-salin="${aman}" title="Salin password"><i data-lucide="copy"></i></button>
  </div>`;
}

/** Pasang tombol salin password pada wadah. */
function pasangSalinPassword(wadah) {
  if (!wadah) return;
  wadah.querySelectorAll('[data-salin]').forEach(function (btn) {
    if (btn.dataset.terpasang === '1') return;
    btn.dataset.terpasang = '1';
    btn.addEventListener('click', async function () {
      const teks = btn.dataset.salin;
      try {
        await navigator.clipboard.writeText(teks);
        toast('Password disalin.', 'ok');
      } catch (e) {
        const inp = btn.parentElement.querySelector('[data-pwd]');
        if (inp) { inp.focus(); inp.select(); try { document.execCommand('copy'); toast('Password disalin.', 'ok'); } catch (e2) { toast('Gagal menyalin. Salin manual dari kotak.', 'err'); } }
        else toast('Gagal menyalin. Salin manual dari kotak.', 'err');
      }
    });
  });
}

function tampilkanPassword(daftar) {
  const isi = document.getElementById('password-isi');
  if (!isi) return;
  isi.innerHTML = renderTabel(
    [
      { k: 'username', judul: 'Username', render: v => `<code>${escape(v)}</code>` },
      { k: 'password_awal', judul: 'Password Awal', render: v => kolomPassword(v) }
    ],
    daftar,
    { kosongPesan: 'Tidak ada.' }
  );
  modalBuka('modal-password');
  renderIkon();
  pasangSalinPassword(isi);
}

function unduhPasswordSaatIni() {
  if (!state.passwordSaatIni.length) return;
  unduhExcel('password-awal.xlsx', 'Password',
    state.passwordSaatIni.map(p => ({ Username: p.username, 'Password Awal': p.password_awal })));
}

// =========================== IMPOR ===========================

function unduhTemplatePengguna() {
  unduhTemplate('template-pengguna.xlsx', 'Pengguna',
    ['nama_lengkap', 'NIP', 'username', 'peran'],
    [
      ['Budi Santoso', '198501012010011001', '', 'guru'],
      ['Siti Aminah', '198203152008012002', 'siti.aminah', 'guru,standar_penilaian']
    ]
  );
  toast('Template diunduh.', 'info');
}

/** Normalisasi key hasil baca ke huruf kecil + trim, agar cocok dengan kontrak. */
function normalisasiBaris(b) {
  const o = {};
  Object.keys(b).forEach(k => { o[String(k).trim().toLowerCase()] = b[k]; });
  return {
    nama_lengkap: o.nama_lengkap || o.nama || '',
    nip: o.nip || '',
    username: o.username || '',
    peran: o.peran || ''
  };
}

async function bacaBerkasImpor(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const wadah = document.getElementById('pratinjau-impor');
  const btnImpor = document.getElementById('btn-impor');
  wadah.innerHTML = spin('Membaca berkas...');
  btnImpor.disabled = true;
  try {
    const baris = await bacaFileKeBaris(file);
    state.barisImpor = (baris || []).map(normalisasiBaris);
    if (!state.barisImpor.length) {
      wadah.innerHTML = `<div class="kosong"><p>Berkas kosong atau tidak terbaca.</p></div>`;
      return;
    }
    // Pratinjau: tandai baris yang kelihatannya bermasalah (nama / peran kosong).
    // Validasi penuh tetap di server.
    const kolom = [
      { k: 'nama_lengkap', judul: 'Nama Lengkap' },
      { k: 'nip', judul: 'NIP' },
      { k: 'username', judul: 'Username' },
      { k: 'peran', judul: 'Peran' }
    ];
    const head = kolom.map(k => `<th>${escape(k.judul)}</th>`).join('');
    let jmlMasalah = 0;
    const body = state.barisImpor.map(r => {
      const masalah = !r.nama_lengkap || !r.peran;
      if (masalah) jmlMasalah++;
      const td = kolom.map(k => `<td>${escape(r[k.k] || '-')}</td>`).join('');
      return `<tr class="${masalah ? 'baris-galat' : ''}">${td}</tr>`;
    }).join('');
    wadah.innerHTML = `
      <p style="margin:.25rem 0 .5rem; font-size:.85rem">
        ${state.barisImpor.length} baris terbaca.
        ${jmlMasalah ? `<span style="color:var(--warn)">${jmlMasalah} baris tampak kurang lengkap (ditandai merah).</span>` : ''}
      </p>
      <div class="tabel-bungkus">
        <table class="tabel tabel-padat">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    btnImpor.disabled = false;
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><p>Gagal membaca berkas: ${escape(String(err.message || err))}</p></div>`;
  } finally {
    renderIkon();
  }
}

async function jalankanImpor() {
  if (!state.barisImpor.length) return;
  const btn = document.getElementById('btn-impor');
  btn.disabled = true; btn.innerHTML = spin('Mengimpor...');
  try {
    const d = await panggil('pengguna_impor', { baris: state.barisImpor }, state.token);
    state.hasilImpor = d;
    // Tampilkan modal hasil.
    const isi = document.getElementById('impor-hasil-isi');
    isi.innerHTML = renderTabel(
      [
        { k: 'username', judul: 'Username', render: v => `<code>${escape(v)}</code>` },
        { k: 'nama_lengkap', judul: 'Nama Lengkap' },
        { k: 'password_awal', judul: 'Password Awal', render: v => kolomPassword(v) }
      ],
      d.dibuat || [],
      { kosongPesan: 'Tidak ada akun baru.' }
    );
    modalBuka('modal-impor-hasil');
    renderIkon();
    pasangSalinPassword(isi);
    toast(`${d.jumlah} akun baru dibuat.`, 'ok');
    // Bersihkan pratinjau & state impor.
    state.barisImpor = [];
    document.getElementById('pratinjau-impor').innerHTML = '';
    document.getElementById('file-impor').value = '';
    document.getElementById('btn-impor').disabled = true;
    await muatDaftar();
    renderIsi();
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="file-up"></i> Impor`;
    renderIkon();
  }
}

function unduhHasilImpor() {
  if (!state.hasilImpor || !state.hasilImpor.dibuat || !state.hasilImpor.dibuat.length) {
    toast('Tidak ada data untuk diunduh.', 'warn');
    return;
  }
  unduhExcel('akun-awal.xlsx', 'Akun Baru',
    state.hasilImpor.dibuat.map(p => ({
      Username: p.username, 'Nama Lengkap': p.nama_lengkap, 'Password Awal': p.password_awal
    })));
}
