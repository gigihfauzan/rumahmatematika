// halaman.js — Render halaman: login, ganti-password, shell, beranda, pengaturan, kedepan.
import { el, renderIkon, escape, toast, spin, pesanGalat } from './ui.js';
import { login as apiLogin, logout as apiLogout, gantiPassword, getSesiCache, boleh, bersihkanSesi } from './auth.js';
import { panggil, GalatApi } from './api.js';
import { navigasi, daftar, setSesiAktif, jalan } from './router.js';
import { initTema, terapkan, terapkanTemaSekolah, setTemaSaya, temaSaya, TEMA_VALID, TEMA_INFO } from './tema.js';
import { pasangModalTutupGlobal } from './komponen.js';
// Halaman Tahap 2A + 2B (modul data master, siswa, naik kelas, mutasi).
import { renderDasbor } from './pages/dasbor.js';
import { renderTahunAjaran } from './pages/ta.js';
import { renderPengguna } from './pages/pengguna.js';
import { renderKelas } from './pages/kelas.js';
import { renderMapel } from './pages/mapel.js';
import { renderPenugasan } from './pages/penugasan.js';
import { renderSiswa } from './pages/siswa.js';
import { renderNaikKelas } from './pages/naikkelas.js';
import { renderMutasi } from './pages/mutasi.js';
// Halaman Tahap 3A + 3B (kegiatan, peserta, panel, input nilai, progres, impor).
import { renderKegiatan } from './pages/kegiatan.js';
import { renderPesertaKegiatan } from './pages/peserta.js';
import { renderPanelSpn } from './pages/panel-spv.js';
import { renderTugasGuru } from './pages/tugas-guru.js';
import { renderInputNilai } from './pages/input-nilai.js';
import { renderProgres } from './pages/progres.js';
import { renderImporNilai } from './pages/impor-nilai.js';
// Halaman Tahap 4: Pemantauan (lembar kelas, paralel, rekap, grafik, remedial).
import { renderPemantauan } from './pages/pemantauan.js';
// Halaman Tahap 5A & 5B: Laporan (unduh PDF/Excel, hasil per siswa, grafik).
import { renderLaporan } from './pages/laporan.js';

let state = { pengaturan: null };

// Pasang handler global tombol tutup modal (sekali, idempoten).
pasangModalTutupGlobal();

/** Pasang tombol "mata" untuk menampilkan/menyembunyikan password pada wadah. */
function pasangTogglePassword(wadah) {
  if (!wadah) return;
  wadah.querySelectorAll('[data-toggle]').forEach(function (btn) {
    if (btn.dataset.terpasang === '1') return;
    btn.dataset.terpasang = '1';
    btn.addEventListener('click', function () {
      const input = wadah.querySelector('#' + btn.dataset.toggle);
      if (!input) return;
      const tampil = input.type === 'text';
      input.type = tampil ? 'password' : 'text';
      btn.innerHTML = tampil ? '<i data-lucide="eye"></i>' : '<i data-lucide="eye-off"></i>';
      try { renderIkon(); } catch (e) {}
    });
  });
}

// =========================== LOGIN ===========================

export function renderLogin(pesanGalatAwal) {
  initTema();
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-latar">
      <div class="kartu login-kartu">
        <div class="login-brand">
          <div class="logo">E-Nilai</div>
          <div class="sub">Sistem Penilaian Sekolah</div>
        </div>
        <form id="form-login" autocomplete="on">
          <div class="field">
            <label class="label" for="username">NIP atau Username</label>
            <input class="input" id="username" name="username" autocomplete="username" placeholder="NIP atau username" required autofocus />
          </div>
          <div class="field">
            <label class="label" for="password">Password</label>
            <div class="pwd-wrap">
              <input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
              <button type="button" class="pwd-toggle" data-toggle="password" aria-label="Tampilkan password"><i data-lucide="eye"></i></button>
            </div>
          </div>
          <div id="login-galat" class="galat-field"></div>
          <button class="btn btn-blok" id="btn-login" type="submit">
            <i data-lucide="log-in"></i> Masuk
          </button>
        </form>
      </div>
    </div>`;
  renderIkon();
  pasangTogglePassword(document.getElementById('form-login'));
  if (pesanGalatAwal) document.getElementById('login-galat').textContent = pesanGalatAwal;

  document.getElementById('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const btn = document.getElementById('btn-login');
    const galatEl = document.getElementById('login-galat');
    galatEl.textContent = '';
    btn.disabled = true; btn.innerHTML = `${spin('Memeriksa...')}`;
    try {
      const data = await apiLogin(u, p);
      toast('Selamat datang, ' + data.nama_lengkap, 'ok');
      if (data.wajib_ganti_password) {
        renderGantiPassword(true);
      } else {
        await muatSetelahLogin();
      }
    } catch (err) {
      btn.disabled = false; btn.innerHTML = `<i data-lucide="log-in"></i> Masuk`;
      renderIkon();
      galatEl.textContent = pesanGalat(err);
    }
  });
}

// =========================== GANTI PASSWORD ===========================

export function renderGantiPassword(wajib) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-latar">
      <div class="kartu login-kartu">
        <div class="login-brand">
          <div class="logo">E-Nilai</div>
          <div class="sub">${wajib ? 'Wajib ganti password' : 'Ganti Password'}</div>
        </div>
        ${wajib ? '<p class="petunjuk" style="margin-bottom:1rem">Saat login pertama, Anda wajib mengganti password bawaan.</p>' : ''}
        <form id="form-ganti">
          <div class="field">
            <label class="label" for="lama">Password Lama</label>
            <div class="pwd-wrap">
              <input class="input" id="lama" type="password" autocomplete="current-password" required autofocus />
              <button type="button" class="pwd-toggle" data-toggle="lama" aria-label="Tampilkan password"><i data-lucide="eye"></i></button>
            </div>
          </div>
          <div class="field">
            <label class="label" for="baru">Password Baru</label>
            <div class="pwd-wrap">
              <input class="input" id="baru" type="password" autocomplete="new-password" minlength="8" required />
              <button type="button" class="pwd-toggle" data-toggle="baru" aria-label="Tampilkan password"><i data-lucide="eye"></i></button>
            </div>
            <div class="petunjuk">Minimal 8 karakter.</div>
          </div>
          <div class="field">
            <label class="label" for="baru2">Ulangi Password Baru</label>
            <div class="pwd-wrap">
              <input class="input" id="baru2" type="password" autocomplete="new-password" minlength="8" required />
              <button type="button" class="pwd-toggle" data-toggle="baru2" aria-label="Tampilkan password"><i data-lucide="eye"></i></button>
            </div>
          </div>
          <div id="ganti-galat" class="galat-field"></div>
          <button class="btn btn-blok" id="btn-ganti" type="submit">
            <i data-lucide="key-round"></i> Simpan Password Baru
          </button>
        </form>
      </div>
    </div>`;
  renderIkon();
  pasangTogglePassword(document.getElementById('form-ganti'));
  document.getElementById('form-ganti').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const lama = document.getElementById('lama').value;
    const baru = document.getElementById('baru').value;
    const baru2 = document.getElementById('baru2').value;
    const galatEl = document.getElementById('ganti-galat');
    galatEl.textContent = '';
    if (baru !== baru2) { galatEl.textContent = 'Password baru tidak sama.'; return; }
    const btn = document.getElementById('btn-ganti');
    btn.disabled = true; btn.innerHTML = `${spin('Menyimpan...')}`;
    try {
      await gantiPassword(lama, baru);
      toast('Password berhasil diganti.', 'ok');
      await muatSetelahLogin();
    } catch (err) {
      btn.disabled = false; btn.innerHTML = `<i data-lucide="key-round"></i> Simpan Password Baru`;
      renderIkon();
      galatEl.textContent = pesanGalat(err);
    }
  });
}

// =========================== SETELAH LOGIN ===========================

async function muatSetelahLogin() {
  let sesi = getSesiCache();
  // Pastikan sesi masih valid di server.
  try {
    const info = await panggil('info_sesi', {}, localStorage.getItem('enilai_token'));
    sesi = info;
  } catch (err) {
    if (err.kode === 'SESI') {
      bersihkanSesi();
      renderLogin('Sesi berakhir. Silakan login lagi.');
      return;
    }
  }
  await renderShell(sesi);
  jalan();
}

// =========================== SHELL ===========================

const MENU = [
  { grup: 'Utama', peran: null, item: [
    { judul: 'Beranda', ikon: 'house', hash: '#/beranda' },
    { judul: 'Dasbor', ikon: 'layout-dashboard', hash: '#/dasbor' }
  ]},
  // Data Master: admin menulis, standar penilaian lihat.
  { grup: 'Data Master', peran: 'standar_penilaian', item: [
    { judul: 'Kelas & Rombel', ikon: 'school', hash: '#/kelas' },
    { judul: 'Mapel & Slot', ikon: 'book-open', hash: '#/mapel' },
    { judul: 'Penugasan', ikon: 'clipboard-list', hash: '#/penugasan' },
    { judul: 'Data Siswa', ikon: 'graduation-cap', hash: '#/siswa' }
  ]},
  { grup: 'Administrasi', peran: 'admin', item: [
    { judul: 'Pengaturan Sekolah', ikon: 'settings', hash: '#/pengaturan' },
    { judul: 'Tahun Ajaran', ikon: 'calendar', hash: '#/ta' },
    { judul: 'Akun Pengguna', ikon: 'users', hash: '#/pengguna' },
    { judul: 'Naik Kelas', ikon: 'circle-arrow-up', hash: '#/naikkelas' },
    { judul: 'Mutasi Siswa', ikon: 'user-plus', hash: '#/mutasi' },
    { judul: 'Backup', ikon: 'database-backup', hash: '#/kedepan/Backup', kedepan: true }
  ]},
  { grup: 'Standar Penilaian', peran: 'standar_penilaian', item: [
    { judul: 'Panel SPN', ikon: 'gauge', hash: '#/panel' },
    { judul: 'Kegiatan', ikon: 'calendar-days', hash: '#/kegiatan' },
    { judul: 'Progres Input', ikon: 'activity', hash: '#/progres' },
    { judul: 'Pemantauan', ikon: 'chart-bar', hash: '#/pemantauan' },
    { judul: 'Impor Nilai', ikon: 'upload', hash: '#/impor-nilai' },
    { judul: 'Laporan', ikon: 'file-text', hash: '#/laporan' }
  ]},
  { grup: 'Guru', peran: 'guru', item: [
    { judul: 'Tugas Mengajar', ikon: 'presentation', hash: '#/tugas-guru' },
    { judul: 'Lembar Kelas', ikon: 'clipboard-list', hash: '#/pemantauan' },
    { judul: 'Laporan Kelas', ikon: 'file-text', hash: '#/laporan' }
  ]},
  { grup: 'Kepala Sekolah', peran: 'kepsek', item: [
    { judul: 'Pemantauan', ikon: 'chart-bar', hash: '#/pemantauan' },
    { judul: 'Progres Input', ikon: 'activity', hash: '#/progres' },
    { judul: 'Laporan (Grafik)', ikon: 'file-text', hash: '#/laporan' }
  ]}
];

export async function renderShell(sesi) {
  setSesiAktif(sesi);
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-head">
          <div class="logo" data-nama-sekolah>E-Nilai</div>
          <div class="sub">Sistem Penilaian</div>
        </div>
        <nav class="nav">${renderMenu(sesi)}</nav>
      </aside>
      <div class="overlay" id="overlay"></div>
      <div class="konten">
        <header class="topbar">
          <button class="btn btn-ghost ikon-btn topbar-toggle" id="btn-drawer" aria-label="Buka menu">
            <i data-lucide="menu"></i>
          </button>
          <div class="topbar-judul" id="topbar-judul">Beranda</div>
          <div class="pilihan-tema" id="pilihan-tema" title="Tema"></div>
          <div class="topbar-user">
            <strong>${escape(sesi.nama_lengkap)}</strong>
            <span>${sesi.peran ? sesi.peran.join(', ') : ''}</span>
          </div>
          <button class="btn btn-sekunder btn-kecil ikon-btn" id="btn-logout" title="Keluar">
            <i data-lucide="log-out"></i> Keluar
          </button>
        </header>
        <main class="main" id="main">${spin('Memuat...')}</main>
      </div>
    </div>`;
  renderIkon();
  pasangListenerShell(sesi);
  renderPilihanTema();
  daftarkanRute(sesi);

  // Ambil pengaturan untuk nama sekolah di sidebar + tema bawaan.
  try {
    const p = await panggil('pengaturan_ambil', {}, localStorage.getItem('enilai_token'));
    state.pengaturan = p;
    if (p.nama_sekolah) {
      const ns = document.querySelector('[data-nama-sekolah]');
      if (ns) ns.textContent = p.nama_sekolah;
    }
    terapkanTemaSekolah(p.tema_bawaan);
    renderPilihanTema();
  } catch (e) { /* non-fatal */ }
}

function renderMenu(sesi) {
  let html = '';
  MENU.forEach(grup => {
    if (grup.peran && !boleh(sesi.peran, grup.peran)) return;
    html += `<div class="nav-group"><div class="nav-group-judul">${escape(grup.grup)}</div>`;
    grup.item.forEach(it => {
      html += `<button class="nav-item" data-hash="${it.hash}" data-judul="${escape(it.judul)}">
        <i data-lucide="${it.ikon}"></i>
        <span>${escape(it.judul)}</span>
        ${it.kedepan ? '<span class="tag-kedepan">segera</span>' : ''}
      </button>`;
    });
    html += `</div>`;
  });
  return html;
}

function pasangListenerShell(sesi) {
  // Klik nav item
  document.querySelectorAll('.nav-item[data-hash]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigasi(btn.dataset.hash);
      // set judul topbar
      const judul = btn.dataset.judul;
      document.getElementById('topbar-judul').textContent = judul;
    });
  });
  // Drawer
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  document.getElementById('btn-drawer')?.addEventListener('click', () => {
    sidebar.classList.toggle('show'); overlay.classList.toggle('show');
  });
  overlay?.addEventListener('click', () => { sidebar.classList.remove('show'); overlay.classList.remove('show'); });
  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await apiLogout();
    toast('Anda telah keluar.', 'info');
    renderLogin();
  });
}

function renderPilihanTema() {
  const wadah = document.getElementById('pilihan-tema');
  if (!wadah) return;
  const aktif = document.documentElement.getAttribute('data-tema') || 'light_blue';
  wadah.innerHTML = TEMA_VALID.map(t =>
    `<button class="tema-chip" data-tema="${t}" data-aktif="${t === aktif}"
      style="--c:${TEMA_INFO[t].warna}" title="${TEMA_INFO[t].label}" aria-label="Tema ${TEMA_INFO[t].label}"></button>`
  ).join('');
  wadah.querySelectorAll('.tema-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      setTemaSaya(chip.dataset.tema);
      renderPilihanTema();
    });
  });
}

// =========================== RUTE ===========================

function daftarkanRute(sesi) {
  daftar('beranda', () => renderBeranda(sesi));
  daftar('pengaturan', () => renderPengaturan(sesi));
  // Tahap 2A + 2B.
  daftar('dasbor', () => renderDasbor(sesi));
  daftar('ta', () => renderTahunAjaran(sesi));
  daftar('pengguna', () => renderPengguna(sesi));
  daftar('kelas', () => renderKelas(sesi));
  daftar('mapel', () => renderMapel(sesi));
  daftar('penugasan', () => renderPenugasan(sesi));
  daftar('siswa', () => renderSiswa(sesi));
  daftar('naikkelas', () => renderNaikKelas(sesi));
  daftar('mutasi', () => renderMutasi(sesi));
  // Tahap 3A + 3B.
  daftar('kegiatan', () => renderKegiatan(sesi));
  daftar('peserta', (params) => renderPesertaKegiatan(sesi, params));
  daftar('panel', () => renderPanelSpn(sesi));
  daftar('tugas-guru', () => renderTugasGuru(sesi));
  daftar('input-nilai', (params) => renderInputNilai(sesi, params));
  daftar('progres', () => renderProgres(sesi));
  daftar('impor-nilai', () => renderImporNilai(sesi));
  // Tahap 4: Pemantauan.
  daftar('pemantauan', () => renderPemantauan(sesi));
  // Tahap 5A & 5B: Laporan.
  daftar('laporan', () => renderLaporan(sesi));
  daftar('kedepan', (params) => renderKedepan(params.join(' ') || 'Halaman'));
}

// =========================== BERANDA ===========================

function renderBeranda(sesi) {
  const main = document.getElementById('main');
  const kartu = [];
  if (boleh(sesi.peran, 'guru')) {
    kartu.push(kartuBeranda('Tugas Mengajar Saya', 'presentation', 'Daftar mapel & kelas yang ditugaskan kepada Anda.', false, '#/tugas-guru'));
    kartu.push(kartuBeranda('Kelas Perwalian', 'users-round', 'Ringkasan kelas perwalian Anda.', true));
  }
  if (boleh(sesi.peran, 'standar_penilaian')) {
    kartu.push(kartuBeranda('Panel Standar Penilaian', 'gauge', 'Kelola kegiatan, progres, dan laporan penilaian.', false, '#/panel'));
  }
  if (boleh(sesi.peran, 'admin')) {
    kartu.push(kartuBeranda('Administrasi', 'settings', 'Pengaturan sekolah, akun, data master, dan backup.', false, '#/pengaturan'));
  }
  if (boleh(sesi.peran, 'kepsek')) {
    kartu.push(kartuBeranda('Pemantauan Kepala Sekolah', 'chart-bar', 'Pantau capaian per kelas, paralel, dan kegiatan.', false, '#/progres'));
  }
  main.innerHTML = `
    <h1 class="page-judul">Beranda</h1>
    <p style="color:var(--teks-ringan);margin:0 0 1.25rem">Selamat datang, <strong>${escape(sesi.nama_lengkap)}</strong>.
       Peran Anda: ${sesi.peran ? escape(sesi.peran.join(', ')) : '-'}.</p>
    <div class="beranda-grid">${kartu.join('')}</div>`;
  renderIkon();
  // klik kartu bertaut
  main.querySelectorAll('.beranda-kartu.taut').forEach(k => {
    k.addEventListener('click', () => navigasi(k.dataset.ke));
  });
}

function kartuBeranda(judul, ikon, deskripsi, kedepan, hash) {
  if (kedepan) {
    return `<div class="beranda-kartu">
      <span class="iko"><i data-lucide="${ikon}"></i></span>
      <h3>${escape(judul)}</h3>
      <p>${escape(deskripsi)}</p>
      <div class="badge-kedepan">Tersedia pada tahap berikutnya</div>
    </div>`;
  }
  return `<div class="beranda-kartu taut" data-ke="${escape(hash)}">
    <span class="iko"><i data-lucide="${ikon}"></i></span>
    <h3>${escape(judul)}</h3>
    <p>${escape(deskripsi)}</p>
    <div class="badge-kedepan">Buka &rarr;</div>
  </div>`;
}

// =========================== KEDEPAN (placeholder) ===========================

function renderKedepan(judul) {
  const main = document.getElementById('main');
  document.getElementById('topbar-judul').textContent = judul || 'Tahap Berikutnya';
  main.innerHTML = `
    <h1 class="page-judul">${escape(judul || 'Tahap Berikutnya')}</h1>
    <div class="kosong">
      <i data-lucide="construction"></i>
      <h3>Tersedia pada tahap berikutnya</h3>
      <p>Fitur ini akan dibangun pada tahap mendatang.</p>
    </div>`;
  renderIkon();
}

// =========================== PENGATURAN SEKOLAH ===========================

function renderPengaturan(sesi) {
  document.getElementById('topbar-judul').textContent = 'Pengaturan Sekolah';
  const main = document.getElementById('main');
  const p = state.pengaturan || {};
  main.innerHTML = `
    <h1 class="page-judul">Pengaturan Sekolah</h1>
    <div class="beranda-grid" style="grid-template-columns: 1fr; margin-bottom:1rem">
      <div class="kartu">
        <div class="kartu-title">Pratinjau Kop Dokumen</div>
        <div class="kop" id="kop-pratinjau">${renderKop(p)}</div>
      </div>
    </div>
    <form id="form-pengaturan">
      <div class="kartu" style="margin-bottom:1rem">
        <div class="kartu-title">Identitas Sekolah</div>
        <div class="field">
          <label class="label" for="nama_sekolah">Nama Sekolah</label>
          <input class="input" id="nama_sekolah" value="${escape(p.nama_sekolah || '')}" />
        </div>
        <div class="field">
          <label class="label" for="nama_dinas">Nama Instansi (Dinas/Yayasan) untuk kop</label>
          <input class="input" id="nama_dinas" value="${escape(p.nama_dinas || '')}" />
        </div>
        <div class="field-row">
          <div class="field"><label class="label" for="alamat">Alamat</label>
            <textarea class="textarea" id="alamat">${escape(p.alamat || '')}</textarea></div>
          <div class="field"><label class="label" for="kontak">Kontak</label>
            <input class="input" id="kontak" value="${escape(p.kontak || '')}" /></div>
        </div>
      </div>
      <div class="kartu" style="margin-bottom:1rem">
        <div class="kartu-title">Penandatanganan</div>
        <div class="field-row">
          <div class="field"><label class="label" for="kepsek_nama">Nama Kepala Sekolah</label>
            <input class="input" id="kepsek_nama" value="${escape(p.kepsek_nama || '')}" /></div>
          <div class="field"><label class="label" for="kepsek_nip">NIP Kepala Sekolah</label>
            <input class="input" id="kepsek_nip" value="${escape(p.kepsek_nip || '')}" /></div>
        </div>
        <div class="field"><label class="label" for="tempat_ttd">Tempat Penandatanganan</label>
          <input class="input" id="tempat_ttd" placeholder="mis. Jakarta, 12 Mei 2026" value="${escape(p.tempat_ttd || '')}" /></div>
      </div>
      <div class="kartu" style="margin-bottom:1rem">
        <div class="kartu-title">Penyajian & KKTP</div>
        <div class="field-row">
          <div class="field"><label class="label" for="format_tanggal">Format Tanggal Dokumen</label>
            <input class="input" id="format_tanggal" value="${escape(p.format_tanggal || 'd MMMM yyyy')}" />
            <div class="petunjuk">Sesuai pola Apps Script, mis. "d MMMM yyyy" → "12 Mei 2026".</div></div>
          <div class="field"><label class="label" for="kktp_sekolah_bawaan">KKTP Sekolah Bawaan</label>
            <input class="input" id="kktp_sekolah_bawaan" type="number" min="0" max="100" value="${escape(p.kktp_sekolah_bawaan || 75)}" /></div>
        </div>
        <div class="field">
          <label class="label" for="tema_bawaan">Tema Bawaan Sekolah</label>
          <select class="select" id="tema_bawaan">
            ${TEMA_VALID.map(t => `<option value="${t}" ${p.tema_bawaan === t ? 'selected' : ''}>${TEMA_INFO[t].label}</option>`).join('')}
          </select>
          <div class="petunjuk">Dipakai untuk pengguna yang belum memilih tema pribadi.</div>
        </div>
      </div>
      <div class="kartu" style="margin-bottom:1rem">
        <div class="kartu-title">Logo</div>
        <div class="field-row">
          <div class="field"><label class="label" for="logo_file">Unggah Logo (gambar)</label>
            <input class="input" id="logo_file" type="file" accept="image/*" />
            <div class="petunjuk">Otomatis dikecilkan ke maks 240px. Disimpan sebagai data URI &lt; 50.000 karakter.</div></div>
          <div class="field"><label class="label">Logo Saat Ini</label>
            <div id="logo-saat-ini">${p.logo_datauri
              ? `<img class="kop-logo" src="${escape(p.logo_datauri)}" alt="Logo" />`
              : `<span class="kop-logo kosong-logo">tanpa logo</span>`}</div>
        </div>
        <div id="logo-galat" class="galat-field"></div>
      </div>
      <div style="display:flex; gap:.6rem">
        <button class="btn" id="btn-simpan-pengaturan" type="submit"><i data-lucide="save"></i> Simpan Pengaturan</button>
      </div>
    </form>`;
  renderIkon();
  pasangListenerPengaturan();
}

function renderKop(p) {
  const logo = p.logo_datauri
    ? `<img class="kop-logo" src="${escape(p.logo_datauri)}" alt="Logo" />`
    : `<span class="kop-logo kosong-logo">tanpa logo</span>`;
  const instansi = escape(p.nama_dinas || '');
  const sekolah = escape(p.nama_sekolah || 'Nama Sekolah');
  const alamat = escape(p.alamat || '');
  const kontak = escape(p.kontak || '');
  // Urutan kop: Nama Instansi → Nama Sekolah → Alamat → Kontak (tiap baris sendiri).
  return `${logo}
    <div class="kop-teks">
      ${instansi ? `<div class="kop-instansi" data-kop="nama_dinas">${instansi}</div>` : ''}
      <h2 class="kop-sekolah" data-kop="nama_sekolah">${sekolah}</h2>
      ${alamat ? `<div class="kop-baris" data-kop="alamat">${alamat}</div>` : ''}
      ${kontak ? `<div class="kop-baris" data-kop="kontak">${kontak}</div>` : ''}
    </div>`;
}

function pasangListenerPengaturan() {
  // Bidang yang memengaruhi pratinjau kop — setiap perubahan melukis ulang kop.
  const inputKop = ['nama_sekolah', 'nama_dinas', 'alamat', 'kontak'];
  inputKop.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
      const p = kumpulkanPengaturanDariForm();
      const kp = document.getElementById('kop-pratinjau');
      if (kp) kp.innerHTML = renderKop(p);
    });
  });

  // Unggah logo.
  const fileInput = document.getElementById('logo_file');
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const galatEl = document.getElementById('logo-galat');
    galatEl.textContent = '';
    try {
      const uri = await kecilkanLogo(file, 240);
      const p = kumpulkanPengaturanDariForm();
      p.logo_datauri = uri;
      state.pengaturan = p;
      const kp = document.getElementById('kop-pratinjau');
      if (kp) kp.innerHTML = renderKop(p);
      const wadah = document.getElementById('logo-saat-ini');
      if (wadah) wadah.innerHTML = `<img class="kop-logo" src="${escape(uri)}" alt="Logo" />`;
      toast('Logo siap (klik Simpan untuk menyimpan).', 'info');
    } catch (err) {
      galatEl.textContent = String(err.message || err);
    }
  });

  // Simpan.
  document.getElementById('form-pengaturan').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('btn-simpan-pengaturan');
    const p = kumpulkanPengaturanDariForm();
    btn.disabled = true; btn.innerHTML = `${spin('Menyimpan...')}`;
    try {
      const hasil = await panggil('pengaturan_simpan', { pengaturan: p }, localStorage.getItem('enilai_token'));
      state.pengaturan = hasil.pengaturan;
      toast('Pengaturan tersimpan.', 'ok');
    } catch (err) {
      toast(pesanGalat(err), 'err');
    } finally {
      btn.disabled = false; btn.innerHTML = `<i data-lucide="save"></i> Simpan Pengaturan`;
      renderIkon();
    }
  });
}

function kumpulkanPengaturanDariForm() {
  const ambil = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
  return {
    nama_sekolah: ambil('nama_sekolah'),
    nama_dinas: ambil('nama_dinas'),
    alamat: ambil('alamat'),
    kontak: ambil('kontak'),
    kepsek_nama: ambil('kepsek_nama'),
    kepsek_nip: ambil('kepsek_nip'),
    tempat_ttd: ambil('tempat_ttd'),
    format_tanggal: ambil('format_tanggal'),
    kktp_sekolah_bawaan: Number(ambil('kktp_sekolah_bawaan')) || 0,
    tema_bawaan: ambil('tema_bawaan'),
    logo_datauri: (state.pengaturan && state.pengaturan.logo_datauri) || ''
  };
}

/** Kecilkan gambar di kanvas menjadi data URI JPEG < 50.000 karakter. */
function kecilkanLogo(file, maxDim = 240) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gambar tidak valid.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        } else {
          if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        let uri = canvas.toDataURL('image/jpeg', 0.85);
        if (uri.length > 50000) uri = canvas.toDataURL('image/jpeg', 0.6);
        if (uri.length > 50000) uri = canvas.toDataURL('image/jpeg', 0.4);
        if (uri.length > 50000) {
          reject(new Error('Logo masih terlalu besar setelah dikompres. Gunakan gambar lebih sederhana.'));
          return;
        }
        resolve(uri);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
