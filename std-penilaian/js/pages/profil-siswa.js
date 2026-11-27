// profil-siswa.js — Halaman Profil Siswa (Tahap 6B).
// Cari siswa → tampilkan profil lengkap: identitas, riwayat rombel, kegiatan
// diikuti dengan nilai per slot, grafik rata-rata antar kegiatan, dan riwayat
// perubahan nilai.
//
// Hak akses: admin/standar_penilaian/kepsek dapat melihat semua siswa; guru
// (wali murni) hanya boleh siswa dari kelas perwaliannya (diputuskan server).
//
// Kontrak aksi (Operasi.gs):
//   profil_siswa_cari {q} → {hasil:[{id_siswa,nama,nisn,nis}]}
//   profil_siswa      {id_siswa} → {identitas, riwayat_rombel, kegiatan, riwayat_nilai}
//   riwayat_nilai_ambil {id_kegiatan,id_siswa} → {riwayat:[{nilai_lama,nilai_baru,
//                                                          diinput_oleh,sumber,waktu}]}
//
// Konvensi: import relatif '../api.js' dll; token localStorage.getItem('enilai_token');
// escape() untuk data dinamis; renderIkon() setelah innerHTML; Chart.js via window.Chart.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { chip } from '../komponen.js';

// Chart.js dimuat via <script> UMD di index.html → window.Chart.
const Chart = (typeof window !== 'undefined') ? window.Chart : null;

// =========================== STATE ===========================

const state = {
  sesi: null,
  token: null,
  hasilCari: [],         // daftar hasil profil_siswa_cari
  siswaTerpilih: null,   // objek {id_siswa,nama,nisn,nis}
  profil: null,          // hasil profil_siswa terakhir
  q: '',                 // teks pencarian saat ini
  chart: null            // instance Chart aktif (untuk dihancurkan sebelum render ulang)
};

// =========================== UTIL ===========================

/** ISO yyyy-MM-dd → dd/mm/yyyy. */
function formatTanggal(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** Format nilai: integer apa adanya; desimal 2 angka; null → '—'. */
function fmtNilai(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2);
}

/** Tag varian: huruf kecil inisial tiap kata. */
function varianTag(nama) {
  if (!nama) return '';
  return String(nama).trim().split(/\s+/).map(k => k[0] || '').join('').toLowerCase();
}

/** Debounce pencarian. */
function debung(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Baca variabel CSS tema aktif. */
function warnaTema(nama, fallback) {
  const cs = getComputedStyle(document.documentElement);
  const v = cs.getPropertyValue(nama).trim();
  return v || fallback;
}

/** Konversi warna (hex/rgb/rgba) ke rgba dengan alpha tertentu. */
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

/** Opsi dasar Chart.js mengikuti tema. */
function baseOpts() {
  const grid = warnaRgba(warnaTema('--border', '#d8dee9'), 0.7);
  const teks = warnaTema('--teks', '#0f1b2d');
  const teksRingan = warnaTema('--teks-ringan', '#5b6573');
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: teks, font: { size: 12 } } },
      tooltip: {
        backgroundColor: warnaTema('--permukaan-2', '#f1f5f9'),
        titleColor: teks, bodyColor: teks, borderColor: grid, borderWidth: 1
      }
    },
    scales: {
      x: { ticks: { color: teksRingan, autoSkip: false, maxRotation: 45, minRotation: 0 }, grid: { color: grid } },
      y: { ticks: { color: teksRingan }, grid: { color: grid }, beginAtZero: true }
    }
  };
}

/** Hancurkan chart aktif (sebelum render ulang). */
function hancurkanChart() {
  if (state.chart) { try { state.chart.destroy(); } catch (e) {} state.chart = null; }
}

// =========================== ENTRY ===========================

export async function renderProfilSiswa(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  document.getElementById('topbar-judul').textContent = 'Profil Siswa';
  const main = document.getElementById('main');

  // Hak akses: spn/kepsek/admin atau guru (wali terbatas). Guru murni tanpa
  // perwalian akan ditolak server saat memilih siswa.
  if (!boleh(sesi.peran, 'standar_penilaian') && !boleh(sesi.peran, 'kepsek') && !boleh(sesi.peran, 'guru')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i>
      <h3>Akses ditolak</h3>
      <p>Halaman ini khusus standar penilaian, kepala sekolah, atau wali kelas.</p></div>`;
    renderIkon();
    return;
  }

  renderKerangka();
  pasangListenerKerangka();
  // Tampilkan keadaan awal: minta pengguna mencari siswa.
  renderHasilCari();
  renderDetailKosong('Cari siswa', 'Ketik nama, NISN, atau NIS pada kolom di atas untuk menampilkan profil.');
  renderIkon();
}

// =========================== KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Profil Siswa</h1>
    <p class="petunjuk" style="margin:0 0 1rem">
      Cari siswa untuk melihat identitas, riwayat rombel, kegiatan yang diikuti beserta nilai, grafik rata-rata, dan riwayat perubahan nilai.
    </p>
    <div class="toolbar">
      <div class="tumbal" style="min-width:280px">
        <label class="label" for="profil-q">Cari siswa</label>
        <input class="input" id="profil-q" type="search" value="${escape(state.q)}"
               placeholder="nama / NISN / NIS..." autocomplete="off" autofocus />
      </div>
      <div class="kelompok-aksi" style="margin-left:auto">
        <button class="btn btn-kecil btn-sekunder" id="profil-cari-langsung"><i data-lucide="search"></i> Cari</button>
      </div>
    </div>
    <div id="profil-hasil-cari"></div>
    <div id="profil-detail"></div>
  `;
}

function pasangListenerKerangka() {
  const q = document.getElementById('profil-q');
  if (q) {
    const jalankan = debung(() => {
      state.q = q.value.trim();
      cari();
    }, 350);
    q.addEventListener('input', jalankan);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); state.q = q.value.trim(); cari(); }
    });
  }
  document.getElementById('profil-cari-langsung')?.addEventListener('click', () => {
    const input = document.getElementById('profil-q');
    if (input) { state.q = input.value.trim(); cari(); }
  });
}

// =========================== CARI ===========================

async function cari() {
  const wadah = document.getElementById('profil-hasil-cari');
  if (!wadah) return;
  // Jika kosong, tampilkan keadaan awal.
  if (!state.q) {
    state.hasilCari = [];
    renderHasilCari();
    return;
  }
  wadah.innerHTML = spin('Mencari siswa...');
  try {
    const hasil = await panggil('profil_siswa_cari', { q: state.q }, state.token);
    state.hasilCari = hasil.hasil || [];
    renderHasilCari();
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal mencari</h3><p>${escape(pesanGalat(err))}</p></div>`;
  }
  renderIkon();
}

function renderHasilCari() {
  const wadah = document.getElementById('profil-hasil-cari');
  if (!wadah) return;
  if (!state.q) {
    wadah.innerHTML = '';
    return;
  }
  if (!state.hasilCari.length) {
    wadah.innerHTML = `<div class="kosong" style="padding:1.5rem 1rem"><i data-lucide="search-x"></i>
      <h3>Tidak ditemukan</h3>
      <p>Tidak ada siswa yang cocok dengan "<strong>${escape(state.q)}</strong>". Coba kata kunci lain.</p></div>`;
    return;
  }
  // Daftar hasil sebagai baris yang dapat diklik.
  const baris = state.hasilCari.map(s => `<tr class="baris-klik" data-id-siswa="${escape(s.id_siswa)}" tabindex="0">
    <td><strong>${escape(s.nama)}</strong></td>
    <td>${escape(s.nisn || '-')}</td>
    <td>${escape(s.nis || '-')}</td>
    <td class="aksi"><button class="btn btn-kecil btn-sekunder ikon-btn" title="Buka profil"><i data-lucide="chevron-right"></i></button></td>
  </tr>`).join('');
  wadah.innerHTML = `<div class="tabel-bungkus" style="max-height:280px; margin-bottom:1rem">
    <table class="tabel tabel-padat">
      <thead><tr><th>Nama</th><th>NISN</th><th>NIS</th><th class="aksi"></th></tr></thead>
      <tbody>${baris}</tbody>
    </table>
  </div>`;
  // Pasang listener klik & enter pada baris.
  wadah.querySelectorAll('[data-id-siswa]').forEach(tr => {
    const buka = () => pilihSiswa(tr.dataset.idSiswa);
    tr.addEventListener('click', buka);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buka(); }
    });
  });
  renderIkon();
}

// =========================== PILIH SISWA ===========================

async function pilihSiswa(idSiswa) {
  // Catat siswa terpilih untuk indikator visual.
  state.siswaTerpilih = state.hasilCari.find(s => s.id_siswa === idSiswa) || { id_siswa: idSiswa };
  // Tandai baris aktif.
  document.querySelectorAll('#profil-hasil-cari [data-id-siswa]').forEach(tr => {
    tr.classList.toggle('aktif', tr.dataset.idSiswa === idSiswa);
  });

  const wadah = document.getElementById('profil-detail');
  if (!wadah) return;
  hancurkanChart();
  wadah.innerHTML = spin('Memuat profil siswa...');
  try {
    const profil = await panggil('profil_siswa', { id_siswa: idSiswa }, state.token);
    state.profil = profil;
    renderDetail(profil);
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat profil</h3><p>${escape(pesanGalat(err))}</p></div>`;
  }
  renderIkon();
}

// =========================== RENDER DETAIL ===========================

function renderDetailKosong(judul, pesan) {
  const wadah = document.getElementById('profil-detail');
  if (!wadah) return;
  hancurkanChart();
  wadah.innerHTML = `<div class="kosong"><i data-lucide="user-search"></i>
    <h3>${escape(judul)}</h3><p>${escape(pesan)}</p></div>`;
}

function renderDetail(profil) {
  const wadah = document.getElementById('profil-detail');
  if (!wadah) return;
  const identitas = profil.identitas || {};
  const rombel = profil.riwayat_rombel || [];
  const kegiatan = profil.kegiatan || [];
  const riwayatNilai = profil.riwayat_nilai || [];

  // Peta id_kegiatan → nama (dari kegiatan diikuti) untuk tabel riwayat nilai.
  const namaKegiatan = {};
  kegiatan.forEach(k => { namaKegiatan[k.id_kegiatan] = k.nama; });

  // Bagian 1: kartu identitas.
  const htmlIdentitas = renderIdentitas(identitas);

  // Bagian 2: riwayat rombel.
  const htmlRombel = renderRiwayatRombel(rombel);

  // Bagian 3: daftar kegiatan + grafik rata-rata.
  const htmlKegiatan = renderKegiatan(kegiatan);

  // Bagian 4: riwayat perubahan nilai.
  const htmlRiwayatNilai = renderRiwayatNilai(riwayatNilai, namaKegiatan);

  wadah.innerHTML = `
    ${htmlIdentitas}
    ${htmlRombel}
    ${htmlKegiatan}
    ${htmlRiwayatNilai}
  `;

  // Gambar grafik garis rata-rata antar kegiatan.
  gambarGrafikRataRata(kegiatan);
  renderIkon();
}

/** Kartu identitas siswa. */
function renderIdentitas(i) {
  const jk = i.jenis_kelamin === 'L' ? 'Laki-laki' : (i.jenis_kelamin === 'P' ? 'Perempuan' : (i.jenis_kelamin || '-'));
  const chipStatus = (function (st) {
    if (st === 'aktif') return chip('Aktif', 'ok');
    if (st === 'keluar') return chip('Keluar', 'warn');
    if (st === 'lulus') return chip('Lulus', 'info');
    return chip(st || '-', 'netral');
  })(i.status);
  const varianInfo = i.varian_pilihan
    ? `<span class="chip chip-info">${escape(i.varian_pilihan)}</span>`
    : `<span class="petunjuk">tidak ada varian</span>`;
  return `
    <div class="kartu" style="margin-bottom:1rem">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:.75rem; flex-wrap:wrap">
        <div>
          <h2 style="margin:0 0 .35rem; font-size:1.25rem">${escape(i.nama || '-')}</h2>
          <div style="display:flex; gap:.4rem; flex-wrap:wrap; align-items:center">${chipStatus} ${varianInfo}</div>
        </div>
        <div class="petunjuk" style="font-size:.78rem">Profil siswa</div>
      </div>
      <div class="field-row" style="margin-top:1rem">
        <div class="field"><div class="label">NISN</div><div><code>${escape(i.nisn || '-')}</code></div></div>
        <div class="field"><div class="label">NIS</div><div><code>${escape(i.nis || '-')}</code></div></div>
        <div class="field"><div class="label">Jenis Kelamin</div><div>${escape(jk)}</div></div>
        <div class="field"><div class="label">Tanggal Lahir</div><div>${escape(formatTanggal(i.tanggal_lahir) || '-')}</div></div>
        <div class="field"><div class="label">Status</div><div>${escape(i.status || '-')}</div></div>
        <div class="field"><div class="label">Varian Seni/Prakarya</div><div>${varianInfo}</div></div>
      </div>
    </div>`;
}

/** Tabel riwayat rombel per TA. */
function renderRiwayatRombel(rombel) {
  if (!rombel.length) {
    return `<div class="kartu" style="margin-bottom:1rem">
      <h3 style="margin:0 0 .5rem; font-size:1rem">Riwayat Rombongan Belajar</h3>
      <div class="kosong" style="padding:1.5rem 1rem"><i data-lucide="inbox"></i>
        <p>Belum ada riwayat penempatan kelas.</p></div>
    </div>`;
  }
  const baris = rombel.map(r => `<tr>
    <td>${escape(r.nama_ta || '-')}</td>
    <td><strong>${escape(r.kelas || '-')}</strong></td>
    <td>${escape(r.tingkat || '-')}</td>
    <td>${escape(formatTanggal(r.tanggal_mulai) || '-')}</td>
    <td>${escape(formatTanggal(r.tanggal_selesai) || '—')}</td>
  </tr>`).join('');
  return `<div class="kartu" style="margin-bottom:1rem">
    <h3 style="margin:0 0 .65rem; font-size:1rem">Riwayat Rombongan Belajar</h3>
    <div class="tabel-bungkus" style="max-height:300px">
      <table class="tabel tabel-padat">
        <thead><tr><th>Tahun Ajaran</th><th>Kelas</th><th>Tingkat</th><th>Mulai</th><th>Selesai</th></tr></thead>
        <tbody>${baris}</tbody>
      </table>
    </div>
  </div>`;
}

/** Daftar kegiatan diikuti + kartu nilai per slot + grafik rata-rata. */
function renderKegiatan(kegiatan) {
  // Grafik diletakkan di canvas dengan id profil-chart-rata.
  const htmlGrafik = kegiatan.length
    ? `<div class="kartu" style="margin-bottom:1rem">
        <h3 style="margin:0 0 .65rem; font-size:1rem">Grafik Rata-rata antar Kegiatan</h3>
        <div class="chart-wadah"><canvas id="profil-chart-rata"></canvas></div>
        <div class="petunjuk" style="margin-top:.5rem">Sumbu X: nama kegiatan · Sumbu Y: rata-rata nilai. Kegiatan tanpa rata-rata tidak digambar.</div>
      </div>`
    : '';

  if (!kegiatan.length) {
    return `${htmlGrafik}<div class="kartu" style="margin-bottom:1rem">
      <h3 style="margin:0 0 .5rem; font-size:1rem">Kegiatan Diikuti</h3>
      <div class="kosong" style="padding:1.5rem 1rem"><i data-lucide="inbox"></i>
        <p>Siswa belum mengikuti kegiatan penilaian apa pun.</p></div>
    </div>`;
  }

  // Kartu per kegiatan.
  const kartuKeg = kegiatan.map(k => {
    const slotRows = (k.nilai_per_slot || []).map(s => {
      const diBawah = s.kktp && s.nilai != null && Number(s.nilai) < Number(s.kktp);
      const tag = s.nama_varian ? `<span class="varian-tag">${escape(varianTag(s.nama_varian))}</span>` : '';
      const nilaiTampil = (s.nilai === null || s.nilai === undefined) ? '<span class="petunjuk">—</span>' : escape(fmtNilai(s.nilai));
      return `<tr>
        <td><code>${escape(s.kode || '-')}</code></td>
        <td>${escape(s.nama || '-')}</td>
        <td class="sel-nilai${diBawah ? ' sel-di-bawah-kktp' : ''}"><span class="nilai">${nilaiTampil}</span>${tag}</td>
        <td class="angka">${escape(s.kktp != null ? fmtNilai(s.kktp) : '-')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" class="petunjuk" style="text-align:center; padding:.75rem">tidak ada slot</td></tr>';

    const chipStatusKeg = (function (st) {
      if (st === 'dibuka') return chip('Dibuka', 'ok');
      if (st === 'draft') return chip('Draft', 'netral');
      if (st === 'dikunci') return chip('Dikunci', 'warn');
      if (st === 'diarsipkan') return chip('Diarsipkan', 'netral');
      return chip(st || '-', 'netral');
    })(k.status);
    const badgeArsip = k.diarsipkan ? ` <span class="chip chip-netral"><i data-lucide="archive"></i> arsip</span>` : '';
    const chipLengkap = k.lengkap ? chip('Lengkap', 'ok') : chip('Belum lengkap', 'warn');

    return `<div class="kartu" style="margin-bottom:.75rem">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:.6rem; flex-wrap:wrap; margin-bottom:.6rem">
        <div>
          <h4 style="margin:0; font-size:1rem">${escape(k.nama || '-')} ${badgeArsip}</h4>
          <div class="petunjuk" style="margin-top:.15rem">
            ${escape(k.nama_ta || '-')} · Semester ${escape(k.semester || '-')}
          </div>
        </div>
        <div style="display:flex; gap:.3rem; flex-wrap:wrap; align-items:center">${chipStatusKeg} ${chipLengkap}</div>
      </div>
      <div class="tabel-bungkus" style="max-height:240px">
        <table class="tabel tabel-padat tabel-lembar">
          <thead><tr><th>Kode</th><th>Nama Slot</th><th>Nilai</th><th>KKTP</th></tr></thead>
          <tbody>${slotRows}</tbody>
        </table>
      </div>
      <div style="display:flex; gap:1.25rem; flex-wrap:wrap; margin-top:.6rem; font-size:.85rem">
        <span><strong>Jumlah:</strong> ${escape(fmtNilai(k.jumlah))}</span>
        <span><strong>Rata-rata:</strong> ${escape(fmtNilai(k.rata_rata))}</span>
      </div>
    </div>`;
  }).join('');

  return `${htmlGrafik}
    <div class="kartu" style="margin-bottom:1rem">
      <h3 style="margin:0 0 .65rem; font-size:1rem">Kegiatan Diikuti</h3>
      ${kartuKeg}
    </div>`;
}

/** Tabel riwayat perubahan nilai (nilai lama → baru, sumber, waktu). */
function renderRiwayatNilai(riwayat, namaKegiatan) {
  if (!riwayat.length) {
    return `<div class="kartu" style="margin-bottom:1rem">
      <h3 style="margin:0 0 .5rem; font-size:1rem">Riwayat Perubahan Nilai</h3>
      <div class="kosong" style="padding:1.5rem 1rem"><i data-lucide="inbox"></i>
        <p>Belum ada perubahan nilai yang dicatat (penimpaan nilai lama dengan nilai baru).</p></div>
    </div>`;
  }
  // Urutkan terbaru di atas.
  const arr = [...riwayat].sort((a, b) => String(b.waktu || '').localeCompare(String(a.waktu || '')));
  const baris = arr.map(r => {
    const namaKeg = namaKegiatan[r.id_kegiatan] || r.id_kegiatan || '-';
    const sumber = r.sumber || '-';
    return `<tr>
      <td>${escape(namaKeg)}</td>
      <td class="angka">${escape(fmtNilai(r.nilai_lama))}</td>
      <td style="text-align:center"><i data-lucide="arrow-right" style="width:14px; height:14px; vertical-align:middle"></i></td>
      <td class="angka"><strong>${escape(fmtNilai(r.nilai_baru))}</strong></td>
      <td>${escape(sumber)}</td>
      <td>${escape(r.waktu || '-')}</td>
    </tr>`;
  }).join('');
  return `<div class="kartu" style="margin-bottom:1rem">
    <h3 style="margin:0 0 .65rem; font-size:1rem">Riwayat Perubahan Nilai</h3>
    <div class="tabel-bungkus" style="max-height:360px">
      <table class="tabel tabel-padat">
        <thead><tr><th>Kegiatan</th><th>Nilai Lama</th><th></th><th>Nilai Baru</th><th>Sumber</th><th>Waktu</th></tr></thead>
        <tbody>${baris}</tbody>
      </table>
    </div>
    <div class="petunjuk" style="margin-top:.5rem">
      Hanya penimpaan nilai lama dengan nilai baru yang berbeda yang dicatat. Nilai baru pertama kali (sel kosong → nilai) tidak masuk riwayat.
    </div>
  </div>`;
}

// =========================== GRAFIK RATA-RATA ===========================

/** Gambar grafik garis rata-rata antar kegiatan (satu titik per kegiatan). */
function gambarGrafikRataRata(kegiatan) {
  if (!Chart) return; // pustaka belum dimuat — lewati tanpa fatal.
  const cv = document.getElementById('profil-chart-rata');
  if (!cv) return;
  hancurkanChart();
  // Hanya kegiatan yang punya rata_rata numerik.
  const data = (kegiatan || []).filter(k => k.rata_rata !== null && k.rata_rata !== undefined && !isNaN(Number(k.rata_rata)));
  if (!data.length) return;
  const labels = data.map(k => k.nama || k.id_kegiatan);
  const nilai = data.map(k => Number(k.rata_rata));
  const primer = warnaTema('--primer', '#3b82f6');
  const opts = baseOpts();
  opts.scales.y.title = { display: true, text: 'Rata-rata', color: warnaTema('--teks-ringan', '#5b6573') };
  opts.plugins.tooltip = {
    backgroundColor: warnaTema('--permukaan-2', '#f1f5f9'),
    titleColor: warnaTema('--teks', '#0f1b2d'),
    bodyColor: warnaTema('--teks', '#0f1b2d'),
    borderColor: warnaRgba(warnaTema('--border', '#d8dee9'), 0.7),
    borderWidth: 1,
    callbacks: {
      label: (ctx) => 'Rata-rata: ' + Number(ctx.parsed.y).toFixed(2)
    }
  };
  state.chart = new Chart(cv, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Rata-rata per kegiatan',
        data: nilai,
        borderColor: primer,
        backgroundColor: warnaRgba(primer, 0.15),
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: primer,
        tension: 0.25,
        fill: true
      }]
    },
    options: opts
  });
}
