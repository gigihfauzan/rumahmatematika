// arsip.js — Halaman Arsip (Tahap 6A).
//
// Daftar arsip per kegiatan (snapshot terkompres + checksum SHA-256). Arsip
// bersifat HANYA-BACA; admin dapat membuka kunci (menandai usang) agar kegiatan
// kembali ke status dikunci. Standar penilaian dapat mengarsipkan kegiatan
// berstatus dikunci & mengunggah file Excel arsip ke folder Drive.
//
// Hak akses (diputuskan server; frontend mengikuti bisa_kelola):
// - admin / standar_penilaian / kepsek: melihat daftar & membuka arsip (read-only).
// - standar_penilaian (bisa_kelola=true): arsipkan kegiatan, unggah Excel, verifikasi.
// - admin: buka kunci arsip (alasan wajib).
//
// Token dari localStorage.getItem('enilai_token'). escape() untuk semua data
// dinamis; renderIkon() dipanggil setelah setiap innerHTML.
import { renderIkon, escape, spin, pesanGalat, toast } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import {
  chip, renderModal, modalBuka, modalTutup, pasangModalTutupGlobal
} from '../komponen.js';

// Pasang listener global tombol [data-modal-tutup] sekali saat modul dimuat.
pasangModalTutupGlobal();

// =========================== STATE ===========================

const state = {
  sesi: null,
  token: null,
  bisaKelola: false,      // standar_penilaian → arsipkan, unggah Excel, verifikasi
  bolehBukaKunci: false,  // admin → buka kunci arsip
  daftar: [],             // hasil arsip_daftar.arsip
  taMap: {},              // id_ta → nama (untuk label kelompok)
  kegiatanList: [],       // hasil kegiatan_daftar (TA aktif) untuk modal arsipkan
  // Konteks modal aktif.
  arsipKegiatanHasil: null,  // hasil arsip_kegiatan terakhir (untuk unggah Excel)
  arsipBukaKunciTarget: null // arsip yang akan dibuka kunci
};

// =========================== UTIL ===========================

/** Format timestamp ISO "yyyy-MM-dd HH:mm:ss" → "dd/MM/yyyy HH:mm". */
function formatTanggal(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return String(iso);
  let out = `${m[3]}/${m[2]}/${m[1]}`;
  if (m[4]) out += ` ${m[4]}:${m[5]}`;
  return out;
}

/** Ambil 12 karakter pertama checksum (untuk tampilan singkat). */
function fmtChecksum(s) {
  return String(s || '').slice(0, 12);
}

/** Format nilai: integer apa adanya; desimal 2 angka; null → '—'. */
function fmtNilai(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2);
}

/** Format rata-rata: selalu 2 desimal; null → '—'. */
function fmtRata(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  return num.toFixed(2);
}

/** Urutkan slot_unified berdasarkan urutan. */
function urutSlot(arr) {
  return [...(arr || [])].sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
}

/** Chip status arsip: aktif → ok, usang → warn. */
function chipStatusArsip(st) {
  if (st === 'aktif') return chip('Aktif', 'ok');
  if (st === 'usang') return chip('Usang', 'warn');
  return chip(st || '-', 'netral');
}

// =========================== ENTRY ===========================

export async function renderArsip(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.bisaKelola = boleh(sesi.peran, 'standar_penilaian');
  state.bolehBukaKunci = boleh(sesi.peran, 'admin');
  state.arsipKegiatanHasil = null;
  state.arsipBukaKunciTarget = null;

  document.getElementById('topbar-judul').textContent = 'Arsip';
  const main = document.getElementById('main');

  // Akses: admin/spn/kepsek boleh melihat arsip.
  if (!state.bisaKelola && !boleh(sesi.peran, 'kepsek')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini khusus admin, standar penilaian, atau kepala sekolah.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat arsip...');
  try {
    // Ambil daftar arsip & daftar TA secara paralel (TA untuk label kelompok).
    const [dArsip, dTa] = await Promise.all([
      panggil('arsip_daftar', {}, state.token),
      panggil('ta_daftar', {}, state.token)
    ]);
    state.daftar = dArsip.arsip || [];
    // bisa_kelola dari server menentukan tombol arsipkan/unggah/verifikasi.
    state.bisaKelola = state.bisaKelola && !!dArsip.bisa_kelola;
    (dTa.ta || []).forEach(t => { state.taMap[t.id_ta] = t.nama; });
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
    return;
  }

  renderKerangka();
  renderDaftar();
  pasangListener();
  renderIkon();
}

// =========================== KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  const bisaKelola = state.bisaKelola;
  const bolehBukaKunci = state.bolehBukaKunci;

  main.innerHTML = `
    <h1 class="page-judul">Arsip</h1>
    <p class="petunjuk" style="margin:0 0 1rem">
      Snapshot kegiatan yang telah diarsipkan. Arsip bersifat hanya-baca;
      admin dapat membuka kunci (arsip ditandai usang) jika perlu koreksi.
    </p>
    <div class="toolbar" style="margin-bottom:1rem">
      ${bisaKelola ? `<button class="btn" id="arsip-tambah"><i data-lucide="archive"></i> Arsipkan Kegiatan</button>` : ''}
      <button class="btn btn-sekunder" id="arsip-muat"><i data-lucide="refresh-cw"></i> Muat Ulang</button>
    </div>
    <div id="arsip-daftar"></div>

    ${bisaKelola ? renderModal('modal-arsip-keg', 'Arsipkan Kegiatan', `
      <div class="field">
        <label class="label" for="arsip-pilih-keg">Pilih kegiatan berstatus dikunci</label>
        <select class="select" id="arsip-pilih-keg">
          <option value="">— memuat daftar kegiatan… —</option>
        </select>
        <div class="petunjuk">
          Hanya kegiatan berstatus <strong>dikunci</strong> tanpa nilai draft
          yang dapat diarsipkan. Backup otomatis dibuat sebelum arsip.
        </div>
      </div>
      <div id="arsip-hasil"></div>
    `, `<button class="btn btn-sekunder" data-modal-tutup="modal-arsip-keg">Tutup</button>`) : ''}

    ${bolehBukaKunci ? renderModal('modal-buka-kunci', 'Buka Kunci Arsip', `
      <div class="field">
        <label class="label">Arsip target</label>
        <div id="bk-arsip-info" class="kartu" style="padding:.6rem .8rem; font-size:.85rem"></div>
      </div>
      <div class="field">
        <label class="label" for="bk-alasan">Alasan pembukaan (wajib)</label>
        <textarea class="textarea" id="bk-alasan" rows="3"
          placeholder="Contoh: ditemukan koreksi nilai setelah arsip…"></textarea>
        <div class="petunjuk">
          Arsip akan ditandai <strong>usang</strong>; kegiatan kembali ke status
          <strong>dikunci</strong> agar dapat diedit kembali.
        </div>
      </div>
    `, `<button class="btn btn-sekunder" data-modal-tutup="modal-buka-kunci">Batal</button>
        <button class="btn btn-warn" id="bk-konfirmasi"><i data-lucide="unlock"></i> Buka Kunci</button>`) : ''}

    ${renderModal('modal-buka-arsip', 'Pratinjau Arsip', `<div id="ba-isi">${spin('Menyiapkan...')}</div>`, '', true)}
  `;
}

// =========================== DAFTAR ARSIP ===========================

function renderDaftar() {
  const wadah = document.getElementById('arsip-daftar');
  if (!wadah) return;
  if (!state.daftar.length) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="archive"></i>
      <h3>Belum ada arsip</h3>
      <p>${state.bisaKelola
        ? 'Arsipkan kegiatan berstatus dikunci untuk membuat snapshot pertama.'
        : 'Belum ada kegiatan yang diarsipkan pada sistem ini.'}</p></div>`;
    return;
  }

  // Kelompokkan per (id_ta, semester).
  const grup = new Map();
  state.daftar.forEach(a => {
    const key = `${a.id_ta}|${a.semester}`;
    if (!grup.has(key)) grup.set(key, []);
    grup.get(key).push(a);
  });

  // Urutkan kelompok: nama TA desc (terbaru dulu), semester desc.
  const keys = [...grup.keys()].sort((a, b) => {
    const [taA, semA] = a.split('|');
    const [taB, semB] = b.split('|');
    const namaA = state.taMap[taA] || taA;
    const namaB = state.taMap[taB] || taB;
    if (namaA !== namaB) return namaB > namaA ? 1 : -1;
    return Number(semB || 0) - Number(semA || 0);
  });

  wadah.innerHTML = keys.map(key => {
    const [idTa, sem] = key.split('|');
    const namaTa = state.taMap[idTa] || idTa;
    const items = grup.get(key);
    return `<section class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Tahun Ajaran ${escape(namaTa)} — Semester ${escape(sem || '-')}</div>
      <div class="arsip-grid" style="display:grid; gap:.8rem; grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
        ${items.map(renderKartuArsip).join('')}
      </div>
    </section>`;
  }).join('');
}

function renderKartuArsip(a) {
  const statusChip = chipStatusArsip(a.status);
  const tBuka = `<button class="btn btn-kecil btn-sekunder" data-buka="${escape(a.id_arsip)}" title="Buka arsip (hanya baca)">
    <i data-lucide="eye"></i> Buka</button>`;
  const tVerify = state.bisaKelola
    ? `<button class="btn btn-kecil btn-sekunder" data-verify="${escape(a.id_arsip)}" title="Verifikasi checksum">
        <i data-lucide="shield-check"></i> Verifikasi</button>` : '';
  const tBukaKunci = (state.bolehBukaKunci && a.status === 'aktif')
    ? `<button class="btn btn-kecil btn-warn" data-buka-kunci="${escape(a.id_arsip)}" title="Buka kunci (kembali ke dikunci)">
        <i data-lucide="unlock"></i> Buka Kunci</button>` : '';

  return `<article class="kartu" style="padding:1rem; display:flex; flex-direction:column; gap:.6rem">
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:.5rem">
      <strong style="font-size:1rem">${escape(a.nama_kegiatan)}</strong>
      ${statusChip}
    </div>
    <div style="font-size:.82rem; color:var(--teks-ringan); display:flex; flex-direction:column; gap:.25rem">
      <span><i data-lucide="tag" style="width:14px;height:14px;vertical-align:-2px"></i> Jenis: ${escape(a.jenis || '-')}</span>
      <span><i data-lucide="calendar" style="width:14px;height:14px;vertical-align:-2px"></i> Dibuat: ${escape(formatTanggal(a.dibuat_pada))}</span>
      <span><i data-lucide="hash" style="width:14px;height:14px;vertical-align:-2px"></i> Checksum: <code style="font-family:ui-monospace,monospace">${escape(fmtChecksum(a.checksum))}</code></span>
      ${a.nama_file_excel
        ? `<span><i data-lucide="file-spreadsheet" style="width:14px;height:14px;vertical-align:-2px"></i> Excel: ${escape(a.nama_file_excel)}</span>`
        : (state.bisaKelola ? `<span style="color:var(--warn)"><i data-lucide="alert-triangle" style="width:14px;height:14px;vertical-align:-2px"></i> Excel arsip belum diunggah</span>` : '')}
    </div>
    <div class="kelompok-aksi" style="display:flex; gap:.4rem; flex-wrap:wrap; margin-top:auto">
      ${tBuka}${tVerify}${tBukaKunci}
    </div>
  </article>`;
}

// =========================== LISTENER ===========================

function pasangListener() {
  // Muat ulang daftar.
  document.getElementById('arsip-muat')?.addEventListener('click', () => renderArsip(state.sesi));

  // Buka modal arsipkan kegiatan.
  document.getElementById('arsip-tambah')?.addEventListener('click', async () => {
    modalBuka('modal-arsip-keg');
    // Reset hasil sebelumnya.
    state.arsipKegiatanHasil = null;
    document.getElementById('arsip-hasil').innerHTML = '';
    await muatKegiatanDikunci();
  });

  // Klik tombol pada kartu: buka / verifikasi / buka-kunci (delegasi).
  document.getElementById('arsip-daftar')?.addEventListener('click', async (e) => {
    const tBuka = e.target.closest('[data-buka]');
    const tVerify = e.target.closest('[data-verify]');
    const tBukaKunci = e.target.closest('[data-buka-kunci]');
    if (tBuka) return await bukaArsip(tBuka.dataset.buka);
    if (tVerify) return await verifikasiArsip(tVerify.dataset.verify);
    if (tBukaKunci) return await bukaKunciArsip(tBukaKunci.dataset.bukaKunci);
  });

  // Konfirmasi buka kunci.
  document.getElementById('bk-konfirmasi')?.addEventListener('click', async () => {
    await konfirmasiBukaKunci();
  });

  // Tombol arsipkan (di dalam modal, setelah pilih kegiatan).
  // Listener didelegasikan karena tombol dirender dinamis.
  document.getElementById('arsip-hasil')?.addEventListener('click', async (e) => {
    const tArsip = e.target.closest('[data-arsipkan]');
    if (tArsip) return await jalankanArsip(tArsip.dataset.arsipkan);
    const tUnggah = e.target.closest('[data-unggah-excel]');
    if (tUnggah) return document.getElementById('arsip-input-excel')?.click();
  });

  // Input file Excel (change) → unggah.
  document.getElementById('arsip-input-excel')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await unggahExcelArsip(file);
    // Reset agar file sama dapat dipilih lagi.
    e.target.value = '';
  });
}

// =========================== MODAL: ARSIPKAN KEGIATAN ===========================

/** Muat daftar kegiatan (TA aktif) dan saring yang berstatus dikunci. */
async function muatKegiatanDikunci() {
  const sel = document.getElementById('arsip-pilih-keg');
  if (!sel) return;
  sel.innerHTML = `<option value="">— memuat… —</option>`;
  try {
    const d = await panggil('kegiatan_daftar', {}, state.token);
    state.kegiatanList = (d.kegiatan || []).filter(k => k.status === 'dikunci');
    if (!state.kegiatanList.length) {
      sel.innerHTML = `<option value="">— tidak ada kegiatan dikunci —</option>`;
      document.getElementById('arsip-hasil').innerHTML =
        `<div class="kosong" style="padding:1rem"><i data-lucide="info"></i>
          <p>Tidak ada kegiatan berstatus dikunci pada tahun ajaran aktif.
          Kunci kegiatan lebih dulu di halaman Kegiatan.</p></div>`;
      renderIkon();
      return;
    }
    sel.innerHTML = `<option value="">— pilih kegiatan —</option>` +
      state.kegiatanList.map(k =>
        `<option value="${escape(k.id_kegiatan)}">${escape(k.nama)} (${escape(k.jenis || '-')})</option>`
      ).join('');
    // Render tombol jalankan arsip saat pilih.
    sel.onchange = () => {
      const idKeg = sel.value;
      const hasil = document.getElementById('arsip-hasil');
      if (!idKeg) { hasil.innerHTML = ''; return; }
      const kg = state.kegiatanList.find(k => k.id_kegiatan === idKeg);
      hasil.innerHTML = `<div style="margin-top:.5rem; display:flex; flex-direction:column; gap:.6rem">
        <div class="petunjuk">Kegiatan: <strong>${escape(kg ? kg.nama : '')}</strong></div>
        <button class="btn" data-arsipkan="${escape(idKeg)}">
          <i data-lucide="archive"></i> Arsipkan Sekarang</button>
      </div>`;
      renderIkon();
    };
  } catch (err) {
    sel.innerHTML = `<option value="">— gagal memuat —</option>`;
    document.getElementById('arsip-hasil').innerHTML =
      `<div class="kosong" style="padding:1rem"><i data-lucide="alert-triangle"></i>
        <p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
  }
}

/** Jalankan arsip_kegiatan untuk id_kegiatan terpilih. */
async function jalankanArsip(idKeg) {
  const hasil = document.getElementById('arsip-hasil');
  hasil.innerHTML = spin('Mengarsipkan...');
  renderIkon();
  try {
    const res = await panggil('arsip_kegiatan', { id_kegiatan: idKeg }, state.token);
    state.arsipKegiatanHasil = res;
    // Tampilkan hasil sukses: checksum, folder Drive, nama file Excel, dan input unggah.
    hasil.innerHTML = `
      <div class="banner banner-ok" style="margin-bottom:.6rem">
        <i data-lucide="check-circle"></i>
        <span>Arsip berhasil dibuat. Kegiatan sekarang berstatus <strong>diarsipkan</strong>.</span>
      </div>
      <div class="kartu" style="padding:.8rem; margin-bottom:.6rem; font-size:.85rem">
        <div style="margin-bottom:.3rem"><strong>ID arsip:</strong> <code>${escape(res.id_arsip)}</code></div>
        <div style="margin-bottom:.3rem"><strong>Checksum:</strong>
          <code style="font-family:ui-monospace,monospace; word-break:break-all">${escape(res.checksum)}</code></div>
        <div style="margin-bottom:.3rem"><strong>Folder Drive:</strong>
          <a href="${escape(res.drive_folder_url)}" target="_blank" rel="noopener">${escape(res.drive_folder_url)}</a></div>
        <div><strong>Nama file Excel diharapkan:</strong><br/>
          <code>${escape(res.nama_file_excel_diharapkan)}</code></div>
      </div>
      <div class="petunjuk" style="margin-bottom:.6rem">
        Siapkan file Excel arsip (mis. dari laporan Tahap 5 dengan nama di atas),
        lalu unggah untuk disimpan ke folder arsip.
      </div>
      <input type="file" id="arsip-input-excel" accept=".xlsx,.xls" style="display:none" />
      <button class="btn btn-sekunder" data-unggah-excel="1">
        <i data-lucide="upload"></i> Unggah Excel Arsip</button>
      <div id="arsip-unggah-status"></div>`;
    renderIkon();
    toast('Arsip berhasil dibuat.', 'ok');
  } catch (err) {
    hasil.innerHTML = `<div class="kosong" style="padding:1rem"><i data-lucide="alert-triangle"></i>
      <h3>Gagal mengarsipkan</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
  }
}

/** Baca file sebagai base64 (via FileReader), lalu unggah ke folder arsip. */
async function unggahExcelArsip(file) {
  const res = state.arsipKegiatanHasil;
  if (!res || !res.id_arsip) {
    toast('Konteks arsip hilang. Buka kembali modal arsipkan kegiatan.', 'err');
    return;
  }
  const status = document.getElementById('arsip-unggah-status');
  if (status) status.innerHTML = spin(`Membaca ${file.name}...`);
  renderIkon();
  try {
    // Baca sebagai Data URL → strip prefix "data:...;base64,".
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('Gagal membaca file.'));
      fr.readAsDataURL(file);
    });
    const base64 = String(dataUrl).split(',')[1] || '';
    if (!base64) throw new Error('Isi file kosong.');
    if (status) status.innerHTML = spin('Mengunggah ke Drive...');
    renderIkon();
    await panggil('arsip_upload_excel', {
      id_arsip: res.id_arsip,
      nama_file: file.name,
      data_base64: base64
    }, state.token);
    if (status) status.innerHTML = `<div class="banner banner-ok"><i data-lucide="check-circle"></i>
      <span>File <strong>${escape(file.name)}</strong> tersimpan di folder arsip.</span></div>`;
    renderIkon();
    toast('Excel arsip terunggah.', 'ok');
    // Tutup modal & muat ulang daftar agar nama_file_excel tampil.
    setTimeout(() => {
      modalTutup('modal-arsip-keg');
      renderArsip(state.sesi);
    }, 900);
  } catch (err) {
    if (status) status.innerHTML = `<div class="kosong" style="padding:.8rem"><i data-lucide="alert-triangle"></i>
      <p>${escape(pesanGalat(err) || (err && err.message) || 'Gagal mengunggah.')}</p></div>`;
    renderIkon();
    toast(pesanGalat(err) || 'Gagal mengunggah.', 'err');
  }
}

// =========================== BUKA ARSIP (READ-ONLY) ===========================

async function bukaArsip(idArsip) {
  const isi = document.getElementById('ba-isi');
  if (!isi) return;
  modalBuka('modal-buka-arsip');
  isi.innerHTML = spin('Memuat snapshot arsip...');
  renderIkon();
  try {
    const data = await panggil('arsip_buka', { id_arsip: idArsip }, state.token);
    renderIsiBukaArsip(data);
  } catch (err) {
    isi.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal membuka arsip</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
  }
}

function renderIsiBukaArsip(data) {
  const isi = document.getElementById('ba-isi');
  const arsip = data.arsip || {};
  const hasil = data.hasil || {};
  const slot = urutSlot(hasil.slot_unified);
  const siswa = hasil.siswa || [];
  // statistik adalah objek { per_kelas, per_tingkat, sekolah }; pakai sekolah.
  const statSekolah = (hasil.statistik && hasil.statistik.sekolah) || [];
  const kg = hasil.kegiatan || {};
  const waktuArsip = hasil.waktu_arsip || arsip.dibuat_pada;

  // SPANDUK hanya-baca.
  const spanduk = `<div class="banner banner-info" style="margin-bottom:.75rem">
    <i data-lucide="archive"></i>
    <span><strong>ARSIP</strong> — hanya baca. Dibuat ${escape(formatTanggal(waktuArsip))}.
      Checksum: <code style="font-family:ui-monospace,monospace">${escape(fmtChecksum(arsip.checksum))}</code>
      ${arsip.status === 'usang' ? chip('Usang', 'warn') : chip('Aktif', 'ok')}</span>
  </div>`;

  isi.innerHTML = `
    ${spanduk}
    <h2 style="margin:0 0 .25rem; font-size:1.15rem">${escape(arsip.nama_kegiatan || kg.nama || '-')}</h2>
    <div class="petunjuk" style="margin-bottom:.75rem">
      Jenis: ${escape(arsip.jenis || kg.jenis || '-')} ·
      ${siswa.length} siswa · ${slot.length} slot
    </div>
    ${renderTabelSiswaArsip(siswa, slot)}
    ${renderTabelStatArsip(statSekolah, slot)}`;
  renderIkon();
}

/** Tabel siswa: No, Nama, NISN, nilai per slot, Jumlah, Rata-rata, Peringkat. */
function renderTabelSiswaArsip(siswa, slot) {
  if (!siswa.length) {
    return `<div class="kosong"><i data-lucide="users-round"></i>
      <h3>Tidak ada peserta</h3>
      <p>Snapshot tidak berisi peserta pada arsip ini.</p></div>`;
  }
  // Urut abjad.
  const arr = [...siswa].sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
  const headSlot = slot.map(s =>
    `<th title="${escape(s.nama)}">${escape(s.singkatan || s.kode)}</th>`).join('');
  const head = `<tr>
    <th class="th-no">No</th>
    <th class="td-nama">Nama</th>
    <th>NISN</th>
    ${headSlot}
    <th>Jumlah</th><th>Rata-rata</th><th>Per. Kelas</th>
  </tr>`;
  const body = arr.map((s, idx) => {
    const tds = [];
    tds.push(`<td class="th-no">${escape(idx + 1)}</td>`);
    tds.push(`<td class="td-nama">${escape(s.nama)}</td>`);
    tds.push(`<td>${escape(s.nisn || '-')}</td>`);
    slot.forEach(sl => {
      const np = (s.nilai_per_slot || []).find(x => x.kode === sl.kode);
      if (!np || np.nilai === null || np.nilai === undefined) {
        tds.push(`<td class="sel-nilai sel-nilai-kosong">—</td>`);
      } else {
        const diBawah = np.kktp && Number(np.nilai) < Number(np.kktp);
        tds.push(`<td class="sel-nilai${diBawah ? ' sel-di-bawah-kktp' : ''}">
          <span class="nilai">${escape(fmtNilai(np.nilai))}</span></td>`);
      }
    });
    tds.push(`<td class="angka">${s.ada_nilai ? escape(fmtNilai(s.jumlah)) : '—'}</td>`);
    tds.push(`<td class="angka">${s.ada_nilai ? escape(fmtRata(s.rata_rata)) : '—'}</td>`);
    tds.push(`<td class="angka">${s.ada_nilai ? escape(s.peringkat_kelas ?? '—') : '—'}</td>`);
    return `<tr>${tds.join('')}</tr>`;
  }).join('');
  return `<div class="tabel-bungkus tabel-lembar-bungkus">
    <table class="tabel tabel-padat tabel-lembar">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

/** Tabel statistik per slot (rata-rata, tertinggi, terendah, tuntas/terisi). */
function renderTabelStatArsip(stat, slot) {
  if (!slot.length) return '';
  const head = `<tr>
    <th class="td-nama">Slot</th>
    <th>Terisi</th><th>Rata-rata</th><th>Tertinggi</th>
    <th>Terendah</th><th>Tuntas</th>
  </tr>`;
  const body = slot.map(sl => {
    const st = stat.find(x => x.kode === sl.kode) || {};
    const tuntas = st.tuntas || 0;
    const terisi = st.terisi || 0;
    const cls = tuntas === terisi && terisi > 0 ? 'chip-ok' : (tuntas > 0 ? 'chip-warn' : 'chip-netral');
    return `<tr>
      <td class="td-nama">${escape(sl.nama || sl.kode)}</td>
      <td class="angka">${escape(terisi)}</td>
      <td class="angka">${escape(fmtRata(st.rata_rata))}</td>
      <td class="angka">${escape(fmtNilai(st.tertinggi))}</td>
      <td class="angka">${escape(fmtNilai(st.terendah))}</td>
      <td class="angka"><span class="chip ${cls}">${escape(tuntas)}/${escape(terisi)}</span></td>
    </tr>`;
  }).join('');
  return `<div class="kartu" style="margin-top:1rem">
    <div class="kartu-title">Statistik per Slot (sekolah)</div>
    <div class="tabel-bungkus">
      <table class="tabel tabel-padat">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </div>`;
}

// =========================== VERIFIKASI ===========================

async function verifikasiArsip(idArsip) {
  toast('Memverifikasi checksum...', 'info');
  try {
    const res = await panggil('arsip_verify', { id_arsip: idArsip }, state.token);
    if (res.ok) {
      toast('Verifikasi OK: checksum cocok.', 'ok');
    } else {
      toast('Verifikasi GAGAL: checksum tidak cocok!', 'err');
      // Tampilkan detail di modal buka arsip jika terbuka.
      const isi = document.getElementById('ba-isi');
      if (isi && document.getElementById('modal-buka-arsip')?.classList.contains('show')) {
        isi.insertAdjacentHTML('afterbegin', `<div class="banner banner-warn" style="margin-bottom:.6rem">
          <i data-lucide="shield-x"></i>
          <span><strong>Verifikasi GAGAL.</strong>
            Diharapkan: <code>${escape(fmtChecksum(res.checksum_diharapkan))}</code> ·
            Dihitung: <code>${escape(fmtChecksum(res.checksum_dihitung))}</code></span>
        </div>`);
        renderIkon();
      }
    }
  } catch (err) {
    toast(pesanGalat(err), 'err');
  }
}

// =========================== BUKA KUNCI ===========================

async function bukaKunciArsip(idArsip) {
  const a = state.daftar.find(x => x.id_arsip === idArsip);
  state.arsipBukaKunciTarget = a || { id_arsip: idArsip, nama_kegiatan: '-' };
  const info = document.getElementById('bk-arsip-info');
  if (info) {
    info.innerHTML = `<div><strong>${escape(state.arsipBukaKunciTarget.nama_kegiatan)}</strong></div>
      <div class="petunjuk">ID arsip: <code>${escape(idArsip)}</code></div>`;
  }
  const alasan = document.getElementById('bk-alasan');
  if (alasan) alasan.value = '';
  modalBuka('modal-buka-kunci');
}

async function konfirmasiBukaKunci() {
  const a = state.arsipBukaKunciTarget;
  const alasan = String(document.getElementById('bk-alasan')?.value || '').trim();
  if (!a || !a.id_arsip) {
    toast('Konteks arsip hilang.', 'err');
    return;
  }
  if (!alasan) {
    toast('Alasan wajib diisi.', 'err');
    return;
  }
  const btn = document.getElementById('bk-konfirmasi');
  if (btn) { btn.disabled = true; btn.innerHTML = spin('Memproses...'); }
  try {
    await panggil('arsip_buka_kunci', { id_arsip: a.id_arsip, alasan }, state.token);
    toast('Arsip dibuka. Kegiatan kembali ke status dikunci.', 'ok');
    modalTutup('modal-buka-kunci');
    renderArsip(state.sesi);
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="unlock"></i> Buka Kunci`;
      renderIkon();
    }
  }
}
