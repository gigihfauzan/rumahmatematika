// input-nilai.js — Halaman Tabel Input Nilai (Tahap 3B).
// Fitur: input nilai per siswa (keyboard nav, paste kolom Excel, validasi 0-100),
// statistik langsung (terisi/rata-rata/tertinggi/terendah/jumlah<KKTP), draft lokal
// (localStorage), simpan draft / kirim final, kunci / buka kunci (spn/admin),
// perlindungan versi (VERSI_USANG), read-only saat final/non-izin.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil, GalatApi } from '../api.js';
import { navigasi } from '../router.js';
import { renderModal, modalBuka, modalTutup, chip, pasangModalTutupGlobal } from '../komponen.js';

pasangModalTutupGlobal();

// State halaman.
const state = {
  sesi: null,
  token: null,
  idKeg: null, idKelas: null, idVarian: null,
  data: null,           // hasil nilai_ambil
  versi: 0,             // status_input.versi (di-cache)
  kktp: 0,              // kktp_efektif
  readOnly: false,      // tabel read-only (final & non-spn)
  bolehKunci: false,    // bisa_kunci (spn/admin)
  kunciDraft: null      // kunci localStorage draft
};

// =========================== UTIL ===========================

/** Debounce sederhana. */
function debung(fn, ms = 500) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Coba parse nilai string ke angka 0-100. Mengembalikan {num, ok, kosong}. */
function parseNilai(raw) {
  if (raw === '' || raw == null || String(raw).trim() === '') {
    return { kosong: true, num: null, ok: true };
  }
  const s = String(raw).replace(',', '.').trim();
  const num = Number(s);
  if (isNaN(num)) return { kosong: false, num: null, ok: false };
  if (num < 0 || num > 100) return { kosong: false, num, ok: false };
  return { kosong: false, num, ok: true };
}

/** Kunci localStorage untuk draft. */
function kunciDraft() {
  const u = (state.sesi && state.sesi.username) || '_';
  return `enilai_draft_${state.idKeg}_${state.idKelas}_${state.idVarian}_${u}`;
}

/** Baca draft dari localStorage: { versi, nilai:{id_siswa:string} } atau null. */
function bacaDraft() {
  try {
    const raw = localStorage.getItem(state.kunciDraft);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return { versi: Number(obj.versi) || 0, nilai: obj.nilai || {} };
  } catch (e) { return null; }
}

/** Simpan draft (versi sekarang + peta nilai). */
function simpanDraft(nilaiMap) {
  if (state.readOnly) return;
  try {
    localStorage.setItem(state.kunciDraft, JSON.stringify({ versi: state.versi, nilai: nilaiMap }));
  } catch (e) { /* kuota penuh: abaikan */ }
}

/** Hapus draft. */
function hapusDraft() {
  try { localStorage.removeItem(state.kunciDraft); } catch (e) {}
}

/** Apakah ada perubahan belum tersimpan? Bandingkan draft dengan nilai server. */
function adaDraftBerbeda(nilaiMap, peserta) {
  for (const p of peserta) {
    const serverVal = p.nilai === '' || p.nilai == null ? '' : String(p.nilai);
    const lokalVal = nilaiMap[p.id_siswa] || '';
    if (lokalVal !== serverVal) return true;
  }
  return false;
}

// =========================== ENTRY ===========================

export async function renderInputNilai(sesi, params) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.idKeg = params && params[0];
  state.idKelas = params && params[1];
  state.idVarian = params && params[2];

  document.getElementById('topbar-judul').textContent = 'Input Nilai';
  const main = document.getElementById('main');

  if (!state.idKeg || !state.idKelas || !state.idVarian) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Parameter tidak lengkap</h3>
      <p>Tautan input nilai harus berisi id kegiatan, kelas, dan varian.</p>
      <button class="btn btn-sekunder btn-kecil" onclick="location.hash='#/tugas-guru'">
        <i data-lucide="arrow-left"></i> Kembali</button></div>`;
    renderIkon();
    return;
  }

  state.kunciDraft = kunciDraft();
  main.innerHTML = spin('Memuat tabel nilai...');
  await muatDanRender();
}

/** Muat nilai_ambil lalu render seluruh halaman. */
async function muatDanRender() {
  const main = document.getElementById('main');
  try {
    const data = await panggil('nilai_ambil', {
      id_kegiatan: state.idKeg, id_kelas: state.idKelas, id_varian: state.idVarian
    }, state.token);
    state.data = data;
    state.versi = (data.status_input && Number(data.status_input.versi)) || 0;
    state.kktp = Number(data.kktp_efektif) || 0;
    state.bolehKunci = !!data.bisa_kunci;
    // Read-only jika: tidak diizinkan ATAU status final & bukan spn/admin.
    const finalLock = data.status_input && data.status_input.status === 'final' &&
      !boleh(state.sesi.peran, 'standar_penilaian');
    state.readOnly = !data.diizinkan.diizinkan || finalLock;
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p>
      <button class="btn btn-sekunder btn-kecil" onclick="location.hash='#/tugas-guru'">
        <i data-lucide="arrow-left"></i> Kembali</button></div>`;
    renderIkon();
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
  const d = state.data;
  const kg = d.kegiatan || {};
  const si = d.status_input || {};
  const izin = d.diizinkan || { diizinkan: true, alasan: '' };

  // Header info.
  const headerInfo = `
    <div class="kartu kartu-info-input">
      <div class="kartu-info-head">
        <h2>${escape(kg.nama || '-')}</h2>
        <div class="kartu-info-chips">
          ${si.status === 'final' ? chip('Final', 'ok') : chip('Draft', 'netral')}
          ${state.readOnly ? chip('Read-only', 'warn') : chip('Dapat diedit', 'info')}
        </div>
      </div>
      <div class="kartu-info-meta">
        <span><i data-lucide="users"></i> ${escape(namaKelas(d) || '-')}</span>
        <span><i data-lucide="target"></i> KKTP efektif: <strong>${escape(state.kktp)}</strong></span>
        <span><i data-lucide="calendar-clock"></i> Tutup: ${escape(kg.tanggal_tutup || '-')}</span>
      </div>
      ${!izin.diizinkan ? `<div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
          <div><strong>Input tidak diizinkan.</strong> ${escape(izin.alasan || '')}</div></div>` : ''}
      ${si.status === 'final' && !boleh(state.sesi.peran, 'standar_penilaian')
        ? `<div class="banner banner-info"><i data-lucide="lock"></i>
          <div>Penugasan sudah dikirim final. Hubungi standar penilaian untuk membuka kembali.</div></div>` : ''}
      <div id="badge-draft"></div>
    </div>`;

  // Aksi & footer tabel.
  const tombolAksi = renderTombolAksi();

  main.innerHTML = `
    <h1 class="page-judul">Input Nilai</h1>
    <button class="btn btn-sekunder btn-kecil" id="btn-kembali" style="margin-bottom:1rem">
      <i data-lucide="arrow-left"></i> Kembali ke Tugas</button>
    ${headerInfo}
    <div id="tabel-nilai"></div>
    <div id="stat-bungkus"></div>
    <div class="input-aksi-grup">${tombolAksi}</div>
    ${renderModal('modal-buka-kunci', 'Buka Kunci Penugasan', `
      <p style="margin:0 0 .75rem">Membuka kunci akan mengembalikan status menjadi <strong>draft</strong>.
        Guru dapat mengubah nilai kembali. Alasan wajib dicatat untuk audit.</p>
      <div class="field"><label class="label" for="bk-alasan">Alasan membuka kunci</label>
        <textarea class="textarea" id="bk-alasan" placeholder="Contoh: ada nilai salah ketik, perlu korepsi setelah final."></textarea></div>
      <div id="bk-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-buka-kunci">Batal</button>
      <button class="btn btn-warn" id="btn-jalankan-buka-kunci"><i data-lucide="lock-open"></i> Buka Kunci</button>
    `)}
  `;
}

/** Ambil nama kelas dari peserta pertama (nilai_ambil tidak menyertakan nama kelas eksplisit). */
function namaKelas(d) {
  const p = (d.peserta || [])[0];
  return p && p.nama_kelas ? p.nama_kelas : '';
}

/** Render tombol aksi sesuai hak & status. */
function renderTombolAksi() {
  if (state.readOnly) {
    return `<button class="btn btn-sekunder btn-kecil" id="btn-muat-ulang"><i data-lucide="refresh-cw"></i> Muat Ulang</button>`;
  }
  const btnSimpan = `<button class="btn btn-sekunder btn-kecil" id="btn-simpan"><i data-lucide="save"></i> Simpan Draft</button>`;
  const btnFinal = `<button class="btn btn-kecil" id="btn-final"><i data-lucide="send"></i> Kirim Final</button>`;
  const btnKunci = state.bolehKunci ? `
    <button class="btn btn-sekunder btn-kecil" id="btn-kunci"><i data-lucide="lock"></i> Kunci (Final)</button>
    <button class="btn btn-sekunder btn-kecil" id="btn-buka-kunci"><i data-lucide="lock-open"></i> Buka Kunci</button>` : '';
  const btnMuat = `<button class="btn btn-sekunder btn-kecil" id="btn-muat-ulang"><i data-lucide="refresh-cw"></i> Muat Ulang</button>`;
  return btnSimpan + btnFinal + btnKunci + btnMuat;
}

function renderIsi() {
  const peserta = state.data.peserta || [];
  const wadah = document.getElementById('tabel-nilai');
  if (!wadah) return;

  if (!peserta.length) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="users-x"></i>
      <h3>Tidak ada peserta</h3>
      <p>Tidak ada siswa efektif untuk kegiatan/kelas/varian ini.</p></div>`;
    renderStatistik();
    return;
  }

  // Pulihkan draft jika versi cocok.
  const draft = bacaDraft();
  const draftNilai = (draft && draft.versi === state.versi) ? draft.nilai : null;

  const readonlyAttr = state.readOnly ? 'readonly disabled' : '';
  const baris = peserta.map((p, idx) => {
    // Nilai awal: prioritas draft > nilai server.
    let val = '';
    if (draftNilai && draftNilai[p.id_siswa] != null) val = draftNilai[p.id_siswa];
    else if (p.nilai !== '' && p.nilai != null) val = String(p.nilai);
    const badgeBaru = p.baru ? `<span class="badge badge-baru">Baru</span>` : '';
    const badgeSusulan = p.susulan ? `<span class="badge badge-susulan">Susulan</span>` : '';
    return `<tr data-id="${escape(p.id_siswa)}">
      <td class="td-no">${escape(p.no_urut || (idx + 1))}</td>
      <td class="td-nama">
        <div class="td-nama-grup">
          <span class="td-nama-teks">${escape(p.nama)}</span>
          <span class="badge-grup">${badgeBaru}${badgeSusulan}</span>
        </div>
        <div class="td-nama-sub">${escape(p.nisn || '-')}${p.nis ? ' / ' + escape(p.nis) : ''}</div>
      </td>
      <td class="td-nilai"><input class="input-nilai" type="text" inputmode="decimal"
          data-idx="${idx}" data-id="${escape(p.id_siswa)}"
          value="${escape(val)}" ${readonlyAttr}
          placeholder="—" autocomplete="off" /></td>
    </tr>`;
  }).join('');

  wadah.innerHTML = `<div class="tabel-bungkus tabel-input-bungkus">
    <table class="tabel tabel-input">
      <thead><tr>
        <th class="th-no">No</th>
        <th class="th-nama">Nama Peserta</th>
        <th class="th-nilai">Nilai (0–100)</th>
      </tr></thead>
      <tbody>${baris}</tbody>
    </table></div>`;

  // Verifikasi tiap input (warna & statistik).
  wadah.querySelectorAll('.input-nilai').forEach(inp => verifikasiInput(inp));
  renderStatistik();
  renderBadgeDraft();
}

/** Tampilkan badge "belum tersimpan" jika draft berbeda dari server. */
function renderBadgeDraft() {
  const b = document.getElementById('badge-draft');
  if (!b) return;
  if (state.readOnly) { b.innerHTML = ''; return; }
  const peserta = state.data.peserta || [];
  const nilaiMap = kumpulkanNilai();
  if (adaDraftBerbeda(nilaiMap, peserta)) {
    b.innerHTML = `<span class="badge badge-belum-tersimpan"><i data-lucide="circle-alert"></i> Ada perubahan belum tersimpan</span>`;
  } else {
    b.innerHTML = '';
  }
  renderIkon();
}

/** Kumpulkan peta {id_siswa: nilai_string} dari input tabel. */
function kumpulkanNilai() {
  const map = {};
  document.querySelectorAll('#tabel-nilai .input-nilai').forEach(inp => {
    map[inp.dataset.id] = inp.value;
  });
  return map;
}

/** Verifikasi nilai satu input: tandai merah jika invalid, tandai di-bawah-kktp jika valid < kktp. */
function verifikasiInput(inp) {
  inp.classList.remove('sel-galat', 'di-bawah-kktp');
  const parsed = parseNilai(inp.value);
  if (!parsed.ok) {
    inp.classList.add('sel-galat');
    return;
  }
  if (!parsed.kosong && parsed.num < state.kktp) {
    inp.classList.add('di-bawah-kktp');
  }
}

/** Hitung & render statistik langsung. */
function renderStatistik() {
  const wadah = document.getElementById('stat-bungkus');
  if (!wadah) return;
  const peserta = state.data.peserta || [];
  const total = peserta.length;
  const nilaiNums = [];
  let terisi = 0;
  document.querySelectorAll('#tabel-nilai .input-nilai').forEach(inp => {
    const p = parseNilai(inp.value);
    if (p.kosong) return;
    if (!p.ok) return; // bermasalah tidak dihitung
    nilaiNums.push(p.num);
    terisi++;
  });
  const rata = nilaiNums.length ? (nilaiNums.reduce((a, b) => a + b, 0) / nilaiNums.length) : 0;
  const tertinggi = nilaiNums.length ? Math.max(...nilaiNums) : 0;
  const terendah = nilaiNums.length ? Math.min(...nilaiNums) : 0;
  const diBawah = nilaiNums.filter(n => n < state.kktp).length;
  const kosong = total - terisi;

  wadah.innerHTML = `<div class="stat-grid">
    <div class="stat-kartu"><div class="stat-angka">${terisi}/${total}</div><div class="stat-label">Terisi</div></div>
    <div class="stat-kartu"><div class="stat-angka">${nilaiNums.length ? rata.toFixed(2) : '-'}</div><div class="stat-label">Rata-rata</div></div>
    <div class="stat-kartu"><div class="stat-angka">${nilaiNums.length ? tertinggi : '-'}</div><div class="stat-label">Tertinggi</div></div>
    <div class="stat-kartu"><div class="stat-angka">${nilaiNums.length ? terendah : '-'}</div><div class="stat-label">Terendah</div></div>
    <div class="stat-kartu ${diBawah ? 'stat-warn' : ''}"><div class="stat-angka">${diBawah}</div><div class="stat-label">Di bawah KKTP</div></div>
    <div class="stat-kartu ${kosong ? 'stat-warn' : ''}"><div class="stat-angka">${kosong}</div><div class="stat-label">Belum diisi</div></div>
  </div>`;
}

// =========================== LISTENER ===========================

function pasangListener() {
  // Kembali.
  document.getElementById('btn-kembali')?.addEventListener('click', () => navigasi('#/tugas-guru'));
  document.getElementById('btn-muat-ulang')?.addEventListener('click', muatDanRender);

  const tabel = document.getElementById('tabel-nilai');
  if (!tabel) return;

  // Input nilai: input → verifikasi + statistik + draft (debounce).
  const simpanDraftDebung = debung(() => {
    simpanDraft(kumpulkanNilai());
    renderBadgeDraft();
  }, 500);
  tabel.addEventListener('input', (e) => {
    const inp = e.target.closest('.input-nilai');
    if (!inp) return;
    verifikasiInput(inp);
    renderStatistik();
    simpanDraftDebung();
  });

  // Keyboard nav: Enter/ArrowDown → baris+1; ArrowUp → baris-1.
  tabel.addEventListener('keydown', (e) => {
    const inp = e.target.closest('.input-nilai');
    if (!inp) return;
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      fokusInput(Number(inp.dataset.idx) + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      fokusInput(Number(inp.dataset.idx) - 1);
    }
  });

  // Paste kolom Excel: ambil teks, split baris, isi berurutan.
  tabel.addEventListener('paste', (e) => {
    if (state.readOnly) return;
    const inp = e.target.closest('.input-nilai');
    if (!inp) return;
    const teks = e.clipboardData ? e.clipboardData.getData('text') : '';
    if (!teks) return;
    e.preventDefault();
    const baris = teks.split(/\r\n|\r|\n/).map(s => s.trim()).filter(s => s !== '');
    if (!baris.length) return;
    const semuaInput = Array.from(document.querySelectorAll('#tabel-nilai .input-nilai'));
    const idxAwal = Number(inp.dataset.idx);
    let dipakai = 0;
    for (let i = 0; i < baris.length && (idxAwal + i) < semuaInput.length; i++) {
      // Untuk tiap baris: jika ada beberapa kolom (tab), ambil token yang parse-angka; kalau tidak, ambil utuh.
      const tok = baris[i].split(/\t|;|,/).map(s => s.trim());
      let nilaiStr = baris[i];
      // Cari token pertama yang angka valid.
      const numericTok = tok.find(t => parseNilai(t).ok && !parseNilai(t).kosong);
      if (numericTok != null) nilaiStr = numericTok;
      else if (tok.length > 1) nilaiStr = tok[tok.length - 1]; // kolom terakhir (umumnya nilai)
      const target = semuaInput[idxAwal + i];
      target.value = nilaiStr;
      verifikasiInput(target);
      dipakai++;
    }
    if (baris.length !== dipakai) {
      toast(`Ditempel ${dipakai} nilai dari ${baris.length} baris. Jumlah baris berbeda dari baris tabel tersisa.`, 'warn');
    } else {
      toast(`${dipakai} nilai ditempel.`, 'ok');
    }
    renderStatistik();
    simpanDraftDebung();
  });

  // Aksi tombol.
  document.getElementById('btn-simpan')?.addEventListener('click', () => simpanAtauFinal('draft'));
  document.getElementById('btn-final')?.addEventListener('click', () => simpanAtauFinal('final'));
  document.getElementById('btn-kunci')?.addEventListener('click', kunci);
  document.getElementById('btn-buka-kunci')?.addEventListener('click', () => {
    document.getElementById('bk-alasan').value = '';
    document.getElementById('bk-galat').textContent = '';
    modalBuka('modal-buka-kunci');
  });
  document.getElementById('btn-jalankan-buka-kunci')?.addEventListener('click', bukaKunci);
}

/** Fokus input nilai pada indeks (jika ada). */
function fokusInput(idx) {
  const inp = document.querySelector(`#tabel-nilai .input-nilai[data-idx="${idx}"]`);
  if (inp) { inp.focus(); inp.select?.(); }
}

// =========================== SIMPAN / FINAL / KUNCI ===========================

/** Simpan draft atau kirim final. */
async function simpanAtauFinal(target) {
  if (state.readOnly) return;
  const peserta = state.data.peserta || [];

  // Validasi: ada nilai bermasalah?
  const bermasalah = [];
  const nilaiList = [];
  document.querySelectorAll('#tabel-nilai .input-nilai').forEach(inp => {
    const p = parseNilai(inp.value);
    if (p.kosong) return;
    if (!p.ok) {
      bermasalah.push({ id_siswa: inp.dataset.id, pesan: 'Nilai invalid' });
      return;
    }
    nilaiList.push({ id_siswa: inp.dataset.id, nilai: inp.value });
  });

  if (bermasalah.length) {
    toast(`Ada ${bermasalah.length} nilai invalid (merah). Perbaiki sebelum menyimpan.`, 'err');
    return;
  }

  // Hitung jumlah kosong untuk final.
  const jumlahKosong = peserta.length - nilaiList.length;

  if (target === 'final') {
    const ok = confirm(`Kirim final? Ada ${jumlahKosong} nilai kosong (tidak akan diisi).`);
    if (!ok) return;
  }

  const aksi = target === 'final' ? 'nilai_kirim_final' : 'nilai_simpan';
  const btn = document.getElementById(target === 'final' ? 'btn-final' : 'btn-simpan');
  const btnHtmlAwal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = spin(target === 'final' ? 'Mengirim...' : 'Menyimpan...');

  try {
    const hasil = await panggil(aksi, {
      id_kegiatan: state.idKeg, id_kelas: state.idKelas, id_varian: state.idVarian,
      versi: state.versi, nilai: nilaiList
    }, state.token);
    // Sukses.
    state.versi = hasil.versi_baru;
    hapusDraft();
    let pesan = target === 'final' ? 'Nilai dikirim final.' : 'Draft tersimpan.';
    if (hasil.dibulatkan && hasil.dibulatkan.length) {
      pesan += ` ${hasil.dibulatkan.length} nilai dibulatkan.`;
    }
    if (hasil.bermasalah && hasil.bermasalah.length) {
      pesan += ` ${hasil.bermasalah.length} nilai bermasalah.`;
    }
    if (hasil.jumlah_kosong) {
      pesan += ` ${hasil.jumlah_kosong} nilai kosong.`;
    }
    toast(pesan, target === 'final' ? 'ok' : 'ok');
    // Muat ulang untuk merefresh nilai bulat & status.
    await muatDanRender();
  } catch (err) {
    if (err instanceof GalatApi && err.kode === 'VERSI_USANG') {
      toast(pesanGalat(err), 'warn');
      tampilkanVersiUsang();
    } else {
      toast(pesanGalat(err), 'err');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlAwal; renderIkon(); }
  }
}

/** Tampilkan banner + tombol muat ulang ketika versi usang. */
function tampilkanVersiUsang() {
  const b = document.getElementById('badge-draft');
  if (!b) return;
  b.innerHTML = `<div class="banner banner-warn" style="margin-top:.75rem">
    <i data-lucide="alert-triangle"></i>
    <div>Isian Anda berdasarkan versi lama. Muat ulang untuk mendapatkan data terbaru.
      <button class="btn btn-kecil btn-warn" id="btn-versi-muat-ulang" style="margin-left:.5rem">
        <i data-lucide="refresh-cw"></i> Muat Ulang</button></div></div>`;
  renderIkon();
  document.getElementById('btn-versi-muat-ulang')?.addEventListener('click', muatDanRender);
}

/** Kunci (final) oleh spn/admin. */
async function kunci() {
  if (!state.bolehKunci) return;
  if (!confirm('Kunci penugasan? Status akan menjadi final; guru tidak dapat mengubah nilai lagi.')) return;
  const btn = document.getElementById('btn-kunci');
  const awal = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = spin('Mengunci...');
  try {
    await panggil('nilai_kunci', {
      id_kegiatan: state.idKeg, id_kelas: state.idKelas, id_varian: state.idVarian
    }, state.token);
    toast('Penugasan dikunci (final).', 'ok');
    hapusDraft();
    await muatDanRender();
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = awal; renderIkon(); }
  }
}

/** Buka kunci (final → draft) oleh spn/admin dengan alasan. */
async function bukaKunci() {
  if (!state.bolehKunci) return;
  const alasan = document.getElementById('bk-alasan').value.trim();
  const galatEl = document.getElementById('bk-galat');
  galatEl.textContent = '';
  if (!alasan) { galatEl.textContent = 'Alasan wajib diisi.'; return; }
  const btn = document.getElementById('btn-jalankan-buka-kunci');
  const awal = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = spin('Membuka...');
  try {
    await panggil('nilai_buka_kunci', {
      id_kegiatan: state.idKeg, id_kelas: state.idKelas, id_varian: state.idVarian, alasan
    }, state.token);
    toast('Penugasan dibuka kembali (draft).', 'ok');
    modalTutup('modal-buka-kunci');
    await muatDanRender();
  } catch (err) {
    galatEl.textContent = pesanGalat(err);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = awal; renderIkon(); }
  }
}
