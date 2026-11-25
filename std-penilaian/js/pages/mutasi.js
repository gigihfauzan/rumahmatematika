// mutasi.js — Halaman Mutasi Siswa (Tahap 2B).
// Tiga tab: Siswa Masuk, Siswa Keluar, Lulus.
// Hak: hanya admin.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  idTa: null,
  kelasList: [],
  multiVarian: {},        // {tingkat: slot} slot multi-varian
  tabAktif: 'masuk',      // masuk | keluar | lulus
  siswaTerpilih: null,    // siswa yang dipilih untuk keluar/lulus
  debounceCari: null
};

// =========================== ENTRY ===========================

export async function renderMutasi(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  if (!boleh(sesi.peran, 'admin')) {
    document.getElementById('topbar-judul').textContent = 'Mutasi Siswa';
    const main = document.getElementById('main');
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3><p>Halaman ini khusus administrator.</p></div>`;
    renderIkon();
    return;
  }

  document.getElementById('topbar-judul').textContent = 'Mutasi Siswa';
  const main = document.getElementById('main');
  main.innerHTML = spin('Memuat data master...');
  try {
    const [ta, kelas, mapel] = await Promise.all([
      panggil('ta_daftar', {}, state.token),
      panggil('kelas_daftar', {}, state.token),
      panggil('mapel_daftar', {}, state.token)
    ]);
    state.idTa = (ta.aktif && ta.aktif.id_ta) || (ta.ta[0] && ta.ta[0].id_ta) || null;
    state.kelasList = kelas.kelas || [];
    state.multiVarian = {};
    (mapel.slot || []).forEach(s => {
      if ((s.varian || []).length > 1) state.multiVarian[Number(s.tingkat)] = s;
    });
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  renderKerangka();
  tampilkanTab(state.tabAktif);
  renderIkon();
  pasangListener();
}

// =========================== RENDER ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Mutasi Siswa</h1>
    <p style="color:var(--teks-ringan); margin:0 0 1.25rem; max-width:640px">
      Catat siswa masuk (dari sekolah lain), keluar, atau lulus. Perubahan tercatat di riwayat siswa.
    </p>

    <div class="toolbar" style="margin-bottom:1rem">
      <div class="kelompok-aksi">
        <button class="btn btn-kecil btn-sekunder tab-btn ${state.tabAktif === 'masuk' ? 'aktif' : ''}" data-tab="masuk"><i data-lucide="user-plus"></i> Siswa Masuk</button>
        <button class="btn btn-kecil btn-sekunder tab-btn ${state.tabAktif === 'keluar' ? 'aktif' : ''}" data-tab="keluar"><i data-lucide="log-out"></i> Siswa Keluar</button>
        <button class="btn btn-kecil btn-sekunder tab-btn ${state.tabAktif === 'lulus' ? 'aktif' : ''}" data-tab="lulus"><i data-lucide="graduation-cap"></i> Lulus</button>
      </div>
    </div>

    <div id="tab-masuk" class="tab-panel"></div>
    <div id="tab-keluar" class="tab-panel" style="display:none"></div>
    <div id="tab-lulus" class="tab-panel" style="display:none"></div>

    <style>
      .tab-btn.aktif { background: var(--primer); color: var(--primer-fg); border-color: var(--primer) }
      .baris-pilih-siswa { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-top:.5rem }
      .baris-pilih-siswa .chip-pilih { display:inline-flex; align-items:center; gap:.4rem; padding:.35rem .6rem; border:1px solid var(--primer); border-radius:999px; background: color-mix(in srgb, var(--primer) 10%, transparent); font-size:.82rem }
      .baris-pilih-siswa .chip-pilih button { background:none; border:none; color:var(--err); cursor:pointer; padding:0; display:inline-flex }
      .hasil-cari { border:1px solid var(--border); border-radius:var(--radius-sm); margin-top:.4rem; max-height:240px; overflow-y:auto }
      .hasil-cari .item { padding:.45rem .6rem; border-bottom:1px solid var(--border); cursor:pointer; font-size:.85rem }
      .hasil-cari .item:hover { background: var(--permukaan-2) }
      .hasil-cari .item strong { display:block }
      .hasil-cari .item span { color:var(--teks-ringan); font-size:.78rem }
    </style>
  `;
}

/** Tampilkan satu tab, sembunyikan lainnya. */
function tampilkanTab(tab) {
  state.tabAktif = tab;
  ['masuk', 'keluar', 'lulus'].forEach(t => {
    const panel = document.getElementById('tab-' + t);
    if (panel) panel.style.display = (t === tab) ? '' : 'none';
    const btn = document.querySelector(`.tab-btn[data-tab="${t}"]`);
    if (btn) btn.classList.toggle('aktif', t === tab);
  });
  // Render isi tab.
  if (tab === 'masuk') renderTabMasuk();
  else if (tab === 'keluar') renderTabKeluar();
  else if (tab === 'lulus') renderTabLulus();
  renderIkon();
}

// =========================== TAB: SISWA MASUK ===========================

function renderTabMasuk() {
  const panel = document.getElementById('tab-masuk');
  const hariIni = new Date().toISOString().slice(0, 10);
  panel.innerHTML = `
    <div class="kartu">
      <div class="kartu-title">Identitas & Penempatan Siswa Masuk</div>
      <form id="form-masuk">
        <div class="field-row">
          <div class="field"><label class="label" for="m-tanggal">Tanggal Masuk</label>
            <input class="input" id="m-tanggal" type="date" value="${hariIni}" required /></div>
          <div class="field"><label class="label" for="m-asal">Sekolah Asal</label>
            <input class="input" id="m-asal" placeholder="Nama sekolah asal (opsional)" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label class="label" for="m-kelas">Kelas Tujuan</label>
            <select class="select" id="m-kelas" required>
              <option value="">— pilih —</option>
              ${state.kelasList.map(k => `<option value="${escape(k.id_kelas)}" data-tingkat="${escape(k.tingkat)}">${escape(k.nama_kelas)}</option>`).join('')}
            </select></div>
          <div class="field" id="m-varian-bungkus" style="display:none">
            <label class="label" for="m-varian">Varian <span style="color:var(--err)">*</span></label>
            <select class="select" id="m-varian"><option value="">— pilih —</option></select>
            <div class="petunjuk">Kelas pada tingkat ini memiliki slot multi-varian (Seni & Prakarya).</div>
          </div>
        </div>

        <h4 style="margin:1rem 0 .5rem; font-size:.92rem">Identitas Siswa</h4>
        <div class="field-row">
          <div class="field"><label class="label" for="m-nisn">NISN</label>
            <input class="input" id="m-nisn" autocomplete="off" /></div>
          <div class="field"><label class="label" for="m-nis">NIS</label>
            <input class="input" id="m-nis" autocomplete="off" /></div>
        </div>
        <div class="field"><label class="label" for="m-nama">Nama Lengkap</label>
          <input class="input" id="m-nama" autocomplete="off" required /></div>
        <div class="field-row">
          <div class="field"><label class="label" for="m-jk">Jenis Kelamin</label>
            <select class="select" id="m-jk"><option value="L">L</option><option value="P">P</option></select></div>
          <div class="field"><label class="label" for="m-tgl-lahir">Tanggal Lahir</label>
            <input class="input" id="m-tgl-lahir" type="date" /></div>
        </div>

        <div id="m-galat" class="galat-field"></div>
        <button class="btn" type="submit"><i data-lucide="user-plus"></i> Catat Siswa Masuk</button>
      </form>
    </div>`;

  document.getElementById('m-kelas')?.addEventListener('change', muatVarianMasuk);
  document.getElementById('form-masuk')?.addEventListener('submit', simpanMasuk);
}

/** Muat varian untuk kelas yang dipilih di tab masuk. */
function muatVarianMasuk() {
  const selKelas = document.getElementById('m-kelas');
  const bungkus = document.getElementById('m-varian-bungkus');
  const selVarian = document.getElementById('m-varian');
  if (!selKelas || !bungkus || !selVarian) return;
  const opt = selKelas.options[selKelas.selectedIndex];
  const tingkat = opt ? Number(opt.dataset.tingkat) : null;
  const smv = tingkat ? state.multiVarian[tingkat] : null;
  if (smv) {
    selVarian.innerHTML = '<option value="">— pilih —</option>' +
      smv.varian.map(v => `<option value="${escape(v.id_varian)}">${escape(v.nama)}</option>`).join('');
    bungkus.style.display = '';
  } else {
    selVarian.innerHTML = '<option value="">— pilih —</option>';
    selVarian.value = '';
    bungkus.style.display = 'none';
  }
}

async function simpanMasuk(ev) {
  ev.preventDefault();
  const galatEl = document.getElementById('m-galat');
  galatEl.textContent = '';

  const idKelas = document.getElementById('m-kelas').value;
  if (!idKelas) { galatEl.textContent = 'Kelas tujuan wajib.'; return; }
  const opt = document.getElementById('m-kelas').options[document.getElementById('m-kelas').selectedIndex];
  const tingkat = opt ? Number(opt.dataset.tingkat) : null;
  const smv = tingkat ? state.multiVarian[tingkat] : null;
  const idVarian = document.getElementById('m-varian').value;
  if (smv && !idVarian) {
    galatEl.textContent = `Varian wajib untuk slot multi-varian: ${smv.nama}.`;
    return;
  }

  const siswa = {
    nisn: document.getElementById('m-nisn').value.trim(),
    nis: document.getElementById('m-nis').value.trim(),
    nama: document.getElementById('m-nama').value.trim(),
    jenis_kelamin: document.getElementById('m-jk').value,
    tanggal_lahir: document.getElementById('m-tgl-lahir').value
  };
  if (smv && idVarian) siswa.id_varian_pilihan = idVarian;

  const data = {
    jenis: 'masuk',
    siswa,
    tanggal: document.getElementById('m-tanggal').value,
    id_kelas_tujuan: idKelas
  };
  const asal = document.getElementById('m-asal').value.trim();
  if (asal) data.sekolah_asal = asal;
  if (smv && idVarian) data.id_varian = idVarian;

  const btn = ev.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    const hasil = await panggil('mutasi_simpan', data, state.token);
    toast(`Siswa masuk dicatat: ${siswa.nama}.`, 'ok');
    // Reset form (kecuali kelas & varian yang mungkin masih relevan).
    document.getElementById('form-masuk').reset();
    document.getElementById('m-tanggal').value = new Date().toISOString().slice(0, 10);
    muatVarianMasuk();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="user-plus"></i> Catat Siswa Masuk`;
    renderIkon();
  }
}

// =========================== TAB: SISWA KELUAR ===========================

function renderTabKeluar() {
  state.siswaTerpilih = null;
  const panel = document.getElementById('tab-keluar');
  const hariIni = new Date().toISOString().slice(0, 10);
  panel.innerHTML = `
    <div class="kartu">
      <div class="kartu-title">Catat Siswa Keluar</div>
      <div class="field">
        <label class="label" for="k-cari">Cari Siswa Aktif</label>
        <input class="input" id="k-cari" placeholder="Ketik nama / NISN / NIS..." autocomplete="off" />
        <div class="petunjuk">Hanya siswa berstatus <strong>aktif</strong> yang dapat ditandai keluar.</div>
        <div id="k-hasil-cari"></div>
      </div>
      <div class="field">
        <label class="label">Siswa Terpilih</label>
        <div id="k-terpilih"><span style="color:var(--teks-ringan); font-size:.85rem">Belum memilih.</span></div>
      </div>
      <div class="field-row">
        <div class="field"><label class="label" for="k-tanggal">Tanggal Keluar</label>
          <input class="input" id="k-tanggal" type="date" value="${hariIni}" required /></div>
        <div class="field"><label class="label" for="k-alasan">Alasan (opsional)</label>
          <input class="input" id="k-alasan" placeholder="mis. pindah sekolah" /></div>
      </div>
      <div id="k-galat" class="galat-field"></div>
      <button class="btn" id="btn-simpan-keluar" disabled><i data-lucide="log-out"></i> Catat Keluar</button>
    </div>`;
  pasangCariSiswa('k-cari', 'k-hasil-cari', 'k-terpilih', 'k-galat', 'keluar');
  document.getElementById('btn-simpan-keluar')?.addEventListener('click', simpanKeluar);
}

async function simpanKeluar() {
  const galatEl = document.getElementById('k-galat');
  galatEl.textContent = '';
  if (!state.siswaTerpilih) { galatEl.textContent = 'Pilih siswa dahulu.'; return; }
  const btn = document.getElementById('btn-simpan-keluar');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    await panggil('mutasi_simpan', {
      jenis: 'keluar',
      id_siswa: state.siswaTerpilih.id_siswa,
      tanggal: document.getElementById('k-tanggal').value,
      alasan: document.getElementById('k-alasan').value.trim()
    }, state.token);
    toast(`Siswa ${state.siswaTerpilih.nama} ditandai keluar.`, 'ok');
    state.siswaTerpilih = null;
    renderTabKeluar();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    btn.disabled = false; btn.innerHTML = `<i data-lucide="log-out"></i> Catat Keluar`;
    renderIkon();
  }
}

// =========================== TAB: LULUS ===========================

function renderTabLulus() {
  state.siswaTerpilih = null;
  const panel = document.getElementById('tab-lulus');
  const hariIni = new Date().toISOString().slice(0, 10);
  panel.innerHTML = `
    <div class="kartu">
      <div class="kartu-title">Catat Siswa Lulus</div>
      <div class="field">
        <label class="label" for="l-cari">Cari Siswa Aktif</label>
        <input class="input" id="l-cari" placeholder="Ketik nama / NISN / NIS..." autocomplete="off" />
        <div class="petunjuk">Hanya siswa berstatus <strong>aktif</strong> yang dapat ditandai lulus.</div>
        <div id="l-hasil-cari"></div>
      </div>
      <div class="field">
        <label class="label">Siswa Terpilih</label>
        <div id="l-terpilih"><span style="color:var(--teks-ringan); font-size:.85rem">Belum memilih.</span></div>
      </div>
      <div class="field"><label class="label" for="l-tanggal">Tanggal Lulus</label>
        <input class="input" id="l-tanggal" type="date" value="${hariIni}" required /></div>
      <div id="l-galat" class="galat-field"></div>
      <button class="btn" id="btn-simpan-lulus" disabled><i data-lucide="graduation-cap"></i> Catat Lulus</button>
    </div>`;
  pasangCariSiswa('l-cari', 'l-hasil-cari', 'l-terpilih', 'l-galat', 'lulus');
  document.getElementById('btn-simpan-lulus')?.addEventListener('click', simpanLulus);
}

async function simpanLulus() {
  const galatEl = document.getElementById('l-galat');
  galatEl.textContent = '';
  if (!state.siswaTerpilih) { galatEl.textContent = 'Pilih siswa dahulu.'; return; }
  const btn = document.getElementById('btn-simpan-lulus');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    await panggil('mutasi_simpan', {
      jenis: 'lulus',
      id_siswa: state.siswaTerpilih.id_siswa,
      tanggal: document.getElementById('l-tanggal').value
    }, state.token);
    toast(`Siswa ${state.siswaTerpilih.nama} ditandai lulus.`, 'ok');
    state.siswaTerpilih = null;
    renderTabLulus();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    btn.disabled = false; btn.innerHTML = `<i data-lucide="graduation-cap"></i> Catat Lulus`;
    renderIkon();
  }
}

// =========================== PENCARIAN SISWA (DIPAKAI KELUAR & LULUS) ===========================

/** Pasang input pencarian siswa aktif untuk tab keluar/lulus.
 * @param {string} idInput id elemen input teks
 * @param {string} idHasil id wadah hasil pencarian
 * @param {string} idTerpilih id wadah chip siswa terpilih
 * @param {string} idGalat id wadah pesan galat
 * @param {'keluar'|'lulus'} jenis
 */
function pasangCariSiswa(idInput, idHasil, idTerpilih, idGalat, jenis) {
  const input = document.getElementById(idInput);
  const hasil = document.getElementById(idHasil);
  if (!input || !hasil) return;

  const handler = async () => {
    const q = input.value.trim();
    if (q.length < 2) { hasil.innerHTML = ''; return; }
    hasil.innerHTML = spin('Mencari...');
    try {
      const res = await panggil('siswa_daftar', { id_ta: state.idTa, status: 'aktif', q }, state.token);
      const siswa = (res.siswa || []).slice(0, 10);
      if (!siswa.length) {
        hasil.innerHTML = `<div style="padding:.5rem .6rem; color:var(--teks-ringan); font-size:.85rem">Tidak ada hasil.</div>`;
        return;
      }
      hasil.innerHTML = `<div class="hasil-cari">` + siswa.map(s => `
        <div class="item" data-id="${escape(s.id_siswa)}" data-nama="${escape(s.nama)}" data-nisn="${escape(s.nisn)}" data-kelas="${escape(s.kelas_saat_ini ? s.kelas_saat_ini.nama_kelas : '-')}">
          <strong>${escape(s.nama)}</strong>
          <span>NISN ${escape(s.nisn || '-')} · Kelas ${escape(s.kelas_saat_ini ? s.kelas_saat_ini.nama_kelas : '-')}</span>
        </div>`).join('') + `</div>`;
      // Bind klik item.
      hasil.querySelectorAll('.item').forEach(item => {
        item.addEventListener('click', () => {
          state.siswaTerpilih = {
            id_siswa: item.dataset.id,
            nama: item.dataset.nama,
            nisn: item.dataset.nisn
          };
          input.value = '';
          hasil.innerHTML = '';
          renderTerpilih(idTerpilih, jenis);
          // Aktifkan tombol simpan.
          const btnId = jenis === 'keluar' ? 'btn-simpan-keluar' : 'btn-simpan-lulus';
          const btn = document.getElementById(btnId);
          if (btn) btn.disabled = false;
        });
      });
    } catch (err) {
      hasil.innerHTML = `<div style="padding:.5rem .6rem; color:var(--err); font-size:.85rem">${escape(pesanGalat(err))}</div>`;
    }
  };
  // Debounce sederhana.
  input.addEventListener('input', () => {
    clearTimeout(state.debounceCari);
    state.debounceCari = setTimeout(handler, 350);
  });
}

/** Tampilkan chip siswa terpilih + tombol ganti. */
function renderTerpilih(idTerpilih, jenis) {
  const wadah = document.getElementById(idTerpilih);
  if (!wadah) return;
  if (!state.siswaTerpilih) {
    wadah.innerHTML = `<span style="color:var(--teks-ringan); font-size:.85rem">Belum memilih.</span>`;
    return;
  }
  wadah.innerHTML = `
    <div class="baris-pilih-siswa">
      <span class="chip-pilih">
        <strong>${escape(state.siswaTerpilih.nama)}</strong>
        <span style="color:var(--teks-ringan)">NISN ${escape(state.siswaTerpilih.nisn || '-')}</span>
        <button type="button" id="btn-ganti-${jenis}" aria-label="Ganti pilihan"><i data-lucide="x"></i></button>
      </span>
    </div>`;
  renderIkon();
  document.getElementById(`btn-ganti-${jenis}`)?.addEventListener('click', () => {
    state.siswaTerpilih = null;
    renderTerpilih(idTerpilih, jenis);
    const btnId = jenis === 'keluar' ? 'btn-simpan-keluar' : 'btn-simpan-lulus';
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = true;
  });
}

// =========================== LISTENER GLOBAL HALAMAN ===========================

function pasangListener() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => tampilkanTab(btn.dataset.tab));
  });
}
