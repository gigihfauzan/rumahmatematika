// pdf.js — Generator PDF untuk laporan Tahap 5A & 5B (lembar kelas, paralel,
// rekap, siswa, grafik). Memakai jsPDF UMD (window.jspdf.jsPDF) + plugin
// autoTable (doc.autoTable). Font bawaan 'times' (serif) — Tinos binary tidak
// dapat dibenamkan di env GitHub Pages statis ini; "≥" diganti ">=" (lihat
// layout.js::gePakan) sebagai workaround. Pakai escape HTML tidak relevan di
// PDF; kita bersihkan karakter non-WinAnsi manual.
//
// Catatan limitation:
// - Rotasi teks header slot 90° TIDAK didukung autoTable → gunakan singkatan
//   horizontal 1 baris.
// - Style sel terbatas pada fillColor / textColor / fontStyle / halign / valign.
// - Logo via addImage(dataURI) — format JPEG/PNG/base64 otomatis dideteksi jsPDF.
import {
  fmtNilai, fmtRata, fmtPersen, gePakan, bangunKop,
  bangunLembarKelas, bangunParalel, bangunRekap, bangunSiswa,
  normalisasiOsi
} from './layout.js';

// Akses jsPDF & autoTable dari window (UMD).
function jsPDF(opsi) {
  const j = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF);
  if (!j) throw new Error('Pustaka jsPDF tidak tersedia di window.');
  return new j(opsi);
}

/** Ukuran kertas mm (portrait): A4 dan F4 (folio). */
function ukuranKertas(kertas) {
  if (kertas === 'F4') return [215, 330];
  return [210, 297]; // A4
}

/** Bersihkan karakter yang tidak disandikan WinAnsi (font bawaan jsPDF). */
function bersihTeks(s) {
  return String(s == null ? '' : s)
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/–/g, '-')   // en-dash → hyphen
    .replace(/—/g, '-')
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/…/g, '...');
}

// =========================== FUNGSI UNDUH UTAMA ===========================

/**
 * Unduh lembar kelas sebagai PDF.
 * @param {Object} data  respons `lembar_kelas` (data mesin)
 * @param {Object} opsi  {kertas, orientasi, tanggal_dokumen, tampilkan_logo, tampilkan_varian_tag, nomor_halaman, tanda_belum_final, format:'pdf', formatTanggalPola}
 * @param {string} namaFile  nama berkas .pdf
 */
export async function unduhPdfLembarKelas(data, opsi, namaFile) {
  const hal = bangunLembarKelas(data, { ...opsi, format: 'pdf' });
  const doc = siapkanDoc(hal.opsi);
  let halamanKe = 1;
  gambarKop(doc, hal.kop);
  if (hal.opsi.tanda_belum_final) gambarBelumFinal(doc);
  gambarTabelLembar(doc, hal, 'kelas', (d) => {
    // didDrawPage: tiap halaman baru → kop + footer ulang.
    if (d.pageNumber > 1) {
      gambarKop(doc, hal.kop);
      if (hal.opsi.tanda_belum_final) gambarBelumFinal(doc);
    }
    halamanKe = Math.max(halamanKe, d.pageNumber);
  });
  gambarTandaTangan(doc, hal.tanda_tangan, hal.opsi);
  if (hal.opsi.nomor_halaman) tulisNomorHalaman(doc);
  simpanDoc(doc, namaFile);
}

/** Unduh lembar paralel sebagai PDF. */
export async function unduhPdfParalel(data, opsi, namaFile) {
  const hal = bangunParalel(data, { ...opsi, format: 'pdf' });
  const doc = siapkanDoc(hal.opsi);
  gambarKop(doc, hal.kop);
  if (hal.opsi.tanda_belum_final) gambarBelumFinal(doc);
  gambarTabelLembar(doc, hal, 'paralel', (d) => {
    if (d.pageNumber > 1) {
      gambarKop(doc, hal.kop);
      if (hal.opsi.tanda_belum_final) gambarBelumFinal(doc);
    }
  });
  gambarTandaTangan(doc, hal.tanda_tangan, hal.opsi);
  if (hal.opsi.nomor_halaman) tulisNomorHalaman(doc);
  simpanDoc(doc, namaFile);
}

/**
 * Unduh MULTI lembar kelas sebagai SATU PDF — satu kelas per halaman (addPage
 * antar kelas). Setiap kelas: kop + tabel + statistik + tanda tangan.
 * @param {Array<Object>} daftarData  array respons `lembar_kelas`
 * @param {Object} opsi
 * @param {string} namaFile
 */
export async function unduhPdfLembarKelasMulti(daftarData, opsi, namaFile) {
  if (!daftarData || !daftarData.length) {
    throw new Error('Tidak ada data lembar kelas untuk diunduh.');
  }
  const halPertama = bangunLembarKelas(daftarData[0], { ...opsi, format: 'pdf' });
  const doc = siapkanDoc(halPertama.opsi);
  let halKe = 1;
  for (let i = 0; i < daftarData.length; i++) {
    const hal = bangunLembarKelas(daftarData[i], { ...opsi, format: 'pdf' });
    if (i > 0) {
      doc.addPage(ukuranKertas(hal.opsi.kertas), hal.opsi.orientasi);
      halKe++;
    }
    gambarKop(doc, hal.kop);
    if (hal.opsi.tanda_belum_final) gambarBelumFinal(doc);
    gambarTabelLembar(doc, hal, 'kelas', (d) => {
      if (d.pageNumber > halKe) {
        gambarKop(doc, hal.kop);
        if (hal.opsi.tanda_belum_final) gambarBelumFinal(doc);
        halKe = d.pageNumber;
      }
    });
    gambarTandaTangan(doc, hal.tanda_tangan, hal.opsi);
  }
  if (halPertama.opsi.nomor_halaman) tulisNomorHalaman(doc);
  simpanDoc(doc, namaFile);
}

/** Unduh rekap sebagai PDF (landscape default). */
export async function unduhPdfRekap(data, opsi, namaFile) {
  // Rekap selalu landscape.
  const hal = bangunRekap(data, { ...opsi, format: 'pdf', orientasi: 'landscape' });
  const doc = siapkanDoc(hal.opsi);
  gambarKop(doc, hal.kop);
  if (hal.opsi.tanda_belum_final) gambarBelumFinal(doc);
  gambarTabelRekap(doc, hal, (d) => {
    if (d.pageNumber > 1) {
      gambarKop(doc, hal.kop);
      if (hal.opsi.tanda_belum_final) gambarBelumFinal(doc);
    }
  });
  gambarTandaTangan(doc, hal.tanda_tangan, hal.opsi);
  if (hal.opsi.nomor_halaman) tulisNomorHalaman(doc);
  simpanDoc(doc, namaFile);
}

/**
 * Unduh laporan hasil per siswa sebagai PDF — satu halaman per siswa.
 * @param {Array<Object>} daftar  array laporanSiswa
 * @param {Object} opsi
 * @param {string} namaFile
 */
export async function unduhPdfSiswa(daftar, opsi, namaFile) {
  const o = normalisasiOsi({ ...opsi, format: 'pdf' });
  const doc = siapkanDoc(o);
  let halKe = 1;
  for (let i = 0; i < daftar.length; i++) {
    const hal = bangunSiswa(daftar[i], o);
    if (hal.kosong) {
      // Lewati siswa tidak terdaftar (jarang terjadi — frontend sudah menyaring).
      continue;
    }
    if (i > 0) {
      doc.addPage(ukuranKertas(o.kertas), o.orientasi);
      halKe++;
    }
    gambarKop(doc, hal.kop);
    if (o.tanda_belum_final) gambarBelumFinal(doc);
    gambarHalamanSiswa(doc, hal, o, (d) => {
      if (d.pageNumber > halKe) {
        gambarKop(doc, hal.kop);
        if (o.tanda_belum_final) gambarBelumFinal(doc);
        halKe = d.pageNumber;
      }
    });
    // Tanda tangan: paraf wali (kiri) + kepsek (kanan) dengan tempat/tanggal.
    gambarTandaTangan(doc, hal.tanda_tangan, o);
    if (o.nomor_halaman) tulisNomorHalaman(doc);
  }
  simpanDoc(doc, namaFile);
}

/**
 * Unduh PDF berisi satu atau beberapa canvas Chart.js (landscape).
 * @param {Array<{canvas:HTMLCanvasElement, judul:string}>} canvasList
 * @param {Object} opsi {kertas, judul_dokumen, sub_judul, kop}
 */
export async function unduhPdfGrafik(canvasList, opsi, namaFile) {
  const o = normalisasiOsi({ ...opsi, format: 'pdf', orientasi: 'landscape' });
  const doc = siapkanDoc(o);
  const lebar = doc.internal.pageSize.getWidth();
  const tinggi = doc.internal.pageSize.getHeight();
  const margin = 12;
  for (let i = 0; i < canvasList.length; i++) {
    const it = canvasList[i];
    if (i > 0) doc.addPage(ukuranKertas(o.kertas), 'landscape');
    let y = margin;
    if (o.kop && (o.kop.judul || o.kop.sub)) {
      doc.setFont('times', 'bold'); doc.setFontSize(13);
      doc.text(bersihTeks(o.kop.judul || ''), lebar / 2, y, { align: 'center' }); y += 6;
      if (o.kop.sub) {
        doc.setFont('times', 'normal'); doc.setFontSize(11);
        doc.text(bersihTeks(o.kop.sub), lebar / 2, y, { align: 'center' }); y += 5;
      }
    }
    doc.setFont('times', 'bold'); doc.setFontSize(12);
    doc.text(bersihTeks(it.judul || ''), margin, y + 2);
    y += 8;
    // Sisipkan gambar canvas: skala agar muat dalam area tersisa.
    const areaW = lebar - margin * 2;
    const areaH = tinggi - y - margin;
    const dataUrl = it.canvas.toDataURL('image/png');
    const ratio = it.canvas.width / it.canvas.height;
    let w = areaW, h = w / ratio;
    if (h > areaH) { h = areaH; w = h * ratio; }
    const x = (lebar - w) / 2;
    try {
      doc.addImage(dataUrl, 'PNG', x, y, w, h);
    } catch (e) {
      doc.text('Gagal menyisipkan gambar grafik: ' + String(e.message || e), margin, y + 5);
    }
    if (o.nomor_halaman) tulisNomorHalaman(doc);
  }
  simpanDoc(doc, namaFile);
}

// =========================== INTERNAL: SETUP & KOP ===========================

function siapkanDoc(o) {
  const fmt = ukuranKertas(o.kertas);
  return jsPDF({
    orientation: o.orientasi === 'landscape' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: fmt,
    putOnlyUsedFonts: true
  });
}

function simpanDoc(doc, namaFile) {
  doc.save(namaFile || 'laporan.pdf');
}

/**
 * Gambar kop di atas halaman saat ini: logo kiri (opsi), baris instansi/sekolah/
 * alamat/kontak tengah, judul + sub di bawah kop. Garis pemisah bawah kop.
 * @returns y setelah kop (untuk melanjutkan tabel).
 */
function gambarKop(doc, kop) {
  if (!kop) return;
  const lebar = doc.internal.pageSize.getWidth();
  const margin = 12;
  const cx = lebar / 2;
  let y = 14;
  const logo = kop.logo_datauri;
  let logoH = 0;
  if (logo) {
    try {
      // Logo ukuran kecil 18mm; di kiri atas.
      doc.addImage(logo, 'JPEG', margin, 10, 18, 18, undefined, 'FAST');
      logoH = 18;
    } catch (e) {
      // Mungkin PNG; coba lagi tanpa paksa format.
      try { doc.addImage(logo, 'PNG', margin, 10, 18, 18); logoH = 18; }
      catch (e2) { /* abaikan logo rusak */ }
    }
  }
  // Baris kop (instansi → sekolah → alamat → kontak).
  doc.setFont('times', 'normal');
  const baris = kop.baris || [];
  baris.forEach((b, i) => {
    if (i === 0 && baris.length > 1) {
      // Baris pertama (instansi) — huruf kecil kapital, ukuran 9.
      doc.setFontSize(9);
      doc.text(bersihTeks(String(b).toUpperCase()), cx, y, { align: 'center' });
    } else if (i === 1) {
      // Nama sekolah — bold 13.
      doc.setFont('times', 'bold'); doc.setFontSize(13);
      doc.text(bersihTeks(b), cx, y, { align: 'center' });
      doc.setFont('times', 'normal');
    } else {
      doc.setFontSize(9);
      doc.text(bersihTeks(b), cx, y, { align: 'center' });
    }
    y += 4.6;
  });
  if (logoH > 0 && y < 10 + logoH + 2) y = 10 + logoH + 2;
  // Judul dokumen + sub.
  if (kop.judul) {
    y += 2;
    doc.setFont('times', 'bold'); doc.setFontSize(13);
    doc.text(bersihTeks(kop.judul), cx, y, { align: 'center' });
    doc.setFont('times', 'normal');
    y += 5;
  }
  if (kop.sub) {
    doc.setFontSize(10);
    doc.text(bersihTeks(kop.sub), cx, y, { align: 'center' });
    y += 4.5;
  }
  // Garis pemisah.
  y += 1;
  doc.setDrawColor(0); doc.setLineWidth(0.4);
  doc.line(margin, y, lebar - margin, y);
  // Catat y akhir kop agar tabel mulai dari sana.
  doc._ySetelahKop = y + 4;
  return doc._ySetelahKop;
}

/** Tanda "BELUM FINAL" pojok kanan atas. */
function gambarBelumFinal(doc) {
  const lebar = doc.internal.pageSize.getWidth();
  doc.setFont('times', 'bold'); doc.setFontSize(9);
  doc.setTextColor(180, 0, 0);
  doc.text('BELUM FINAL', lebar - 12, 8, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

/** Nomor halaman kecil di bawah tengah. */
function tulisNomorHalaman(doc) {
  const lebar = doc.internal.pageSize.getWidth();
  const tinggi = doc.internal.pageSize.getHeight();
  const n = doc.internal.getNumberOfPages();
  doc.setFont('times', 'normal'); doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.text('Halaman ' + i + ' dari ' + n, lebar / 2, tinggi - 6, { align: 'center' });
  }
  doc.setTextColor(0, 0, 0);
}

// =========================== INTERNAL: TABEL LEMBAR ===========================

/**
 * Gambar tabel lembar (kelas atau paralel). autoTable dipakai dengan head
 * berulang per halaman. Baris statistik di foot.
 */
function gambarTabelLembar(doc, hal, mode, onSetiapHalaman) {
  const o = hal.opsi;
  const margin = 12;
  const startY = doc._ySetelahKop || 30;

  // Susun head.
  const headSlot = hal.header.kolom_slot.map(k => bersihTeks(k.singkatan || k.kode));
  const head = mode === 'kelas'
    ? ['No', 'Nama', ...headSlot, 'Jml', 'Rata', ...(o.tampilkan_peringkat ? ['Per. Kelas', 'Per. Paralel'] : []), 'Ket']
    : ['No', 'Nama', 'Kelas', ...headSlot, 'Jml', 'Rata', ...(o.tampilkan_peringkat ? ['Per. Paralel'] : [])];

  // Susun body.
  const body = hal.baris.map(b => {
    const selNilai = b.nilai.map(np => {
      const teks = fmtNilai(np.nilai);
      const tag = np.varian_tag ? ' ' + np.varian_tag : '';
      const isi = teks === '–' ? '–' : teks + tag;
      // Di bawah KKTP: warna merah + tanda bintang.
      const styles = np.di_bawah ? { textColor: [180, 0, 0], fontStyle: 'normal' } : {};
      return { content: bersihTeks(isi), styles };
    });
    const selJml = b.jumlah === null ? { content: '–' } : { content: bersihTeks(fmtNilai(b.jumlah)) };
    const selRata = b.rata === null ? { content: '–' } : { content: bersihTeks(fmtRata(b.rata)) };
    const tail = [];
    if (mode === 'kelas') {
      if (o.tampilkan_peringkat) {
        tail.push({ content: b.pk === null ? '–' : String(b.pk) });
        tail.push({ content: b.pp === null ? '–' : String(b.pp) });
      }
      // Keterangan.
      let ket = '';
      if (!b.ada_nilai) ket = 'belum ada';
      else if (!b.lengkap) ket = 'belum lengkap';
      else ket = 'lengkap';
      tail.push({ content: ket });
    } else {
      if (o.tampilkan_peringkat) {
        tail.push({ content: b.pp === null ? '–' : String(b.pp) });
      }
    }
    const namaCell = { content: bersihTeks(b.nama), styles: { cellWidth: 40, halign: 'left' } };
    const awal = mode === 'kelas'
      ? [{ content: String(b.no), styles: { halign: 'center' } }, namaCell]
      : [{ content: String(b.no), styles: { halign: 'center' } }, namaCell,
         { content: bersihTeks(b.nama_kelas || ''), styles: { cellWidth: 16, halign: 'center' } }];
    return [...awal, ...selNilai, selJml, selRata, ...tail];
  });

  // Foot: baris statistik Rata/Tertinggi/Terendah/Tuntas.
  const foot = susunanFootLembar(hal, mode, o);

  // ColumnStyles: No & Nama & tail; slot default.
  const colStyles = {};
  colStyles[0] = { cellWidth: 8, halign: 'center' };
  if (mode === 'kelas') {
    colStyles[1] = { cellWidth: 40 };
    const awal = 2 + hal.header.kolom_slot.length; // setelah slot
    colStyles[awal] = { cellWidth: 12, halign: 'center' };        // Jml
    colStyles[awal + 1] = { cellWidth: 14, halign: 'center' };    // Rata
    if (o.tampilkan_peringkat) {
      colStyles[awal + 2] = { cellWidth: 14, halign: 'center' };  // Per. Kelas
      colStyles[awal + 3] = { cellWidth: 14, halign: 'center' };  // Per. Paralel
      colStyles[awal + 4] = { cellWidth: 22, halign: 'center' };  // Ket
    } else {
      colStyles[awal + 2] = { cellWidth: 24, halign: 'center' };  // Ket
    }
  } else {
    colStyles[1] = { cellWidth: 38 };
    colStyles[2] = { cellWidth: 16, halign: 'center' };
    const awal = 3 + hal.header.kolom_slot.length;
    colStyles[awal] = { cellWidth: 12, halign: 'center' };
    colStyles[awal + 1] = { cellWidth: 14, halign: 'center' };
    if (o.tampilkan_peringkat) colStyles[awal + 2] = { cellWidth: 16, halign: 'center' };
  }

  doc.autoTable({
    startY,
    head: [head],
    body,
    foot,
    // margin.top = 38 agar pada halaman pecah, tabel mulai di bawah kop yang
    // digambar ulang oleh didDrawPage (kop ±32mm + jarak).
    margin: { left: margin, right: margin, top: 38, bottom: 22 },
    headStyles: {
      fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold',
      halign: 'center', lineColor: 100, lineWidth: 0.1, fontSize: 8
    },
    bodyStyles: { textColor: 0, fontSize: 8, lineColor: 200, lineWidth: 0.05 },
    footStyles: {
      fillColor: [248, 248, 248], textColor: 0, fontStyle: 'bold',
      halign: 'center', fontSize: 7.5, lineColor: 200, lineWidth: 0.05
    },
    columnStyles: colStyles,
    showHead: 'everyPage',
    showFoot: 'lastPage',
    tableLineColor: 120, tableLineWidth: 0.1,
    didDrawPage: (data) => { if (onSetiapHalaman) onSetiapHalaman(data); }
  });
}

/** Susun baris foot (statistik) untuk lembar kelas/paralel. */
function susunanFootLembar(hal, mode, o) {
  const headSlot = hal.header.kolom_slot;
  const prefix = mode === 'kelas'
    ? (o.tampilkan_peringkat ? ['', ''] : [''])
    : (o.tampilkan_peringkat ? ['', '', ''] : ['', '']);
  const tailKelas = o.tampilkan_peringkat ? ['', '', '', '', ''] : ['', '', ''];
  const tailParalel = o.tampilkan_peringkat ? ['', '', ''] : ['', ''];

  function baris(judul, getter) {
    const awal = prefix.map(() => ({ content: judul, styles: { fontStyle: 'bold', halign: 'left' } }));
    // Perbaiki: judul menempati kolom nama pertama, kolom sisanya kosong sampai slot.
    const cells = [];
    if (mode === 'kelas') {
      cells.push({ content: '', styles: { fontStyle: 'bold' } }); // No
      cells.push({ content: judul, styles: { fontStyle: 'bold', halign: 'left' } }); // Nama
    } else {
      cells.push({ content: '', styles: { fontStyle: 'bold' } });
      cells.push({ content: judul, styles: { fontStyle: 'bold', halign: 'left' } });
      cells.push({ content: '', styles: {} }); // Kelas
    }
    headSlot.forEach(sl => {
      const st = hal.statistik.per_slot.find(x => x.kode === sl.kode) || {};
      cells.push({ content: bersihTeks(getter(st)), styles: { halign: 'center' } });
    });
    const tail = mode === 'kelas' ? tailKelas.map(() => ({ content: '' })) : tailParalel.map(() => ({ content: '' }));
    return [...cells, ...tail];
  }

  return [
    baris('Rata-rata', st => fmtRata(st.rata)),
    baris('Tertinggi', st => fmtNilai(st.tertinggi)),
    baris('Terendah', st => fmtNilai(st.terendah)),
    baris('Tuntas', st => (st.tuntas || 0) + '/' + (st.terisi || 0))
  ];
}

// =========================== INTERNAL: TABEL REKAP ===========================

function gambarTabelRekap(doc, hal, onSetiapHalaman) {
  const o = hal.opsi;
  const margin = 12;
  let y = doc._ySetelahKop || 30;

  // Untuk tiap blok tingkat: judul blok + tabel slot×stat.
  hal.blok.forEach((bt, idx) => {
    if (idx > 0) {
      // Tambah halaman baru per blok agar tidak terpotong ganjil.
      doc.addPage(ukuranKertas(o.kertas), 'landscape');
      if (onSetiapHalaman) onSetiapHalaman({ pageNumber: doc.internal.getNumberOfPages() });
      // Reset y ke bawah kop yang baru digambar.
      y = doc._ySetelahKop || 30;
    }
    // Judul blok.
    doc.setFont('times', 'bold'); doc.setFontSize(11);
    doc.text('Tingkat ' + bersihTeks(String(bt.tingkat)), margin, y);
    y += 4;

    // Tabel: baris = slot (utama + varian), kolom = [Nama, KKTP, Terisi, Rata, Tinggi, Rendah, Tuntas, Belum, %].
    const head = [['Mata Pelajaran', 'KKTP', 'Terisi', 'Rata-rata', 'Tertinggi', 'Terendah', 'Tuntas', 'Belum', '% Tuntas']];
    const body = [];
    bt.slot.forEach(sl => {
      body.push([
        { content: bersihTeks(sl.nama) + (sl.multi ? ' *' : ''), styles: { fontStyle: 'bold', halign: 'left' } },
        { content: String(sl.kktp || 0), styles: { halign: 'center' } },
        { content: String(sl.terisi || 0), styles: { halign: 'center' } },
        { content: bersihTeks(fmtRata(sl.rata)), styles: { halign: 'center' } },
        { content: bersihTeks(fmtNilai(sl.tertinggi)), styles: { halign: 'center' } },
        { content: bersihTeks(fmtNilai(sl.terendah)), styles: { halign: 'center' } },
        { content: String(sl.tuntas || 0), styles: { halign: 'center' } },
        { content: String(sl.belum_tuntas || 0), styles: { halign: 'center' } },
        { content: bersihTeks(fmtPersen(sl.persen_tuntas)), styles: { halign: 'center' } }
      ]);
      (sl.baris_varian || []).forEach(v => {
        body.push([
          { content: '   ↳ ' + bersihTeks(v.nama), styles: { halign: 'left', fontSize: 7.5, textColor: [80, 80, 80] } },
          { content: String(v.kktp || 0), styles: { halign: 'center', fontSize: 7.5, textColor: [80, 80, 80] } },
          { content: String(v.terisi || 0), styles: { halign: 'center', fontSize: 7.5, textColor: [80, 80, 80] } },
          { content: bersihTek(fmtRata(v.rata)), styles: { halign: 'center', fontSize: 7.5, textColor: [80, 80, 80] } },
          { content: bersihTek(fmtNilai(v.tertinggi)), styles: { halign: 'center', fontSize: 7.5, textColor: [80, 80, 80] } },
          { content: bersihTek(fmtNilai(v.terendah)), styles: { halign: 'center', fontSize: 7.5, textColor: [80, 80, 80] } },
          { content: String(v.tuntas || 0), styles: { halign: 'center', fontSize: 7.5, textColor: [80, 80, 80] } },
          { content: String(v.belum_tuntas || 0), styles: { halign: 'center', fontSize: 7.5, textColor: [80, 80, 80] } },
          { content: bersihTek(fmtPersen(v.persen_tuntas)), styles: { halign: 'center', fontSize: 7.5, textColor: [80, 80, 80] } }
        ]);
      });
    });

    doc.autoTable({
      startY: y,
      head,
      body,
      margin: { left: margin, right: margin, top: 38, bottom: 20 },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold', halign: 'center', fontSize: 8 },
      bodyStyles: { textColor: 0, fontSize: 8, lineColor: 200, lineWidth: 0.05 },
      columnStyles: {
        0: { cellWidth: 60, halign: 'left' },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 22, halign: 'center' },
        6: { cellWidth: 20, halign: 'center' },
        7: { cellWidth: 20, halign: 'center' },
        8: { cellWidth: 22, halign: 'center' }
      },
      showHead: 'everyPage',
      didDrawPage: (data) => { if (onSetiapHalaman) onSetiapHalaman(data); }
    });
    y = doc.lastAutoTable.finalY + 6;
  });

  // Perbandingan rombel (heatmap-like) sebagai tabel ringkas setelah blok.
  if (hal.rombel && hal.rombel.length) {
    hal.rombel.forEach(bt => {
      if (!bt.kelas || !bt.kelas.length) return;
      doc.addPage(ukuranKertas(o.kertas), 'landscape');
      if (onSetiapHalaman) onSetiapHalaman({ pageNumber: doc.internal.getNumberOfPages() });
      doc.setFont('times', 'bold'); doc.setFontSize(11);
      doc.text('Perbandingan Antar Rombel — Tingkat ' + bersihTeks(String(bt.tingkat)), margin, 22);
      const slotHead = hal.slot.map(s => bersihTeks(s.singkatan || s.kode));
      const head = [['Kelas', ...slotHead, 'Rata-rata']];
      const body = bt.kelas.map(k => {
        const nilai = k.slot_rata.map(sr => bersihTek(sr.rata === null ? '–' : fmtRata(sr.rata)));
        // Rata-rata kelas dihitung dari slot_rata yang ada (frontend ringkas; tidak
        // dipakai sebagai angka resmi, hanya tampilan tambahan).
        const ada = k.slot_rata.filter(sr => sr.rata !== null).map(sr => Number(sr.rata));
        const rataKelas = ada.length ? (ada.reduce((a, b) => a + b, 0) / ada.length).toFixed(2) : '–';
        return [{ content: bersihTeks(k.nama_kelas), styles: { halign: 'left', fontStyle: 'bold' } },
                ...nilai.map(n => ({ content: n, styles: { halign: 'center' } })),
                { content: rataKelas, styles: { halign: 'center', fontStyle: 'bold' } }];
      });
      doc.autoTable({
        startY: 26,
        head, body,
        margin: { left: margin, right: margin, top: 38, bottom: 20 },
        headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', halign: 'center', fontSize: 8 },
        bodyStyles: { textColor: 0, fontSize: 8, lineColor: 200, lineWidth: 0.05 },
        showHead: 'everyPage'
      });
    });
  }
}

// Alias singkat agar tidak lupa pemanggilan helper.
function bersihTek(s) { return bersihTeks(s); }

// =========================== INTERNAL: HALAMAN SISWA ===========================

function gambarHalamanSiswa(doc, hal, o, onSetiapHalaman) {
  const margin = 12;
  const lebar = doc.internal.pageSize.getWidth();
  let y = doc._ySetelahKop || 30;

  // Blok identitas: dua kolom (label : nilai).
  doc.setFont('times', 'bold'); doc.setFontSize(11);
  doc.text(bersihTeks(hal.kop.judul || 'LAPORAN HASIL'), lebar / 2, y, { align: 'center' });
  y += 5;
  if (hal.kop.sub) {
    doc.setFont('times', 'normal'); doc.setFontSize(10);
    doc.text(bersihTeks(hal.kop.sub), lebar / 2, y, { align: 'center' });
    y += 5;
  }
  y += 2;

  const idn = hal.identitas;
  const pasangan = [
    ['Nama', idn.nama], ['NISN', idn.nisn], ['NIS', idn.nis],
    ['Kelas', idn.kelas], ['Tingkat', idn.tingkat ? String(idn.tingkat) : ''],
    ['Tahun Ajaran', idn.tahun_ajaran], ['Semester', idn.semester ? String(idn.semester) : ''],
    ['Kegiatan', idn.kegiatan]
  ].filter(p => p[1]);

  // Tabel identitas 2 kolom (label, nilai) — autoTable.
  const idBody = pasangan.map(p => [
    { content: bersihTeks(p[0]), styles: { fontStyle: 'bold', cellWidth: 40 } },
    { content: bersihTeks(String(p[1])), styles: { cellWidth: 100 } }
  ]);
  doc.autoTable({
    startY: y,
    body: idBody,
    margin: { left: margin, right: margin },
    theme: 'plain',
    bodyStyles: { fontSize: 9, textColor: 0 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 100 } }
  });
  y = doc.lastAutoTable.finalY + 6;

  // Tabel slot: No, Mata Pelajaran, Nilai, KKTP, Keterangan, [Rata Kelas, Rata Tingkat].
  const head = hal.ringkasan.tampilkan_pembanding
    ? ['No', 'Mata Pelajaran', 'Nilai', 'KKTP', 'Keterangan', 'Rata Kelas', 'Rata Tingkat']
    : ['No', 'Mata Pelajaran', 'Nilai', 'KKTP', 'Keterangan'];
  const body = hal.slot.map((s, i) => {
    const sel = [
      { content: String(i + 1), styles: { halign: 'center' } },
      { content: bersihTeks(s.nama_mapel), styles: { halign: 'left' } },
      { content: bersihTeks(fmtNilai(s.nilai)), styles: { halign: 'center', ...(s.di_bawah ? { textColor: [180, 0, 0] } : {}) } },
      { content: String(s.kktp || 0), styles: { halign: 'center' } },
      { content: bersihTeks(s.keterangan), styles: { halign: 'center', ...(s.di_bawah ? { textColor: [180, 0, 0] } : {}) } }
    ];
    if (hal.ringkasan.tampilkan_pembanding) {
      sel.push({ content: bersihTeks(fmtRata(s.rata_kelas)), styles: { halign: 'center' } });
      sel.push({ content: bersihTeks(fmtRata(s.rata_tingkat)), styles: { halign: 'center' } });
    }
    return sel;
  });
  doc.autoTable({
    startY: y,
    head: [head],
    body,
    margin: { left: margin, right: margin, top: 38, bottom: 22 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', halign: 'center', fontSize: 9 },
    bodyStyles: { textColor: 0, fontSize: 9, lineColor: 200, lineWidth: 0.05 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 35, halign: 'center' }
    },
    showHead: 'everyPage',
    didDrawPage: (d) => { if (onSetiapHalaman) onSetiapHalaman(d); }
  });
  y = doc.lastAutoTable.finalY + 6;

  // Ringkasan.
  const r = hal.ringkasan;
  const ringkasan = [
    'Jumlah Nilai: ' + (r.jumlah === null ? '–' : fmtNilai(r.jumlah)),
    'Rata-rata: ' + (r.rata_rata === null ? '–' : fmtRata(r.rata_rata)),
    'Jumlah Belum Tuntas: ' + r.jumlah_belum_tuntas,
    'Jumlah Slot Kosong: ' + r.jumlah_kosong
  ];
  if (r.tampilkan_peringkat) {
    ringkasan.push('Peringkat Kelas: ' + (r.peringkat_kelas === null ? '–' : r.peringkat_kelas));
    ringkasan.push('Peringkat Paralel: ' + (r.peringkat_paralel === null ? '–' : r.peringkat_paralel));
  }
  doc.setFont('times', 'bold'); doc.setFontSize(10);
  doc.text('Ringkasan', margin, y); y += 5;
  doc.setFont('times', 'normal'); doc.setFontSize(9);
  ringkasan.forEach(t => {
    doc.text('• ' + bersihTeks(t), margin + 2, y);
    y += 4.5;
  });
  y += 3;

  // Catatan.
  if (hal.catatan && hal.catatan.length) {
    doc.setFont('times', 'italic'); doc.setFontSize(8.5);
    hal.catatan.forEach(c => {
      const lines = doc.splitTextToSize(bersihTeks(c), lebar - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 4;
    });
  }
}

// =========================== INTERNAL: TANDA TANGAN ===========================

/** Gambar blok tanda tangan di bawah area tabel. */
function gambarTandaTangan(doc, tt, o) {
  if (!tt) return;
  const lebar = doc.internal.pageSize.getWidth();
  const tinggi = doc.internal.pageSize.getHeight();
  const margin = 12;
  // Posisi y: bawah halaman (sisakan ~50mm untuk tanda tangan).
  const yAkhir = doc.lastAutoTable ? doc.lastAutoTable.finalY : (doc._ySetelahKop || 30);
  let y = Math.max(yAkhir + 16, tinggi - 56);

  // Reset font.
  doc.setFont('times', 'normal'); doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Blok kiri.
  if (tt.kiri && tt.kiri.nama) {
    const xKiri = margin + 8;
    if (tt.kiri.label) { doc.text(bersihTeks(tt.kiri.label), xKiri, y); y += 4; }
    if (tt.kiri.peran) { doc.text(bersihTeks(tt.kiri.peran), xKiri, y); y += 18; }
    doc.setLineWidth(0.3); doc.line(xKiri, y, xKiri + 60, y); y += 4;
    doc.setFont('times', 'bold');
    doc.text(bersihTeks(tt.kiri.nama || ''), xKiri, y);
    doc.setFont('times', 'normal');
    if (tt.kiri.nip) { y += 4; doc.text('NIP. ' + bersihTeks(tt.kiri.nip), xKiri, y); }
  }
  // Blok kanan.
  if (tt.kanan && tt.kanan.nama) {
    let yK = Math.max(yAkhir + 16, tinggi - 56);
    const xKanan = lebar - margin - 60 - 8;
    if (tt.kanan.label) { doc.text(bersihTeks(tt.kanan.label), xKanan, yK); yK += 4; }
    if (tt.kanan.tempat_tanggal) {
      doc.text(bersihTeks(tt.kanan.tempat_tanggal), xKanan, yK); yK += 4;
    }
    if (tt.kanan.peran) { doc.text(bersihTeks(tt.kanan.peran), xKanan, yK); yK += 18; }
    doc.setLineWidth(0.3); doc.line(xKanan, yK, xKanan + 60, yK); yK += 4;
    doc.setFont('times', 'bold');
    doc.text(bersihTeks(tt.kanan.nama || ''), xKanan, yK);
    doc.setFont('times', 'normal');
    if (tt.kanan.nip) { yK += 4; doc.text('NIP. ' + bersihTeks(tt.kanan.nip), xKanan, yK); }
  }
}

// Ekspor helper untuk pratinjau HTML (dipakai halaman laporan).
export { bersihTeks };
