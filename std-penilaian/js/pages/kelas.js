// kelas.js — Halaman Kelas & Rombongan Belajar (Tahap 2A).
// Daftar kelas per tingkat (7/8/9), buat rombel cepat, atur wali kelas.
// Hak: admin menulis; standar_penilaian (spn) lihat.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { renderTabel, renderModal, modalBuka, modalTutup, chip } from '../komponen.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  bolehTulis: false,
  taDaftar: [],
  idTa: null,
  kelas: [],
  guru: [],          // daftar pengguna aktif untuk pilihan wali
  idEditWali: null
};

// =========================== ENTRY ===========================

export async function renderKelas(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.bolehTulis = boleh(sesi.peran, 'admin');

  document.getElementById('topbar-judul').textContent = 'Kelas & Rombongan Belajar';
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
      <h1 class="page-judul">Kelas & Rombongan Belajar</h1>
      <div class="kosong"><i data-lucide="calendar-x"></i><h3>Belum ada tahun ajaran</h3>
        <p>Tambah tahun ajaran dahulu di halaman Tahun Ajaran.</p></div>`;
    renderIkon();
    return;
  }
  main.innerHTML = spin('Memuat kelas...');
  try {
    // Ambil kelas + daftar guru (untuk pilihan wali) secara paralel.
    const [k, g] = await Promise.all([
      panggil('kelas_daftar', { id_ta: state.idTa }, state.token),
      panggil('pengguna_daftar', { status: 'aktif' }, state.token)
    ]);
    state.kelas = k.kelas || [];
    state.guru = g.pengguna || [];
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
  const btnBuatRombel = state.bolehTulis
    ? `<button class="btn btn-kecil" id="btn-buat-rombel"><i data-lucide="sparkles"></i> Buat Rombel Cepat</button>`
    : '';

  main.innerHTML = `
    <h1 class="page-judul">Kelas & Rombongan Belajar</h1>
    <div class="toolbar">
      <div class="tumbal"><label class="label" for="pilih-ta">Tahun Ajaran</label>
        <select class="select" id="pilih-ta">${opsiTa}</select></div>
      <div class="kelompok-aksi">${btnBuatRombel}</div>
    </div>
    <div id="kelas-isi"></div>

    ${state.bolehTulis ? renderModal('modal-rombel', 'Buat Rombel Cepat', `
      <div class="field"><label class="label" for="r-tingkat">Tingkat</label>
        <select class="select" id="r-tingkat">
          <option value="7">7</option>
          <option value="8">8</option>
          <option value="9">9</option>
        </select></div>
      <div class="field-row">
        <div class="field"><label class="label" for="r-dari">Dari Huruf</label>
          <input class="input" id="r-dari" maxlength="1" value="A" autocomplete="off" /></div>
        <div class="field"><label class="label" for="r-sampai">Sampai Huruf</label>
          <input class="input" id="r-sampai" maxlength="1" value="G" autocomplete="off" /></div>
      </div>
      <div class="petunjuk">Akan dibuat rombel dari huruf "Dari" sampai "Sampai". Yang sudah ada dilewati.</div>
      <div id="r-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-rombel">Batal</button>
      <button class="btn" id="btn-simpan-rombel"><i data-lucide="check"></i> Buat</button>
    `) : ''}

    ${state.bolehTulis ? renderModal('modal-wali', 'Pilih Wali Kelas', `
      <div class="field"><label class="label" for="w-wali">Wali Kelas</label>
        <select class="select" id="w-wali">
          <option value="">— Tanpa wali —</option>
          ${state.guru.map(g => `<option value="${escape(g.id_pengguna)}">${escape(g.nama_lengkap)}${g.nip ? ' (' + escape(g.nip) + ')' : ''}</option>`).join('')}
        </select></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-wali">Batal</button>
      <button class="btn" id="btn-simpan-wali"><i data-lucide="save"></i> Simpan</button>
    `) : ''}
  `;
}

// =========================== RENDER ISI ===========================

function renderIsi() {
  const wadah = document.getElementById('kelas-isi');
  if (!wadah) return;
  // Kelompokkan per tingkat.
  const perTingkat = { 7: [], 8: [], 9: [] };
  state.kelas.forEach(k => { (perTingkat[k.tingkat] || (perTingkat[k.tingkat] = [])).push(k); });

  const tabelTingkat = (t) => {
    const arr = perTingkat[t] || [];
    if (!arr.length) return `<div class="kosong" style="padding:1.5rem"><p>Belum ada kelas tingkat ${t}.</p></div>`;
    const kolom = [
      { k: 'nama_kelas', judul: 'Kelas' },
      {
        k: 'id_wali', judul: 'Wali Kelas',
        render: (v, r) => {
          if (state.bolehTulis) {
            return `<button class="btn btn-sekunder btn-kecil" data-wali="${escape(r.id_kelas)}" title="Atur wali">
              ${r.nama_wali ? escape(r.nama_wali) : '<i data-lucide="user-plus"></i> Pilih wali'}
            </button>`;
          }
          return escape(r.nama_wali || '-');
        }
      }
    ];
    return renderTabel(kolom, arr, { padat: true });
  };

  wadah.innerHTML = [7, 8, 9].map(t => `
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Tingkat ${t}
        <span class="chip chip-netral" style="margin-left:.5rem">${(perTingkat[t] || []).length} kelas</span>
      </div>
      ${tabelTingkat(t)}
    </div>`).join('');
}

// =========================== LISTENER ===========================

function pasangListener() {
  const main = document.getElementById('main');
  // Ganti TA.
  const selTa = document.getElementById('pilih-ta');
  selTa?.addEventListener('change', () => { state.idTa = selTa.value; muat(); });
  // Buat rombel.
  document.getElementById('btn-buat-rombel')?.addEventListener('click', () => {
    document.getElementById('r-galat').textContent = '';
    modalBuka('modal-rombel');
  });
  document.getElementById('btn-simpan-rombel')?.addEventListener('click', buatRombel);
  // Simpan wali.
  document.getElementById('btn-simpan-wali')?.addEventListener('click', simpanWali);
  // Klik sel wali (delegasi).
  wadahListener(main);
}

function wadahListener(main) {
  main?.querySelector('#kelas-isi')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wali]');
    if (!b) return;
    const k = state.kelas.find(x => x.id_kelas === b.dataset.wali);
    if (!k) return;
    state.idEditWali = k.id_kelas;
    document.getElementById('w-wali').value = k.id_wali || '';
    modalBuka('modal-wali');
  });
}

// =========================== AKSI ===========================

async function buatRombel() {
  const galatEl = document.getElementById('r-galat');
  galatEl.textContent = '';
  const tingkat = Number(document.getElementById('r-tingkat').value);
  const dari = document.getElementById('r-dari').value.trim().toUpperCase();
  const sampai = document.getElementById('r-sampai').value.trim().toUpperCase();
  if (!dari || !sampai) { galatEl.textContent = 'Huruf awal dan akhir wajib diisi.'; return; }
  const btn = document.getElementById('btn-simpan-rombel');
  btn.disabled = true; btn.innerHTML = spin('Membuat...');
  try {
    const d = await panggil('kelas_buat_rombel', {
      id_ta: state.idTa, tingkat, dari_huruf: dari, sampai_huruf: sampai
    }, state.token);
    toast(`${d.jumlah} rombel dibuat.`, 'ok');
    modalTutup('modal-rombel');
    await muat();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="check"></i> Buat`;
    renderIkon();
  }
}

async function simpanWali() {
  const idKelas = state.idEditWali;
  const idWali = document.getElementById('w-wali').value;
  if (!idKelas) return;
  const btn = document.getElementById('btn-simpan-wali');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    await panggil('kelas_simpan', { id_kelas: idKelas, id_wali: idWali }, state.token);
    toast('Wali kelas diperbarui.', 'ok');
    modalTutup('modal-wali');
    await muat();
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan`;
    renderIkon();
  }
}
