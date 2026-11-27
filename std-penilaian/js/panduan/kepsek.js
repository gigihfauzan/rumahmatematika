// kepsek.js — Panduan untuk peran Kepala Sekolah.
// Isi ringkas: pemantauan capaian, laporan, profil siswa.
// Dipakai oleh pages/panduan.js sesuai peran utama pengguna.

export const PANDUAN = {
  judul: 'Panduan Kepala Sekolah',
  langkah: [
    'Buka menu Pemantauan untuk melihat capaian nilai seluruh kelas dan tingkat pada tahun ajaran aktif.',
    'Pilih kegiatan pada dropdown untuk memuat data. Anda dapat melihat semua tab: Lembar Kelas, Lembar Paralel (per tingkat), Rekap (perbandingan rombel × slot), Grafik, dan Remedial.',
    'Gunakan Lembar Paralel untuk membandingkan semua siswa pada satu tingkat sekaligus, lengkap dengan peringkat paralel. Ini berguna untuk melihat distribusi capaian antar kelas.',
    'Lihat tab Rekap untuk mendapatkan heatmap rata-rata per rombel × slot. Slot dengan rata-rata rendah perlu menjadi perhatian untuk perbaikan strategi pembelajaran.',
    'Buka tab Grafik untuk visualisasi: rata-rata per mapel per tingkat, perbandingan antar rombel, dan ketuntasan (tuntas vs belum) dalam persen.',
    'Periksa tab Remedial untuk daftar siswa di bawah KKTP per slot/kelas. Jadwalkan program perbaikan untuk siswa-siswa tersebut.',
    'Buka Profil Siswa untuk drill-down per siswa: identitas, riwayat rombel, kegiatan diikuti dengan nilai per slot, grafik rata-rata antar kegiatan, dan riwayat perubahan nilai.',
    'Unduh Laporan resmi (menu Laporan) — rekap per kelas/tingkat/siswa dengan kop sekolah — untuk rapat dewan guru atau dokumen sekolah.',
    'Pantau Progres input guru di menu Progres untuk memastikan kedisiplinan pengisian nilai tepat waktu.'
  ],
  faq: [
    {
      q: 'Apa yang dapat saya lihat sebagai kepala sekolah?',
      a: 'Anda dapat melihat seluruh data pemantauan (lembar kelas, paralel, rekap, grafik, remedial), profil siswa, laporan, dan progres input. Anda tidak dapat mengubah nilai atau mengelola data master — operasi tersebut dilakukan admin/SPN/guru.'
    },
    {
      q: 'Bagaimana cara mengetahui kelas dengan capaian rendah?',
      a: 'Buka Pemantauan → tab Rekap. Heatmap menampilkan rata-rata per rombel × slot. Sel dengan rata-rata rendah akan terlihat jelas. Lanjutkan ke tab Grafik untuk visualisasi batang perbandingan antar rombel.'
    },
    {
      q: 'Apakah data yang saya lihat sudah final?',
      a: 'Secara default, nilai draft dan final sama-sama ditampilkan. Aktifkan "Hanya final" pada toolbar Pemantauan untuk melihat rekap final saja. Banner kuning akan menampilkan jumlah penugasan yang belum final.'
    },
    {
      q: 'Bagaimana cara menindaklanjuti siswa remedial?',
      a: 'Buka tab Remedial. Pilih tingkat/kelas/slot untuk memfilter. Daftar siswa di bawah KKTP ditampilkan beserta nilai saat ini. Koordinasikan dengan guru pengampu dan wali kelas untuk program perbaikan atau pengayaan.'
    },
    {
      q: 'Apakah saya dapat mencetak laporan untuk arsip sekolah?',
      a: 'Ya. Menu Laporan menyediakan unduhan PDF/Excel dengan kop sekolah (nama sekolah, dinas, alamat, kepala sekolah). Format siap untuk dicetak atau dikirim secara digital.'
    }
  ]
};
