// excel.js — Generator Excel untuk laporan Tahap 5A & 5B (lembar kelas, paralel,
// rekap, siswa, grafik). Memakai SheetJS community (XLSX.utils.*) yang dimuat
// langsung dari CDN (sama seperti js/excel.js, versi dipatok 0.18.5).
//
// Catatan limitation (SheetJS community):
// - Style penuh (border/fill/bold/font size) TIDAK didukung. Hanya `!merges`
//   (merge sel), `!cols` (lebar kolom), `!rows` (tinggi baris), dan tipe sel
//   `t:'n'|'s'|'b'`. Untuk meniru "header tebal", kita andalkan keterangan di
//   README bahwa pembaca harus menerapkan style manual jika perlu.
// - Page setup (orientasi/margin/ukuran kertas) TIDAK didukung community.
// - Sisipan gambar (logo, grafik canvas) TIDAK didukung community. Sebagai ganti:
//   • Logo → dilewati (kop tetap memakai baris teks).
//   • Grafik → ditulis sebagai tabel data pada lembar khusus.
// - Nilai di bawah KKTP: ditulis sebagai angka sungguhan tanpa rumus; tanda
//   ditampilkan lewat kolom "Ket" atau sel terpisah (warna tidak didukung).
// - Karakter "≥" Unicode tetap dipakai (UTF-8 didukung SheetJS).
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';
import {
  fmtNilai, fmtRata, fmtPersen, gePakan,
  bangunLembarKelas, bangunParalel, bangunRekap, bangunSiswa,
  normalisasiOsi
} from './layout.js';

// =========================== FUNGSI UNDUH UTAMA ===========================

/**
 * Unduh lembar kelas sebagai Excel: satu lembar kerja per kelas.
 * @param {Object} data  respons `lembar_kelas` (data mesin, satu kelas)
 * @param {Object} opsi
 * @param {string} namaFile
 */
export function unduhExcelLembarKelas(data, opsi, namaFile) {
  const hal = bangunLembarKelas(data, { ...opsi, format: 'excel' });
  const wb = XLSX.utils.book_new();
  const namaSheet = namaSheetLembar(hal.kelas);
  const ws = tulisLembarKelasSheet(hal);
  XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  XLSX.writeFile(wb, namaFile);
}

/** Unduh lembar paralel sebagai Excel: satu lembar per tingkat. */
export function unduhExcelParalel(data, opsi, namaFile) {
  const hal = bangunParalel(data, { ...opsi, format: 'excel' });
  const wb = XLSX.utils.book_new();
  const namaSheet = namaSheetAman('TINGKAT ' + (hal.tingkat || '-'));
  const ws = tulisLembarParalelSheet(hal);
  XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  XLSX.writeFile(wb, namaFile);
}

/**
 * Unduh MULTI lembar kelas sebagai SATU workbook Excel — satu lembar kerja per
 * kelas (nama sheet = nama kelas).
 * @param {Array<Object>} daftarData  array respons `lembar_kelas`
 * @param {Object} opsi
 * @param {string} namaFile
 */
export function unduhExcelLembarKelasMulti(daftarData, opsi, namaFile) {
  if (!daftarData || !daftarData.length) {
    throw new Error('Tidak ada data lembar kelas untuk diunduh.');
  }
  const wb = XLSX.utils.book_new();
  const usedNames = new Set();
  daftarData.forEach(data => {
    const hal = bangunLembarKelas(data, { ...opsi, format: 'excel' });
    const ws = tulisLembarKelasSheet(hal);
    // Hindari nama sheet duplikat (tambah akhiran jika perlu).
    let namaSheet = namaSheetLembar(hal.kelas);
    let i = 1;
    while (usedNames.has(namaSheet)) {
      const s = ' ' + String(i);
      namaSheet = namaSheetAman((hal.kelas.nama_kelas || 'KELAS') + s);
      i++;
    }
    usedNames.add(namaSheet);
    XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  });
  XLSX.writeFile(wb, namaFile);
}

/** Unduh rekap sebagai Excel: satu lembar per blok tingkat + lembar ringkas sekolah. */
export function unduhExcelRekap(data, opsi, namaFile) {
  const hal = bangunRekap(data, { ...opsi, format: 'excel', orientasi: 'landscape' });
  const wb = XLSX.utils.book_new();

  // Lembar ringkas sekolah (statistik per slot seluruh sekolah).
  if (hal.per_sekolah && hal.per_sekolah.length) {
    const wsSek = tulisRingkasSekolahSheet(hal);
    XLSX.utils.book_append_sheet(wb, wsSek, 'RINGKASAN SEKOLAH');
  }
  // Satu lembar per tingkat.
  hal.blok.forEach(bt => {
    const namaSheet = namaSheetAman('TINGKAT ' + bt.tingkat);
    const ws = tulisRekapSheet(hal, bt);
    XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  });
  // Lembar perbandingan rombel.
  if (hal.rombel && hal.rombel.length) {
    hal.rombel.forEach(bt => {
      if (!bt.kelas || !bt.kelas.length) return;
      const namaSheet = namaSheetAman('ROMBEL TKT ' + bt.tingkat);
      const ws = tulisRombelSheet(hal, bt);
      XLSX.utils.book_append_sheet(wb, ws, namaSheet);
    });
  }
  XLSX.writeFile(wb, namaFile);
}

/**
 * Unduh laporan hasil per siswa sebagai Excel: satu lembar per siswa.
 * @param {Array<Object>} daftar  array laporanSiswa
 */
export function unduhExcelSiswa(daftar, opsi, namaFile) {
  const o = normalisasiOsi({ ...opsi, format: 'excel' });
  const wb = XLSX.utils.book_new();
  let n = 0;
  daftar.forEach(lap => {
    const hal = bangunSiswa(lap, o);
    if (hal.kosong) return;
    n++;
    const namaSheet = namaSheetAman(namaSheetSiswa(hal));
    const ws = tulisSiswaSheet(hal);
    XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  });
  if (n === 0) {
    // Lembar kosong supaya file tetap terbentuk.
    const ws = XLSX.utils.aoa_to_sheet([['Tidak ada laporan siswa untuk lingkup ini.']]);
    XLSX.utils.book_append_sheet(wb, ws, 'KOSONG');
  }
  XLSX.writeFile(wb, namaFile);
}

/**
 * Unduh grafik sebagai Excel. SheetJS community tidak mendukung sisipan gambar,
 * jadi kita tulis tabel data grafik (per tingkat: Mapel, Tertinggi, Terendah,
 * Rata-rata, Tuntas, Belum Tuntas) sebagai lembar kerja.
 * @param {Array<{judul:string, labels:string[], datasets:Array<{label:string,data:number[]}>}>} grafikList
 */
export function unduhExcelGrafikSisipan(grafikList, opsi, namaFile) {
  const wb = XLSX.utils.book_new();
  grafikList.forEach((g, i) => {
    const aoa = [];
    // Header: Mapel + nama dataset.
    const header = ['Mapel', ...(g.datasets || []).map(d => d.label || '')];
    aoa.push(header);
    const labels = g.labels || [];
    const panjang = Math.max(labels.length, ...(g.datasets || []).map(d => (d.data || []).length));
    for (let r = 0; r < panjang; r++) {
      const row = [labels[r] || ''];
      (g.datasets || []).forEach(d => {
        const v = (d.data || [])[r];
        row.push(v === null || v === undefined ? '' : Number(v));
      });
      aoa.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 24 }, ...(g.datasets || []).map(() => ({ wch: 14 }))];
    const namaSheet = namaSheetAman('GRAFIK ' + (i + 1));
    XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  });
  XLSX.writeFile(wb, namaFile);
}

// =========================== INTERNAL: NAMA SHEET ===========================

/** Bersihkan karakter invalid untuk nama sheet Excel. Maks 31 karakter. */
function namaSheetAman(s) {
  return String(s == null ? '' : s)
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'SHEET';
}

/** Nama sheet untuk lembar kelas (mis. "VII A"). */
function namaSheetLembar(kls) {
  const t = kls && kls.nama_kelas ? kls.nama_kelas : 'KELAS';
  return namaSheetAman(t);
}

/** Nama sheet untuk laporan siswa (mis. "Andi - VII A"). */
function namaSheetSiswa(hal) {
  const idn = hal.identitas || {};
  const nama = idn.nama || 'SISWA';
  const kelas = idn.kelas ? ' - ' + idn.kelas : '';
  return namaSheetAman(nama + kelas);
}

// =========================== INTERNAL: KOP & MERGE ===========================

/** Tulis kop di array-of-arrays (aoa). Mengembalikan jumlah baris yang dipakai. */
function tulisKopKeAoa(aoa, kop, lebarKolomTotal) {
  // Baris instansi → sekolah → alamat → kontak → (judul) → (sub) → kosong.
  const mergeRanges = []; // [{r,c,...}] dalam koordinat sheet (r,c 0-based)
  let r = aoa.length;
  // Instansi: kapital.
  if (kop.baris[0]) {
    aoa.push([String(kop.baris[0]).toUpperCase(), ...Array(Math.max(0, lebarKolomTotal - 1)).fill('')]);
    mergeRanges.push({ s: { r, c: 0 }, e: { r, c: Math.max(0, lebarKolomTotal - 1) } });
    r++;
  }
  // Sekolah.
  if (kop.baris[1]) {
    aoa.push([String(kop.baris[1]), ...Array(Math.max(0, lebarKolomTotal - 1)).fill('')]);
    mergeRanges.push({ s: { r, c: 0 }, e: { r, c: Math.max(0, lebarKolomTotal - 1) } });
    r++;
  }
  // Alamat & kontak (boleh digabung 1 baris jika pendek).
  if (kop.baris[2]) {
    aoa.push([String(kop.baris[2]), ...Array(Math.max(0, lebarKolomTotal - 1)).fill('')]);
    mergeRanges.push({ s: { r, c: 0 }, e: { r, c: Math.max(0, lebarKolomTotal - 1) } });
    r++;
  }
  if (kop.baris[3]) {
    aoa.push([String(kop.baris[3]), ...Array(Math.max(0, lebarKolomTotal - 1)).fill('')]);
    mergeRanges.push({ s: { r, c: 0 }, e: { r, c: Math.max(0, lebarKolomTotal - 1) } });
    r++;
  }
  // Judul dokumen.
  if (kop.judul) {
    aoa.push([String(kop.judul), ...Array(Math.max(0, lebarKolomTotal - 1)).fill('')]);
    mergeRanges.push({ s: { r, c: 0 }, e: { r, c: Math.max(0, lebarKolomTotal - 1) } });
    r++;
  }
  // Sub.
  if (kop.sub) {
    aoa.push([String(kop.sub), ...Array(Math.max(0, lebarKolomTotal - 1)).fill('')]);
    mergeRanges.push({ s: { r, c: 0 }, e: { r, c: Math.max(0, lebarKolomTotal - 1) } });
    r++;
  }
  // Baris kosong pemisah.
  aoa.push(Array(lebarKolomTotal).fill(''));
  return { barisDipakai: (aoa.length - r) + 1 + 1, mergeRanges, rAkhir: aoa.length - 1 };
}

/** Pasang !merges & !cols pada ws. */
function pasangProps(ws, merges, cols, rows) {
  if (merges && merges.length) ws['!merges'] = merges;
  if (cols && cols.length) ws['!cols'] = cols;
  if (rows && rows.length) ws['!rows'] = rows;
}

// =========================== INTERNAL: LEMBAR KELAS ===========================

function tulisLembarKelasSheet(hal) {
  const slot = hal.header.kolom_slot;
  const tampilkanPeringkat = hal.opsi.tampilkan_peringkat;
  // Lebar kolom total: No, Nama, slot×N, Jml, Rata, Per.Kelas, Per.Paralel, Ket.
  const lebarKolomTotal = 2 + slot.length + 2 + (tampilkanPeringkat ? 3 : 0) + 1; // kelas: + ket
  const aoa = [];
  const { mergeRanges } = tulisKopKeAoa(aoa, hal.kop, lebarKolomTotal);

  // Baris info kelas & wali.
  const infoRow = ['Kelas', hal.kelas.nama_kelas || '-', '', '', 'Wali', hal.kelas.wali_nama || '-'];
  while (infoRow.length < lebarKolomTotal) infoRow.push('');
  aoa.push(infoRow);
  // Baris KKTP berlaku per slot.
  const kktpRow = ['KKTP', '', ''];
  slot.forEach(s => kktpRow.push('≥ ' + (s.kktp || 0)));
  while (kktpRow.length < lebarKolomTotal) kktpRow.push('');
  aoa.push(kktpRow);
  aoa.push(Array(lebarKolomTotal).fill('')); // pemisah

  // Header tabel.
  const headRow = ['No', 'Nama', ...slot.map(s => s.singkatan || s.kode), 'Jml', 'Rata'];
  if (tampilkanPeringkat) headRow.push('Per. Kelas', 'Per. Paralel');
  headRow.push('Ket');
  aoa.push(headRow);

  // Body.
  hal.baris.forEach(b => {
    const row = [b.no, b.nama];
    b.nilai.forEach(np => {
      if (np.nilai === null) row.push('');
      else row.push(Number(np.nilai));
    });
    row.push(b.jumlah === null ? '' : Number(b.jumlah));
    row.push(b.rata === null ? '' : Number(b.rata));
    if (tampilkanPeringkat) {
      row.push(b.pk === null ? '' : Number(b.pk));
      row.push(b.pp === null ? '' : Number(b.pp));
    }
    // Keterangan singkat + tanda bintang bila ada di bawah KKTP.
    let ket = '';
    if (!b.ada_nilai) ket = 'belum ada';
    else if (!b.lengkap) ket = 'belum lengkap';
    else ket = 'lengkap';
    // Tanda di bawah KKTP: kumpulkan kode slot.
    const diBawah = b.nilai.filter(np => np.di_bawah).map(np => np.kode);
    if (diBawah.length) ket += ' (*' + diBawah.join(',') + ')';
    row.push(ket);
    aoa.push(row);
  });

  // Foot statistik.
  const slotStat = hal.statistik.per_slot;
  const barisRata = ['Rata-rata', '', ''];
  slotStat.forEach(st => barisRata.push(st.rata === null ? '' : Number(st.rata)));
  while (barisRata.length < lebarKolomTotal) barisRata.push('');
  aoa.push(barisRata);
  const barisTinggi = ['Tertinggi', '', ''];
  slotStat.forEach(st => barisTinggi.push(st.tertinggi === null ? '' : Number(st.tertinggi)));
  while (barisTinggi.length < lebarKolomTotal) barisTinggi.push('');
  aoa.push(barisTinggi);
  const barisRendah = ['Terendah', '', ''];
  slotStat.forEach(st => barisRendah.push(st.terendah === null ? '' : Number(st.terendah)));
  while (barisRendah.length < lebarKolomTotal) barisRendah.push('');
  aoa.push(barisRendah);
  const barisTuntas = ['Tuntas', '', ''];
  slotStat.forEach(st => barisTuntas.push((st.tuntas || 0) + '/' + (st.terisi || 0)));
  while (barisTuntas.length < lebarKolomTotal) barisTuntas.push('');
  aoa.push(barisTuntas);

  // Tanda tangan.
  aoa.push(Array(lebarKolomTotal).fill(''));
  aoa.push(Array(lebarKolomTotal).fill(''));
  const tt = hal.tanda_tangan;
  const barisTT1 = [];
  while (barisTT1.length < lebarKolomTotal) barisTT1.push('');
  if (tt.kiri) {
    barisTT1[0] = tt.kiri.label || '';
    barisTT1[1] = tt.kiri.peran || '';
  }
  if (tt.kanan) {
    const colKanan = lebarKolomTotal - 3;
    barisTT1[colKanan] = tt.kanan.label || '';
    barisTT1[colKanan + 1] = tt.kanan.peran || '';
  }
  aoa.push(barisTT1);
  const barisTT2 = Array(lebarKolomTotal).fill('');
  if (tt.kanan && tt.kanan.tempat_tanggal) {
    const colKanan = lebarKolomTotal - 3;
    barisTT2[colKanan] = tt.kanan.tempat_tanggal;
  }
  aoa.push(barisTT2);
  aoa.push(Array(lebarKolomTotal).fill(''));  // spasi tanda tangan
  aoa.push(Array(lebarKolomTotal).fill(''));
  const barisTT3 = Array(lebarKolomTotal).fill('');
  if (tt.kiri) {
    barisTT3[0] = tt.kiri.nama || '';
    barisTT3[1] = tt.kiri.nip ? 'NIP. ' + tt.kiri.nip : '';
  }
  if (tt.kanan) {
    const colKanan = lebarKolomTotal - 3;
    barisTT3[colKanan] = tt.kanan.nama || '';
    barisTT3[colKanan + 1] = tt.kanan.nip ? 'NIP. ' + tt.kanan.nip : '';
  }
  aoa.push(barisTT3);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // !cols: No=4, Nama=28, slot=8 each, Jml=8, Rata=8, PerKls=8, PerPar=8, Ket=18.
  const cols = [{ wch: 4 }, { wch: 28 }];
  slot.forEach(() => cols.push({ wch: 8 }));
  cols.push({ wch: 8 }, { wch: 8 });
  if (tampilkanPeringkat) cols.push({ wch: 8 }, { wch: 8 });
  cols.push({ wch: 22 });
  pasangProps(ws, mergeRanges, cols, null);
  return ws;
}

// =========================== INTERNAL: LEMBAR PARALEL ===========================

function tulisLembarParalelSheet(hal) {
  const slot = hal.header.kolom_slot;
  const tampilkanPeringkat = hal.opsi.tampilkan_peringkat;
  // No, Nama, Kelas, slot×N, Jml, Rata, Per.Paralel.
  const lebarKolomTotal = 3 + slot.length + 2 + (tampilkanPeringkat ? 1 : 0);
  const aoa = [];
  const { mergeRanges } = tulisKopKeAoa(aoa, hal.kop, lebarKolomTotal);
  // Baris info tingkat.
  const info = ['Tingkat', String(hal.tingkat || '-')];
  while (info.length < lebarKolomTotal) info.push('');
  aoa.push(info);
  // KKTP per slot.
  const kktpRow = ['KKTP', '', ''];
  slot.forEach(s => kktpRow.push('≥ ' + (s.kktp || 0)));
  while (kktpRow.length < lebarKolomTotal) kktpRow.push('');
  aoa.push(kktpRow);
  aoa.push(Array(lebarKolomTotal).fill(''));

  const headRow = ['No', 'Nama', 'Kelas', ...slot.map(s => s.singkatan || s.kode), 'Jml', 'Rata'];
  if (tampilkanPeringkat) headRow.push('Per. Paralel');
  aoa.push(headRow);

  hal.baris.forEach(b => {
    const row = [b.no, b.nama, b.nama_kelas || ''];
    b.nilai.forEach(np => {
      if (np.nilai === null) row.push('');
      else row.push(Number(np.nilai));
    });
    row.push(b.jumlah === null ? '' : Number(b.jumlah));
    row.push(b.rata === null ? '' : Number(b.rata));
    if (tampilkanPeringkat) row.push(b.pp === null ? '' : Number(b.pp));
    aoa.push(row);
  });

  // Foot statistik.
  const slotStat = hal.statistik.per_slot;
  const barisRata = ['Rata-rata', '', ''];
  slotStat.forEach(st => barisRata.push(st.rata === null ? '' : Number(st.rata)));
  while (barisRata.length < lebarKolomTotal) barisRata.push('');
  aoa.push(barisRata);
  const barisTinggi = ['Tertinggi', '', ''];
  slotStat.forEach(st => barisTinggi.push(st.tertinggi === null ? '' : Number(st.tertinggi)));
  while (barisTinggi.length < lebarKolomTotal) barisTinggi.push('');
  aoa.push(barisTinggi);
  const barisRendah = ['Terendah', '', ''];
  slotStat.forEach(st => barisRendah.push(st.terendah === null ? '' : Number(st.terendah)));
  while (barisRendah.length < lebarKolomTotal) barisRendah.push('');
  aoa.push(barisRendah);
  const barisTuntas = ['Tuntas', '', ''];
  slotStat.forEach(st => barisTuntas.push((st.tuntas || 0) + '/' + (st.terisi || 0)));
  while (barisTuntas.length < lebarKolomTotal) barisTuntas.push('');
  aoa.push(barisTuntas);

  // Tanda tangan kanan saja.
  aoa.push(Array(lebarKolomTotal).fill(''));
  aoa.push(Array(lebarKolomTotal).fill(''));
  const tt = hal.tanda_tangan;
  if (tt.kanan) {
    const colKanan = lebarKolomTotal - 3;
    const r1 = Array(lebarKolomTotal).fill('');
    r1[colKanan] = tt.kanan.label || ''; r1[colKanan + 1] = tt.kanan.peran || '';
    aoa.push(r1);
    const r2 = Array(lebarKolomTotal).fill('');
    r2[colKanan] = tt.kanan.tempat_tanggal || '';
    aoa.push(r2);
    aoa.push(Array(lebarKolomTotal).fill(''));
    aoa.push(Array(lebarKolomTotal).fill(''));
    const r3 = Array(lebarKolomTotal).fill('');
    r3[colKanan] = tt.kanan.nama || '';
    r3[colKanan + 1] = tt.kanan.nip ? 'NIP. ' + tt.kanan.nip : '';
    aoa.push(r3);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = [{ wch: 4 }, { wch: 26 }, { wch: 10 }];
  slot.forEach(() => cols.push({ wch: 8 }));
  cols.push({ wch: 8 }, { wch: 8 });
  if (tampilkanPeringkat) cols.push({ wch: 10 });
  pasangProps(ws, mergeRanges, cols, null);
  return ws;
}

// =========================== INTERNAL: REKAP ===========================

function tulisRekapSheet(hal, bt) {
  // Kolom: Mata Pelajaran, KKTP, Terisi, Rata-rata, Tertinggi, Terendah, Tuntas, Belum, % Tuntas.
  const lebarKolomTotal = 9;
  const aoa = [];
  const { mergeRanges } = tulisKopKeAoa(aoa, hal.kop, lebarKolomTotal);
  // Sub-judul: TINGKAT X.
  const sub = ['BLOK TINGKAT ' + bt.tingkat];
  while (sub.length < lebarKolomTotal) sub.push('');
  mergeRanges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: lebarKolomTotal - 1 } });
  aoa.push(sub);
  aoa.push(Array(lebarKolomTotal).fill(''));

  const head = ['Mata Pelajaran', 'KKTP', 'Terisi', 'Rata-rata', 'Tertinggi', 'Terendah', 'Tuntas', 'Belum', '% Tuntas'];
  aoa.push(head);

  bt.slot.forEach(sl => {
    aoa.push([sl.nama + (sl.multi ? ' *' : ''), sl.kktp || 0, sl.terisi || 0,
      sl.rata === null ? '' : Number(sl.rata),
      sl.tertinggi === null ? '' : Number(sl.tertinggi),
      sl.terendah === null ? '' : Number(sl.terendah),
      sl.tuntas || 0, sl.belum_tuntas || 0,
      sl.persen_tuntas === null ? '' : Number(sl.persen_tuntas)]);
    (sl.baris_varian || []).forEach(v => {
      aoa.push(['   ↳ ' + v.nama, v.kktp || 0, v.terisi || 0,
        v.rata === null ? '' : Number(v.rata),
        v.tertinggi === null ? '' : Number(v.tertinggi),
        v.terendah === null ? '' : Number(v.terendah),
        v.tuntas || 0, v.belum_tuntas || 0,
        v.persen_tuntas === null ? '' : Number(v.persen_tuntas)]);
    });
  });

  // Tanda tangan.
  aoa.push(Array(lebarKolomTotal).fill(''));
  aoa.push(Array(lebarKolomTotal).fill(''));
  const tt = hal.tanda_tangan;
  if (tt.kanan) {
    const r1 = Array(lebarKolomTotal).fill('');
    r1[5] = tt.kanan.label || ''; r1[6] = tt.kanan.peran || '';
    aoa.push(r1);
    const r2 = Array(lebarKolomTotal).fill('');
    r2[5] = tt.kanan.tempat_tanggal || '';
    aoa.push(r2);
    aoa.push(Array(lebarKolomTotal).fill(''));
    aoa.push(Array(lebarKolomTotal).fill(''));
    const r3 = Array(lebarKolomTotal).fill('');
    r3[5] = tt.kanan.nama || '';
    r3[6] = tt.kanan.nip ? 'NIP. ' + tt.kanan.nip : '';
    aoa.push(r3);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = [{ wch: 32 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
  pasangProps(ws, mergeRanges, cols, null);
  return ws;
}

function tulisRingkasSekolahSheet(hal) {
  const lebarKolomTotal = 9;
  const aoa = [];
  const { mergeRanges } = tulisKopKeAoa(aoa, hal.kop, lebarKolomTotal);
  const sub = ['RINGKASAN SEKOLAH'];
  while (sub.length < lebarKolomTotal) sub.push('');
  mergeRanges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: lebarKolomTotal - 1 } });
  aoa.push(sub);
  aoa.push(Array(lebarKolomTotal).fill(''));
  aoa.push(['Mata Pelajaran', 'KKTP', 'Terisi', 'Rata-rata', 'Tertinggi', 'Terendah', 'Tuntas', 'Belum', '% Tuntas']);
  (hal.per_sekolah || []).forEach(st => {
    aoa.push([st.nama + (st.multi ? ' *' : ''), st.kktp || 0, st.terisi || 0,
      st.rata === null ? '' : Number(st.rata),
      st.tertinggi === null ? '' : Number(st.tertinggi),
      st.terendah === null ? '' : Number(st.terendah),
      st.tuntas || 0, st.belum_tuntas || 0,
      st.persen_tuntas === null ? '' : Number(st.persen_tuntas)]);
    (st.varian || []).forEach(v => {
      aoa.push(['   ↳ ' + v.nama, st.kktp || 0, v.terisi || 0,
        v.rata_rata === null ? '' : Number(v.rata_rata),
        v.tertinggi === null ? '' : Number(v.tertinggi),
        v.terendah === null ? '' : Number(v.terendah),
        v.tuntas || 0, v.belum_tuntas || 0,
        v.persen_tuntas === null ? '' : Number(v.persen_tuntas)]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = [{ wch: 32 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
  pasangProps(ws, mergeRanges, cols, null);
  return ws;
}

function tulisRombelSheet(hal, bt) {
  const slot = hal.slot;
  // Kolom: Kelas + slot×N + Rata-rata.
  const lebarKolomTotal = 1 + slot.length + 1;
  const aoa = [];
  const { mergeRanges } = tulisKopKeAoa(aoa, hal.kop, lebarKolomTotal);
  const sub = ['PERBANDINGAN ANTAR ROMBEL — TINGKAT ' + bt.tingkat];
  while (sub.length < lebarKolomTotal) sub.push('');
  mergeRanges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: lebarKolomTotal - 1 } });
  aoa.push(sub);
  aoa.push(Array(lebarKolomTotal).fill(''));
  const head = ['Kelas', ...slot.map(s => s.singkatan || s.kode), 'Rata-rata'];
  aoa.push(head);
  bt.kelas.forEach(k => {
    const row = [k.nama_kelas || ''];
    let jumlah = 0, ada = 0;
    k.slot_rata.forEach(sr => {
      if (sr.rata === null) row.push('');
      else { row.push(Number(sr.rata)); jumlah += Number(sr.rata); ada++; }
    });
    row.push(ada ? Number((jumlah / ada).toFixed(2)) : '');
    aoa.push(row);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = [{ wch: 14 }, ...slot.map(() => ({ wch: 10 })), { wch: 12 }];
  pasangProps(ws, mergeRanges, cols, null);
  return ws;
}

// =========================== INTERNAL: SISWA ===========================

function tulisSiswaSheet(hal) {
  const tampilkanPembanding = hal.ringkasan.tampilkan_pembanding;
  const tampilkanPeringkat = hal.ringkasan.tampilkan_peringkat;
  // Kolom: No, Mata Pelajaran, Nilai, KKTP, Keterangan, [Rata Kelas, Rata Tingkat].
  const lebarKolomTotal = 5 + (tampilkanPembanding ? 2 : 0);
  const aoa = [];
  const { mergeRanges } = tulisKopKeAoa(aoa, hal.kop, lebarKolomTotal);

  // Blok identitas.
  const idn = hal.identitas;
  const pasangan = [
    ['Nama', idn.nama], ['NISN', idn.nisn], ['NIS', idn.nis],
    ['Kelas', idn.kelas], ['Tingkat', idn.tingkat ? String(idn.tingkat) : ''],
    ['Tahun Ajaran', idn.tahun_ajaran], ['Semester', idn.semester ? String(idn.semester) : ''],
    ['Kegiatan', idn.kegiatan]
  ].filter(p => p[1]);
  pasangan.forEach(p => {
    const row = [p[0], p[1]];
    while (row.length < lebarKolomTotal) row.push('');
    aoa.push(row);
    mergeRanges.push({ s: { r: aoa.length - 1, c: 1 }, e: { r: aoa.length - 1, c: lebarKolomTotal - 1 } });
  });
  aoa.push(Array(lebarKolomTotal).fill(''));

  // Header tabel.
  const head = ['No', 'Mata Pelajaran', 'Nilai', 'KKTP', 'Keterangan'];
  if (tampilkanPembanding) head.push('Rata Kelas', 'Rata Tingkat');
  aoa.push(head);

  hal.slot.forEach((s, i) => {
    const row = [i + 1, s.nama_mapel];
    row.push(s.nilai === null ? '' : Number(s.nilai));
    row.push(s.kktp || 0);
    row.push(s.keterangan + (s.di_bawah ? ' *' : ''));
    if (tampilkanPembanding) {
      row.push(s.rata_kelas === null ? '' : Number(s.rata_kelas));
      row.push(s.rata_tingkat === null ? '' : Number(s.rata_tingkat));
    }
    aoa.push(row);
  });

  // Ringkasan.
  aoa.push(Array(lebarKolomTotal).fill(''));
  const r = hal.ringkasan;
  const ringkasan = [
    ['Jumlah Nilai', r.jumlah === null ? '' : Number(r.jumlah)],
    ['Rata-rata', r.rata_rata === null ? '' : Number(r.rata_rata)],
    ['Jumlah Belum Tuntas', r.jumlah_belum_tuntas],
    ['Jumlah Slot Kosong', r.jumlah_kosong]
  ];
  if (tampilkanPeringkat) {
    ringkasan.push(['Peringkat Kelas', r.peringkat_kelas === null ? '' : Number(r.peringkat_kelas)]);
    ringkasan.push(['Peringkat Paralel', r.peringkat_paralel === null ? '' : Number(r.peringkat_paralel)]);
  }
  ringkasan.forEach(row => {
    const r2 = [...row];
    while (r2.length < lebarKolomTotal) r2.push('');
    aoa.push(r2);
    mergeRanges.push({ s: { r: aoa.length - 1, c: 1 }, e: { r: aoa.length - 1, c: lebarKolomTotal - 1 } });
  });

  // Catatan.
  if (hal.catatan && hal.catatan.length) {
    aoa.push(Array(lebarKolomTotal).fill(''));
    hal.catatan.forEach(c => {
      const row = [c];
      while (row.length < lebarKolomTotal) row.push('');
      aoa.push(row);
      mergeRanges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: lebarKolomTotal - 1 } });
    });
  }

  // Tanda tangan.
  aoa.push(Array(lebarKolomTotal).fill(''));
  aoa.push(Array(lebarKolomTotal).fill(''));
  const tt = hal.tanda_tangan;
  if (tt.kiri || tt.kanan) {
    const r1 = Array(lebarKolomTotal).fill('');
    if (tt.kiri) { r1[0] = tt.kiri.label || ''; r1[1] = tt.kiri.peran || ''; }
    const colKanan = lebarKolomTotal - 2;
    if (tt.kanan) { r1[colKanan] = tt.kanan.label || ''; r1[colKanan + 1] = ''; }
    aoa.push(r1);
    if (tt.kanan && tt.kanan.tempat_tanggal) {
      const r2 = Array(lebarKolomTotal).fill('');
      r2[colKanan] = tt.kanan.tempat_tanggal;
      aoa.push(r2);
    } else {
      aoa.push(Array(lebarKolomTotal).fill(''));
    }
    aoa.push(Array(lebarKolomTotal).fill(''));
    aoa.push(Array(lebarKolomTotal).fill(''));
    const r3 = Array(lebarKolomTotal).fill('');
    if (tt.kiri) { r3[0] = tt.kiri.nama || ''; r3[1] = tt.kiri.nip ? 'NIP. ' + tt.kiri.nip : ''; }
    if (tt.kanan) { r3[colKanan] = tt.kanan.nama || ''; r3[colKanan + 1] = tt.kanan.nip ? 'NIP. ' + tt.kanan.nip : ''; }
    aoa.push(r3);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const cols = [{ wch: 4 }, { wch: 32 }, { wch: 10 }, { wch: 8 }, { wch: 16 }];
  if (tampilkanPembanding) cols.push({ wch: 12 }, { wch: 12 });
  pasangProps(ws, mergeRanges, cols, null);
  return ws;
}
