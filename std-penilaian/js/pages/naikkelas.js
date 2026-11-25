// naikkelas.js — Halaman Wizard Naik Kelas (Tahap 2B).
// Fitur: pilih TA sumber & tujuan, mode (7→8 / 8→9 / 9→lulus / manual),
// pratinjau rencana, jalankan dengan id_batch, batalkan batch.
// Hak: hanya admin.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { renderTabel } from '../komponen.js';
import { bacaFileKeBaris, unduhTemplate } from '../excel.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  taList: [],
  idTaSumber: '',
  idTaTujuan: '',
  mode: '7_8',
  barisPenempatan: [],   // baris hasil bacaFileKeBaris untuk mode 7_8/manual
  pratinjau: null,       // hasil naikkelas_pratinjau
  hasilJalan: null,      // hasil naikkelas_jalankan {id_batch, jumlah, pengecualian}
  sedangJalan: false
};

// =========================== ENTRY ===========================

export async function renderNaikKelas(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  // Hanya admin.
  if (!boleh(sesi.peran, 'admin')) {
    document.getElementById('topbar-judul').textContent = 'Naik Kelas';
    const main = document.getElementById('main');
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3><p>Halaman ini khusus administrator.</p></div>`;
    renderIkon();
    return;
  }

  document.getElementById('topbar-judul').textContent = 'Naik Kelas & Promosi';
  const main = document.getElementById('main');
  main.innerHTML = spin('Memuat tahun ajaran...');
  try {
    const ta = await panggil('ta_daftar', {}, state.token);
    state.taList = ta.ta || [];
    // Bawaan: TA aktif sebagai sumber.
    state.idTaSumber = (ta.aktif && ta.aktif.id_ta) || (state.taList[0] && state.taList[0].id_ta) || '';
    // Tujuan: TA berikutnya (heuristic — nama berurutan); bawaan kosong agar user pilih.
    state.idTaTujuan = '';
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  renderKerangka();
  renderIkon();
  pasangListener();
}

// =========================== RENDER ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  const optTa = state.taList.map(t => `<option value="${escape(t.id_ta)}">${escape(t.nama)}${t.aktif ? ' (aktif)' : ''}</option>`).join('');

  main.innerHTML = `
    <h1 class="page-judul">Naik Kelas & Promosi</h1>
    <p style="color:var(--teks-ringan); margin:0 0 1.25rem; max-width:640px">
      Promosikan siswa antar tahun ajaran. Riwayat kelas tidak pernah dihapus;
      wizard hanya menambah penempatan baru di TA tujuan atau menandai lulus.
    </p>

    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">1 · Pilih Tahun Ajaran</div>
      <div class="field-row">
        <div class="field"><label class="label" for="ta-sumber">TA Sumber</label>
          <select class="select" id="ta-sumber">${optTa}</select></div>
        <div class="field"><label class="label" for="ta-tujuan">TA Tujuan</label>
          <select class="select" id="ta-tujuan"><option value="">— pilih —</option>${optTa}</select></div>
      </div>
    </div>

    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">2 · Pilih Mode</div>
      <div class="field-group" id="mode-group" style="display:grid; gap:.5rem">
        <label class="baris-mode"><input type="radio" name="mode" value="7_8" ${state.mode === '7_8' ? 'checked' : ''} />
          <span><strong>Kelas 7 → 8</strong> — impor penempatan baru (NISN + kelas tujuan).</span></label>
        <label class="baris-mode"><input type="radio" name="mode" value="8_9" ${state.mode === '8_9' ? 'checked' : ''} />
          <span><strong>Kelas 8 → 9</strong> — kembalikan ke rombel kelas 7 (otomatis dari riwayat).</span></label>
        <label class="baris-mode"><input type="radio" name="mode" value="9_lulus" ${state.mode === '9_lulus' ? 'checked' : ''} />
          <span><strong>Kelas 9 → Lulus</strong> — tandai seluruh siswa tingkat 9 sebagai lulus.</span></label>
        <label class="baris-mode"><input type="radio" name="mode" value="manual" ${state.mode === 'manual' ? 'checked' : ''} />
          <span><strong>Manual</strong> — penempatan khusus (NISN + kelas tujuan).</span></label>
      </div>
    </div>

    <div class="kartu" style="margin-bottom:1rem" id="panel-berkas">
      <div class="kartu-title">3 · Berkas Penempatan <span id="berkas-info" style="font-weight:400; color:var(--teks-ringan); font-size:.82rem"></span></div>
      <div id="berkas-isi"></div>
    </div>

    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">4 · Jalankan</div>
      <div style="display:flex; gap:.6rem; flex-wrap:wrap; align-items:center">
        <button class="btn btn-sekunder" id="btn-pratinjau"><i data-lucide="eye"></i> Pratinjau</button>
        <button class="btn" id="btn-jalankan" disabled><i data-lucide="play"></i> Jalankan</button>
        <span style="font-size:.82rem; color:var(--teks-ringan)">Pratinjau wajib sebelum menjalankan.</span>
      </div>
    </div>

    <div id="hasil-pratinjau"></div>
    <div id="hasil-jalan"></div>

    <style>
      .baris-mode { display:flex; align-items:flex-start; gap:.6rem; padding:.5rem .6rem; border:1px solid var(--border); border-radius:var(--radius-sm); cursor:pointer; font-size:.88rem }
      .baris-mode:hover { background: var(--permukaan-2) }
      .baris-mode input { margin-top:.2rem }
      .baris-mode span { display:inline-block }
    </style>
  `;
  renderPanelBerkas();
}

/** Tampilkan/sembunyikan panel berkas sesuai mode. */
function renderPanelBerkas() {
  const isi = document.getElementById('berkas-isi');
  const info = document.getElementById('berkas-info');
  if (!isi) return;
  const butuhBerkas = (state.mode === '7_8' || state.mode === 'manual');
  if (!butuhBerkas) {
    info.textContent = '— tidak perlu berkas (otomatis)';
    isi.innerHTML = `<p style="color:var(--teks-ringan); font-size:.85rem; margin:0">Mode ini otomatis: tidak perlu unggah berkas. Klik <strong>Pratinjau</strong> untuk melihat rencana.</p>`;
    return;
  }
  info.textContent = '— wajib (NISN + Kelas Tujuan)';
  isi.innerHTML = `
    <div class="panel-impor">
      <div class="baris-tmpl">
        <button class="btn btn-sekunder btn-kecil" id="btn-unduh-template-nk"><i data-lucide="file-down"></i> Unduh Template</button>
        <span style="font-size:.82rem; color:var(--teks-ringan)">Kolom: NISN, Kelas Tujuan</span>
      </div>
      <label class="drop" for="file-nk">
        <i data-lucide="file-spreadsheet"></i><br/>
        Klik untuk memilih berkas Excel/CSV
        <input type="file" id="file-nk" accept=".xlsx,.xls,.csv" />
      </label>
    </div>
    <div id="pratinjau-berkas"></div>
  `;
  renderIkon();
  // Pasang listener untuk berkas.
  document.getElementById('btn-unduh-template-nk')?.addEventListener('click', unduhTemplateNK);
  document.getElementById('file-nk')?.addEventListener('change', bacaBerkasNK);
}

// =========================== LISTENER ===========================

function pasangListener() {
  const taSumber = document.getElementById('ta-sumber');
  const taTujuan = document.getElementById('ta-tujuan');
  taSumber?.addEventListener('change', () => {
    state.idTaSumber = taSumber.value;
    resetHasil();
  });
  taTujuan?.addEventListener('change', () => {
    state.idTaTujuan = taTujuan.value;
    resetHasil();
  });

  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', () => {
      state.mode = r.value;
      state.barisPenempatan = [];
      renderPanelBerkas();
      resetHasil();
    });
  });

  document.getElementById('btn-pratinjau')?.addEventListener('click', pratinjau);
  document.getElementById('btn-jalankan')?.addEventListener('click', jalankan);
}

function resetHasil() {
  state.pratinjau = null;
  state.hasilJalan = null;
  document.getElementById('hasil-pratinjau').innerHTML = '';
  document.getElementById('hasil-jalan').innerHTML = '';
  document.getElementById('btn-jalankan').disabled = true;
}

// =========================== BERKAS PENEMPATAN ===========================

function unduhTemplateNK() {
  unduhTemplate('template_penempatan.xlsx', 'Penempatan',
    ['NISN', 'Kelas Tujuan'],
    [
      ['0098765432', '8A'],
      ['0098765433', '8A'],
      ['0098765434', '8B']
    ]
  );
  toast('Template diunduh.', 'info');
}

async function bacaBerkasNK(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const wadah = document.getElementById('pratinjau-berkas');
  wadah.innerHTML = spin('Membaca berkas...');
  try {
    const baris = await bacaFileKeBaris(file);
    // Normalisasi kunci header.
    const normal = baris.map(b => ({
      nisn: b.NISN || b.nisn || b.Nisn || '',
      kelas: b['Kelas Tujuan'] || b['Kelas_Tujuan'] || b.Kelas || b.kelas || ''
    })).filter(b => b.nisn || b.kelas);
    state.barisPenempatan = normal;
    if (!normal.length) {
      wadah.innerHTML = `<div class="kosong"><p>Berkas kosong atau tidak ada baris data.</p></div>`;
      return;
    }
    wadah.innerHTML = renderTabel(
      [
        { k: 'nisn', judul: 'NISN' },
        { k: 'kelas', judul: 'Kelas Tujuan' }
      ],
      normal,
      { kosongPesan: 'Tidak ada baris.', padat: true, id: 'tabel-pratinjau-nk' }
    );
    toast(`${normal.length} baris dibaca.`, 'info');
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><p>Gagal membaca berkas: ${escape(String(err.message || err))}</p></div>`;
  }
  renderIkon();
}

// =========================== PRATINJAU ===========================

async function pratinjau() {
  const galatValidasi = validasiDasar();
  if (galatValidasi) { toast(galatValidasi, 'warn'); return; }
  if ((state.mode === '7_8' || state.mode === 'manual') && !state.barisPenempatan.length) {
    toast('Unggah berkas penempatan dahulu untuk mode ini.', 'warn');
    return;
  }

  const btn = document.getElementById('btn-pratinjau');
  const wadah = document.getElementById('hasil-pratinjau');
  btn.disabled = true; btn.innerHTML = spin('Memeriksa...');
  wadah.innerHTML = spin('Menyusun pratinjau...');
  document.getElementById('btn-jalankan').disabled = true;

  try {
    const data = {
      id_ta_sumber: state.idTaSumber,
      id_ta_tujuan: state.idTaTujuan,
      mode: state.mode
    };
    if (state.mode === '7_8' || state.mode === 'manual') {
      data.baris = state.barisPenempatan;
    }
    const hasil = await panggil('naikkelas_pratinjau', data, state.token);
    state.pratinjau = hasil;
    state.hasilJalan = null; // pratinjau baru → reset hasil jalan.
    renderHasilPratinjau(hasil);
    // Aktifkan jalankan hanya jika ada rencana.
    document.getElementById('btn-jalankan').disabled = !(hasil.jumlah > 0);
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal pratinjau</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="eye"></i> Pratinjau`;
    renderIkon();
  }
}

function validasiDasar() {
  if (!state.idTaSumber) return 'Pilih tahun ajaran sumber.';
  if (!state.idTaTujuan) return 'Pilih tahun ajaran tujuan.';
  if (state.idTaSumber === state.idTaTujuan) return 'Sumber dan tujuan tidak boleh sama.';
  return null;
}

function renderHasilPratinjau(hasil) {
  const wadah = document.getElementById('hasil-pratinjau');
  const perKelas = hasil.per_kelas_tujuan || [];
  const pengecualian = hasil.pengecualian || [];

  const labelMode = {
    '7_8': 'Kelas 7 → 8',
    '8_9': 'Kelas 8 → 9',
    '9_lulus': 'Kelas 9 → Lulus',
    'manual': 'Manual'
  }[hasil.mode] || hasil.mode;

  wadah.innerHTML = `
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Pratinjau Rencana (${escape(labelMode)})</div>
      <div class="dasbor-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))">
        <div class="dasbor-kartu"><div class="angka">${hasil.jumlah}</div><div class="label">Siswa akan diproses</div></div>
        <div class="dasbor-kartu"><div class="angka" style="color:var(--warn)">${pengecualian.length}</div><div class="label">Pengecualian</div></div>
        <div class="dasbor-kartu"><div class="angka" style="color:var(--aksen)">${perKelas.length}</div><div class="label">Kelas tujuan</div></div>
      </div>

      <h4 style="margin:1rem 0 .5rem">Distribusi per Kelas Tujuan</h4>
      ${perKelas.length
        ? renderTabel(
            [{ k: 'nama_kelas', judul: 'Kelas Tujuan' }, { k: 'jumlah', judul: 'Jumlah', kelas: 'tengah' }],
            perKelas,
            { padat: true }
          )
        : `<p style="color:var(--teks-ringan); font-size:.85rem">Tidak ada distribusi kelas (mis. mode lulus).</p>`}

      <h4 style="margin:1rem 0 .5rem">Pengecualian</h4>
      ${pengecualian.length
        ? renderTabel(
            [
              { k: 'nisn', judul: 'NISN' },
              { k: 'nama', judul: 'Nama' },
              { k: 'alasan', judul: 'Alasan' }
            ],
            pengecualian,
            { padat: true, id: 'tabel-pengecualian' }
          )
        : `<p style="color:var(--teks-ringan); font-size:.85rem">Tidak ada pengecualian.</p>`}
    </div>`;
  renderIkon();
}

// =========================== JALANKAN ===========================

async function jalankan() {
  if (!state.pratinjau || !(state.pratinjau.jumlah > 0)) return;
  const konfirmasi = confirm(`Jalankan promosi untuk ${state.pratinjau.jumlah} siswa?\n\nMode: ${state.pratinjau.mode}\nPengecualian: ${(state.pratinjau.pengecualian || []).length}\n\nLanjutkan?`);
  if (!konfirmasi) return;

  const btn = document.getElementById('btn-jalankan');
  const wadah = document.getElementById('hasil-jalan');
  btn.disabled = true; btn.innerHTML = spin('Memproses...');
  wadah.innerHTML = spin('Menjalankan promosi...');
  state.sedangJalan = true;

  try {
    const data = {
      id_ta_sumber: state.idTaSumber,
      id_ta_tujuan: state.idTaTujuan,
      mode: state.mode
    };
    if (state.mode === '7_8' || state.mode === 'manual') {
      data.baris = state.barisPenempatan;
    }
    const hasil = await panggil('naikkelas_jalankan', data, state.token);
    state.hasilJalan = hasil;
    renderHasilJalan(hasil);
    toast(`Promosi selesai: ${hasil.jumlah} siswa.`, 'ok');
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i><h3>Gagal menjalankan</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="play"></i> Jalankan`;
    state.sedangJalan = false;
    renderIkon();
  }
}

function renderHasilJalan(hasil) {
  const wadah = document.getElementById('hasil-jalan');
  const pengecualian = hasil.pengecualian || [];
  wadah.innerHTML = `
    <div class="kartu" style="margin-bottom:1rem; border-left:4px solid var(--ok)">
      <div class="kartu-title">Hasil Promosi</div>
      <div class="dasbor-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))">
        <div class="dasbor-kartu"><div class="angka">${hasil.jumlah}</div><div class="label">Siswa diproses</div></div>
        <div class="dasbor-kartu"><div class="angka" style="color:var(--primer); font-size:1rem; word-break:break-all">${escape(hasil.id_batch)}</div><div class="label">ID Batch (catat untuk pembatalan)</div></div>
      </div>
      <div style="display:flex; gap:.6rem; flex-wrap:wrap; margin-top:1rem">
        <button class="btn btn-sekunder" id="btn-salin-batch"><i data-lucide="copy"></i> Salin ID Batch</button>
        <button class="btn btn-sekunder" id="btn-batal-batch" style="color:var(--err)"><i data-lucide="undo-2"></i> Batalkan Batch</button>
      </div>
      ${pengecualian.length ? `
        <h4 style="margin:1rem 0 .5rem">Pengecualian (tidak diproses)</h4>
        ${renderTabel(
          [{ k: 'nisn', judul: 'NISN' }, { k: 'nama', judul: 'Nama' }, { k: 'alasan', judul: 'Alasan' }],
          pengecualian,
          { padat: true }
        )}
      ` : ''}
    </div>`;
  renderIkon();
  document.getElementById('btn-salin-batch')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(hasil.id_batch).then(
      () => toast('ID Batch disalin.', 'ok'),
      () => toast('Gagal menyalin. Salin manual: ' + hasil.id_batch, 'warn')
    );
  });
  document.getElementById('btn-batal-batch')?.addEventListener('click', () => batalkanBatch(hasil.id_batch));
}

// =========================== BATAL BATCH ===========================

async function batalkanBatch(idBatch) {
  if (!idBatch) return;
  if (!confirm(`Batalkan batch ${idBatch}?\n\nPembatalan hanya bisa dilakukan jika belum ada data nilai di TA tujuan.`)) return;
  try {
    const hasil = await panggil('naikkelas_batal', { id_batch: idBatch }, state.token);
    toast(`Batch dibatalkan: ${hasil.jumlah} siswa dikembalikan.`, 'ok');
    // Bersihkan hasil jalan & pratinjau agar konsisten.
    state.hasilJalan = null;
    state.pratinjau = null;
    document.getElementById('hasil-jalan').innerHTML = '';
    document.getElementById('hasil-pratinjau').innerHTML = '';
    document.getElementById('btn-jalankan').disabled = true;
  } catch (err) {
    toast(pesanGalat(err), 'err');
  }
}
