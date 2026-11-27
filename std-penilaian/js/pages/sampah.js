// sampah.js — Halaman Tempat Sampah (Tahap 6B).
// Tampilkan item terhapus (siswa / penugasan / pengguna), pulihkan, atau hapus permanen.
// Hak akses: admin & standar_penilaian (spn). Hapus permanen hanya admin.
//
// Kontrak aksi (Operasi.gs):
//   sampah_daftar      {q?, jenis?} → {daftar:[{id_sampah,jenis,id_entitas,data_json,
//                                                dihapus_oleh,dihapus_pada,kedaluwarsa}],
//                                          bisa_hapus_permanen}
//   sampah_pulihkan    {id_sampah}  → {ok, konflik?}
//   sampah_hapus_permanen {id_sampah} → {ok}
//
// Konvensi: import relatif '../api.js' dll; token localStorage.getItem('enilai_token');
// escape() untuk data dinamis; renderIkon() setelah innerHTML; komentar Indonesia.
import { renderIkon, escape, toast, spin, pesanGalat } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { chip, renderModal, modalBuka, modalTutup, pasangModalTutupGlobal } from '../komponen.js';

// Pasang listener global tombol [data-modal-tutup] sekali saat modul dimuat.
pasangModalTutupGlobal();

// =========================== STATE ===========================

const state = {
  sesi: null,
  token: null,
  bisaHapusPermanen: false,   // dari hasil sampah_daftar + cek peran admin
  daftar: [],
  filter: { q: '', jenis: '' },
  itemTerpilih: null          // item yang sedang di modal hapus permanen
};

/** Opsi filter jenis sampah. */
const JENIS_OPSI = [
  { nilai: '', label: 'Semua' },
  { nilai: 'siswa', label: 'Siswa' },
  { nilai: 'penugasan', label: 'Penugasan' },
  { nilai: 'pengguna', label: 'Pengguna' }
];

// =========================== UTIL ===========================

/** Chip warna untuk jenis item sampah. */
function chipJenis(j) {
  if (j === 'siswa') return chip('Siswa', 'info');
  if (j === 'penugasan') return chip('Penugasan', 'warn');
  if (j === 'pengguna') return chip('Pengguna', 'netral');
  return chip(j || '-', 'netral');
}

/**
 * Parse data_json dan ambil field ringkas (nama / username / kunci utama).
 * Aman terhadap data_json kosong atau rusak (tidak melempar).
 */
function ringkasData(jenis, dataJson) {
  let obj = {};
  try { obj = JSON.parse(dataJson || '{}'); } catch (e) { obj = {}; }
  if (jenis === 'siswa') {
    const bagian = [obj.nama, obj.nisn && ('NISN ' + obj.nisn), obj.nis && ('NIS ' + obj.nis)]
      .filter(Boolean);
    return bagian.length ? bagian.join(' · ') : '(data siswa)';
  }
  if (jenis === 'pengguna') {
    const bagian = [obj.username, obj.nama_lengkap].filter(Boolean);
    return bagian.length ? bagian.join(' · ') : '(data pengguna)';
  }
  if (jenis === 'penugasan') {
    const bagian = [
      obj.id_guru && ('guru ' + obj.id_guru),
      obj.id_kelas && ('kelas ' + obj.id_kelas),
      obj.id_kegiatan && ('keg ' + obj.id_kegiatan),
      obj.id_varian && ('varian ' + obj.id_varian)
    ].filter(Boolean);
    return bagian.length ? bagian.join(' · ') : '(data penugasan)';
  }
  // Fallback: tampilkan hingga 3 kunci utama.
  const kunci = Object.keys(obj).slice(0, 3);
  return kunci.length ? kunci.map(k => k + '=' + obj[k]).join(', ') : '(data)';
}

/** Debounce sederhana. */
function debung(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// =========================== ENTRY ===========================

export async function renderSampah(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');

  document.getElementById('topbar-judul').textContent = 'Tempat Sampah';
  const main = document.getElementById('main');

  // Hak akses: admin & spn.
  if (!boleh(sesi.peran, 'standar_penilaian')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i>
      <h3>Akses ditolak</h3>
      <p>Halaman ini khusus admin &amp; standar penilaian.</p></div>`;
    renderIkon();
    return;
  }
  state.bisaHapusPermanen = boleh(sesi.peran, 'admin');

  renderKerangka();
  pasangListenerKerangka();
  await muatDanRender();
  renderIkon();
}

// =========================== KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Tempat Sampah</h1>
    <p class="petunjuk" style="margin:0 0 1rem">
      Item yang dihapus disimpan 60 hari, lalu otomatis dibersihkan. Pulihkan untuk mengembalikan ke tabel asal.
    </p>
    <div class="toolbar">
      <div class="tumbal" style="min-width:180px">
        <label class="label" for="sampah-jenis">Jenis</label>
        <select class="select" id="sampah-jenis">
          ${JENIS_OPSI.map(o => `<option value="${escape(o.nilai)}"${o.nilai === state.filter.jenis ? ' selected' : ''}>${escape(o.label)}</option>`).join('')}
        </select>
      </div>
      <div class="tumbal" style="min-width:240px">
        <label class="label" for="sampah-q">Cari</label>
        <input class="input" id="sampah-q" type="search" value="${escape(state.filter.q)}"
               placeholder="kata kunci (nama / NISN / id)..." autocomplete="off" />
      </div>
      <div class="kelompok-aksi" style="margin-left:auto">
        <button class="btn btn-kecil btn-sekunder" id="sampah-muat-ulang"><i data-lucide="refresh-cw"></i> Muat ulang</button>
      </div>
    </div>
    <div id="sampah-isi">${spin('Memuat sampah...')}</div>

    <!-- Modal konfirmasi hapus permanen (ganda: tekan tombol → ketik HAPUS). -->
    ${renderModal('modal-hapus-permanen', 'Hapus permanen?', `
      <div class="banner banner-warn" style="margin:0 0 .75rem">
        <i data-lucide="alert-triangle"></i>
        <span>Item yang dihapus permanen <strong>tidak dapat dikembalikan</strong>. Pastikan Anda yakin.</span>
      </div>
      <div id="hapus-permanen-rincian" style="margin:0 0 .75rem; font-size:.88rem; color:var(--teks-ringan)"></div>
      <div class="field">
        <label class="label" for="hapus-permanen-konfirmasi">Ketik <strong>HAPUS</strong> untuk konfirmasi</label>
        <input class="input" id="hapus-permanen-konfirmasi" autocomplete="off" />
        <div class="petunjuk">Pengetikan tepat "HAPUS" (huruf kapital) membuka tombol hapus.</div>
      </div>
      <div id="hapus-permanen-galat" class="galat-field"></div>
    `, `
      <button class="btn btn-sekunder" data-modal-tutup="modal-hapus-permanen">Batal</button>
      <button class="btn btn-warn" id="btn-hapus-permanen-ya"><i data-lucide="trash-2"></i> Hapus permanen</button>
    `)}
  `;
}

function pasangListenerKerangka() {
  // Filter jenis: re-render segera.
  document.getElementById('sampah-jenis')?.addEventListener('change', (e) => {
    state.filter.jenis = e.target.value;
    muatDanRender();
  });
  // Pencarian: debounce 350ms.
  const q = document.getElementById('sampah-q');
  if (q) {
    const jalankan = debung(() => {
      state.filter.q = q.value.trim();
      muatDanRender();
    }, 350);
    q.addEventListener('input', jalankan);
  }
  // Tombol muat ulang.
  document.getElementById('sampah-muat-ulang')?.addEventListener('click', () => muatDanRender());
  // Tombol konfirmasi hapus permanen.
  document.getElementById('btn-hapus-permanen-ya')?.addEventListener('click', konfirmasiHapusPermanen);
}

// =========================== MUAT & RENDER ISI ===========================

async function muatDanRender() {
  const wadah = document.getElementById('sampah-isi');
  if (!wadah) return;
  wadah.innerHTML = spin('Memuat sampah...');
  try {
    const hasil = await panggil('sampah_daftar', {
      q: state.filter.q || undefined,
      jenis: state.filter.jenis || undefined
    }, state.token);
    state.daftar = hasil.daftar || [];
    // bisa_hapus_permanen dari server + pastikan peran admin.
    state.bisaHapusPermanen = !!hasil.bisa_hapus_permanen && boleh(state.sesi.peran, 'admin');
    renderIsi();
  } catch (err) {
    wadah.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
  }
  renderIkon();
}

function renderIsi() {
  const wadah = document.getElementById('sampah-isi');
  const daftar = state.daftar;

  if (!daftar.length) {
    const adaFilter = state.filter.q || state.filter.jenis;
    wadah.innerHTML = `<div class="kosong"><i data-lucide="trash-2"></i>
      <h3>Sampah kosong</h3>
      <p>${adaFilter ? 'Tidak ada item yang cocok dengan filter saat ini.' : 'Belum ada item yang dihapus. Item yang Anda hapus akan muncul di sini selama 60 hari.'}</p></div>`;
    return;
  }

  const head = `<tr>
    <th>Jenis</th>
    <th>Id Entitas</th>
    <th>Ringkas</th>
    <th>Dihapus oleh</th>
    <th>Dihapus pada</th>
    <th>Kedaluwarsa</th>
    <th class="aksi">Aksi</th>
  </tr>`;
  const body = daftar.map(r => {
    const btnPulih = `<button class="btn btn-kecil btn-sekunder" data-pulihkan="${escape(r.id_sampah)}" title="Pulihkan ke tabel asal"><i data-lucide="rotate-ccw"></i> Pulihkan</button>`;
    const btnPermanen = state.bisaHapusPermanen
      ? `<button class="btn btn-kecil btn-ghost ikon-btn" data-hapus-permanen="${escape(r.id_sampah)}" title="Hapus permanen" aria-label="Hapus permanen"><i data-lucide="trash-2"></i></button>`
      : '';
    return `<tr>
      <td>${chipJenis(r.jenis)}</td>
      <td><code>${escape(r.id_entitas)}</code></td>
      <td>${escape(ringkasData(r.jenis, r.data_json))}</td>
      <td><code>${escape(r.dihapus_oleh)}</code></td>
      <td>${escape(r.dihapus_pada || '-')}</td>
      <td>${escape(r.kedaluwarsa || '-')}</td>
      <td class="aksi">${btnPulih}${btnPermanen}</td>
    </tr>`;
  }).join('');

  wadah.innerHTML = `<div class="tabel-bungkus">
    <table class="tabel tabel-padat">
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;

  // Pasang listener aksi baris.
  wadah.querySelectorAll('[data-pulihkan]').forEach(b => {
    b.addEventListener('click', () => pulihkan(b.dataset.pulihkan));
  });
  wadah.querySelectorAll('[data-hapus-permanen]').forEach(b => {
    b.addEventListener('click', () => bukaModalHapusPermanen(b.dataset.hapusPermanen));
  });
  renderIkon();
}

// =========================== PULIHKAN ===========================

async function pulihkan(idSampah) {
  try {
    const hasil = await panggil('sampah_pulihkan', { id_sampah: idSampah }, state.token);
    // Kontrak: { ok, konflik? }. Jika ok=false dan ada konflik → tampilkan pesan.
    if (hasil && hasil.ok === false) {
      const pesan = hasil.konflik || 'Pemulihan gagal: konflik data.';
      toast(pesan, 'warn');
      // Tetap refresh daftar (status bisa berubah).
      await muatDanRender();
      return;
    }
    toast('Item berhasil dipulihkan ke tabel asal.', 'ok');
    await muatDanRender();
  } catch (err) {
    toast(pesanGalat(err), 'err');
  }
}

// =========================== HAPUS PERMANEN ===========================

function bukaModalHapusPermanen(idSampah) {
  if (!state.bisaHapusPermanen) {
    toast('Anda tidak berhak menghapus permanen.', 'err');
    return;
  }
  const item = state.daftar.find(r => r.id_sampah === idSampah);
  if (!item) {
    toast('Item tidak ditemukan di daftar.', 'err');
    return;
  }
  state.itemTerpilih = item;
  const rincian = document.getElementById('hapus-permanen-rincian');
  if (rincian) {
    rincian.innerHTML = `<strong>Jenis:</strong> ${escape(item.jenis)} &middot;
      <strong>Id:</strong> <code>${escape(item.id_entitas)}</code><br/>
      <strong>Ringkas:</strong> ${escape(ringkasData(item.jenis, item.data_json))}`;
  }
  const konfInput = document.getElementById('hapus-permanen-konfirmasi');
  if (konfInput) konfInput.value = '';
  const galat = document.getElementById('hapus-permanen-galat');
  if (galat) galat.textContent = '';
  modalBuka('modal-hapus-permanen');
  renderIkon();
}

async function konfirmasiHapusPermanen() {
  if (!state.itemTerpilih) return;
  const input = document.getElementById('hapus-permanen-konfirmasi');
  const galat = document.getElementById('hapus-permanen-galat');
  if (galat) galat.textContent = '';
  // Konfirmasi ganda: harus ketik "HAPUS" persis.
  if (!input || String(input.value).trim() !== 'HAPUS') {
    if (galat) galat.textContent = 'Ketik "HAPUS" (huruf kapital) tepat seperti tertulis.';
    return;
  }
  try {
    await panggil('sampah_hapus_permanen', { id_sampah: state.itemTerpilih.id_sampah }, state.token);
    toast('Item dihapus permanen.', 'ok');
    modalTutup('modal-hapus-permanen');
    state.itemTerpilih = null;
    await muatDanRender();
  } catch (err) {
    if (galat) galat.textContent = pesanGalat(err);
  }
}
