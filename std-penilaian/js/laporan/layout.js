// layout.js — Model tata letak BERSAMA untuk PDF (jsPDF) & Excel (SheetJS).
//
// Tujuan: menjadi satu-satunya tempat yang membentuk struktur "halaman laporan"
// dari data mesin (lembar_kelas, lembar_paralel, rekap, laporan_siswa). Baik
// pdf.js maupun excel.js hanya bertugas menerjemahkan model ini ke format masing-
// masing. JANGAN menghitung ulang angka; semua sudah dari mesin (Pemantauan.gs &
// Mesin.gs di server).
//
// Konvensi:
// - Nilai null → tanda '–' (en-dash) di tampilan; angka dibulatkan: bilangan
//   bulat apa adanya, desimal 2 angka.
// - Tanda >= (KKTP) memakai ">=" untuk PDF (font bawaan jsPDF tidak menyandikan
//   "≥" pada WinAnsi; font Tinos tidak dapat dibenamkan di env GitHub Pages ini)
//   dan "≥" untuk Excel (Unicode OK di SheetJS).
// - File layout.js TIDAK memanggil API; menerima data sudah berbentuk mentah
//   dari pemanggil (halaman/laporan.js).

// =========================== UTILITAS FORMAT ===========================

/** Format nilai: integer apa adanya; desimal 2 angka; null → '–'. */
export function fmtNilai(n) {
  if (n === null || n === undefined || n === '') return '–';
  const num = Number(n);
  if (isNaN(num)) return '–';
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2);
}

/** Format rata-rata: selalu 2 desimal; null → '–'. */
export function fmtRata(n) {
  if (n === null || n === undefined || n === '') return '–';
  const num = Number(n);
  if (isNaN(num)) return '–';
  return num.toFixed(2);
}

/** Persen tuntas: 1 desimal. */
export function fmtPersen(n) {
  if (n === null || n === undefined) return '–';
  return Number(n).toFixed(1).replace(/\.0$/, '') + '%';
}

/** Tanda "≥" atau ">=" sesuai target format: 'pdf' → ">=" (WinAnsi); selain itu "≥". */
export function gePakan(format) {
  return format === 'pdf' ? '>=' : '≥';
}

/** Tag varian: huruf kecil inisial tiap kata. "Seni Budaya" → "sb", "Prakarya" → "pk". */
export function varianTag(nama) {
  if (!nama) return '';
  return String(nama).trim().split(/\s+/).map(k => k[0] || '').join('').toLowerCase();
}

/** Bersihkan karakter tidak valid untuk nama berkas/lembar: garis miring → '-'. */
function bersihkanNama(s) {
  return String(s == null ? '' : s).replace(/[\\/]/g, '-').replace(/[\\?\*\[\]:]/g, '_').trim();
}

/**
 * Nama berkas laporan: {Jenis}_{Laporan}_{Cakupan}_SEMESTER {n}_TAHUN AJARAN {yyyy-yyyy}.{ext}
 * @param {{jenis:string, laporan:string, cakupan:string, semester:string|number, tahunAjaran:string, ext:string}} p
 */
export function namaFileLaporan(p) {
  const bagian = [
    p.jenis || 'LAPORAN',
    p.laporan || 'LAPORAN',
    p.cakupan || 'SEKOLAH'
  ].map(bersihkanNama);
  const sem = 'SEMESTER ' + (p.semester || '1');
  const ta = 'TAHUN AJARAN ' + bersihkanNama(p.tahunAjaran || '');
  const ext = (p.ext || 'pdf').replace(/^\./, '');
  return [...bagian, sem, ta].join('_') + '.' + ext;
}

// =========================== FORMAT TANGGAL ===========================

const NAMA_BULAN_PANJANG = ['Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'];
const NAMA_BULAN_PENDEK = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

/** Parse tanggal input (yyyy-mm-dd | Date | string) → Date pada zona lokal. */
function parseTanggal(v) {
  if (!v) return null;
  if (v instanceof Date) return new Date(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // dd/mm/yyyy atau dd-mm-yyyy
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (m) {
    let th = Number(m[3]);
    if (th < 100) th += 2000;
    const d = new Date(th, Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

/**
 * Format tanggal mengikuti pola Apps Script Utilities.formatDate (sebagian).
 * Mendukung token: d, dd, MMMM, MMM, MM, M, yyyy, yy. Tidak mendukung E/EEEE/H
 * (nama hari) — frontend tidak punya nama hari berbahasa Indonesia yang stabil
 * tanpa pustaka Intl. Jika pola kosong → 'd MMMM yyyy'.
 */
export function formatTanggal(pola, tanggal) {
  const d = parseTanggal(tanggal);
  if (!d) return '';
  const p = pola && String(pola).trim() ? String(pola) : 'd MMMM yyyy';
  const tgl = d.getDate();
  const bln = d.getMonth();
  const thn = d.getFullYear();
  // Token replacement berurutan (MMMM sebelum MM, dst).
  return p
    .replace(/yyyy/g, String(thn))
    .replace(/yy/g, String(thn).slice(-2))
    .replace(/MMMM/g, NAMA_BULAN_PANJANG[bln])
    .replace(/MMM/g, NAMA_BULAN_PENDEK[bln])
    .replace(/MM/g, String(bln + 1).padStart(2, '0'))
    .replace(/M(?![a-z])/g, String(bln + 1))
    .replace(/dd/g, String(tgl).padStart(2, '0'))
    .replace(/d(?![a-zA-Z])/g, String(tgl));
}

/** Tahun ajaran "2026-2027" → "TAHUN AJARAN 2026-2027" sudah punya '-' tetap utuh. */
export function labelTahunAjaran(namaTA) {
  return String(namaTA || '').trim();
}

// =========================== OPSI NORMALISASI ===========================

/** Opsi bawaan untuk fungsi bangun*. */
export function normalisasiOsi(opsi) {
  const o = opsi || {};
  return {
    kertas: o.kertas === 'F4' ? 'F4' : 'A4',
    orientasi: o.orientasi === 'landscape' ? 'landscape' : 'portrait',
    tanggal_dokumen: o.tanggal_dokumen || '',
    tampilkan_logo: o.tampilkan_logo !== false,   // default true
    tampilkan_varian_tag: o.tampilkan_varian_tag !== false,
    nomor_halaman: o.nomor_halaman !== false,
    tanda_belum_final: !!o.tanda_belum_final,
    tampilkan_peringkat: o.tampilkan_peringkat !== false,
    tampilkan_pembanding: o.tampilkan_pembanding !== false,
    format: o.format === 'excel' ? 'excel' : 'pdf',
    formatTanggalPola: o.formatTanggalPola || 'd MMMM yyyy'
  };
}

// =========================== KOP ===========================

/**
 * Bangun objek kop bersama.
 * @param {Object} pengaturan  {nama_sekolah, nama_dinas, alamat, kontak, logo_datauri, kepsek_nama, kepsek_nip, tempat_ttd}
 * @param {Object} kegiatan    {nama, jenis, semester, id_ta, tanggal_dokumen}
 * @param {Object} opsi        sudah melalui normalisasiOsi
 * @param {string} judulDokumen  mis. "LAPORAN HASIL ASLM" (per jenis laporan)
 * @returns {{logo_datauri:string, baris:string[], judul:string, sub:string, kepsek:{nama,nip}, tempat_ttd:string, tanggal_teks:string}}
 */
export function bangunKop(pengaturan, kegiatan, opsi, judulDokumen) {
  const p = pengaturan || {};
  const kg = kegiatan || {};
  const baris = [];
  if (p.nama_dinas) baris.push(String(p.nama_dinas));
  if (p.nama_sekolah) baris.push(String(p.nama_sekolah));
  if (p.alamat) baris.push(String(p.alamat));
  if (p.kontak) baris.push(String(p.kontak));
  // Judul dokumen: dari jenis laporan + nama kegiatan.
  const judul = (judulDokumen || 'LAPORAN').toUpperCase();
  const subBagian = [];
  if (kg.semester) subBagian.push('SEMESTER ' + kg.semester);
  // Tahun ajaran datangnya dari kegiatan.id_ta — di laporan siswa server sudah
  // sisipkan ke identitas.tahun_ajaran; di lembar/rekap, kita tampilkan saja
  // nama kegiatan sebagai baris sub.
  if (kg.nama) subBagian.push(String(kg.nama));
  const tanggalTeks = formatTanggal(opsi.formatTanggalPola, opsi.tanggal_dokumen || kg.tanggal_dokumen);
  return {
    logo_datauri: opsi.tampilkan_logo ? (p.logo_datauri || '') : '',
    baris,
    judul,
    sub: subBagian.join(' · '),
    kepsek: { nama: p.kepsek_nama || '', nip: p.kepsek_nip || '' },
    tempat_ttd: p.tempat_ttd || '',
    tanggal_teks: tanggalTeks
  };
}

// =========================== LEMBAR KELAS ===========================

/**
 * Bangun halaman lembar kelas.
 * @param {Object} data  respons aksi `lembar_kelas` {kegiatan, kelas, slot_unified, siswa, statistik_slot, belum_final}
 * @param {Object} opsi  sudah melalui normalisasiOsi
 * @returns {Object} halaman {kop, kelas, header, baris, statistik, tanda_tangan, catatan, belum_final, jenis:'lembar_kelas'}
 */
export function bangunLembarKelas(data, opsi) {
  const o = normalisasiOsi(opsi);
  const kg = data.kegiatan || {};
  const kls = data.kelas || {};
  const slot = urutSlot(data.slot_unified);
  const siswa = data.siswa || [];
  const stat = data.statistik_slot || [];

  const kop = bangunKop(data.pengaturan || {}, kg, o, 'Lembar Nilai Kelas');

  // Header: NO, NAMA, slot×N, JML, RATA, PER.KELAS, PER.PARALEL, KET (per opsi).
  const header = {
    kolom_slot: slot.map(s => ({
      kode: s.kode, nama: s.nama, singkatan: s.singkatan || s.kode,
      multi: !!s.multi, kktp: s.kktp || 0
    })),
    tampilkan_peringkat: o.tampilkan_peringkat,
    tampilkan_keterangan: true
  };

  // Baris siswa (urut abjad; peringkat dari server).
  const baris = siswa.map((s, idx) => {
    const nilaiPerSlot = slot.map(sl => {
      const np = (s.nilai_per_slot || []).find(x => x.kode === sl.kode);
      const nilai = np ? np.nilai : null;
      const kktp = np ? np.kktp : (sl.kktp || 0);
      const diBawah = nilai !== null && Number(nilai) < Number(kktp);
      const tag = (o.tampilkan_varian_tag && sl.multi && np && np.nama_varian) ? varianTag(np.nama_varian) : '';
      return { kode: sl.kode, nilai, kktp, di_bawah: diBawah, varian_tag: tag };
    });
    return {
      no: idx + 1,
      nama: s.nama || '',
      nisn: s.nisn || '',
      nis: s.nis || '',
      id_kelas: s.id_kelas,
      nama_kelas: s.nama_kelas || kls.nama_kelas || '',
      nilai: nilaiPerSlot,
      jumlah: s.ada_nilai ? s.jumlah : null,
      rata: s.ada_nilai ? s.rata_rata : null,
      pk: s.ada_nilai && o.tampilkan_peringkat ? (s.peringkat_kelas ?? null) : null,
      pp: s.ada_nilai && o.tampilkan_peringkat ? (s.peringkat_paralel ?? null) : null,
      ada_nilai: !!s.ada_nilai,
      lengkap: !!s.lengkap,
      slot_kosong: s.slot_kosong || []
    };
  });

  // Statistik per slot.
  const statistik = {
    per_slot: slot.map(sl => {
      const st = stat.find(x => x.kode === sl.kode) || {};
      return {
        kode: sl.kode, nama: sl.nama,
        rata: st.rata_rata ?? null,
        tertinggi: st.tertinggi ?? null,
        terendah: st.terendah ?? null,
        tuntas: st.tuntas || 0,
        terisi: st.terisi || 0,
        belum_tuntas: st.belum_tuntas || 0,
        persen_tuntas: st.persen_tuntas || 0,
        multi: !!sl.multi,
        varian: st.varian || []
      };
    })
  };

  // Tanda tangan: kepsek kiri, wali kanan + tempat/tanggal.
  const tanda_tangan = {
    kiri: { label: 'Mengetahui,', peran: 'Kepala Sekolah', nama: kop.kepsek.nama, nip: kop.kepsek.nip },
    kanan: { label: '', peran: 'Wali Kelas ' + (kls.nama_kelas || ''), nama: kls.wali_nama || '', nip: '', tempat_tanggal: susunTempatTanggal(kop) }
  };

  const catatan = [];
  if (slot.some(s => s.multi)) {
    catatan.push('Slot multi-varian: nama varian dicetak sebagai tag di samping nilai (mis. "sb" = Seni Budaya, "pk" = Prakarya).');
  }
  catatan.push('Nilai di bawah KKTP ditandai (*) pada dokumen cetak.');

  return {
    jenis: 'lembar_kelas',
    kop,
    kelas: { id_kelas: kls.id_kelas, nama_kelas: kls.nama_kelas || '', tingkat: kls.tingkat || '', wali_nama: kls.wali_nama || '' },
    header,
    baris,
    statistik,
    tanda_tangan,
    catatan,
    belum_final: data.belum_final || 0,
    opsi: o
  };
}

// =========================== LEMBAR PARALEL ===========================

/**
 * Bangun halaman lembar paralel (satu tingkat).
 * @param {Object} data  respons aksi `lembar_paralel` {kegiatan, tingkat, slot_unified, siswa, statistik_slot}
 */
export function bangunParalel(data, opsi) {
  const o = normalisasiOsi(opsi);
  const kg = data.kegiatan || {};
  const slot = urutSlot(data.slot_unified);
  const siswa = data.siswa || [];
  const stat = data.statistik_slot || [];
  const tingkat = data.tingkat || '';

  const kop = bangunKop(data.pengaturan || {}, kg, o, 'Lembar Nilai Paralel (Tingkat ' + tingkat + ')');

  const header = {
    kolom_slot: slot.map(s => ({
      kode: s.kode, nama: s.nama, singkatan: s.singkatan || s.kode,
      multi: !!s.multi, kktp: s.kktp || 0
    })),
    tampilkan_peringkat: o.tampilkan_peringkat,   // paralel hanya peringkat paralel
    tampilkan_keterangan: false
  };

  const baris = siswa.map((s, idx) => {
    const nilaiPerSlot = slot.map(sl => {
      const np = (s.nilai_per_slot || []).find(x => x.kode === sl.kode);
      const nilai = np ? np.nilai : null;
      const kktp = np ? np.kktp : (sl.kktp || 0);
      const diBawah = nilai !== null && Number(nilai) < Number(kktp);
      const tag = (o.tampilkan_varian_tag && sl.multi && np && np.nama_varian) ? varianTag(np.nama_varian) : '';
      return { kode: sl.kode, nilai, kktp, di_bawah: diBawah, varian_tag: tag };
    });
    return {
      no: idx + 1,
      nama: s.nama || '',
      nisn: s.nisn || '',
      nis: s.nis || '',
      nama_kelas: s.nama_kelas || '',
      nilai: nilaiPerSlot,
      jumlah: s.ada_nilai ? s.jumlah : null,
      rata: s.ada_nilai ? s.rata_rata : null,
      pp: s.ada_nilai && o.tampilkan_peringkat ? (s.peringkat_paralel ?? null) : null,
      ada_nilai: !!s.ada_nilai,
      lengkap: !!s.lengkap
    };
  });

  const statistik = {
    per_slot: slot.map(sl => {
      const st = stat.find(x => x.kode === sl.kode) || {};
      return {
        kode: sl.kode, nama: sl.nama,
        rata: st.rata_rata ?? null, tertinggi: st.tertinggi ?? null, terendah: st.terendah ?? null,
        tuntas: st.tuntas || 0, terisi: st.terisi || 0, belum_tuntas: st.belum_tuntas || 0,
        persen_tuntas: st.persen_tuntas || 0, multi: !!sl.multi, varian: st.varian || []
      };
    })
  };

  const tanda_tangan = {
    kiri: null,
    kanan: { label: 'Mengetahui,', peran: 'Kepala Sekolah', nama: kop.kepsek.nama, nip: kop.kepsek.nip, tempat_tanggal: susunTempatTanggal(kop) }
  };

  const catatan = [];
  if (slot.some(s => s.multi)) catatan.push('Slot multi-varian: tag inisial varian di samping nilai.');
  catatan.push('Nilai di bawah KKTP ditandai (*) pada dokumen cetak.');

  return {
    jenis: 'lembar_paralel',
    kop, tingkat, header, baris, statistik, tanda_tangan, catatan,
    belum_final: data.belum_final || 0, opsi: o
  };
}

// =========================== REKAP ===========================

/**
 * Bangun halaman rekapitulasi (seluruh sekolah, satu atau beberapa tingkat).
 * @param {Object} data  respons aksi `rekap` {kegiatan, per_tingkat:[{tingkat,slot_stat}], per_sekolah:[], perbandingan_rombel, slot_unified}
 * @returns {Object} halaman rekap dengan blok per tingkat
 */
export function bangunRekap(data, opsi) {
  const o = normalisasiOsi(opsi);
  const kg = data.kegiatan || {};
  const slot = urutSlot(data.slot_unified);
  const perTingkat = data.per_tingkat || [];
  const perSekolah = data.per_sekolah || [];
  const perbandRombel = data.perbandingan_rombel || [];
  const waliTerbatas = !!data.wali_kelas_terbatas;

  const kop = bangunKop(data.pengaturan || {}, kg, o, 'Rekapitulasi Nilai');

  // Blok per tingkat: tiap blok punya label, daftar slot (utama + varian), baris stat.
  const blok = perTingkat.map(bt => {
    const slotStat = bt.slot_stat || [];
    const barisUtama = slot.map(sl => {
      const st = slotStat.find(x => x.kode === sl.kode) || {};
      const barisVarian = (st.varian || []).map(v => ({
        nama: v.nama,
        terisi: v.terisi || 0, rata: v.rata_rata ?? null,
        tertinggi: v.tertinggi ?? null, terendah: v.terendah ?? null,
        tuntas: v.tuntas || 0, belum_tuntas: v.belum_tuntas || 0,
        persen_tuntas: v.persen_tuntas || 0, kktp: st.kktp || sl.kktp || 0,
        sub: true
      }));
      return {
        nama: sl.nama, multi: !!sl.multi, kktp: st.kktp || sl.kktp || 0,
        terisi: st.terisi || 0, rata: st.rata_rata ?? null,
        tertinggi: st.tertinggi ?? null, terendah: st.terendah ?? null,
        tuntas: st.tuntas || 0, belum_tuntas: st.belum_tuntas || 0,
        persen_tuntas: st.persen_tuntas || 0, sub: false,
        baris_varian: barisVarian
      };
    });
    // Baris ringkasan tingkat: rata-rata kolom atau dijumlah? Mengikuti pola Excel
    // lama: baris TERTINGGI/TERENDAH/RATA-RATA/TUNTAS/BELUM TUNTAS per mapel (baris
    // utama), bukan di-rotate. Di layout.js kita berikan struktur fleksibel agar
    // PDF/Excel dapat memilih penyajian (tabel slot×stat vs tabel stat×slot).
    return {
      tingkat: bt.tingkat,
      slot: barisUtama
    };
  });

  // Perbandingan rombel: kelompok per tingkat; tiap kelas punya slot_rata.
  const rombel = perbandRombel.map(bt => ({
    tingkat: bt.tingkat,
    kelas: (bt.rombel || []).map(r => ({
      id_kelas: r.id_kelas, nama_kelas: r.nama_kelas,
      slot_rata: slot.map(sl => {
        const sr = (r.slot_rata || []).find(x => x.kode === sl.kode) || {};
        return { kode: sl.kode, rata: sr.rata_rata ?? null };
      })
    }))
  }));

  const tanda_tangan = {
    kiri: null,
    kanan: { label: 'Mengetahui,', peran: 'Kepala Sekolah', nama: kop.kepsek.nama, nip: kop.kepsek.nip, tempat_tanggal: susunTempatTanggal(kop) }
  };

  const catatan = [];
  if (slot.some(s => s.multi)) catatan.push('Slot multi-varian (Seni & Prakarya) dipecah per varian (↳).');
  catatan.push('Nilai rata-rata dibulatkan 2 desimal; persen tuntas 1 desimal.');
  if (waliTerbatas) catatan.push('Cakupan terbatas pada kelas perwalian Anda.');

  return {
    jenis: 'rekap',
    kop, slot, blok, per_sekolah: perSekolah.map(st => ({
      kode: st.kode, nama: st.nama, kktp: st.kktp || 0,
      terisi: st.terisi || 0, rata: st.rata_rata ?? null,
      tertinggi: st.tertinggi ?? null, terendah: st.terendah ?? null,
      tuntas: st.tuntas || 0, belum_tuntas: st.belum_tuntas || 0,
      persen_tuntas: st.persen_tuntas || 0, multi: !!st.multi, varian: st.varian || []
    })),
    rombel, tanda_tangan, catatan,
    belum_final: data.belum_final || 0, opsi: o, wali_kelas_terbatas: waliTerbatas
  };
}

// =========================== LAPORAN SISWA ===========================

/**
 * Bangun halaman laporan hasil per siswa.
 * @param {Object} lapor  satu objek laporanSiswa dari aksi `laporan_siswa`
 * @returns {Object} halaman siswa
 */
export function bangunSiswa(lapor, opsi) {
  const o = normalisasiOsi(opsi);
  if (!lapor || !lapor.ada) {
    return { jenis: 'siswa', kosong: true, keterangan: (lapor && lapor.keterangan) || 'Siswa tidak terdaftar pada kegiatan ini.' };
  }
  const idn = lapor.identitas || {};
  const kop = lapor.kop || {};
  const wali = lapor.wali || {};
  const kg = lapor.kegiatan || {};

  // Susun kop lengkap (server sudah menyertakan kop; kita bungkus agar seragam).
  const kopObj = {
    logo_datauri: o.tampilkan_logo ? (kop.logo_datauri || '') : '',
    baris: [kop.nama_dinas, kop.nama_sekolah, kop.alamat, kop.kontak].filter(Boolean),
    judul: ('LAPORAN HASIL ' + (kg.nama || idn.kegiatan || 'NILAI')).toUpperCase(),
    sub: [kg.semester ? 'SEMESTER ' + kg.semester : '', idn.tahun_ajaran, idn.kelas ? 'Kelas ' + idn.kelas : '']
      .filter(Boolean).join(' · '),
    kepsek: { nama: kop.kepsek_nama || '', nip: kop.kepsek_nip || '' },
    tempat_ttd: kop.tempat_ttd || '',
    tanggal_teks: formatTanggal(o.formatTanggalPola, o.tanggal_dokumen || kop.tanggal_dokumen)
  };

  // Slot siswa.
  const slot = (lapor.slot || []).map(r => ({
    kode: r.kode, nama_mapel: r.nama_mapel, nilai: r.nilai,
    kktp: r.kktp || 0,
    keterangan: r.keterangan || (r.nilai === null ? '–' : (Number(r.nilai) >= Number(r.kktp) ? 'Tuntas' : 'Belum Tuntas')),
    di_bawah: r.nilai !== null && Number(r.nilai) < Number(r.kktp),
    rata_kelas: r.rata_rata_kelas ?? null,
    rata_tingkat: r.rata_rata_tingkat ?? null
  }));

  // Ringkasan.
  const ringkasan = {
    jumlah: lapor.jumlah ?? null,
    rata_rata: lapor.rata_rata ?? null,
    jumlah_belum_tuntas: lapor.jumlah_belum_tuntas || 0,
    jumlah_kosong: lapor.jumlah_kosong || 0,
    lengkap: !!lapor.lengkap,
    slot_kosong: lapor.slot_kosong || [],
    peringkat_kelas: lapor.tampilkan_peringkat ? (lapor.peringkat_kelas ?? null) : null,
    peringkat_paralel: lapor.tampilkan_peringkat ? (lapor.peringkat_paralel ?? null) : null,
    tampilkan_peringkat: !!lapor.tampilkan_peringkat,
    tampilkan_pembanding: !!lapor.tampilkan_pembanding
  };

  // Identitas.
  const identitas = {
    nama: idn.nama || '', nisn: idn.nisn || '', nis: idn.nis || '',
    kelas: idn.kelas || '', tingkat: idn.tingkat || '',
    tahun_ajaran: idn.tahun_ajaran || '', semester: idn.semester || '',
    kegiatan: idn.kegiatan || '', jenis: idn.jenis || ''
  };

  // Tanda tangan: wali kiri, kepsek kanan (paraf). Tempat+tanggal di kanan.
  const tanda_tangan = {
    kiri: { label: 'Wali Kelas', peran: 'Wali Kelas ' + (idn.kelas || ''), nama: wali.nama || '', nip: wali.nip || '', tempat_tanggal: '' },
    kanan: { label: 'Mengetahui,', peran: 'Kepala Sekolah', nama: kopObj.kepsek.nama, nip: kopObj.kepsek.nip, tempat_tanggal: susunTempatTanggal(kopObj) }
  };

  const catatan = [];
  if (!ringkasan.lengkap) {
    catatan.push('Catatan: laporan ini belum lengkap — terdapat slot kosong: ' + (ringkasan.slot_kosong.join(', ') || '-') + '.');
  }
  if (ringkasan.jumlah_belum_tuntas > 0) {
    catatan.push('Terdapat ' + ringkasan.jumlah_belum_tuntas + ' mata pelajaran dengan nilai di bawah KKTP.');
  }

  return {
    jenis: 'siswa',
    kop: kopObj, identitas, slot, ringkasan, tanda_tangan, catatan,
    belum_final: lapor.belum_final || 0, opsi: o
  };
}

// =========================== INTERNAL HELPERS ===========================

/** Urutkan slot_unified berdasarkan urutan. */
function urutSlot(arr) {
  return [...(arr || [])].sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
}

/** Susun "Tempat, tanggal" untuk tanda tangan. */
function susunTempatTanggal(kop) {
  const t = kop.tempat_ttd || '';
  const d = kop.tanggal_teks || '';
  if (t && d) return t + ', ' + d;
  return t || d || '';
}
