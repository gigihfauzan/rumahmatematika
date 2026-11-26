// impor-nilai.js — Halaman Impor Nilai dari Excel/CSV (Tahap 3B).
// Wizard bertahap: pilih kegiatan+varian+kelas → unggah berkas & petakan kolom →
// muat peserta (versi) → pencocokan otomatis (NISN/NIS/nama/fuzzy) → pratinjau
// 3 kelompok (Cocok / Perlu dicek / Tidak cocok) + siswa kosong → simpan draft
// via nilai_impor. Hak: spn/admin/guru (penugasan miliknya).
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil, GalatApi } from '../api.js';
import { bacaFileKeBaris } from '../excel.js';
import { navigasi } from '../router.js';
import { chip } from '../komponen.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  langkah: 1,
  kegiatanList: [],
  kelasList: [],
  daftarVarian: [],      // gabungan varian: {id_varian, nama, tingkat, nama_slot}
  idKeg: '', idVarian: '', idKelas: '',
  barisFile: [],         // array objek hasil bacaFileKeBaris
  headerFile: [],        // daftar key header file
  mapping: { nama: '', nilai: '', nisn: '', nis: '' },
  peserta: [],           // dari nilai_ambil
  versi: 0,
  kktp: 0,
  kegiatanNorm: null,
  hasilMatch: null,      // { cocok, perluDicek, tidakCocok, kosong }
  hasilImpor: null       // respons nilai_impor
};

// =========================== UTIL ===========================

/** Normalisasi nama: lowercase + buang tanda baca & spasi. */
function normNama(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Jarak Levenshtein sederhana. */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Skor kesamaan 0..1 berbasis Levenshtein. */
function skorKesamaan(a, b) {
  const x = normNama(a), y = normNama(b);
  if (!x && !y) return 1;
  const maxLen = Math.max(x.length, y.length);
  if (!maxLen) return 0;
  return 1 - levenshtein(x, y) / maxLen;
}

/** Coba parse nilai ke angka 0-100. */
function parseNilai(raw) {
  if (raw === '' || raw == null || String(raw).trim() === '') return { kosong: true, num: null, ok: true };
  const s = String(raw).replace(',', '.').trim();
  const num = Number(s);
  if (isNaN(num)) return { kosong: false, num: null, ok: false };
  if (num < 0 || num > 100) return { kosong: false, num, ok: false };
  return { kosong: false, num, ok: true };
}

/** Deteksi kolom header file berdasarkan nama. */
function deteksiKolom(headers) {
  const map = { nama: '', nilai: '', nisn: '', nis: '' };
  headers.forEach(h => {
    const lc = String(h || '').toLowerCase();
    if (!map.nama && /nama|name/i.test(lc)) map.nama = h;
    else if (!map.nilai && /nilai|value|skor|score|hasil/i.test(lc)) map.nilai = h;
    else if (!map.nisn && /nisn/i.test(lc)) map.nisn = h;
    else if (!map.nis && /\bnis\b/i.test(lc) && !/nisn/i.test(lc)) map.nis = h;
  });
  return map;
}

// =========================== ENTRY ===========================

export async function renderImporNilai(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.langkah = 1;
  state.barisFile = [];
  state.headerFile = [];
  state.mapping = { nama: '', nilai: '', nisn: '', nis: '' };
  state.peserta = [];
  state.versi = 0;
  state.hasilMatch = null;
  state.hasilImpor = null;
  state.idKeg = ''; state.idVarian = ''; state.idKelas = '';

  document.getElementById('topbar-judul').textContent = 'Impor Nilai';
  const main = document.getElementById('main');

  // Hak: spn/admin/guru (guru untuk penugasan miliknya — server validasi).
  if (!boleh(sesi.peran, 'standar_penilaian') && !boleh(sesi.peran, 'guru')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Hanya guru dan standar penilaian yang dapat mengimpor nilai.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat data...');
  try {
    const [keg, kelas, mapel] = await Promise.all([
      panggil('kegiatan_daftar', {}, state.token),
      panggil('kelas_daftar', {}, state.token),
      panggil('mapel_daftar', {}, state.token)
    ]);
    state.kegiatanList = keg.kegiatan || [];
    state.kelasList = kelas.kelas || [];
    // Gabungkan semua varian dari semua slot untuk pilihan varian.
    state.daftarVarian = [];
    (mapel.slot || []).forEach(s => {
      (s.varian || []).forEach(v => state.daftarVarian.push({
        id_varian: v.id_varian, nama: v.nama, tingkat: s.tingkat, nama_slot: s.nama
      }));
    });
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  renderWizard();
  renderIkon();
  pasangListener();
}

// =========================== RENDER WIZARD ===========================

function renderWizard() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Impor Nilai</h1>
    <button class="btn btn-sekunder btn-kecil" id="btn-kembali" style="margin-bottom:1rem">
      <i data-lucide="arrow-left"></i> Kembali</button>
    ${renderStepper()}
    <div id="wizard-isi" style="margin-top:1.25rem">${renderLangkah()}</div>`;
  renderIkon();
  pasangListener();
}

/** Render stepper (4 langkah). */
function renderStepper() {
  const langkah = [
    { n: 1, judul: 'Pilih kegiatan' },
    { n: 2, judul: 'Unggah berkas' },
    { n: 3, judul: 'Pencocokan' },
    { n: 4, judul: 'Pratinjau & simpan' }
  ];
  const aktif = state.langkah;
  return `<ol class="stepper">${langkah.map(l => `
    <li class="stepper-item ${l.n === aktif ? 'aktif' : (l.n < aktif ? 'selesai' : '')}">
      <span class="stepper-no">${l.n < aktif ? '✓' : l.n}</span>
      <span class="stepper-judul">${escape(l.judul)}</span>
    </li>`).join('')}</ol>`;
}

/** Render isi sesuai langkah aktif. */
function renderLangkah() {
  if (state.langkah === 1) return renderLangkah1();
  if (state.langkah === 2) return renderLangkah2();
  if (state.langkah === 3) return renderLangkah3();
  if (state.langkah === 4) return renderLangkah4();
  return '';
}

// ----- Langkah 1: pilih kegiatan, varian, kelas -----

function renderLangkah1() {
  const kegOpt = state.kegiatanList.map(k =>
    `<option value="${escape(k.id_kegiatan)}"${k.id_kegiatan === state.idKeg ? ' selected' : ''}>
      ${escape(k.nama)} (${escape(k.status)})</option>`).join('');
  const varianOpt = state.daftarVarian.map(v =>
    `<option value="${escape(v.id_varian)}"${v.id_varian === state.idVarian ? ' selected' : ''}>
      ${escape(v.nama)} — ${escape(v.nama_slot)} (T${escape(v.tingkat)})</option>`).join('');
  const kelasOpt = state.kelasList.map(k =>
    `<option value="${escape(k.id_kelas)}"${k.id_kelas === state.idKelas ? ' selected' : ''}>
      ${escape(k.nama_kelas)} (T${escape(k.tingkat)})</option>`).join('');

  return `<div class="kartu">
    <div class="kartu-title">Pilih kegiatan, mapel/varian, dan kelas tujuan</div>
    <div class="field"><label class="label" for="im-keg">Kegiatan</label>
      <select class="select" id="im-keg"><option value="">— pilih —</option>${kegOpt}</select></div>
    <div class="field"><label class="label" for="im-varian">Mapel / Varian</label>
      <select class="select" id="im-varian"><option value="">— pilih —</option>${varianOpt}</select>
      <div class="petunjuk">Varian harus sesuai dengan kelas tujuan (untuk slot multi-varian).</div></div>
    <div class="field"><label class="label" for="im-kelas">Kelas</label>
      <select class="select" id="im-kelas"><option value="">— pilih —</option>${kelasOpt}</select></div>
    <div id="im-galat" class="galat-field"></div>
    <div class="wizard-aksi">
      <button class="btn" id="btn-lanjut-1"><i data-lucide="arrow-right"></i> Lanjut</button>
    </div>
  </div>`;
}

// ----- Langkah 2: unggah berkas & petakan kolom -----

function renderLangkah2() {
  const headers = state.headerFile;
  const optHeader = (sel) => '<option value="">(abaikan)</option>' +
    headers.map(h => `<option value="${escape(h)}"${h === sel ? ' selected' : ''}>${escape(h)}</option>`).join('');

  const infoBerkas = state.barisFile.length
    ? `<div class="petunjuk" style="margin-bottom:.75rem">Berkas berhasil dibaca: <strong>${state.barisFile.length}</strong> baris data. Periksa pemetaan kolom di bawah.</div>`
    : '';

  const panelBerkas = state.barisFile.length ? '' : `
    <label class="drop" for="im-file">
      <i data-lucide="file-spreadsheet"></i><br/>
      Klik untuk memilih berkas Excel/CSV (.xlsx, .xls, .csv)
      <input type="file" id="im-file" accept=".xlsx,.xls,.csv" />
    </label>`;

  const panelMapping = state.barisFile.length ? `
    <div class="field-row">
      <div class="field"><label class="label" for="im-kol-nama">Kolom Nama</label>
        <select class="select" id="im-kol-nama">${optHeader(state.mapping.nama)}</select></div>
      <div class="field"><label class="label" for="im-kol-nilai">Kolom Nilai</label>
        <select class="select" id="im-kol-nilai">${optHeader(state.mapping.nilai)}</select></div>
      <div class="field"><label class="label" for="im-kol-nisn">Kolom NISN (opsional)</label>
        <select class="select" id="im-kol-nisn">${optHeader(state.mapping.nisn)}</select></div>
      <div class="field"><label class="label" for="im-kol-nis">Kolom NIS (opsional)</label>
        <select class="select" id="im-kol-nis">${optHeader(state.mapping.nis)}</select></div>
    </div>
    <div class="petunjuk" style="margin-bottom:.75rem">Pratinjau 5 baris pertama:</div>
    ${tabelPratinjauFile()}` : '';

  return `<div class="kartu">
    <div class="kartu-title">Unggah berkas Excel/CSV</div>
    ${infoBerkas}
    <div class="panel-impor">${panelBerkas}</div>
    ${panelMapping}
    <div id="im-galat" class="galat-field"></div>
    <div class="wizard-aksi">
      <button class="btn btn-sekunder" id="btn-kembali-2"><i data-lucide="arrow-left"></i> Kembali</button>
      <button class="btn" id="btn-lanjut-2" ${state.barisFile.length ? '' : 'disabled'}>
        <i data-lucide="arrow-right"></i> Lanjut</button>
    </div>
  </div>`;
}

/** Pratinjau 5 baris pertama dari berkas. */
function tabelPratinjauFile() {
  if (!state.barisFile.length) return '';
  const headers = state.headerFile;
  const baris = state.barisFile.slice(0, 5);
  const head = headers.map(h => `<th>${escape(h)}</th>`).join('');
  const body = baris.map(r => `<tr>${headers.map(h => `<td>${escape(r[h] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<div class="tabel-bungkus" style="max-height:200px"><table class="tabel tabel-padat">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// ----- Langkah 3: muat peserta & lakukan pencocokan -----

function renderLangkah3() {
  // Pencocokan otomatis dijalankan saat masuk langkah ini.
  return `<div class="kartu">
    <div class="kartu-title">Memuat peserta & mencocokkan</div>
    <div style="display:flex;justify-content:center;padding:1.5rem">${spin('Memproses pencocokan...')}</div>
  </div>`;
}

// ----- Langkah 4: pratinjau 3 kelompok + simpan -----

function renderLangkah4() {
  const hm = state.hasilMatch;
  if (!hm) return '';
  const totalCocok = hm.cocok.length;
  const totalPerlu = hm.perluDicek.length;
  const totalTidak = hm.tidakCocok.length;
  const totalKosong = hm.kosong.length;
  const totalBermasalah = hm.bermasalah.length;
  const akanDibulatkan = hm.akanDibulatkan;

  const ringkasan = `<div class="stat-grid" style="margin-bottom:1rem">
    <div class="stat-kartu stat-ok"><div class="stat-angka">${totalCocok}</div><div class="stat-label">Cocok otomatis</div></div>
    <div class="stat-kartu stat-warn"><div class="stat-angka">${totalPerlu}</div><div class="stat-label">Perlu dicek</div></div>
    <div class="stat-kartu"><div class="stat-angka">${totalTidak}</div><div class="stat-label">Tidak cocok</div></div>
    <div class="stat-kartu"><div class="stat-angka">${totalKosong}</div><div class="stat-label">Siswa tidak di file</div></div>
    <div class="stat-kartu ${totalBermasalah ? 'stat-warn' : ''}"><div class="stat-angka">${totalBermasalah}</div><div class="stat-label">Nilai invalid</div></div>
    <div class="stat-kartu ${akanDibulatkan ? 'stat-warn' : ''}"><div class="stat-angka">${akanDibulatkan}</div><div class="stat-label">Akan dibulatkan</div></div>
  </div>`;

  const hasilImporHtml = state.hasilImpor ? renderHasilImpor() : '';

  return `<div class="kartu">
    <div class="kartu-title">Pratinjau pencocokan & simpan</div>
    ${ringkasan}
    ${renderKelompok('Cocok otomatis', hm.cocok, 'ok', false)}
    ${renderKelompok('Perlu dicek (kemiripan < 100%)', hm.perluDicek, 'warn', true)}
    ${renderKelompok('Tidak cocok', hm.tidakCocok, 'netral', true)}
    ${renderKelompokKosong('Siswa di kelas tidak ada di file', hm.kosong)}
    ${renderKelompokBermasalah('Nilai invalid (tidak akan dikirim)', hm.bermasalah)}
    <div id="im-galat" class="galat-field"></div>
    <div class="wizard-aksi">
      <button class="btn btn-sekunder" id="btn-kembali-4"><i data-lucide="arrow-left"></i> Kembali</button>
      <button class="btn" id="btn-simpan-impor"><i data-lucide="save"></i> Simpan sebagai Draft</button>
    </div>
    ${hasilImporHtml}
  </div>`;
}

/** Render kelompok Cocok / Perlu dicek / Tidak cocok. */
function renderKelompok(judul, items, tipe, denganDropdown) {
  if (!items.length) return '';
  const optSiswa = (selId) => {
    const opts = state.peserta.map(p =>
      `<option value="${escape(p.id_siswa)}">${escape(p.nama)} (${escape(p.nisn || '-')})</option>`).join('');
    return `<select class="select select-pasang" data-id="${escape(selId)}" style="min-width:240px">
      <option value="">— lewati —</option>${opts}</select>`;
  };
  const head = `<tr>
    <th>Baris</th><th>Nama di file</th><th>NISN/NIS</th><th>Nilai</th>
    ${denganDropdown ? '<th>Pasangkan ke siswa</th>' : '<th>Cocok dengan</th>'}
  </tr>`;
  const body = items.map((it, i) => {
    const parsed = parseNilai(it.nilai);
    const clsNilai = parsed.ok ? (parsed.kosong ? '' : (parsed.num < state.kktp ? 'di-bawah-kktp' : '')) : 'sel-galat';
    const nilaiTampil = it.nilai === '' || it.nilai == null ? '<span style="color:var(--teks-ringan)">—</span>' : escape(it.nilai);
    const cocokCell = it.siswa
      ? `<span>${escape(it.siswa.nama)} <span style="color:var(--teks-ringan)">(${escape(it.siswa.nisn || '-')})</span></span>`
      : (denganDropdown ? optSiswa(it.key) : '<span style="color:var(--teks-ringan)">—</span>');
    const keyakinan = it.skor != null ? `<span class="chip chip-${tipe}" style="margin-left:.25rem">${Math.round(it.skor * 100)}%</span>` : '';
    return `<tr data-key="${escape(it.key)}">
      <td>${escape(it.baris)}</td>
      <td>${escape(it.nama)}${keyakinan}</td>
      <td>${escape(it.nisn || '-')}${it.nis ? ' / ' + escape(it.nis) : ''}</td>
      <td class="${clsNilai}">${nilaiTampil}</td>
      <td>${cocokCell}</td>
    </tr>`;
  }).join('');
  return `<details class="kelompok-impor" open>
    <summary>${escape(judul)} <span class="chip chip-${tipe}">${items.length}</span></summary>
    <div class="tabel-bungkus"><table class="tabel tabel-padat"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  </details>`;
}

/** Render kelompok siswa kosong (tidak ada di file). */
function renderKelompokKosong(judul, items) {
  if (!items.length) return '';
  const head = `<tr><th>Nama siswa</th><th>NISN</th><th>Nilai saat ini</th></tr>`;
  const body = items.map(it => `<tr>
    <td>${escape(it.siswa.nama)}</td>
    <td>${escape(it.siswa.nisn || '-')}</td>
    <td>${it.siswa.nilai === '' || it.siswa.nilai == null
      ? '<span style="color:var(--teks-ringan)">belum diisi</span>'
      : escape(it.siswa.nilai)}</td>
  </tr>`).join('');
  return `<details class="kelompok-impor">
    <summary>${escape(judul)} <span class="chip chip-netral">${items.length}</span></summary>
    <div class="petunjuk" style="margin:.5rem 0">Siswa ini tidak akan diubah oleh impor.</div>
    <div class="tabel-bungkus"><table class="tabel tabel-padat"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  </details>`;
}

/** Render kelompok nilai invalid. */
function renderKelompokBermasalah(judul, items) {
  if (!items.length) return '';
  const head = `<tr><th>Baris</th><th>Nama di file</th><th>Nilai</th><th>Pesan</th></tr>`;
  const body = items.map(it => `<tr class="baris-galat">
    <td>${escape(it.baris)}</td>
    <td>${escape(it.nama)}</td>
    <td class="sel-galat">${escape(it.nilai)}</td>
    <td>${escape(it.pesan)}</td>
  </tr>`).join('');
  return `<details class="kelompok-impor">
    <summary>${escape(judul)} <span class="chip chip-err">${items.length}</span></summary>
    <div class="tabel-bungkus"><table class="tabel tabel-padat"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  </details>`;
}

/** Render hasil impor. */
function renderHasilImpor() {
  const h = state.hasilImpor;
  return `<div class="banner banner-ok" style="margin-top:1rem">
    <i data-lucide="check-circle-2"></i>
    <div><strong>Impor berhasil.</strong> Versi baru: ${h.versi_baru}.
      ${h.dibulatkan && h.dibulatkan.length ? `${h.dibulatkan.length} nilai dibulatkan.` : ''}
      ${h.bermasalah && h.bermasalah.length ? `${h.bermasalah.length} nilai bermasalah.` : 'Tidak ada yang bermasalah.'}
      <button class="btn btn-kecil" id="btn-buka-input" style="margin-left:.5rem">
        <i data-lucide="external-link"></i> Buka tabel input</button></div>
  </div>`;
}

// =========================== PENCOCOKAN ===========================

/** Jalankan pencocokan otomatis berdasarkan mapping & peserta. */
function jalankanPencocokan() {
  const m = state.mapping;
  const peserta = state.peserta;
  // Bangun indeks.
  const byNisn = new Map();
  const byNis = new Map();
  const byNormNama = new Map();
  peserta.forEach(p => {
    if (p.nisn) byNisn.set(String(p.nisn).trim(), p);
    if (p.nis) byNis.set(String(p.nis).trim(), p);
    const nn = normNama(p.nama);
    if (nn) {
      if (!byNormNama.has(nn)) byNormNama.set(nn, []);
      byNormNama.get(nn).push(p);
    }
  });

  const cocok = [];
  const perluDicek = [];
  const tidakCocok = [];
  const bermasalah = [];
  const idSudahCocok = new Set();
  let akanDibulatkan = 0;
  let urut = 0;

  state.barisFile.forEach((r, idx) => {
    const barisNo = idx + 2; // +1 header, +1 index 0
    const namaFile = m.nama ? (r[m.nama] ?? '') : '';
    const nisnFile = m.nisn ? String(r[m.nisn] ?? '').trim() : '';
    const nisFile = m.nis ? String(r[m.nis] ?? '').trim() : '';
    const nilaiFile = m.nilai ? (r[m.nilai] ?? '') : '';
    urut++;
    const key = 'f' + urut;

    const parsed = parseNilai(nilaiFile);
    // Cek nilai invalid → tetap masuk kecocokan, tapi tandai.
    const itemBase = {
      key, baris: barisNo, nama: String(namaFile), nisn: nisnFile, nis: nisFile,
      nilai: nilaiFile === '' || nilaiFile == null ? '' : String(nilaiFile),
      siswa: null, skor: null
    };

    // Pencocokan: NISN > NIS > nama persis > fuzzy.
    let matched = null;
    let skor = null;
    if (nisnFile && byNisn.has(nisnFile)) {
      matched = byNisn.get(nisnFile);
      skor = 1;
    } else if (nisFile && byNis.has(nisFile)) {
      matched = byNis.get(nisFile);
      skor = 1;
    } else {
      const nn = normNama(namaFile);
      if (nn && byNormNama.has(nn)) {
        const kandidat = byNormNama.get(nn);
        matched = kandidat[0];
        skor = 1;
      } else if (nn) {
        // Fuzzy: cari max similarity di seluruh peserta.
        let maxSkor = 0, kandidatFuzzy = null;
        peserta.forEach(p => {
          const s = skorKesamaan(namaFile, p.nama);
          if (s > maxSkor) { maxSkor = s; kandidatFuzzy = p; }
        });
        if (kandidatFuzzy && maxSkor >= 0.6) {
          matched = kandidatFuzzy;
          skor = maxSkor;
        }
      }
    }

    if (!matched) {
      // Tidak ada kandidat → tidak cocok.
      if (!parsed.ok && !parsed.kosong) {
        bermasalah.push({ ...itemBase, pesan: parsed.kosong ? '' : (isNaN(Number(String(nilaiFile).replace(',', '.'))) ? 'Bukan angka' : 'Di luar 0-100') });
      } else {
        tidakCocok.push(itemBase);
      }
      return;
    }

    // Hitung akan-dibulatkan.
    if (parsed.ok && !parsed.kosong && parsed.num !== Math.round(parsed.num)) akanDibulatkan++;

    itemBase.siswa = matched;
    itemBase.skor = skor;

    if (skor >= 1) {
      // Cocok persis → hindari duplikat (siswa hanya boleh dipasang sekali).
      if (idSudahCocok.has(matched.id_siswa)) {
        perluDicek.push(itemBase); // siswa sudah dipakai → perlu dicek manual.
      } else {
        idSudahCocok.add(matched.id_siswa);
        if (!parsed.ok && !parsed.kosong) {
          bermasalah.push({ ...itemBase, pesan: isNaN(Number(String(nilaiFile).replace(',', '.'))) ? 'Bukan angka' : 'Di luar 0-100' });
        } else {
          cocok.push(itemBase);
        }
      }
    } else {
      perluDicek.push(itemBase);
    }
  });

  // Siswa di kelas yang tidak ada di file.
  const kosong = peserta
    .filter(p => !idSudahCocok.has(p.id_siswa))
    .map(p => ({ siswa: p }));

  state.hasilMatch = { cocok, perluDicek, tidakCocok, kosong, bermasalah, akanDibulatkan };
}

// =========================== LISTENER ===========================

function pasangListener() {
  const main = document.getElementById('main');
  if (!main) return;

  // Kembali ke beranda.
  main.addEventListener('click', (e) => {
    if (e.target.closest('#btn-kembali')) {
      navigasi('#/tugas-guru');
    }
  });

  // Langkah 1: pilih.
  main.querySelector('#btn-lanjut-1')?.addEventListener('click', lanjutKeLangkah2);
  // Langkah 2: unggah & lanjut.
  main.querySelector('#im-file')?.addEventListener('change', bacaBerkas);
  main.querySelector('#btn-lanjut-2')?.addEventListener('click', lanjutKeLangkah3);
  main.querySelector('#btn-kembali-2')?.addEventListener('click', () => { state.langkah = 1; renderWizard(); });
  // Langkah 4: simpan.
  main.querySelector('#btn-simpan-impor')?.addEventListener('click', simpanImpor);
  main.querySelector('#btn-kembali-4')?.addEventListener('click', () => { state.langkah = 2; renderWizard(); });
}

// ----- Transisi langkah -----

function lanjutKeLangkah2() {
  const keg = document.getElementById('im-keg').value;
  const varian = document.getElementById('im-varian').value;
  const kelas = document.getElementById('im-kelas').value;
  const galat = document.getElementById('im-galat');
  galat.textContent = '';
  if (!keg) { galat.textContent = 'Pilih kegiatan.'; return; }
  if (!varian) { galat.textContent = 'Pilih mapel/varian.'; return; }
  if (!kelas) { galat.textContent = 'Pilih kelas.'; return; }
  state.idKeg = keg; state.idVarian = varian; state.idKelas = kelas;
  state.langkah = 2;
  renderWizard();
}

async function bacaBerkas(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const wadah = document.getElementById('wizard-isi');
  const galat = document.getElementById('im-galat');
  galat.textContent = '';
  wadah.innerHTML = `<div class="kartu">${spin('Membaca berkas...')}</div>`;
  try {
    const baris = await bacaFileKeBaris(file);
    if (!baris.length) {
      galat.textContent = 'Berkas kosong atau tidak terbaca.';
      state.barisFile = []; state.headerFile = [];
      renderWizard();
      return;
    }
    state.barisFile = baris;
    state.headerFile = Object.keys(baris[0]);
    state.mapping = deteksiKolom(state.headerFile);
    if (!state.mapping.nilai) {
      galat.textContent = 'Kolom nilai tidak terdeteksi otomatis. Pilih manual di bawah.';
    }
    renderWizard();
  } catch (err) {
    galat.textContent = pesanGalat(err);
    state.barisFile = []; state.headerFile = [];
    renderWizard();
  }
}

async function lanjutKeLangkah3() {
  // Simpan mapping dari select.
  state.mapping.nama = document.getElementById('im-kol-nama')?.value || '';
  state.mapping.nilai = document.getElementById('im-kol-nilai')?.value || '';
  state.mapping.nisn = document.getElementById('im-kol-nisn')?.value || '';
  state.mapping.nis = document.getElementById('im-kol-nis')?.value || '';
  const galat = document.getElementById('im-galat');
  galat.textContent = '';
  if (!state.mapping.nama) { galat.textContent = 'Kolom Nama wajib dipetakan.'; return; }
  if (!state.mapping.nilai) { galat.textContent = 'Kolom Nilai wajib dipetakan.'; return; }

  state.langkah = 3;
  renderWizard();
  // Muat peserta (versi).
  try {
    const d = await panggil('nilai_ambil', {
      id_kegiatan: state.idKeg, id_kelas: state.idKelas, id_varian: state.idVarian
    }, state.token);
    state.peserta = d.peserta || [];
    state.versi = (d.status_input && Number(d.status_input.versi)) || 0;
    state.kktp = Number(d.kktp_efektif) || 0;
    state.kegiatanNorm = d.kegiatan || null;
  } catch (err) {
    state.langkah = 2;
    renderWizard();
    toast(pesanGalat(err), 'err');
    const g = document.getElementById('im-galat');
    if (g) g.textContent = pesanGalat(err);
    return;
  }
  // Jalankan pencocokan.
  jalankanPencocokan();
  state.langkah = 4;
  renderWizard();
}

// ----- Simpan impor -----

async function simpanImpor() {
  // Kumpulkan pasangan: cocok (otomatis) + dropdown pasangan dari perluDicek/tidakCocok.
  const hm = state.hasilMatch;
  if (!hm) return;
  const pasangan = [];
  const galat = document.getElementById('im-galat');
  galat.textContent = '';

  // Cocok otomatis.
  hm.cocok.forEach(it => {
    const p = parseNilai(it.nilai);
    if (p.ok && !p.kosong) pasangan.push({ id_siswa: it.siswa.id_siswa, nilai: it.nilai });
  });

  // Pasangan manual dari dropdown.
  document.querySelectorAll('.select-pasang').forEach(sel => {
    const idSiswa = sel.value;
    if (!idSiswa) return;
    // Cari item sesuai data-key.
    const key = sel.dataset.id;
    const pool = hm.perluDicek.concat(hm.tidakCocok);
    const it = pool.find(x => x.key === key);
    if (!it) return;
    const p = parseNilai(it.nilai);
    if (p.ok && !p.kosong) pasangan.push({ id_siswa: idSiswa, nilai: it.nilai });
  });

  if (!pasangan.length) {
    galat.textContent = 'Tidak ada pasangan nilai valid untuk diimpor.';
    return;
  }

  const btn = document.getElementById('btn-simpan-impor');
  const awal = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = spin('Menyimpan impor...');

  try {
    const hasil = await panggil('nilai_impor', {
      id_kegiatan: state.idKeg, id_kelas: state.idKelas, id_varian: state.idVarian,
      versi: state.versi, pasangan
    }, state.token);
    state.hasilImpor = hasil;
    state.versi = hasil.versi_baru;
    let pesan = `Impor berhasil: ${pasangan.length} nilai disimpan sebagai draft.`;
    if (hasil.dibulatkan && hasil.dibulatkan.length) pesan += ` ${hasil.dibulatkan.length} dibulatkan.`;
    if (hasil.bermasalah && hasil.bermasalah.length) pesan += ` ${hasil.bermasalah.length} bermasalah.`;
    toast(pesan, 'ok');
    renderWizard();
    document.getElementById('btn-buka-input')?.addEventListener('click', () => {
      navigasi(`#/input-nilai/${state.idKeg}/${state.idKelas}/${state.idVarian}`);
    });
  } catch (err) {
    if (err instanceof GalatApi && err.kode === 'VERSI_USANG') {
      galat.innerHTML = `${escape(pesanGalat(err))} <button class="btn btn-kecil btn-warn" id="btn-versi-ulang" style="margin-left:.5rem"><i data-lucide="refresh-cw"></i> Muat ulang</button>`;
      renderIkon();
      document.getElementById('btn-versi-ulang')?.addEventListener('click', () => {
        state.langkah = 2;
        renderWizard();
      });
    } else {
      galat.textContent = pesanGalat(err);
    }
  } finally {
    const b = document.getElementById('btn-simpan-impor');
    if (b) { b.disabled = false; b.innerHTML = awal; renderIkon(); }
  }
}
