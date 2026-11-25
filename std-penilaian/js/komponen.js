// komponen.js — Komponen UI bersama: tabel, paginasi, modal, chip.
import { el, escape } from './ui.js';

/** Render tabel sederhana.
 * @param {Array<{k:string,judul:string,render?:(v,row)=>string,kelas?:string}>} kolom
 * @param {Array<object>} baris
 * @param {{kosongPesan?:string,id?:string,Padat?:boolean}} opts
 */
export function renderTabel(kolom, baris, opts) {
  opts = opts || {};
  const idAttr = opts.id ? `id="${opts.id}"` : '';
  const padat = opts.padat ? ' tabel-padat' : '';
  if (!baris.length) {
    return `<div class="kosong" ${idAttr}><p>${escape(opts.kosongPesan || 'Tidak ada data.')}</p></div>`;
  }
  const head = kolom.map(k => `<th class="${escape(k.kelas || '')}">${escape(k.judul)}</th>`).join('');
  const body = baris.map(row => {
    const td = kolom.map(k => {
      const v = row[k.k];
      const isi = k.render ? k.render(v, row) : escape(v ?? '');
      return `<td>${isi}</td>`;
    }).join('');
    return `<tr data-id="${escape(row.id ?? '')}">${td}</tr>`;
  }).join('');
  return `<div class="tabel-bungkus" ${idAttr}><table class="tabel${padat}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Render kontrol paginasi. Tombol membawa data-halaman. */
export function renderPaginasi(total, halaman, perHalaman) {
  const jmlHalaman = Math.max(1, Math.ceil(total / perHalaman));
  if (jmlHalaman <= 1) return '';
  const h = Number(halaman) || 1;
  const tombol = [];
  const btn = (label, no, aktif, disabled) =>
    `<button class="btn btn-kecil btn-sekunder ${aktif ? 'aktif' : ''}" data-halaman="${no}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  tombol.push(btn('«', Math.max(1, h - 1), false, h <= 1));
  // tampilkan maks 7 halaman di sekitar saat ini
  let awal = Math.max(1, h - 3), akhir = Math.min(jmlHalaman, awal + 6);
  awal = Math.max(1, akhir - 6);
  for (let i = awal; i <= akhir; i++) tombol.push(btn(String(i), i, i === h, false));
  tombol.push(btn('»', Math.min(jmlHalaman, h + 1), false, h >= jmlHalaman));
  return `<div class="paginasi">${tombol.join('')}</div>`;
}

/** Render modal (disembunyikan sampai modalBuka dipanggil). */
export function renderModal(id, judul, isiHTML, footerHTML, besar) {
  return `<div class="modal" id="${escape(id)}" aria-hidden="true">
    <div class="modal-bingkai ${besar ? 'besar' : ''}" role="dialog" aria-modal="true" aria-label="${escape(judul)}">
      <div class="modal-head"><h3>${escape(judul)}</h3>
        <button class="btn btn-ghost ikon-btn" data-modal-tutup="${escape(id)}" aria-label="Tutup"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-isi">${isiHTML}</div>
      ${footerHTML ? `<div class="modal-foot">${footerHTML}</div>` : ''}
    </div>
  </div>`;
}

export function modalBuka(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('show'); m.setAttribute('aria-hidden', 'false'); }
}
export function modalTutup(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('show'); m.setAttribute('aria-hidden', 'true'); }
}

/** Pasang listener global untuk tombol [data-modal-tutup]. Idempoten. */
let _modalTutupGlobalTerpasang = false;
export function pasangModalTutupGlobal() {
  if (_modalTutupGlobalTerpasang) return;
  _modalTutupGlobalTerpasang = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-modal-tutup]');
    if (b) modalTutup(b.dataset.modalTutup);
  });
}

/** Chip kecil berwarna. tipe: netral|ok|err|warn|info. */
export function chip(teks, tipe) {
  return `<span class="chip chip-${tipe || 'netral'}">${escape(teks)}</span>`;
}

/** Baris field untuk formulir. */
export function field(judul, isiHTML, petunjukHTML) {
  return `<div class="field"><label class="label">${escape(judul)}</label>${isiHTML}${petunjukHTML ? `<div class="petunjuk">${petunjukHTML}</div>` : ''}</div>`;
}

/** Tombol aksi baris tabel. */
export function tombolAksi(ikon, label, dataKey, dataVal, tipe) {
  return `<button class="btn btn-kecil ${tipe === 'err' ? 'btn-sekunder' : 'btn-ghost'} ikon-btn" data-${dataKey}="${escape(dataVal)}" title="${escape(label)}"><i data-lucide="${ikon}"></i></button>`;
}
