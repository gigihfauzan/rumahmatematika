// progres.js — Halaman Matriks Progres Input Nilai (Tahap 3B).
// Menampilkan progres (terisi/total, status draft/final, ada kosong) per
// (guru, varian, kelas) untuk satu kegiatan. Filter tingkat, guru, status.
// Salin pesan pengingat (semua / per guru). Klik baris → input nilai hanya
// untuk spn/admin (bisa_input). Guru & kepsek murni melihat matriks saja
// (guru membuka input dari halaman Tugas Mengajar).
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { navigasi } from '../router.js';
import { chip } from '../komponen.js';

// State halaman.
const state = {
  sesi: null,
  token: null,
  bolehInput: false,    // bisa_input (spn/admin) dari progres_matriks
  bisaKlikBaris: false, // spn/admin atau guru (penugasan miliknya); kepsek murni tidak.
  kegiatanList: [],     // daftar kegiatan dari kegiatan_daftar
  idKeg: null,
  matriks: null,        // { sel, kegiatan, bisa_input }
  filter: { tingkat: '', idGuru: '', status: '' }
};

// =========================== UTIL ===========================

/** Persen terisi (0..100); total=0 → 0. */
function persen(terisi, total) {
  if (!total) return 0;
  return Math.round((terisi / total) * 100);
}

/** Apakah pengguna ini kepsek murni (tidak bisa input tabel nilai)? */
function kepsekMurni(peran) {
  return boleh(peran, 'kepsek') && !boleh(peran, 'standar_penilaian') && !boleh(peran, 'guru');
}

// =========================== ENTRY ===========================

export async function renderProgres(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  // bisa_input (spn/admin) datang dari server setelah muatMatriks. Awal: false.
  state.bolehInput = false;
  state.bisaKlikBaris = false;

  document.getElementById('topbar-judul').textContent = 'Progres Input Nilai';
  const main = document.getElementById('main');

  // Hak lihat: spn/admin/guru/kepsek boleh. Guru lihat semua (matriks lengkap)
  // — server akan tetap mengembalikan seluruh sel.
  if (!boleh(sesi.peran, 'standar_penilaian') && !boleh(sesi.peran, 'guru') && !boleh(sesi.peran, 'kepsek')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini khusus standar penilaian, guru, atau kepala sekolah.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat daftar kegiatan...');
  try {
    const d = await panggil('kegiatan_daftar', {}, state.token);
    state.kegiatanList = d.kegiatan || [];
    state.bolehInput = !!d.bisa_kelola;
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    return;
  }
  renderKerangka();
  renderPilihKegiatan();
  renderIkon();
  pasangListener();
}

// =========================== RENDER KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Progres Input Nilai</h1>
    <p class="petunjuk" style="margin:0 0 1rem">Pilih kegiatan untuk memantau progres input nilai per guru & kelas.</p>
    <div class="toolbar">
      <div class="tumbal"><label class="label" for="flt-keg">Kegiatan</label>
        <select class="select" id="flt-keg">
          <option value="">— pilih kegiatan —</option>
          ${state.kegiatanList.map(k => `<option value="${escape(k.id_kegiatan)}">${escape(k.nama)} (${escape(k.status)})</option>`).join('')}
        </select></div>
      <div class="tumbal"><label class="label" for="flt-tingkat">Tingkat</label>
        <select class="select" id="flt-tingkat" disabled>
          <option value="">Semua</option>
          <option value="7">7</option>
          <option value="8">8</option>
          <option value="9">9</option>
        </select></div>
      <div class="tumbal"><label class="label" for="flt-guru">Guru</label>
        <select class="select" id="flt-guru" disabled>
          <option value="">Semua</option>
        </select></div>
      <div class="tumbal"><label class="label" for="flt-status">Status</label>
        <select class="select" id="flt-status" disabled>
          <option value="">Semua</option>
          <option value="belum_final">Belum final</option>
          <option value="ada_kosong">Ada nilai kosong</option>
        </select></div>
      <div class="kelompok-aksi">
        <button class="btn btn-kecil btn-sekunder" id="btn-salin-semua" disabled>
          <i data-lucide="clipboard-copy"></i> Salin Pengingat (Semua)</button>
        <button class="btn btn-kecil btn-sekunder" id="btn-salin-guru" disabled>
          <i data-lucide="clipboard-copy"></i> Salin Pengingat (Guru Terpilih)</button>
      </div>
    </div>
    <div id="progres-info"></div>
    <div id="progres-tabel"></div>`;
}

function renderPilihKegiatan() {
  const wadah = document.getElementById('progres-tabel');
  if (!state.kegiatanList.length) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="inbox"></i>
      <h3>Belum ada kegiatan</h3>
      <p>Belum ada kegiatan penilaian pada tahun ajaran aktif.</p></div>`;
    return;
  }
  wadah.innerHTML = `<div class="kosong"><i data-lucide="mouse-pointer-click"></i>
    <h3>Pilih kegiatan</h3>
    <p>Pilih kegiatan pada dropdown di atas untuk menampilkan matriks progres.</p></div>`;
}

// =========================== MUAT MATRIKS ===========================

async function muatMatriks() {
  const wadah = document.getElementById('progres-tabel');
  const info = document.getElementById('progres-info');
  info.innerHTML = '';
  wadah.innerHTML = spin('Memuat matriks progres...');

  // Aktifkan filter.
  ['flt-tingkat', 'flt-guru', 'flt-status', 'btn-salin-semua'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.disabled = false;
  });

  try {
    const hasil = await panggil('progres_matriks', {
      id_kegiatan: state.idKeg,
      tingkat: state.filter.tingkat || undefined,
      id_guru: state.filter.idGuru || undefined,
      filter: state.filter.status || undefined
    }, state.token);
    state.matriks = hasil;
    state.bolehInput = !!hasil.bisa_input;
    // Bisa klik baris jika bisa_input (spn/admin) dan bukan kepsek murni.
    state.bisaKlikBaris = state.bolehInput && !kepsekMurni(state.sesi.peran);
    renderInfoKegiatan(hasil);
    renderGuruOptions(hasil.sel || []);
    renderTabelMatriks(hasil);
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat matriks</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
  }
}

/** Render info kegiatan terpilih (nama, tenggat). */
function renderInfoKegiatan(hasil) {
  const kg = hasil.kegiatan || {};
  const info = document.getElementById('progres-info');
  info.innerHTML = `<div class="kartu kartu-info-progres">
    <div class="kartu-info-head">
      <h2>${escape(kg.nama || '-')}</h2>
      <div class="kartu-info-chips">
        ${chipStatusKegiatan(kg.status)}
      </div>
    </div>
    <div class="kartu-info-meta">
      <span><i data-lucide="calendar"></i> Buka: ${escape(kg.tanggal_buka || '-')}</span>
      <span><i data-lucide="calendar-clock"></i> Tutup: ${escape(kg.tanggal_tutup || '-')}</span>
      <span><i data-lucide="layers"></i> Tingkat peserta: ${escape((kg.tingkat_peserta || []).join(', ') || '-')}</span>
    </div></div>`;
}

function chipStatusKegiatan(st) {
  if (st === 'dibuka') return chip('Dibuka', 'ok');
  if (st === 'draft') return chip('Draft', 'netral');
  if (st === 'dikunci') return chip('Dikunci', 'warn');
  if (st === 'diarsipkan') return chip('Diarsipkan', 'netral');
  return chip(st || '-', 'netral');
}

/** Isi dropdown guru dari daftar sel (distinct). */
function renderGuruOptions(sel) {
  const flt = document.getElementById('flt-guru');
  if (!flt) return;
  const map = new Map();
  sel.forEach(s => {
    if (s.id_pengguna && !map.has(s.id_pengguna)) map.set(s.id_pengguna, s.nama_guru);
  });
  const arr = [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cur = state.filter.idGuru;
  flt.innerHTML = '<option value="">Semua</option>' +
    arr.map(([id, nama]) => `<option value="${escape(id)}"${id === cur ? ' selected' : ''}>${escape(nama)}</option>`).join('');
  // Tombol salin-guru aktif hanya jika guru terpilih.
  const btnG = document.getElementById('btn-salin-guru');
  if (btnG) btnG.disabled = !state.filter.idGuru;
}

/** Render tabel matriks progres. */
function renderTabelMatriks(hasil) {
  const wadah = document.getElementById('progres-tabel');
  const sel = hasil.sel || [];
  if (!sel.length) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="circle-slash"></i>
      <h3>Tidak ada sel</h3>
      <p>Tidak ada penugasan/kelas yang cocok dengan filter.</p></div>`;
    renderIkon();
    return;
  }

  const kolom = [
    { k: 'nama_guru', judul: 'Guru', render: v => v ? escape(v) : `<span style="color:var(--teks-ringan)">(belum ditugaskan)</span>` },
    { k: 'nama_varian', judul: 'Mapel / Varian' },
    { k: 'nama_kelas', judul: 'Kelas' },
    { k: 'terisi', judul: 'Terisi / Total', render: (v, r) => miniBar(v, r.total) },
    { k: 'status_input', judul: 'Status', render: v => v === 'final' ? chip('Final', 'ok') : chip('Draft', 'netral') },
    { k: 'ada_kosong', judul: 'Ada Kosong', render: v => v ? chip('Ya', 'warn') : chip('Tidak', 'netral') }
  ];

  // Render tabel dengan row data-id untuk klik → input-nilai.
  // Klik hanya jika bisa_input (spn/admin) & bukan kepsek murni. Guru & kepsek
  // murni melihat matriks tapi tidak bisa klik baris (guru buka input dari halaman Tugas).
  const bisaKlik = state.bisaKlikBaris;
  const kepalaTambahan = bisaKlik ? '' : `<div class="petunjuk" style="margin-bottom:.5rem">
    <i data-lucide="lock"></i> Anda hanya dapat melihat matriks. Untuk input nilai, buka dari halaman Tugas Mengajar atau minta standar penilaian.</div>`;

  // Bangun tabel manual untuk kontrol klik baris & kelas klik.
  const head = kolom.map(k => `<th>${escape(k.judul)}</th>`).join('');
  const body = sel.map(r => {
    const tds = kolom.map(k => {
      const v = r[k.k];
      const isi = k.render ? k.render(v, r) : escape(v ?? '');
      return `<td>${isi}</td>`;
    }).join('');
    const klikAttr = bisaKlik && r.ditugaskan
      ? ` data-keg="${escape(r.id_kegiatan || state.idKeg)}" data-kelas="${escape(r.id_kelas)}" data-varian="${escape(r.id_varian)}" role="button" tabindex="0" class="baris-klik"`
      : '';
    return `<tr ${klikAttr}>${tds}</tr>`;
  }).join('');

  wadah.innerHTML = `${kepalaTambahan}
    <div class="tabel-bungkus"><table class="tabel tabel-padat">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;

  // Pasang listener klik baris.
  if (bisaKlik) {
    wadah.querySelectorAll('tr.baris-klik').forEach(tr => {
      tr.addEventListener('click', () => {
        const keg = tr.dataset.keg || state.idKeg;
        navigasi(`#/input-nilai/${keg}/${tr.dataset.kelas}/${tr.dataset.varian}`);
      });
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const keg = tr.dataset.keg || state.idKeg;
          navigasi(`#/input-nilai/${keg}/${tr.dataset.kelas}/${tr.dataset.varian}`);
        }
      });
    });
  }
  renderIkon();
}

/** Mini bar progres + label. */
function miniBar(terisi, total) {
  const p = persen(terisi, total);
  return `<div class="mini-bar-grup">
    <div class="mini-bar"><div class="mini-bar-isi ${p < 100 ? 'mini-bar-belum' : ''}" style="width:${p}%"></div></div>
    <span class="mini-bar-label">${escape(terisi)}/${escape(total)}</span>
  </div>`;
}

// =========================== LISTENER ===========================

function pasangListener() {
  document.getElementById('flt-keg')?.addEventListener('change', async (e) => {
    state.idKeg = e.target.value;
    state.filter = { tingkat: '', idGuru: '', status: '' };
    if (!state.idKeg) {
      renderPilihKegiatan();
      ['flt-tingkat', 'flt-guru', 'flt-status', 'btn-salin-semua', 'btn-salin-guru'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
      });
      document.getElementById('progres-info').innerHTML = '';
      return;
    }
    await muatMatriks();
  });

  document.getElementById('flt-tingkat')?.addEventListener('change', async (e) => {
    state.filter.tingkat = e.target.value;
    if (state.idKeg) await muatMatriks();
  });

  document.getElementById('flt-guru')?.addEventListener('change', async (e) => {
    state.filter.idGuru = e.target.value;
    if (state.idKeg) await muatMatriks();
  });

  document.getElementById('flt-status')?.addEventListener('change', async (e) => {
    state.filter.status = e.target.value;
    if (state.idKeg) await muatMatriks();
  });

  document.getElementById('btn-salin-semua')?.addEventListener('click', () => salinPengingat(null));
  document.getElementById('btn-salin-guru')?.addEventListener('click', () => {
    if (state.filter.idGuru) salinPengingat(state.filter.idGuru);
  });
}

/** Salin pesan pengingat ke clipboard. idGuru=null → semua belum final. */
async function salinPengingat(idGuru) {
  if (!state.idKeg) return;
  const btn = idGuru ? document.getElementById('btn-salin-guru') : document.getElementById('btn-salin-semua');
  const awal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = spin('Menyiapkan...'); }
  try {
    const data = { id_kegiatan: state.idKeg };
    if (idGuru) data.id_pengguna = idGuru;
    const hasil = await panggil('progres_pesan_pengingat', data, state.token);
    const pesan = hasil.pesan || '';
    if (!pesan) { toast('Tidak ada pesan pengingat (semua sudah final?).', 'info'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(pesan);
      toast('Pesan pengingat disalin ke clipboard.', 'ok');
    } else {
      // Fallback: tampilkan di textarea modal sementara.
      const ta = document.createElement('textarea');
      ta.value = pesan; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Pesan pengingat disalin.', 'ok'); }
      catch (e) { toast('Tidak bisa menyalin otomatis. Pesan ditampilkan di alert.', 'warn'); alert(pesan); }
      document.body.removeChild(ta);
    }
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = awal; renderIkon(); }
  }
}
