// backup.js — Halaman Backup & Restore (Tahap 6A).
//
// Backup database (salinan spreadsheet ke folder Drive), unduh cadangan .xlsx
// (tanpa/ dengan kredensial), toggle trigger backup harian & mode pemeliharaan,
// serta restore dari file backup (pratinjau diff + konfirmasi ganda).
//
// Hak akses: SEMUA aksi di backend hanya admin. Halaman ini admin-only.
//
// Pustaka: SheetJS (import langsung, versi dipatok 0.18.5). Token dari
// localStorage.getItem('enilai_token'). escape() untuk semua data dinamis;
// renderIkon() dipanggil setelah setiap innerHTML.
import { renderIkon, escape, spin, pesanGalat, toast } from '../ui.js';
import { boleh } from '../auth.js';
import { panggil } from '../api.js';
import { chip, renderModal, modalBuka, modalTutup, pasangModalTutupGlobal } from '../komponen.js';
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';

// Pasang listener global tombol [data-modal-tutup] sekali saat modul dimuat.
pasangModalTutupGlobal();

// =========================== STATE ===========================

const state = {
  sesi: null,
  token: null,
  daftar: [],          // hasil backup_daftar.daftar
  peringatan: '',      // dari backup_daftar
  triggerAktif: false, // backup harian
  maintenance: false,  // mode pemeliharaan
  // Restore.
  restoreDiff: null,   // hasil restore_preview
  restoreBackupTerpilih: '' // id_file_backup
};

// =========================== UTIL ===========================

/** Format ukuran byte → KB/MB (1 desimal). */
function fmtUkuran(byte) {
  const b = Number(byte) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Format timestamp ISO "yyyy-MM-dd HH:mm:ss" → "dd/MM/yyyy HH:mm". */
function formatTanggal(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return String(iso);
  let out = `${m[3]}/${m[2]}/${m[1]}`;
  if (m[4]) out += ` ${m[4]}:${m[5]}`;
  return out;
}

// =========================== ENTRY ===========================

export async function renderBackup(sesi) {
  state.sesi = sesi;
  state.token = localStorage.getItem('enilai_token');
  state.restoreDiff = null;
  state.restoreBackupTerpilih = '';

  document.getElementById('topbar-judul').textContent = 'Backup & Restore';
  const main = document.getElementById('main');

  // Akses: hanya admin.
  if (!boleh(sesi.peran, 'admin')) {
    main.innerHTML = `<div class="kosong"><i data-lucide="lock"></i><h3>Akses ditolak</h3>
      <p>Halaman ini khusus administrator.</p></div>`;
    renderIkon();
    return;
  }

  main.innerHTML = spin('Memuat daftar backup...');
  try {
    const d = await panggil('backup_daftar', {}, state.token);
    state.daftar = d.daftar || [];
    state.peringatan = d.peringatan || '';
    state.triggerAktif = !!d.trigger_aktif;
    state.maintenance = !!d.maintenance;
  } catch (err) {
    main.innerHTML = `<div class="kosong"><i data-lucide="alert-triangle"></i>
      <h3>Gagal memuat</h3><p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
    toast(pesanGalat(err), 'err');
    return;
  }

  renderKerangka();
  renderDaftar();
  renderToggle();
  renderRestore();
  pasangListener();
  renderIkon();
}

// =========================== KERANGKA ===========================

function renderKerangka() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <h1 class="page-judul">Backup &amp; Restore</h1>
    <p class="petunjuk" style="margin:0 0 1rem">
      Salinan database tersimpan di folder Google Drive. Restore bersifat
      destruktif — selalu didahului backup otomatis dan memerlukan konfirmasi ganda.
    </p>

    <div id="bk-peringatan"></div>

    <section class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Daftar Backup</div>
      <div class="toolbar" style="margin-bottom:.6rem">
        <button class="btn" id="bk-buat"><i data-lucide="database-backup"></i> Backup Sekarang</button>
        <button class="btn btn-sekunder" id="bk-muat"><i data-lucide="refresh-cw"></i> Muat Ulang</button>
      </div>
      <div id="bk-daftar"></div>
    </section>

    <section class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Unduh Cadangan .xlsx</div>
      <div class="field" style="margin-bottom:.6rem">
        <label class="cek-kotak" style="display:flex; align-items:center; gap:.5rem; cursor:pointer">
          <input type="checkbox" id="bk-sertakan-kred" />
          <span>Sertakan kredensial (password hash, salt, PIN hash)</span>
        </label>
        <div class="petunjuk" style="color:var(--warn)">
          <i data-lucide="alert-triangle" style="width:14px;height:14px;vertical-align:-2px"></i>
          Hanya centang jika benar-benar perlu. File berisi data sensitif —
          simpan di tempat aman dan jangan dibagikan.
        </div>
      </div>
      <button class="btn btn-sekunder" id="bk-unduh-xlsx">
        <i data-lucide="file-spreadsheet"></i> Unduh .xlsx</button>
      <div id="bk-unduh-status"></div>
    </section>

    <section class="kartu" style="margin-bottom:1rem">
      <div class="kartu-title">Pengaturan Sistem</div>
      <div style="display:flex; flex-direction:column; gap:.6rem">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:.6rem; flex-wrap:wrap">
          <div>
            <strong>Trigger Backup Harian</strong>
            <div class="petunjuk">Backup otomatis setiap hari pukul 01:00 WIB.</div>
          </div>
          <label class="cek-kotak" style="display:inline-flex; align-items:center; gap:.5rem; cursor:pointer">
            <input type="checkbox" id="bk-trigger" ${state.triggerAktif ? 'checked' : ''} />
            <span>${state.triggerAktif ? 'Aktif' : 'Nonaktif'}</span>
          </label>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:.6rem; flex-wrap:wrap; border-top:1px dashed var(--border); padding-top:.6rem">
          <div>
            <strong>Mode Pemeliharaan</strong>
            <div class="petunjuk">Nonaktifkan penyimpanan untuk peran non-admin (6 jam maks).</div>
          </div>
          <label class="cek-kotak" style="display:inline-flex; align-items:center; gap:.5rem; cursor:pointer">
            <input type="checkbox" id="bk-maintenance" ${state.maintenance ? 'checked' : ''} />
            <span>${state.maintenance ? 'ON' : 'OFF'}</span>
          </label>
        </div>
      </div>
    </section>

    <section class="kartu">
      <div class="kartu-title">Restore dari Backup</div>
      <div class="toolbar" style="margin-bottom:.6rem">
        <div class="tumbal" style="min-width:260px">
          <label class="label" for="bk-restore-pilih">Pilih file backup</label>
          <select class="select" id="bk-restore-pilih">
            <option value="">— pilih backup —</option>
            ${state.daftar.map(f =>
              `<option value="${escape(f.id_file)}">${escape(f.nama)} (${escape(formatTanggal(f.dibuat_pada))})</option>`
            ).join('')}
          </select>
        </div>
        <div class="tumbal" style="display:flex; align-items:flex-end">
          <button class="btn btn-sekunder" id="bk-restore-preview"><i data-lucide="git-compare"></i> Pratinjau Diff</button>
        </div>
      </div>
      <div id="bk-restore-diff"></div>
      <div id="bk-restore-form"></div>
    </section>

    ${renderModal('bk-modal-restore', 'Konfirmasi Restore', `
      <div class="banner banner-warn" style="margin-bottom:.6rem">
        <i data-lucide="alert-triangle"></i>
        <span>Operasi ini akan <strong>menimpa</strong> data pada tab terpilih dengan
          data dari file backup. Backup otomatis dibuat sebelum penimpaan.
          Mode pemeliharaan dinyalakan selama proses.</span>
      </div>
      <div id="bk-restore-ringkas" class="kartu" style="padding:.6rem .8rem; font-size:.85rem; margin-bottom:.6rem"></div>
      <div class="field">
        <label class="label" for="bk-restore-konfirmasi">Ketik <strong>PULIHKAN</strong> untuk mengonfirmasi</label>
        <input class="input" id="bk-restore-konfirmasi" type="text" placeholder="PULIHKAN" autocomplete="off" />
      </div>
    `, `<button class="btn btn-sekunder" data-modal-tutup="bk-modal-restore">Batal</button>
        <button class="btn btn-warn" id="bk-restore-jalankan"><i data-lucide="rotate-ccw"></i> Pulihkan</button>`)}
  `;
}

// =========================== DAFTAR ===========================

function renderDaftar() {
  const wadah = document.getElementById('bk-daftar');
  if (!wadah) return;
  if (!state.daftar.length) {
    wadah.innerHTML = `<div class="kosong" style="padding:1rem"><i data-lucide="database-backup"></i>
      <p>Belum ada backup. Klik <strong>Backup Sekarang</strong> untuk membuat salinan pertama.</p></div>`;
    return;
  }
  const head = `<tr>
    <th>Nama</th><th>Ukuran</th><th>Dibuat</th><th>Drive</th>
  </tr>`;
  const body = state.daftar.map(f => `<tr>
    <td><strong>${escape(f.nama)}</strong></td>
    <td class="angka">${escape(fmtUkuran(f.ukuran))}</td>
    <td>${escape(formatTanggal(f.dibuat_pada))}</td>
    <td><a href="${escape(f.url)}" target="_blank" rel="noopener">Buka <i data-lucide="external-link" style="width:12px;height:12px;vertical-align:-1px"></i></a></td>
  </tr>`).join('');
  wadah.innerHTML = `<div class="tabel-bungkus">
    <table class="tabel tabel-padat"><thead>${head}</thead><tbody>${body}</tbody></table>
  </div>`;
}

function renderToggle() {
  // Peringatan backup terakhir > 8 hari.
  const wadah = document.getElementById('bk-peringatan');
  if (!wadah) return;
  if (state.peringatan) {
    wadah.innerHTML = `<div class="banner banner-warn" style="margin-bottom:1rem">
      <i data-lucide="alert-triangle"></i><span>${escape(state.peringatan)}</span>
    </div>`;
  } else {
    wadah.innerHTML = '';
  }
}

// =========================== RESTORE ===========================

function renderRestore() {
  // Tidak ada render awal; diff dirender saat pratinjau diklik.
}

/** Tampilkan pratinjau diff (baris sekarang vs backup) untuk backup terpilih. */
async function jalankanRestorePreview() {
  const idFile = document.getElementById('bk-restore-pilih')?.value;
  if (!idFile) {
    toast('Pilih file backup dulu.', 'err');
    return;
  }
  state.restoreBackupTerpilih = idFile;
  const wadahDiff = document.getElementById('bk-restore-diff');
  const wadahForm = document.getElementById('bk-restore-form');
  wadahDiff.innerHTML = spin('Memuat perbandingan...');
  wadahForm.innerHTML = '';
  renderIkon();
  try {
    const d = await panggil('restore_preview', { id_file_backup: idFile }, state.token);
    state.restoreDiff = d;
    const head = `<tr>
      <th>Tab</th><th>Baris Sekarang</th><th>Baris Backup</th><th>Selisih</th><th>Pulihkan?</th>
    </tr>`;
    const body = (d.diff || []).map(r => {
      const sel = Number(r.baris_sekarang || 0) - Number(r.baris_backup || 0);
      const selisih = sel === 0 ? '<span style="color:var(--teks-ringan)">sama</span>'
        : (sel > 0 ? `<span class="chip chip-warn">+${sel}</span>` : `<span class="chip chip-info">${sel}</span>`);
      return `<tr>
        <td><strong>${escape(r.tab)}</strong></td>
        <td class="angka">${escape(r.baris_sekarang)}</td>
        <td class="angka">${escape(r.baris_backup)}</td>
        <td class="angka">${selisih}</td>
        <td><label class="cek-kotak" style="display:inline-flex; align-items:center; gap:.3rem; cursor:pointer">
          <input type="checkbox" class="bk-restore-tab" data-tab="${escape(r.tab)}" checked />
          <span>ya</span>
        </label></td>
      </tr>`;
    }).join('');
    wadahDiff.innerHTML = `
      <div class="petunjuk" style="margin-bottom:.4rem">
        Backup: <strong>${escape(d.nama_backup)}</strong> · ${escape(formatTanggal(d.waktu_backup))}
      </div>
      <div class="tabel-bungkus" style="max-height:50vh">
        <table class="tabel tabel-padat"><thead>${head}</thead><tbody>${body}</tbody></table>
      </div>`;
    wadahForm.innerHTML = `<div style="margin-top:.6rem; display:flex; gap:.5rem; flex-wrap:wrap; align-items:center">
      <button class="btn btn-warn" id="bk-restore-buka-modal"><i data-lucide="rotate-ccw"></i> Pulihkan Tab Terpilih</button>
      <span class="petunjuk">Konfirmasi ganda akan diminta pada langkah berikutnya.</span>
    </div>`;
    renderIkon();
  } catch (err) {
    wadahDiff.innerHTML = `<div class="kosong" style="padding:1rem"><i data-lucide="alert-triangle"></i>
      <p>${escape(pesanGalat(err))}</p></div>`;
    renderIkon();
  }
}

/** Buka modal konfirmasi restore dengan ringkasan tab terpilih. */
function bukaModalRestore() {
  if (!state.restoreDiff) {
    toast('Jalankan pratinjau diff lebih dulu.', 'err');
    return;
  }
  const tabs = [...document.querySelectorAll('.bk-restore-tab')]
    .filter(c => c.checked).map(c => c.dataset.tab);
  if (!tabs.length) {
    toast('Pilih minimal satu tab untuk dipulihkan.', 'err');
    return;
  }
  const ringkas = document.getElementById('bk-restore-ringkas');
  if (ringkas) {
    ringkas.innerHTML = `<div><strong>Backup:</strong> ${escape(state.restoreDiff.nama_backup)}</div>
      <div><strong>Waktu:</strong> ${escape(formatTanggal(state.restoreDiff.waktu_backup))}</div>
      <div><strong>Tab dipilih:</strong> ${escape(tabs.join(', '))}</div>`;
  }
  const konf = document.getElementById('bk-restore-konfirmasi');
  if (konf) konf.value = '';
  modalBuka('bk-modal-restore');
}

/** Jalankan restore_jalankan dengan tabs terpilih & konfirmasi "PULIHKAN". */
async function jalankanRestore() {
  const idFile = state.restoreBackupTerpilih;
  const tabs = [...document.querySelectorAll('.bk-restore-tab')]
    .filter(c => c.checked).map(c => c.dataset.tab);
  const konf = String(document.getElementById('bk-restore-konfirmasi')?.value || '').trim();
  if (konf !== 'PULIHKAN') {
    toast('Ketik "PULIHKAN" (huruf besar) untuk mengonfirmasi.', 'err');
    return;
  }
  const btn = document.getElementById('bk-restore-jalankan');
  if (btn) { btn.disabled = true; btn.innerHTML = spin('Memulihkan...'); }
  try {
    const res = await panggil('restore_jalankan', {
      id_file_backup: idFile, tabs, konfirmasi: 'PULIHKAN'
    }, state.token);
    toast('Restore selesai.', 'ok');
    // Tampilkan laporan di tempat diff.
    const wadah = document.getElementById('bk-restore-diff');
    if (wadah) {
      wadah.innerHTML = `<div class="banner banner-ok" style="margin-bottom:.6rem">
        <i data-lucide="check-circle"></i><span>Restore selesai. Mode pemeliharaan dimatikan kembali.</span>
      </div><div class="kartu" style="padding:.8rem; font-size:.85rem">
        <div class="kartu-title">Laporan</div>
        <ul style="margin:0; padding-left:1.2rem">
          ${(res.laporan || []).map(l => `<li>${escape(l)}</li>`).join('')}
        </ul>
      </div>`;
    }
    document.getElementById('bk-restore-form').innerHTML = '';
    modalTutup('bk-modal-restore');
    renderIkon();
    // Muat ulang state (maintenance dkk).
    setTimeout(() => renderBackup(state.sesi), 600);
  } catch (err) {
    toast(pesanGalat(err), 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="rotate-ccw"></i> Pulihkan`;
      renderIkon();
    }
  }
}

// =========================== UNDUH XLSX ===========================

/** Unduh cadangan .xlsx dari backup_unduh: data.data {tabName: [[rows]]}. */
async function unduhXlsx() {
  const sertakan = document.getElementById('bk-sertakan-kred')?.checked;
  const status = document.getElementById('bk-unduh-status');
  if (status) status.innerHTML = spin('Menyiapkan workbook...');
  renderIkon();
  try {
    const res = await panggil('backup_unduh', { sertakan_kredensial: !!sertakan }, state.token);
    const dataTab = (res && res.data) || {};
    const namaTab = Object.keys(dataTab);
    if (!namaTab.length) {
      throw new Error('Server tidak mengembalikan data tab.');
    }
    const wb = XLSX.utils.book_new();
    namaTab.forEach(nama => {
      const aoa = dataTab[nama];
      if (!Array.isArray(aoa) || !aoa.length) return;
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Nama sheet maks 31 karakter & bebas karakter ilegal.
      const namaSheet = String(nama).replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, namaSheet || 'Sheet');
    });
    const tgl = new Date().toISOString().slice(0, 10);
    const namaFile = `backup_e-nilai_${tgl}${sertakan ? '_dengan-kredensial' : ''}.xlsx`;
    XLSX.writeFile(wb, namaFile);
    if (status) status.innerHTML = `<div class="banner banner-ok"><i data-lucide="check-circle"></i>
      <span>File <strong>${escape(namaFile)}</strong> diunduh (${namaTab.length} tab).</span></div>`;
    renderIkon();
    toast('Cadangan .xlsx diunduh.', 'ok');
  } catch (err) {
    if (status) status.innerHTML = `<div class="kosong" style="padding:.8rem"><i data-lucide="alert-triangle"></i>
      <p>${escape(pesanGalat(err) || (err && err.message) || 'Gagal mengunduh.')}</p></div>`;
    renderIkon();
    toast(pesanGalat(err) || 'Gagal mengunduh.', 'err');
  }
}

// =========================== LISTENER ===========================

function pasangListener() {
  document.getElementById('bk-muat')?.addEventListener('click', () => renderBackup(state.sesi));

  // Backup sekarang.
  document.getElementById('bk-buat')?.addEventListener('click', async () => {
    const btn = document.getElementById('bk-buat');
    if (btn) { btn.disabled = true; btn.innerHTML = spin('Membuat backup...'); }
    try {
      const res = await panggil('backup_buat', {}, state.token);
      toast('Backup dibuat: ' + (res.backup?.nama || ''), 'ok');
      await renderBackup(state.sesi);
    } catch (err) {
      toast(pesanGalat(err), 'err');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="database-backup"></i> Backup Sekarang`;
        renderIkon();
      }
    }
  });

  // Unduh xlsx.
  document.getElementById('bk-unduh-xlsx')?.addEventListener('click', unduhXlsx);

  // Toggle trigger backup harian.
  document.getElementById('bk-trigger')?.addEventListener('change', async (e) => {
    const aktif = e.target.checked;
    try {
      const res = await panggil('backup_trigger_toggle', { aktif }, state.token);
      state.triggerAktif = !!res.aktif;
      e.target.checked = state.triggerAktif;
      e.target.nextElementSibling.textContent = state.triggerAktif ? 'Aktif' : 'Nonaktif';
      toast('Trigger backup harian ' + (state.triggerAktif ? 'diaktifkan' : 'dinonaktifkan') + '.', 'ok');
    } catch (err) {
      e.target.checked = !aktif; // kembalikan
      toast(pesanGalat(err), 'err');
    }
  });

  // Toggle mode pemeliharaan (dengan konfirmasi).
  document.getElementById('bk-maintenance')?.addEventListener('change', async (e) => {
    const aktif = e.target.checked;
    const kata = aktif ? 'Mengaktifkan' : 'Mematikan';
    if (!confirm(`${kata} mode pemeliharaan? ${aktif
      ? 'Penyimpanan oleh peran non-admin akan ditolak selama 6 jam maks.'
      : 'Penyimpanan oleh peran non-admin akan diizinkan kembali.'}`)) {
      e.target.checked = !aktif; // batal
      return;
    }
    try {
      const res = await panggil('maintenance_toggle', { aktif }, state.token);
      state.maintenance = !!res.maintenance;
      e.target.checked = state.maintenance;
      e.target.nextElementSibling.textContent = state.maintenance ? 'ON' : 'OFF';
      toast('Mode pemeliharaan ' + (state.maintenance ? 'AKTIF' : 'padam') + '.', state.maintenance ? 'warn' : 'ok');
    } catch (err) {
      e.target.checked = !aktif;
      toast(pesanGalat(err), 'err');
    }
  });

  // Restore: pratinjau & jalankan.
  document.getElementById('bk-restore-preview')?.addEventListener('click', jalankanRestorePreview);
  document.getElementById('bk-restore-form')?.addEventListener('click', (e) => {
    if (e.target.closest('#bk-restore-buka-modal')) bukaModalRestore();
  });
  document.getElementById('bk-restore-jalankan')?.addEventListener('click', jalankanRestore);
}
