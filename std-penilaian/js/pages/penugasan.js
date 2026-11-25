// penugasan.js — Halaman Penugasan (Tahap 2A).
// Ringkasan (belum lengkap + beban guru), input cepat guru×varian×kelas,
// daftar penugasan现有, impor massal, ekspor.
// Hak: admin menulis; standar_penilaian (spn) lihat + ekspor.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { renderTabel, chip, tombolAksi } from '../komponen.js';
import { bacaFileKeBaris, unduhExcel, unduhTemplate } from '../excel.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  bolehTulis: false,
  bolehLihat: false,
  taDaftar: [],
  idTa: null,
  penugasan: [],
  guru: [],
  varian: [],
  kelas: [],
  ringkas: { belum_lengkap: [], beban: [], total_belum: 0 },
  barisImpor: []
};

// =========================== ENTRY ===========================

export async function renderPenugasan(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.bolehTulis = boleh(sesi.peran, 'admin');
  state.bolehLihat = state.bolehTulis || boleh(sesi.peran, 'standar_penilaian');
  state.barisImpor = [];

  document.getElementById('topbar-judul').textContent = 'Penugasan';
  const main = document.getElementById('main');

  if (!state.bolehLihat) {
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
      <h1 class="page-judul">Penugasan</h1>
      <div class="kosong"><i data-lucide="calendar-x"></i><h3>Belum ada tahun ajaran</h3></div>`;
    renderIkon();
    return;
  }
  main.innerHTML = spin('Memuat penugasan...');
  try {
    // Daftar + ringkasan secara paralel.
    const [d, r] = await Promise.all([
      panggil('penugasan_daftar', { id_ta: state.idTa }, state.token),
      panggil('penugasan_ringkasan', { id_ta: state.idTa }, state.token)
    ]);
    state.penugasan = d.penugasan || [];
    state.guru = d.guru || [];
    state.varian = d.varian || [];
    state.kelas = d.kelas || [];
    state.ringkas = r || { belum_lengkap: [], beban: [], total_belum: 0 };
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
  const btnEkspor = `<button class="btn btn-kecil btn-sekunder" id="btn-ekspor"><i data-lucide="file-down"></i> Ekspor Daftar</button>`;

  main.innerHTML = `
    <h1 class="page-judul">Penugasan</h1>
    <div class="toolbar">
      <div class="tumbal"><label class="label" for="pilih-ta">Tahun Ajaran</label>
        <select class="select" id="pilih-ta">${opsiTa}</select></div>
      <div class="kelompok-aksi">${btnEkspor}</div>
    </div>
    <div class="dasbor-grid">
      <div class="dasbor-kartu"><div class="angka">${escape(state.ringkas.total_belum ?? 0)}</div>
        <div class="label">Belum Lengkap (varian × kelas)</div></div>
      <div class="dasbor-kartu"><div class="angka">${escape(state.penugasan.length)}</div>
        <div class="label">Total Penugasan</div></div>
      <div class="dasbor-kartu"><div class="angka">${escape(state.guru.length)}</div>
        <div class="label">Guru Aktif</div></div>
      <div class="dasbor-kartu"><div class="angka">${escape(state.kelas.length)}</div>
        <div class="label">Kelas</div></div>
    </div>
    <div id="penugasan-isi"></div>

    ${state.bolehTulis ? `
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Impor Massal</div>
      <div class="panel-impor">
        <div class="baris-tmpl">
          <button class="btn btn-sekunder btn-kecil" id="btn-template-tgs"><i data-lucide="download"></i> Unduh Template</button>
          <button class="btn btn-sekunder btn-kecil" id="btn-pilih-file-tgs"><i data-lucide="upload"></i> Pilih Berkas</button>
          <input type="file" id="file-impor-tgs" accept=".xlsx,.xls,.csv" />
          <button class="btn btn-kecil" id="btn-impor-tgs" disabled><i data-lucide="file-up"></i> Impor</button>
        </div>
        <div id="pratinjau-impor-tgs"></div>
      </div>
    </div>` : ''}
  `;
}

// =========================== RENDER ISI ===========================

function renderIsi() {
  const wadah = document.getElementById('penugasan-isi');
  if (!wadah) return;

  // Bagian input cepat (admin saja).
  const bagianInput = state.bolehTulis ? `
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Penugasan Cepat</div>
      <div class="field-row">
        <div class="field"><label class="label" for="pilih-guru">Guru</label>
          <select class="select" id="pilih-guru">
            <option value="">— pilih guru —</option>
            ${state.guru.map(g => `<option value="${escape(g.id_pengguna)}">${escape(g.nama_lengkap)}${g.nip ? ' (' + escape(g.nip) + ')' : ''}</option>`).join('')}
          </select></div>
        <div class="field"><label class="label" for="pilih-varian">Varian Mapel</label>
          <select class="select" id="pilih-varian">
            <option value="">— pilih varian —</option>
            ${state.varian.map(v => `<option value="${escape(v.id_varian)}">${escape(v.nama)}</option>`).join('')}
          </select></div>
      </div>
      <div class="petunjuk" style="margin-bottom:.5rem">Centang kelas yang ditugaskan. Gunakan tombol cepat per tingkat.</div>
      <div id="matriks-kelas">${renderMatriks()}</div>
      <div style="margin-top:.75rem">
        <button class="btn" id="btn-simpan-penugasan"><i data-lucide="save"></i> Simpan Penugasan</button>
      </div>
    </div>
  ` : '';

  // Tabel beban guru.
  const bebanTabel = renderTabel(
    [
      { k: 'nama', judul: 'Guru', render: v => escape(v || '-') },
      { k: 'jumlah', judul: 'Beban (kelas × varian)' }
    ],
    state.ringkas.beban || [],
    { kosongPesan: 'Belum ada beban.', padat: true }
  );

  // Tabel belum lengkap (maks 30).
  const belum = state.ringkas.belum_lengkap || [];
  const belumTabel = belum.length
    ? renderTabel(
        [{ k: 'nama_kelas', judul: 'Kelas' }, { k: 'nama_varian', judul: 'Varian' }],
        belum.slice(0, 30),
        { padat: true }
      )
    : `<div class="kosong"><p>Semua kelas sudah lengkap untuk semua varian.</p></div>`;
  const sisaBelum = Math.max(0, belum.length - 30);

  // Tabel penugasan现有.
  const kolomPenugasan = [
    { k: 'nama_guru', judul: 'Guru', render: v => escape(v || '-') },
    {
      k: 'nama_slot', judul: 'Mapel',
      render: (v, r) => `<div><strong>${escape(v || '-')}</strong>
        <div style="font-size:.78rem;color:var(--teks-ringan)">${escape(r.nama_varian || '')}</div></div>`
    },
    { k: 'nama_kelas', judul: 'Kelas', render: v => chip(v || '-', 'info') }
  ];
  if (state.bolehTulis) {
    kolomPenugasan.push({
      k: 'id_penugasan', judul: 'Aksi', kelas: 'aksi',
      render: (v) => tombolAksi('trash-2', 'Hapus', 'hapus', v, 'err')
    });
  }
  const penugasanTabel = renderTabel(kolomPenugasan, state.penugasan, { kosongPesan: 'Belum ada penugasan.', padat: true });

  wadah.innerHTML = `
    ${bagianInput}
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Beban Guru</div>
      ${bebanTabel}
    </div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Belum Lengkap ${belum.length > 30 ? '(30 dari ' + belum.length + ' ditampilkan)' : ''}</div>
      ${belumTabel}
      ${sisaBelum > 0 ? `<p style="font-size:.78rem;color:var(--teks-ringan);margin:.5rem 0 0">+ ${sisaBelum} lainnya.</p>` : ''}
    </div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Daftar Penugasan</div>
      ${penugasanTabel}
    </div>
  `;
}

/** Daftar kelas per tingkat dengan checkbox + tombol "centang semua / kosongkan". */
function renderMatriks() {
  if (!state.kelas.length) return `<div class="kosong"><p>Belum ada kelas di tahun ajaran ini.</p></div>`;
  // Urut: tingkat, nama.
  const urut = [...state.kelas].sort((a, b) =>
    (a.tingkat - b.tingkat) || (a.nama_kelas < b.nama_kelas ? -1 : 1));
  const byTingkat = { 7: [], 8: [], 9: [] };
  urut.forEach(k => (byTingkat[k.tingkat] || (byTingkat[k.tingkat] = [])).push(k));
  return [7, 8, 9].map(t => {
    const arr = byTingkat[t] || [];
    if (!arr.length) return '';
    return `<div style="margin-bottom:.75rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
        <strong>Tingkat ${t}</strong>
        <button class="btn btn-kecil btn-sekunder" data-cek-semua="${t}" type="button">Centang Semua</button>
        <button class="btn btn-kecil btn-sekunder" data-uncek-semua="${t}" type="button">Kosongkan</button>
      </div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        ${arr.map(k => `<label class="label" style="font-weight:400;display:inline-flex;align-items:center;gap:.3rem;min-width:80px">
          <input type="checkbox" class="cek-kelas" data-tingkat="${escape(t)}" value="${escape(k.id_kelas)}" /> ${escape(k.nama_kelas)}</label>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// =========================== LISTENER ===========================

function pasangListener() {
  const main = document.getElementById('main');
  // Ganti TA.
  const selTa = document.getElementById('pilih-ta');
  selTa?.addEventListener('change', () => { state.idTa = selTa.value; muat(); });
  // Ekspor.
  document.getElementById('btn-ekspor')?.addEventListener('click', eksporDaftar);
  // Centang/kosongkan semua per tingkat.
  main?.querySelector('#penugasan-isi')?.addEventListener('click', (e) => {
    const cek = e.target.closest('[data-cek-semua]');
    const uncek = e.target.closest('[data-uncek-semua]');
    if (cek) {
      const t = cek.dataset.cekSemua;
      document.querySelectorAll(`.cek-kelas[data-tingkat="${t}"]`).forEach(cb => cb.checked = true);
    } else if (uncek) {
      const t = uncek.dataset.uncekSemua;
      document.querySelectorAll(`.cek-kelas[data-tingkat="${t}"]`).forEach(cb => cb.checked = false);
    }
  });
  // Simpan penugasan cepat.
  document.getElementById('btn-simpan-penugasan')?.addEventListener('click', simpanPenugasan);
  // Hapus baris (delegasi).
  main?.querySelector('#penugasan-isi')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hapus]');
    if (b) hapusPenugasan(b);
  });
  // Impor.
  document.getElementById('btn-template-tgs')?.addEventListener('click', unduhTemplatePenugasan);
  document.getElementById('btn-pilih-file-tgs')?.addEventListener('click', () => document.getElementById('file-impor-tgs').click());
  document.getElementById('file-impor-tgs')?.addEventListener('change', (e) => bacaBerkasImpor(e));
  document.getElementById('btn-impor-tgs')?.addEventListener('click', jalankanImpor);
}

// =========================== AKSI ===========================

async function simpanPenugasan() {
  const idPengguna = document.getElementById('pilih-guru').value;
  const idVarian = document.getElementById('pilih-varian').value;
  const idKelas = Array.from(document.querySelectorAll('.cek-kelas:checked')).map(cb => cb.value);
  if (!idPengguna || !idVarian) { toast('Pilih guru dan varian.', 'err'); return; }
  if (!idKelas.length) { toast('Pilih minimal satu kelas.', 'err'); return; }
  const btn = document.getElementById('btn-simpan-penugasan');
  btn.disabled = true; btn.innerHTML = spin('Menyimpan...');
  try {
    const d = await panggil('penugasan_simpan', {
      id_ta: state.idTa, id_pengguna: idPengguna, id_varian: idVarian, id_kelas: idKelas
    }, state.token);
    toast(`${d.jumlah} penugasan ditambahkan.`, 'ok');
    // Reset centang.
    document.querySelectorAll('.cek-kelas:checked').forEach(cb => cb.checked = false);
    await muat();
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan Penugasan`;
    renderIkon();
  }
}

async function hapusPenugasan(btn) {
  const id = btn.dataset.hapus;
  if (!confirm('Hapus penugasan ini?')) return;
  btn.disabled = true;
  try {
    await panggil('penugasan_hapus', { id_penugasan: id }, state.token);
    toast('Penugasan dihapus.', 'ok');
    await muat();
  } catch (err) {
    toast(pesanGalat(err), 'err');
    btn.disabled = false;
  }
}

// =========================== EKSPOR ===========================

function eksporDaftar() {
  if (!state.penugasan.length) { toast('Tidak ada data untuk diekspor.', 'warn'); return; }
  unduhExcel('penugasan.xlsx', 'Penugasan',
    state.penugasan.map(p => ({
      Guru: p.nama_guru, Mapel: p.nama_slot, Varian: p.nama_varian, Kelas: p.nama_kelas
    })));
}

// =========================== IMPOR ===========================

function unduhTemplatePenugasan() {
  unduhTemplate('template-penugasan.xlsx', 'Penugasan',
    ['username', 'NIP', 'varian', 'kelas'],
    [
      ['budi.santoso', '198501012010011001', 'Matematika', '7A,7B,7C'],
      ['siti.aminah', '', 'Bahasa Indonesia', '8A;8B']
    ]
  );
  toast('Template diunduh.', 'info');
}

/** Normalisasi key hasil baca (huruf kecil + trim). */
function normalisasiBaris(b) {
  const o = {};
  Object.keys(b).forEach(k => { o[String(k).trim().toLowerCase()] = b[k]; });
  return {
    username: o.username || '',
    nip: o.nip || '',
    varian: o.varian || o.mapel || '',
    kelas: o.kelas || ''
  };
}

async function bacaBerkasImpor(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const wadah = document.getElementById('pratinjau-impor-tgs');
  const btnImpor = document.getElementById('btn-impor-tgs');
  wadah.innerHTML = spin('Membaca berkas...');
  btnImpor.disabled = true;
  try {
    const baris = await bacaFileKeBaris(file);
    state.barisImpor = (baris || []).map(normalisasiBaris);
    if (!state.barisImpor.length) {
      wadah.innerHTML = `<div class="kosong"><p>Berkas kosong.</p></div>`;
      return;
    }
    // Pratinjau dengan tanda baris bermasalah (validasi penuh di server).
    const kolom = [
      { k: 'username', judul: 'Username' },
      { k: 'nip', judul: 'NIP' },
      { k: 'varian', judul: 'Varian' },
      { k: 'kelas', judul: 'Kelas' }
    ];
    const head = kolom.map(k => `<th>${escape(k.judul)}</th>`).join('');
    let jmlMasalah = 0;
    const body = state.barisImpor.map(r => {
      const masalah = (!r.username && !r.nip) || !r.varian || !r.kelas;
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
    wadah.innerHTML = `<div class="kosong"><p>Gagal membaca: ${escape(String(err.message || err))}</p></div>`;
  } finally {
    renderIkon();
  }
}

async function jalankanImpor() {
  if (!state.barisImpor.length) return;
  const btn = document.getElementById('btn-impor-tgs');
  btn.disabled = true; btn.innerHTML = spin('Mengimpor...');
  try {
    const d = await panggil('penugasan_impor', { id_ta: state.idTa, baris: state.barisImpor }, state.token);
    toast(`${d.dibuat} penugasan ditambahkan.`, 'ok');
    // Bersihkan.
    state.barisImpor = [];
    document.getElementById('pratinjau-impor-tgs').innerHTML = '';
    document.getElementById('file-impor-tgs').value = '';
    document.getElementById('btn-impor-tgs').disabled = true;
    await muat();
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = `<i data-lucide="file-up"></i> Impor`;
    renderIkon();
  }
}
