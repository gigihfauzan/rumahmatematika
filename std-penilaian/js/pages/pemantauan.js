// pemantauan.js — Halaman Pemantauan (Tahap 4).
// Tampilan pemantauan nilai per kegiatan: lembar kelas, lembar paralel, rekap,
// grafik, dan remedial. Mengikuti kontrak aksi Pemantauan.gs & Mesin.gs.
//
// Hak akses (diputuskan server; frontend mengikuti bisa_semua & wali_kelas_terbatas):
// - admin/standar_penilaian/kepsek: semua kelas & semua tab.
// - wali kelas murni (peran 'guru' tanpa spn/kepsek): Lembar Kelas, Rekap, Remedial
//   saja; server memaksa data terbatas ke kelas perwalian.
// - Lembar Paralel & Grafik hanya ditampilkan jika boleh(peran,'kepsek').
//
// Catatan: tidak ada pustaka selain Chart.js (UMD via <script> di index.html,
// versi dipatok 4.4.1). Token diambil dari localStorage. escape() dipakai untuk
// semua data dinamis; renderIkon() dipanggil setelah setiap innerHTML.
import { renderIkon, escape, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { chip } from '../komponen.js';

// Chart.js dimuat via <script> UMD di index.html → window.Chart.
const Chart = (typeof window !== 'undefined') ? window.Chart : null;

// =========================== STATE ===========================

const state = {
  sesi: null,
  token: null,
  // Daftar kegiatan & preferensi global.
  kegiatanList: [],
  bisaSemua: false,           // bisa_semua dari pemantauan_kegiatan_daftar
  idKeg: null,
  kegiatan: null,             // objek kegiatan terpilih
  hanyaFinal: false,
  belumFinal: 0,              // jumlah penugasan belum final (untuk banner)
  // Tab aktif.
  tabAktif: 'kelas',          // 'kelas' | 'paralel' | 'rekap' | 'grafik' | 'remedial'
  // Kelas (di-cache; dipakai tab Lembar Kelas & Remedial).
  kelasList: [],
  kelasListDimuat: false,
  // Untuk wali murni: daftar id_kelas perwalian yang berhasil ditemukan.
  waliKelasIds: [],
  waliKelasDitemukan: false,
  // Lembar Kelas.
  idKelasTerpilih: null,
  urutLembar: 'abjad',        // 'abjad' | 'peringkat'
  // Lembar Paralel.
  tingkatParalel: null,
  paralelFilter: { idKelas: '', q: '' },
  _paralelSiswaCache: [],   // siswa penuh dari lembar_paralel (untuk filter lokal)
  _paralelSlotCache: [],
  _paralelStatCache: [],
  // Rekap.
  rekapTingkatAktif: null,
  rekapCache: null,           // hasil rekap terakhir
  // Grafik (Chart.js).
  charts: [],                 // instance Chart aktif (untuk dihancurkan sebelum render ulang)
  grafikTingkat: null,
  grafikKodeSlot: null,
  grafikCache: null,          // hasil grafik terakhir
  // Remedial.
  remedialFilter: { tingkat: '', idKelas: '', kodeSlot: '' },
  remedialCache: null,        // hasil remedial terakhir
  // slot_unified (di-cache dari respons mana pun; dipakai filter slot Remedial).
  slotUnified: []
};

// =========================== UTIL ===========================

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

/** Persen tuntas: 1 desimal (sudah dari server) atau 0. */
function fmtPersen(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(1).replace(/\.0$/, '') + '%';
}

/** Tag varian: huruf kecil inisial tiap kata. "Seni Budaya" → "sb", "Prakarya" → "pk". */
function varianTag(nama) {
  if (!nama) return '';
  return String(nama).trim().split(/\s+/).map(k => k[0] || '').join('').toLowerCase();
}

/** Baca variabel CSS tema aktif (mis. --primer). Fallback bila kosong. */
function warnaTema(nama, fallback) {
  const cs = getComputedStyle(document.documentElement);
  const v = cs.getPropertyValue(nama).trim();
  return v || fallback;
}

/** Konversi warna (hex / rgb / rgba) ke rgba dengan alpha tertentu. */
function warnaRgba(warna, alpha) {
  const s = String(warna).trim();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length !== 6) return s;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map(x => x.trim());
    return `rgba(${p[0]},${p[1]},${p[2]},${alpha})`;
  }
  return s;
}

/** Urutkan slot_unified berdasarkan urutan. */
function urutSlot(arr) {
  return [...(arr || [])].sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
}

/** Apakah tab paralel/grafik boleh ditampilkan? */
function bolehParalelGrafik() {
  return boleh(state.sesi.peran, 'kepsek');
}

/** Daftar tab yang tersedia untuk sesi ini. */
function daftarTab() {
  const t = [{ id: 'kelas', judul: 'Lembar Kelas', ikon: 'table' }];
  if (bolehParalelGrafik()) {
    t.push({ id: 'paralel', judul: 'Lembar Paralel', ikon: 'layers' });
  }
  t.push({ id: 'rekap', judul: 'Rekap', ikon: 'clipboard-list' });
  if (bolehParalelGrafik()) {
    t.push({ id: 'grafik', judul: 'Grafik', ikon: 'bar-chart-3' });
  }
  t.push({ id: 'remedial', judul: 'Remedial', ikon: 'alert-triangle' });
  return t;
}

// =========================== ENTRY ===========================

export async function renderPemantauan(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  // Judul kontekstual: wali (guru murni) melihat "Lembar Kelas", lainnya "Pemantauan".
  const adalahWali = boleh(sesi.peran, 'guru') && !boleh(sesi.peran, 'standar_penilaian') && !boleh(sesi.peran, 'kepsek');
  document.getElementById('topbar-judul').textContent = adalahWali ? 'Lembar Kelas' : 'Pemantauan';
  const main = document.getElementById('main');

  // Hak dasar: spn/kepsek/admin atau guru (wali). Guru murni tanpa perwalian
  // akan ditolak server dengan AKSES_DITOLAK; di sini kita tidak mencegah
  // agar pesan server tetap muncul natural.
  if (!boleh(sesi.peran, 'standar_penilaian') && !boleh(sesi.peran, 'kepsek') && !boleh(sesi.peran, 'guru')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini khusus standar penilaian, kepala sekolah, atau wali kelas.</p></div>`;
    renderIkon();
    return;
  }

  // Pulihkan kegiatan terakhir dari sessionStorage.
  const simpan = sessionStorage.getItem('enilai_keg_pantau');
  if (simpan) state.idKeg = simpan;

  main.innerHTML = spin('Memuat daftar kegiatan...');
  try {
    const d = await panggil('pemantauan_kegiatan_daftar', {}, state.token);
    state.kegiatanList = d.kegiatan || [];
    state.bisaSemua = !!d.bisa_semua;
    // Validasi idKeg tersimpan masih ada di daftar.
    if (state.idKeg && !state.kegiatanList.some(k => k.id_kegiatan === state.idKeg)) {
      state.idKeg = null;
    }
    if (!state.idKeg && state.kegiatanList.length === 1) {
      state.idKeg = state.kegiatanList[0].id_kegiatan;
    }
    state.kegiatan = state.idKeg ? state.kegiatanList.find(k => k.id_kegiatan === state.idKeg) : null;
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }

  renderKerangka();
  pasangListenerKerangka();

  if (!state.kegiatanList.length) {
    renderKosongPilih('Belum ada kegiatan',
      'Belum ada kegiatan penilaian pada tahun ajaran aktif yang dapat Anda pantau.');
    renderIkon();
    return;
  }
  if (!state.idKeg) {
    renderKosongPilih('Pilih kegiatan',
      'Pilih kegiatan pada dropdown di atas untuk mulai memantau.');
    renderIkon();
    return;
  }

  await gantiTab(state.tabAktif);
  renderIkon();
}

// =========================== KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Pemantauan</h1>
    <p class="petunjuk" style="margin:0 0 1rem">Pantau capaian nilai siswa per kelas, paralel, tingkat, dan kegiatan.</p>
    <div class="toolbar">
      <div class="tumbal" style="min-width:240px">
        <label class="label" for="pantau-keg">Kegiatan</label>
        <select class="select" id="pantau-keg">
          <option value="">— pilih kegiatan —</option>
          ${state.kegiatanList.map(k => `<option value="${escape(k.id_kegiatan)}"${k.id_kegiatan === state.idKeg ? ' selected' : ''}>${escape(k.nama)} (${escape(k.status)})</option>`).join('')}
        </select>
      </div>
      <div class="tumbal" style="min-width:180px">
        <label class="label">Filter</label>
        <label class="cek-kotak">
          <input type="checkbox" id="pantau-hanya-final" ${state.hanyaFinal ? 'checked' : ''} />
          <span>Hanya final</span>
        </label>
      </div>
      <div class="tumbal" style="min-width:160px" id="pantau-info-keg">
        ${state.kegiatan ? ringkasKegiatan(state.kegiatan) : ''}
      </div>
    </div>
    <div id="pantau-banner"></div>
    <div class="tab-bar" id="pantau-tab" role="tablist">
      ${daftarTab().map(t => `<button class="tab-item${t.id === state.tabAktif ? ' aktif' : ''}" data-tab="${t.id}" role="tab" aria-selected="${t.id === state.tabAktif ? 'true' : 'false'}"><i data-lucide="${t.ikon}"></i> <span>${escape(t.judul)}</span></button>`).join('')}
    </div>
    <div id="pantau-konten"></div>`;
}

/** Ringkasan kegiatan (status, tingkat) di pojok toolbar. */
function ringkasKegiatan(kg) {
  const tingkat = (kg.tingkat_peserta || []).join(', ');
  return `<div style="font-size:.78rem; color:var(--teks-ringan)">
    <span>${chipStatusKegiatan(kg.status)}</span>
    <span style="margin-left:.5rem">Tingkat: ${escape(tingkat || '-')}</span>
  </div>`;
}

function chipStatusKegiatan(st) {
  if (st === 'dibuka') return chip('Dibuka', 'ok');
  if (st === 'draft') return chip('Draft', 'netral');
  if (st === 'dikunci') return chip('Dikunci', 'warn');
  if (st === 'diarsipkan') return chip('Diarsipkan', 'netral');
  return chip(st || '-', 'netral');
}

function pasangListenerKerangka() {
  // Ganti kegiatan: simpan & re-render tab aktif.
  document.getElementById('pantau-keg')?.addEventListener('change', async (e) => {
    state.idKeg = e.target.value;
    sessionStorage.setItem('enilai_keg_pantau', state.idKeg || '');
    state.kegiatan = state.idKeg ? state.kegiatanList.find(k => k.id_kegiatan === state.idKeg) : null;
    // Reset cache tab karena kegiatan berubah.
    resetCacheTab();
    // Perbarui ringkasan kegiatan.
    const info = document.getElementById('pantau-info-keg');
    if (info) info.innerHTML = state.kegiatan ? ringkasKegiatan(state.kegiatan) : '';
    if (!state.idKeg) {
      renderKosongPilih('Pilih kegiatan', 'Pilih kegiatan pada dropdown di atas untuk mulai memantau.');
      renderIkon();
      return;
    }
    await gantiTab(state.tabAktif);
    renderIkon();
  });

  // Toggle hanya_final: re-render tab aktif.
  document.getElementById('pantau-hanya-final')?.addEventListener('change', async (e) => {
    state.hanyaFinal = e.target.checked;
    // Cache hasil per tab bergantung pada hanya_final → reset.
    state.rekapCache = null;
    state.grafikCache = null;
    state.remedialCache = null;
    if (state.idKeg) {
      await gantiTab(state.tabAktif);
      renderIkon();
    }
  });

  // Klik tab.
  document.getElementById('pantau-tab')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.tab-item');
    if (!btn) return;
    const id = btn.dataset.tab;
    if (id === state.tabAktif) return;
    await gantiTab(id);
    renderIkon();
  });
}

/** Reset cache yang bergantung pada id_kegiatan / hanya_final. */
function resetCacheTab() {
  state.waliKelasIds = [];
  state.waliKelasDitemukan = false;
  state.idKelasTerpilih = null;
  state.tingkatParalel = null;
  state.rekapTingkatAktif = null;
  state.rekapCache = null;
  state.grafikCache = null;
  state.grafikTingkat = null;
  state.grafikKodeSlot = null;
  state.remedialCache = null;
  state.remedialFilter = { tingkat: '', idKelas: '', kodeSlot: '' };
  state.slotUnified = [];
  state.belumFinal = 0;
}

/** Ganti tab aktif: perbarui tab-bar, hancurkan chart, render isi. */
async function gantiTab(id) {
  state.tabAktif = id;
  // Perbarui kelas aktif pada tab-bar.
  document.querySelectorAll('#pantau-tab .tab-item').forEach(b => {
    const on = b.dataset.tab === id;
    b.classList.toggle('aktif', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  hancurkanCharts();
  const wadah = document.getElementById('pantau-konten');
  if (!wadah) return;
  wadah.innerHTML = spin('Memuat...');
  try {
    if (id === 'kelas') await renderLembarKelas();
    else if (id === 'paralel') await renderLembarParalel();
    else if (id === 'rekap') await renderRekap();
    else if (id === 'grafik') await renderGrafik();
    else if (id === 'remedial') await renderRemedial();
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
  }
  renderIkon();
}

// =========================== BANNER ===========================

function renderBanner() {
  const b = document.getElementById('pantau-banner');
  if (!b) return;
  const bf = state.belumFinal || 0;
  if (bf <= 0) { b.innerHTML = ''; return; }
  const pesan = state.hanyaFinal
    ? `${bf} penugasan belum final — nilai draft TIDAK dihitung (hanya final).`
    : `${bf} penugasan belum final — nilai draft ikut dihitung.`;
  b.innerHTML = `<div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
    <span>${escape(pesan)}</span></div>`;
}

/** Tampilkan keadaan kosong di #pantau-konten (tanpa memanggil API). */
function renderKosongPilih(judul, pesan) {
  const wadah = document.getElementById('pantau-konten');
  if (!wadah) return;
  wadah.innerHTML = `<div class="kosong"><i data-lucide="mouse-pointer-click"></i>
    <h3>${escape(judul)}</h3><p>${escape(pesan)}</p></div>`;
}

// =========================== MUAT KELAS (lazy) ===========================

/** Muat daftar kelas: bisa_semua → kelas_daftar; wali murni → temukanWaliKelas. */
async function muatKelasList() {
  if (state.kelasListDimuat) return;
  if (state.bisaSemua) {
    const d = await panggil('kelas_daftar', {}, state.token);
    state.kelasList = d.kelas || [];
    state.kelasListDimuat = true;
  } else {
    await temukanWaliKelas();
  }
}

/** Kelas yang cocok dengan tingkat peserta kegiatan terpilih. */
function kelasByTingkatKegiatan() {
  const tk = (state.kegiatan && state.kegiatan.tingkat_peserta) || [];
  return state.kelasList.filter(k => tk.includes(Number(k.tingkat)));
}

/**
 * Untuk wali murni (bisa_semua=false): temukan kelas perwalian melalui aksi
 * `rekap`. Wali tidak dapat memanggil kelas_daftar (peran standar_penilaian),
 * namun `rekap` dapat diakses dan perbandingan_rombel-nya sudah difilter
 * server ke kelas perwalian (wali_kelas_terbatas=true). Sekaligus mengisi
 * state.kelasList minimum & state.slotUnified.
 */
async function temukanWaliKelas() {
  if (state.waliKelasDitemukan) return;
  const rk = await panggil('rekap', {
    id_kegiatan: state.idKeg, hanya_final: state.hanyaFinal
  }, state.token);
  state.waliKelasIds = [];
  if (!state.kelasListDimuat) state.kelasList = [];
  (rk.perbandingan_rombel || []).forEach(blok => {
    (blok.rombel || []).forEach(r => {
      if (!r.id_kelas) return;
      if (!state.waliKelasIds.includes(r.id_kelas)) state.waliKelasIds.push(r.id_kelas);
      if (!state.kelasList.some(k => k.id_kelas === r.id_kelas)) {
        state.kelasList.push({ id_kelas: r.id_kelas, nama_kelas: r.nama_kelas, tingkat: blok.tingkat });
      }
    });
  });
  state.kelasListDimuat = true;
  if (rk.slot_unified) state.slotUnified = urutSlot(rk.slot_unified);
  state.waliKelasDitemukan = true;
}

// =========================== TAB A: LEMBAR KELAS ===========================

async function renderLembarKelas() {
  const wadah = document.getElementById('pantau-konten');
  wadah.innerHTML = spin('Memuat lembar kelas...');

  // Pastikan kelasList sudah dimuat.
  await muatKelasList();

  // Pilih kelas untuk ditampilkan.
  let idKelas = state.idKelasTerpilih;
  if (state.bisaSemua) {
    // Admin/spn/kepsek: tampilkan select semua kelas pada tingkat kegiatan.
    if (!idKelas) {
      const k = kelasByTingkatKegiatan()[0];
      idKelas = k ? k.id_kelas : null;
    }
  } else {
    // Wali murni: temukan kelas perwalian.
    await temukanWaliKelas();
    if (!state.waliKelasIds.length) {
      state.belumFinal = 0; renderBanner();
      wadah.innerHTML = `<div class="kosong"><i data-lucide="users-round"></i>
        <h3>Tidak ada kelas perwalian</h3>
        <p>Anda tidak memiliki kelas perwalian pada tingkat kegiatan ini.</p></div>`;
      return;
    }
    if (!idKelas || !state.waliKelasIds.includes(idKelas)) {
      idKelas = state.waliKelasIds[0];
    }
  }
  state.idKelasTerpilih = idKelas;

  if (!idKelas) {
    state.belumFinal = 0; renderBanner();
    wadah.innerHTML = `<div class="kosong"><i data-lucide="school"></i>
      <h3>Tidak ada kelas</h3>
      <p>Tidak ada kelas pada tingkat peserta kegiatan ini.</p></div>`;
    return;
  }

  // Render pemilih kelas (select jika bisa_semua atau wali punya >1; teks jika 1).
  const kelasObj = state.kelasList.find(k => k.id_kelas === idKelas);
  const pilihKelas = state.bisaSemua
    ? renderSelectKelas(kelasByTingkatKegiatan(), idKelas)
    : (state.waliKelasIds.length > 1
        ? renderSelectKelas(state.kelasList.filter(k => state.waliKelasIds.includes(k.id_kelas)), idKelas)
        : `<div class="lembar-kelas-stat"><strong>${escape(kelasObj ? kelasObj.nama_kelas : '-')}</strong>
            <span class="petunjuk">kelas perwalian</span></div>`);

  // Muat lembar.
  let data;
  try {
    data = await panggil('lembar_kelas', {
      id_kegiatan: state.idKeg, id_kelas: idKelas, hanya_final: state.hanyaFinal
    }, state.token);
  } catch (err) {
    state.belumFinal = 0; renderBanner();
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat lembar</h3><p>${escape(pesanGalat(err))}</p></div>`;
    return;
  }
  state.belumFinal = data.belum_final || 0;
  renderBanner();
  // Cache slot_unified untuk dipakai tab lain.
  if (data.slot_unified) state.slotUnified = urutSlot(data.slot_unified);

  renderIsiLembarKelas(data, pilihKelas, idKelas);
}

/** Render elemen pemilih kelas (select). */
function renderSelectKelas(daftar, terpilih) {
  const opts = daftar.map(k => `<option value="${escape(k.id_kelas)}"${k.id_kelas === terpilih ? ' selected' : ''}>${escape(k.nama_kelas)}</option>`).join('');
  return `<div class="tumbal" style="min-width:200px">
    <label class="label" for="lembar-kelas">Kelas</label>
    <select class="select" id="lembar-kelas">${opts}</select></div>`;
}

function renderIsiLembarKelas(data, pilihKelas, idKelas) {
  const wadah = document.getElementById('pantau-konten');
  const kg = data.kegiatan || {};
  const kls = data.kelas || {};
  const slot = urutSlot(data.slot_unified);
  const siswa = data.siswa || [];
  const stat = data.statistik_slot || [];

  // Header lembar: nama kegiatan, kelas, wali (nama + paraf), KKTP per slot.
  const kktpChips = slot.map(s => `<span class="chip-kktp" title="${escape(s.nama)}">${escape(s.singkatan || s.kode)}: ${escape(s.kktp || 0)}</span>`).join('');

  wadah.innerHTML = `
    <div class="lembar-header">
      <div class="kartu lembar-meta-kartu">
        <h2 style="margin:0 0 .25rem">${escape(kg.nama || '-')}</h2>
        <div class="lembar-meta">
          <span><i data-lucide="school"></i> Kelas: <strong>${escape(kls.nama_kelas || '-')}</strong></span>
          <span><i data-lucide="user"></i> Wali: <strong>${escape(kls.wali_nama || '-')}</strong></span>
          <div>
            <span style="display:block; margin-bottom:.2rem">KKTP berlaku:</span>
            <div class="lembar-kktp">${kktpChips || '<span class="petunjuk">tidak ada slot</span>'}</div>
          </div>
        </div>
      </div>
      <div class="kartu lembar-paraf">
        <div class="petunjuk" style="margin-bottom:2rem">${escape(kls.wali_nama || '-')},<br/>Wali Kelas ${escape(kls.nama_kelas || '-')}</div>
        <div class="lembar-paraf-garis">Paraf</div>
      </div>
    </div>
    <div class="toolbar" style="margin-bottom:.75rem">
      ${pilihKelas}
      <div class="kelompok-aksi" style="margin-left:auto">
        <button class="btn btn-kecil btn-sekunder ${state.urutLembar === 'abjad' ? 'aktif' : ''}" data-urut="abjad"><i data-lucide="arrow-down-a-z"></i> Abjad</button>
        <button class="btn btn-kecil btn-sekunder ${state.urutLembar === 'peringkat' ? 'aktif' : ''}" data-urut="peringkat"><i data-lucide="trophy"></i> Peringkat</button>
      </div>
    </div>
    ${renderTabelLembar(siswa, slot, stat, { mode: 'kelas' })}
  `;

  // Listener: ganti kelas & urut.
  document.getElementById('lembar-kelas')?.addEventListener('change', async (e) => {
    state.idKelasTerpilih = e.target.value;
    await renderLembarKelas();
    renderIkon();
  });
  wadah.querySelectorAll('[data-urut]').forEach(b => {
    b.addEventListener('click', async () => {
      state.urutLembar = b.dataset.urut;
      await renderLembarKelas();
      renderIkon();
    });
  });
  renderIkon();
}

/**
 * Render tabel lembar nilai (dipakai untuk Lembar Kelas & Lembar Paralel).
 * mode: 'kelas' (kolom Peringkat Kelas + Paralel + Keterangan) | 'paralel' (Peringkat Paralel).
 */
function renderTabelLembar(siswa, slot, stat, opts) {
  if (!siswa.length) {
    return `<div class="kosong"><i data-lucide="circle-slash"></i>
      <h3>Belum ada peserta</h3>
      <p>Tidak ada siswa peserta pada lingkup ini.</p></div>`;
  }
  const mode = opts.mode || 'kelas';

  // Urut siswa.
  let arr = [...siswa];
  if (state.urutLembar === 'peringkat') {
    arr.sort((a, b) => {
      const pa = mode === 'paralel' ? a.peringkat_paralel : a.peringkat_kelas;
      const pb = mode === 'paralel' ? b.peringkat_paralel : b.peringkat_kelas;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    });
  } else {
    arr.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
  }

  // Header.
  const headStickyNo = '<th class="sticky-no th-no">No</th>';
  const headStickyNama = mode === 'paralel'
    ? '<th class="sticky-nama td-nama">Nama</th><th>Kelas</th>'
    : '<th class="sticky-nama td-nama">Nama</th>';
  const headSlot = slot.map(s => `<th title="${escape(s.nama)}">${escape(s.singkatan || s.kode)}${s.multi ? '<span class="varian-mark">*</span>' : ''}</th>`).join('');
  const headTail = mode === 'paralel'
    ? '<th>Jumlah</th><th>Rata-rata</th><th>Peringkat Paralel</th>'
    : '<th>Jumlah</th><th>Rata-rata</th><th>Per. Kelas</th><th>Per. Paralel</th><th>Keterangan</th>';
  const head = `<tr>${headStickyNo}${headStickyNama}${headSlot}${headTail}</tr>`;

  // Body.
  const body = arr.map((s, idx) => {
    const tds = [];
    tds.push(`<td class="sticky-no th-no">${escape(idx + 1)}</td>`);
    tds.push(`<td class="sticky-nama td-nama"><div class="td-nama-grup"><span class="td-nama-teks">${escape(s.nama)}</span></div>
      <div class="td-nama-sub">${escape(s.nisn || '')}${s.nisn && s.nis ? ' · ' : ''}${escape(s.nis || '')}</div></td>`);
    if (mode === 'paralel') tds.push(`<td>${escape(s.nama_kelas || '-')}</td>`);
    // Nilai per slot.
    slot.forEach(sl => {
      const np = (s.nilai_per_slot || []).find(x => x.kode === sl.kode);
      if (!np || np.nilai === null || np.nilai === undefined) {
        tds.push(`<td class="sel-nilai sel-nilai-kosong">—</td>`);
      } else {
        const diBawah = np.kktp && Number(np.nilai) < Number(np.kktp);
        const tag = sl.multi && np.nama_varian ? `<span class="varian-tag">${escape(varianTag(np.nama_varian))}</span>` : '';
        tds.push(`<td class="sel-nilai${diBawah ? ' sel-di-bawah-kktp' : ''}"><span class="nilai">${escape(fmtNilai(np.nilai))}</span>${tag}</td>`);
      }
    });
    // Jumlah, rata.
    tds.push(`<td class="angka">${s.ada_nilai ? escape(fmtNilai(s.jumlah)) : '—'}</td>`);
    tds.push(`<td class="angka">${s.ada_nilai ? escape(fmtRata(s.rata_rata)) : '—'}</td>`);
    // Peringkat.
    if (mode === 'paralel') {
      tds.push(`<td class="angka">${s.ada_nilai ? escape(s.peringkat_paralel ?? '—') : '—'}</td>`);
    } else {
      tds.push(`<td class="angka">${s.ada_nilai ? escape(s.peringkat_kelas ?? '—') : '—'}</td>`);
      tds.push(`<td class="angka">${s.ada_nilai ? escape(s.peringkat_paralel ?? '—') : '—'}</td>`);
      // Keterangan.
      let ket = '';
      if (!s.ada_nilai) {
        ket = `<span class="chip chip-netral">belum ada nilai</span>`;
      } else if (!s.lengkap) {
        const kosong = (s.slot_kosong || []).map(escape).join(', ');
        ket = `<span class="chip chip-warn">belum lengkap</span>
          <span class="petunjuk" style="display:block">${kosong}</span>`;
      } else {
        ket = `<span class="chip chip-ok">lengkap</span>`;
      }
      tds.push(`<td>${ket}</td>`);
    }
    return `<tr>${tds.join('')}</tr>`;
  }).join('');

  // Baris statistik (di thead kedua / tfoot).
  const statRow = (() => {
    if (!stat.length) return '';
    const cells = [];
    cells.push(`<td class="sticky-no" rowspan="1"></td>`);
    if (mode === 'paralel') {
      cells.push(`<td class="sticky-nama" colspan="2"><span class="baris-stat-judul">Rata-rata</span></td>`);
    } else {
      cells.push(`<td class="sticky-nama" colspan="1"><span class="baris-stat-judul">Rata-rata</span></td>`);
    }
    slot.forEach(sl => {
      const st = stat.find(x => x.kode === sl.kode) || {};
      cells.push(`<td class="angka">${escape(fmtRata(st.rata_rata))}</td>`);
    });
    const tailStat = mode === 'paralel'
      ? `<td></td><td></td><td></td>`
      : `<td></td><td></td><td></td><td></td><td></td>`;
    return `<tr class="baris-stat">${cells.join('')}${tailStat}</tr>`;
  })();
  const statRowTertinggi = (() => {
    if (!stat.length) return '';
    const cells = [];
    cells.push(`<td class="sticky-no"></td>`);
    cells.push(`<td class="sticky-nama"><span class="baris-stat-judul">Tertinggi</span></td>`);
    if (mode === 'paralel') cells.push(`<td></td>`);
    slot.forEach(sl => {
      const st = stat.find(x => x.kode === sl.kode) || {};
      cells.push(`<td class="angka">${escape(fmtNilai(st.tertinggi))}</td>`);
    });
    const tail = mode === 'paralel' ? `<td></td><td></td><td></td>` : `<td></td><td></td><td></td><td></td><td></td>`;
    return `<tr class="baris-stat">${cells.join('')}${tail}</tr>`;
  })();
  const statRowTerendah = (() => {
    if (!stat.length) return '';
    const cells = [];
    cells.push(`<td class="sticky-no"></td>`);
    cells.push(`<td class="sticky-nama"><span class="baris-stat-judul">Terendah</span></td>`);
    if (mode === 'paralel') cells.push(`<td></td>`);
    slot.forEach(sl => {
      const st = stat.find(x => x.kode === sl.kode) || {};
      cells.push(`<td class="angka">${escape(fmtNilai(st.terendah))}</td>`);
    });
    const tail = mode === 'paralel' ? `<td></td><td></td><td></td>` : `<td></td><td></td><td></td><td></td><td></td>`;
    return `<tr class="baris-stat">${cells.join('')}${tail}</tr>`;
  })();
  const statRowTuntas = (() => {
    if (!stat.length) return '';
    const cells = [];
    cells.push(`<td class="sticky-no"></td>`);
    cells.push(`<td class="sticky-nama"><span class="baris-stat-judul">Tuntas</span></td>`);
    if (mode === 'paralel') cells.push(`<td></td>`);
    slot.forEach(sl => {
      const st = stat.find(x => x.kode === sl.kode) || {};
      const tuntas = st.tuntas || 0;
      const terisi = st.terisi || 0;
      cells.push(`<td class="angka"><span class="chip ${tuntas === terisi && terisi > 0 ? 'chip-ok' : (tuntas > 0 ? 'chip-warn' : 'chip-netral')}">${escape(tuntas)}/${escape(terisi)}</span></td>`);
    });
    const tail = mode === 'paralel' ? `<td></td><td></td><td></td>` : `<td></td><td></td><td></td><td></td><td></td>`;
    return `<tr class="baris-stat baris-stat-akhir">${cells.join('')}${tail}</tr>`;
  })();

  return `<div class="tabel-bungkus tabel-lembar-bungkus">
    <table class="tabel tabel-padat tabel-lembar">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
      <tfoot>${statRow}${statRowTertinggi}${statRowTerendah}${statRowTuntas}</tfoot>
    </table>
  </div>
  ${slot.some(s => s.multi) ? '<div class="petunjuk" style="margin-top:.5rem"><span class="varian-mark">*</span> slot multi-varian: tag di samping nilai adalah inisial varian (mis. "sb"=Seni Budaya, "pk"=Prakarya).</div>' : ''}`;
}

// =========================== TAB B: LEMBAR PARALEL ===========================

async function renderLembarParalel() {
  const wadah = document.getElementById('pantau-konten');
  wadah.innerHTML = spin('Memuat lembar paralel...');

  const tingkatOpts = (state.kegiatan.tingkat_peserta || []).map(Number);
  if (!tingkatOpts.length) {
    state.belumFinal = 0; renderBanner();
    wadah.innerHTML = `<div class="kosong"><i data-lucide="circle-slash"></i>
      <h3>Tidak ada tingkat peserta</h3></div>`;
    return;
  }
  if (!state.tingkatParalel || !tingkatOpts.includes(state.tingkatParalel)) {
    state.tingkatParalel = tingkatOpts[0];
  }

  let data;
  try {
    data = await panggil('lembar_paralel', {
      id_kegiatan: state.idKeg, tingkat: state.tingkatParalel, hanya_final: state.hanyaFinal
    }, state.token);
  } catch (err) {
    state.belumFinal = 0; renderBanner();
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    return;
  }
  state.belumFinal = data.belum_final || 0;
  renderBanner();
  if (data.slot_unified) state.slotUnified = urutSlot(data.slot_unified);

  const slot = urutSlot(data.slot_unified);
  const siswa = data.siswa || [];
  const stat = data.statistik_slot || [];

  // Filter kelas (distinct) & pencarian nama.
  const kelasSet = new Map();
  siswa.forEach(s => { if (s.id_kelas && !kelasSet.has(s.id_kelas)) kelasSet.set(s.id_kelas, s.nama_kelas); });
  const kelasOpts = [...kelasSet.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .map(([id, nm]) => `<option value="${escape(id)}"${id === state.paralelFilter.idKelas ? ' selected' : ''}>${escape(nm)}</option>`).join('');

  // Urut bawaan: peringkat paralel.
  state.urutLembar = 'peringkat';

  // Simpan cache untuk filter lokal (tanpa panggil API ulang).
  state._paralelSiswaCache = siswa;
  state._paralelSlotCache = slot;
  state._paralelStatCache = stat;

  wadah.innerHTML = `
    <div class="toolbar" style="margin-bottom:.75rem">
      <div class="tumbal" style="min-width:140px">
        <label class="label" for="paralel-tingkat">Tingkat</label>
        <select class="select" id="paralel-tingkat">
          ${tingkatOpts.map(t => `<option value="${t}"${t === state.tingkatParalel ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="tumbal" style="min-width:180px">
        <label class="label" for="paralel-kelas">Kelas</label>
        <select class="select" id="paralel-kelas">
          <option value="">Semua</option>${kelasOpts}
        </select>
      </div>
      <div class="tumbal" style="min-width:200px">
        <label class="label" for="paralel-q">Cari nama</label>
        <input class="input" id="paralel-q" type="search" value="${escape(state.paralelFilter.q)}" placeholder="nama siswa..." />
      </div>
    </div>
    <div id="paralel-tabel">${renderTabelLembar(siswa, slot, stat, { mode: 'paralel' })}</div>`;

  // Listener.
  document.getElementById('paralel-tingkat')?.addEventListener('change', async (e) => {
    state.tingkatParalel = Number(e.target.value);
    state.paralelFilter = { idKelas: '', q: '' };
    await renderLembarParalel();
    renderIkon();
  });
  document.getElementById('paralel-kelas')?.addEventListener('change', (e) => {
    state.paralelFilter.idKelas = e.target.value;
    renderTabelParalelFilter();
  });
  const q = document.getElementById('paralel-q');
  if (q) {
    let t;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.paralelFilter.q = q.value.trim().toLowerCase();
        renderTabelParalelFilter();
      }, 300);
    });
  }
  renderIkon();
}

/** Render ulang isi tabel paralel dengan filter lokal (tanpa panggil API). */
function renderTabelParalelFilter() {
  // Ambil data siswa dari cache terakhir (disimpan sebelum filter).
  // Karena renderLembarParalel me-render tabel dengan siswa penuh, kita saring
  // ulang di klien: baca ulang dari state sementara.
  if (!state._paralelSiswaCache) return;
  const f = state.paralelFilter;
  const siswa = state._paralelSiswaCache.filter(s => {
    if (f.idKelas && s.id_kelas !== f.idKelas) return false;
    if (f.q && !String(s.nama || '').toLowerCase().includes(f.q)) return false;
    return true;
  });
  const wadah = document.getElementById('paralel-tabel');
  if (!wadah) return;
  wadah.innerHTML = renderTabelLembar(siswa, state._paralelSlotCache, state._paralelStatCache, { mode: 'paralel' });
  renderIkon();
}

// =========================== TAB C: REKAP ===========================

async function renderRekap() {
  const wadah = document.getElementById('pantau-konten');
  wadah.innerHTML = spin('Memuat rekap...');

  let data;
  try {
    data = await panggil('rekap', {
      id_kegiatan: state.idKeg, hanya_final: state.hanyaFinal
    }, state.token);
  } catch (err) {
    state.belumFinal = 0; renderBanner();
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat rekap</h3><p>${escape(pesanGalat(err))}</p></div>`;
    return;
  }
  state.rekapCache = data;
  state.belumFinal = data.belum_final || 0;
  renderBanner();
  if (data.slot_unified) state.slotUnified = urutSlot(data.slot_unified);

  const tingkatOpts = (data.per_tingkat || []).map(t => Number(t.tingkat));
  if (!state.rekapTingkatAktif || !tingkatOpts.includes(state.rekapTingkatAktif)) {
    state.rekapTingkatAktif = tingkatOpts[0] || null;
  }

  renderIsiRekap(data);
}

function renderIsiRekap(data) {
  const wadah = document.getElementById('pantau-konten');
  const slot = urutSlot(data.slot_unified);
  const perTingkat = data.per_tingkat || [];
  const perSekolah = data.per_sekolah || [];
  const perbandRombel = data.perbandingan_rombel || [];
  const waliTerbatas = !!data.wali_kelas_terbatas;

  // Tingkat aktif untuk tabel stat slot.
  const tingkatAktif = state.rekapTingkatAktif;
  const statTingkatAktif = (perTingkat.find(t => Number(t.tingkat) === Number(tingkatAktif)) || {}).slot_stat || [];

  // Pemilih tingkat (sembunyi jika wali_kelas_terbatas atau hanya 1 tingkat).
  const tingkatSelect = (waliTerbatas || perTingkat.length <= 1)
    ? `<span class="petunjuk">Tingkat: <strong>${escape(tingkatAktif || '-')}</strong></span>`
    : `<div class="tumbal" style="min-width:140px">
        <label class="label" for="rekap-tingkat">Tingkat</label>
        <select class="select" id="rekap-tingkat">
          ${perTingkat.map(t => `<option value="${escape(t.tingkat)}"${Number(t.tingkat) === Number(tingkatAktif) ? ' selected' : ''}>${escape(t.tingkat)}</option>`).join('')}
        </select></div>`;

  wadah.innerHTML = `
    <div class="toolbar" style="margin-bottom:.75rem">${tingkatSelect}</div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Statistik per Slot — Tingkat ${escape(tingkatAktif || '-')}</div>
      ${renderTabelStatSlot(statTingkatAktif, slot)}
    </div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Statistik per Slot — Sekolah</div>
      ${renderTabelStatSlot(perSekolah, slot)}
    </div>
    <div class="kartu">
      <div class="kartu-title">Perbandingan Antar Rombel (heatmap rata-rata)</div>
      ${renderHeatmap(perbandRombel, slot, waliTerbatas)}
    </div>`;

  document.getElementById('rekap-tingkat')?.addEventListener('change', async (e) => {
    state.rekapTingkatAktif = Number(e.target.value);
    renderIsiRekap(state.rekapCache);
    renderIkon();
  });
  renderIkon();
}

/**
 * Tabel statistik per slot. Untuk slot multi (Seni & Prakarya), baris utama
 * menampilkan statistik gabungan; di bawahnya pecah baris per varian.
 */
function renderTabelStatSlot(slotStat, slot) {
  if (!slot.length) {
    return `<div class="kosong"><i data-lucide="circle-slash"></i><h3>Tidak ada slot</h3></div>`;
  }
  const head = `<tr>
    <th>Slot</th><th>Terisi</th><th>Rata-rata</th><th>Tertinggi</th><th>Terendah</th>
    <th>Tuntas</th><th>Belum</th><th>% Tuntas</th>
  </tr>`;
  const rows = slot.map(sl => {
    const st = (slotStat || []).find(x => x.kode === sl.kode) || {};
    const utama = `<tr class="baris-stat-utama">
      <td><strong>${escape(sl.nama)}</strong>${sl.multi ? ' <span class="varian-mark">*</span>' : ''}</td>
      <td class="angka">${escape(st.terisi || 0)}</td>
      <td class="angka">${escape(fmtRata(st.rata_rata))}</td>
      <td class="angka">${escape(fmtNilai(st.tertinggi))}</td>
      <td class="angka">${escape(fmtNilai(st.terendah))}</td>
      <td class="angka">${escape(st.tuntas || 0)}</td>
      <td class="angka">${escape(st.belum_tuntas || 0)}</td>
      <td class="angka">${escape(fmtPersen(st.persen_tuntas))}</td>
    </tr>`;
    // Pecah varian jika multi.
    const subRows = (st.varian && st.varian.length) ? st.varian.map(v => `<tr class="baris-stat-sub">
      <td>↳ ${escape(v.nama)}</td>
      <td class="angka">${escape(v.terisi || 0)}</td>
      <td class="angka">${escape(fmtRata(v.rata_rata))}</td>
      <td class="angka">${escape(fmtNilai(v.tertinggi))}</td>
      <td class="angka">${escape(fmtNilai(v.terendah))}</td>
      <td class="angka">${escape(v.tuntas || 0)}</td>
      <td class="angka">${escape(v.belum_tuntas || 0)}</td>
      <td class="angka">${escape(fmtPersen(v.persen_tuntas))}</td>
    </tr>`).join('') : '';
    return utama + subRows;
  }).join('');
  return `<div class="tabel-bungkus"><table class="tabel tabel-padat">
    <thead>${head}</thead><tbody>${rows}</tbody></table></div>
    ${slot.some(s => s.multi) ? '<div class="petunjuk" style="margin-top:.4rem"><span class="varian-mark">*</span> slot multi-varian; baris ↳ menampilkan statistik tiap varian.</div>' : ''}`;
}

/** Heatmap rombel × slot (rata-rata). Pewarnaan lembut via color-mix primer. */
function renderHeatmap(perbandRombel, slot, waliTerbatas) {
  if (!perbandRombel.length) {
    return `<div class="kosong"><i data-lucide="circle-slash"></i><h3>Tidak ada data</h3></div>`;
  }
  const blok = perbandRombel.map(blokT => {
    const rombel = blokT.rombel || [];
    if (!rombel.length) return '';
    const head = `<tr><th>Kelas</th>${slot.map(s => `<th title="${escape(s.nama)}">${escape(s.singkatan || s.kode)}</th>`).join('')}</tr>`;
    const rows = rombel.map(r => {
      const cells = slot.map(sl => {
        const sr = (r.slot_rata || []).find(x => x.kode === sl.kode) || {};
        const v = sr.rata_rata;
        if (v === null || v === undefined) {
          return `<td class="heatmap-sel heatmap-sel-kosong" title="${escape(r.nama_kelas)} · ${escape(sl.nama)}: tidak ada nilai">—</td>`;
        }
        const num = Number(v);
        const persen = Math.max(0, Math.min(100, num));
        const tebal = persen >= 55;
        const warna = warnaTema('--primer', '#3b82f6');
        const fg = tebal ? warnaTema('--primer-fg', '#ffffff') : warnaTema('--teks', '#0f1b2d');
        const bg = `color-mix(in srgb, ${warna} ${persen}%, var(--permukaan))`;
        return `<td class="heatmap-sel" data-v="${escape(num.toFixed(1))}" title="${escape(r.nama_kelas)} · ${escape(sl.nama)}: rata-rata ${escape(fmtRata(v))}"
          style="background:${bg}; color:${fg}">${escape(fmtRata(v))}</td>`;
      }).join('');
      return `<tr><th class="heatmap-row-head">${escape(r.nama_kelas)}</th>${cells}</tr>`;
    }).join('');
    return `<div class="heatmap-bungkus-blok">
      <div class="petunjuk" style="margin:.5rem 0">Tingkat ${escape(blokT.tingkat)}${waliTerbatas ? ' (kelas perwalian)' : ''}</div>
      <div class="heatmap-bungkus"><table class="heatmap"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }).join('');
  return blok || `<div class="kosong"><i data-lucide="circle-slash"></i><h3>Tidak ada rombel</h3></div>`;
}

// =========================== TAB D: GRAFIK ===========================

async function renderGrafik() {
  const wadah = document.getElementById('pantau-konten');
  if (!Chart) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Pustaka grafik tidak tersedia</h3>
      <p>Chart.js gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.</p></div>`;
    renderIkon();
    return;
  }
  wadah.innerHTML = spin('Memuat grafik...');

  let data;
  try {
    data = await panggil('grafik', {
      id_kegiatan: state.idKeg, hanya_final: state.hanyaFinal
    }, state.token);
  } catch (err) {
    state.belumFinal = 0; renderBanner();
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat grafik</h3><p>${escape(pesanGalat(err))}</p></div>`;
    return;
  }
  state.grafikCache = data;
  state.belumFinal = data.belum_final || 0;
  renderBanner();

  const tingkatOpts = (data.rata_mapel_tingkat || []).map(t => Number(t.tingkat));
  if (!state.grafikTingkat || !tingkatOpts.includes(state.grafikTingkat)) {
    state.grafikTingkat = tingkatOpts[0] || null;
  }
  const slotKode = (data.perbandingan_rombel || []).flatMap(b => b.series || []).map(s => s.kode);
  const slotOpts = (data.ketuntasan || []).map(k => ({ kode: k.kode, nama: k.nama_slot }));
  if (!state.grafikKodeSlot || !slotKode.includes(state.grafikKodeSlot)) {
    state.grafikKodeSlot = slotOpts[0] ? slotOpts[0].kode : null;
  }

  renderIsiGrafik(data);
}

function renderIsiGrafik(data) {
  const wadah = document.getElementById('pantau-konten');
  const tingkatOpts = (data.rata_mapel_tingkat || []).map(t => Number(t.tingkat));
  const slotOpts = (data.ketuntasan || []).map(k => ({ kode: k.kode, nama: k.nama_slot }));

  wadah.innerHTML = `
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Rata-rata per Mapel per Tingkat</div>
      <div class="chart-wadah"><canvas id="chart-rata-tingkat"></canvas></div>
    </div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Perbandingan Antar Rombel</div>
      <div class="toolbar" style="margin-bottom:.5rem">
        <div class="tumbal" style="min-width:120px">
          <label class="label" for="grafik-tingkat">Tingkat</label>
          <select class="select" id="grafik-tingkat">
            ${tingkatOpts.map(t => `<option value="${t}"${t === state.grafikTingkat ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="tumbal" style="min-width:200px">
          <label class="label" for="grafik-slot">Mapel</label>
          <select class="select" id="grafik-slot">
            ${slotOpts.map(s => `<option value="${escape(s.kode)}"${s.kode === state.grafikKodeSlot ? ' selected' : ''}>${escape(s.nama)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="chart-wadah"><canvas id="chart-rombel"></canvas></div>
    </div>
    <div class="kartu">
      <div class="kartu-title">Ketuntasan per Mapel</div>
      <div class="chart-wadah"><canvas id="chart-ketuntasan"></canvas></div>
    </div>`;

  // Listener pilih tingkat & slot.
  document.getElementById('grafik-tingkat')?.addEventListener('change', (e) => {
    state.grafikTingkat = Number(e.target.value);
    gambarChartRombel(state.grafikCache);
  });
  document.getElementById('grafik-slot')?.addEventListener('change', (e) => {
    state.grafikKodeSlot = e.target.value;
    gambarChartRombel(state.grafikCache);
  });

  // Gambar ketiga chart.
  gambarChartRataTingkat(data);
  gambarChartRombel(data);
  gambarChartKetuntasan(data);
  renderIkon();
}

/** Hancurkan semua chart aktif (sebelum render ulang). */
function hancurkanCharts() {
  state.charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  state.charts = [];
}

/** Opsi dasar Chart.js mengikuti tema (mode gelap/terang otomatis). */
function baseOpts() {
  const grid = warnaRgba(warnaTema('--border', '#d8dee9'), 0.7);
  const teks = warnaTema('--teks', '#0f1b2d');
  const teksRingan = warnaTema('--teks-ringan', '#5b6573');
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: teks, font: { size: 12 } } },
      tooltip: { backgroundColor: warnaTema('--permukaan-2', '#f1f5f9'), titleColor: teks, bodyColor: teks, borderColor: grid, borderWidth: 1 }
    },
    scales: {
      x: { ticks: { color: teksRingan, autoSkip: false, maxRotation: 45, minRotation: 0 }, grid: { color: grid } },
      y: { ticks: { color: teksRingan }, grid: { color: grid }, beginAtZero: true, max: 100 }
    }
  };
}

/** Palet warna seri dari token tema. */
function paletWarna() {
  return [
    warnaTema('--primer', '#3b82f6'),
    warnaTema('--aksen', '#f59e0b'),
    warnaTema('--ok', '#16a34a'),
    warnaTema('--err', '#dc2626'),
    warnaTema('--warn', '#d97706'),
    '#8b5cf6', '#06b6d4', '#ec4899'
  ];
}

/** (1) Batang berkelompok: rata-rata per mapel per tingkat. */
function gambarChartRataTingkat(data) {
  const cv = document.getElementById('chart-rata-tingkat');
  if (!cv) return;
  const labels = data.slot_labels || [];
  const palet = paletWarna();
  const datasets = (data.rata_mapel_tingkat || []).map((t, i) => ({
    label: `Tingkat ${t.tingkat}`,
    data: t.rata || [],
    backgroundColor: warnaRgba(palet[i % palet.length], 0.75),
    borderColor: palet[i % palet.length],
    borderWidth: 1,
    borderRadius: 4
  }));
  const opts = baseOpts();
  opts.scales.y.title = { display: true, text: 'Rata-rata', color: warnaTema('--teks-ringan', '#5b6573') };
  const c = new Chart(cv, { type: 'bar', data: { labels, datasets }, options: opts });
  state.charts.push(c);
}

/** (2) Batang per rombel untuk satu tingkat + satu mapel. */
function gambarChartRombel(data) {
  const cv = document.getElementById('chart-rombel');
  if (!cv) return;
  const blok = (data.perbandingan_rombel || []).find(b => Number(b.tingkat) === Number(state.grafikTingkat));
  if (!blok) return;
  const seri = (blok.series || []).find(s => s.kode === state.grafikKodeSlot);
  const labels = blok.kelas_labels || [];
  const nilai = seri ? seri.nilai : [];
  const palet = paletWarna();
  const c0 = palet[0];
  const dataset = {
    label: seri ? seri.nama_slot : 'Rata-rata',
    data: nilai,
    backgroundColor: warnaRgba(c0, 0.75),
    borderColor: c0,
    borderWidth: 1,
    borderRadius: 4
  };
  const opts = baseOpts();
  opts.scales.y.title = { display: true, text: 'Rata-rata', color: warnaTema('--teks-ringan', '#5b6573') };
  opts.scales.x.title = { display: true, text: 'Kelas', color: warnaTema('--teks-ringan', '#5b6573') };
  const c = new Chart(cv, { type: 'bar', data: { labels, datasets: [dataset] }, options: opts });
  state.charts.push(c);
}

/** (3) Batang bertumpuk: ketuntasan (tuntas vs belum) dalam persen. */
function gambarChartKetuntasan(data) {
  const cv = document.getElementById('chart-ketuntasan');
  if (!cv) return;
  const items = data.ketuntasan || [];
  const labels = items.map(k => k.nama_slot);
  const ok = warnaTema('--ok', '#16a34a');
  const err = warnaTema('--err', '#dc2626');
  const datasets = [
    {
      label: 'Tuntas (%)',
      data: items.map(k => Number(k.persen_tuntas) || 0),
      backgroundColor: warnaRgba(ok, 0.8),
      borderColor: ok, borderWidth: 1
    },
    {
      label: 'Belum tuntas (%)',
      data: items.map(k => 100 - (Number(k.persen_tuntas) || 0)),
      backgroundColor: warnaRgba(err, 0.8),
      borderColor: err, borderWidth: 1
    }
  ];
  const opts = baseOpts();
  opts.scales.x.stacked = true;
  opts.scales.y.stacked = true;
  opts.scales.y.max = 100;
  opts.scales.y.title = { display: true, text: 'Persen (%)', color: warnaTema('--teks-ringan', '#5b6573') };
  opts.plugins.tooltip = {
    callbacks: {
      label: (ctx) => {
        const k = items[ctx.dataIndex];
        if (!k) return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%';
        if (ctx.datasetIndex === 0) return `Tuntas: ${ctx.parsed.y.toFixed(1)}% (${k.tuntas}/${k.tuntas + k.belum_tuntas})`;
        return `Belum: ${ctx.parsed.y.toFixed(1)}% (${k.belum_tuntas}/${k.tuntas + k.belum_tuntas})`;
      }
    }
  };
  const c = new Chart(cv, { type: 'bar', data: { labels, datasets }, options: opts });
  state.charts.push(c);
}

// =========================== TAB E: REMEDIAL ===========================

async function renderRemedial() {
  const wadah = document.getElementById('pantau-konten');
  wadah.innerHTML = spin('Memuat remedial...');

  // Pastikan kelasList & slotUnified siap untuk filter.
  await muatKelasList();
  if (!state.slotUnified.length) {
    // Coba isi slotUnified dari rekap ringan (lazy). Bobot sama dengan rekap,
    // namun hanya sekali dan ter-cache di state.
    try {
      const rk = await panggil('rekap', { id_kegiatan: state.idKeg, hanya_final: state.hanyaFinal }, state.token);
      if (rk.slot_unified) state.slotUnified = urutSlot(rk.slot_unified);
    } catch (e) { /* abaikan; filter slot akan kosong */ }
  }

  const tingkatOpts = (state.kegiatan.tingkat_peserta || []).map(Number);
  const slotOpts = state.slotUnified.map(s => ({ kode: s.kode, nama: s.nama }));

  // Untuk wali murni: paksa kelas perwalian (sembunyikan select kelas).
  let kelasOpts = '';
  let kelasDisabled = false;
  if (state.bisaSemua) {
    const kelasKandidat = kelasByTingkatKegiatan();
    kelasOpts = `<option value="">Semua</option>` + kelasKandidat.map(k => `<option value="${escape(k.id_kelas)}"${k.id_kelas === state.remedialFilter.idKelas ? ' selected' : ''}>${escape(k.nama_kelas)}</option>`).join('');
  } else {
    await temukanWaliKelas();
    if (state.waliKelasIds.length <= 1) {
      kelasDisabled = true;
      const k = state.kelasList.find(x => x.id_kelas === state.waliKelasIds[0]);
      kelasOpts = `<option value="${escape(state.waliKelasIds[0] || '')}">${escape(k ? k.nama_kelas : 'kelas perwalian')}</option>`;
    } else {
      kelasOpts = `<option value="">Semua perwalian</option>` + state.kelasList
        .filter(k => state.waliKelasIds.includes(k.id_kelas))
        .map(k => `<option value="${escape(k.id_kelas)}"${k.id_kelas === state.remedialFilter.idKelas ? ' selected' : ''}>${escape(k.nama_kelas)}</option>`).join('');
    }
  }

  // Render filter dulu, lalu muat data.
  wadah.innerHTML = `
    <div class="toolbar" style="margin-bottom:.75rem">
      <div class="tumbal" style="min-width:120px">
        <label class="label" for="rem-tingkat">Tingkat</label>
        <select class="select" id="rem-tingkat">
          <option value="">Semua</option>
          ${tingkatOpts.map(t => `<option value="${t}"${String(t) === String(state.remedialFilter.tingkat) ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="tumbal" style="min-width:180px">
        <label class="label" for="rem-kelas">Kelas</label>
        <select class="select" id="rem-kelas" ${kelasDisabled ? 'disabled' : ''}>${kelasOpts}</select>
      </div>
      <div class="tumbal" style="min-width:220px">
        <label class="label" for="rem-slot">Mapel / Slot</label>
        <select class="select" id="rem-slot">
          <option value="">Semua</option>
          ${slotOpts.map(s => `<option value="${escape(s.kode)}"${s.kode === state.remedialFilter.kodeSlot ? ' selected' : ''}>${escape(s.nama)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="rem-isi">${spin('Memuat data remedial...')}</div>`;

  // Listener.
  document.getElementById('rem-tingkat')?.addEventListener('change', async (e) => {
    state.remedialFilter.tingkat = e.target.value;
    await muatDanRenderRemedialIsi();
  });
  document.getElementById('rem-kelas')?.addEventListener('change', async (e) => {
    state.remedialFilter.idKelas = e.target.value;
    await muatDanRenderRemedialIsi();
  });
  document.getElementById('rem-slot')?.addEventListener('change', async (e) => {
    state.remedialFilter.kodeSlot = e.target.value;
    await muatDanRenderRemedialIsi();
  });

  await muatDanRenderRemedialIsi();
  renderIkon();
}

async function muatDanRenderRemedialIsi() {
  const isi = document.getElementById('rem-isi');
  if (!isi) return;
  isi.innerHTML = spin('Memuat data remedial...');
  let data;
  try {
    data = await panggil('remedial', {
      id_kegiatan: state.idKeg,
      tingkat: state.remedialFilter.tingkat || undefined,
      id_kelas: state.remedialFilter.idKelas || undefined,
      kode_slot: state.remedialFilter.kodeSlot || undefined,
      hanya_final: state.hanyaFinal
    }, state.token);
  } catch (err) {
    state.belumFinal = 0; renderBanner();
    isi.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  state.remedialCache = data;
  state.belumFinal = data.belum_final || 0;
  renderBanner();
  renderIsiRemedial(data);
  renderIkon();
}

function renderIsiRemedial(data) {
  const isi = document.getElementById('rem-isi');
  if (!isi) return;
  const rem = data.remedial || [];
  const belum = data.belum_lengkap || [];

  const kolRem = [
    { k: 'nama', judul: 'Nama' },
    { k: 'nisn', judul: 'NISN' },
    { k: 'nama_kelas', judul: 'Kelas' },
    { k: 'nama_slot', judul: 'Mapel', render: (v, r) => `${escape(v || '')}${r.nama_varian ? ` <span class="varian-tag">${escape(varianTag(r.nama_varian))}</span>` : ''}` },
    { k: 'nilai', judul: 'Nilai', render: v => `<span class="angka">${escape(fmtNilai(v))}</span>` },
    { k: 'kktp', judul: 'KKTP', render: v => `<span class="angka">${escape(fmtNilai(v))}</span>` }
  ];
  const kolBelum = [
    { k: 'nama', judul: 'Nama' },
    { k: 'nisn', judul: 'NISN' },
    { k: 'nama_kelas', judul: 'Kelas' },
    { k: 'slot_kosong', judul: 'Slot Kosong', render: v => `<span class="petunjuk">${escape((v || []).join(', ') || '-')}</span>` }
  ];

  const tabelRem = rem.length
    ? `<div class="tabel-bungkus"><table class="tabel tabel-padat">
        <thead><tr>${kolRem.map(k => `<th>${escape(k.judul)}</th>`).join('')}</tr></thead>
        <tbody>${rem.map(r => `<tr>${kolRem.map(k => {
          const v = r[k.k];
          const isi2 = k.render ? k.render(v, r) : escape(v ?? '');
          return `<td>${isi2}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<div class="kosong"><i data-lucide="check-circle-2"></i>
        <h3>Tidak ada remedial</h3>
        <p>Semua siswa pada lingkup ini sudah tuntas (nilai ≥ KKTP).</p></div>`;

  const tabelBelum = belum.length
    ? `<div class="tabel-bungkus" style="margin-top:1rem"><table class="tabel tabel-padat">
        <thead><tr>${kolBelum.map(k => `<th>${escape(k.judul)}</th>`).join('')}</tr></thead>
        <tbody>${belum.map(r => `<tr>${kolBelum.map(k => {
          const v = r[k.k];
          const isi2 = k.render ? k.render(v, r) : escape(v ?? '');
          return `<td>${isi2}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<div class="kosong"><i data-lucide="check-circle-2"></i>
        <h3>Tidak ada siswa belum lengkap</h3>
        <p>Semua siswa pada lingkup ini telah mengisi seluruh slot.</p></div>`;

  isi.innerHTML = `
    <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
      <div class="stat-kartu stat-warn"><div class="stat-angka">${escape(rem.length)}</div><div class="stat-label">Remedial</div></div>
      <div class="stat-kartu"><div class="stat-angka">${escape(belum.length)}</div><div class="stat-label">Belum Lengkap</div></div>
    </div>
    <div class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Siswa Remedial (nilai &lt; KKTP)</div>
      ${tabelRem}
    </div>
    <div class="kartu">
      <div class="kartu-title">Siswa Belum Lengkap</div>
      ${tabelBelum}
    </div>`;
}
