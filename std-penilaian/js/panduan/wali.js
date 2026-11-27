// wali.js — Panduan untuk Wali Kelas (guru murni yang memimpin kelas).
// Isi ringkas: lembar kelas, laporan kelas, profil siswa perwalian.
// Dipakai oleh pages/panduan.js sesuai peran utama pengguna.

export const PANDUAN = {
  judul: 'Panduan Wali Kelas',
  langkah: [
    'Buka menu Lembar Kelas (Pemantauan). Sistem otomatis menampilkan kelas perwalian Anda pada tahun ajaran aktif.',
    'Pilih kegiatan pada dropdown di atas untuk melihat lembar nilai kelas Anda. Nilai per slot, jumlah, rata-rata, peringkat kelas & paralel, serta keterangan kelengkapan tampil di satu tabel.',
    'Periksa baris yang bertanda "belum lengkap" — siswa tersebut masih ada slot kosong. Hubungi guru pengampu untuk menyelesaikan input.',
    'Lihat tab Rekap untuk membandingkan rata-rata slot antar kelas pada tingkat yang sama. Tab Remedial menampilkan siswa kelas Anda yang di bawah KKTP.',
    'Buka Profil Siswa: cari siswa perwalian Anda, lalu lihat identitas, riwayat rombel (per TA), kegiatan yang diikuti beserta nilai per slot, grafik rata-rata antar kegiatan, dan riwayat perubahan nilai.',
    'Unduh Laporan Kelas (menu Laporan) untuk mencetak rekap nilai per siswa dengan kop sekolah. Pilih kelas perwalian Anda dan format PDF/Excel.',
    'Pantau kedaluwarsa input: ikuti banner "belum final" yang muncul jika masih ada penugasan belum final pada kegiatan terpilih.'
  ],
  faq: [
    {
      q: 'Mengapa saya hanya melihat kelas perwalian saya?',
      a: 'Wali kelas murni (guru tanpa peran SPN/kepsek/admin) hanya boleh melihat kelas perwaliannya sendiri. Sistem memfilter data otomatis di sisi server. Jika kelas perwalian Anda tidak muncul, hubungi admin untuk memastikan Anda terdaftar sebagai wali kelas pada TA aktif.'
    },
    {
      q: 'Apakah saya dapat menginput nilai dari menu Lembar Kelas?',
      a: 'Tidak. Lembar Kelas bersifat read-only (pemantauan). Untuk menginput nilai, buka menu Tugas Saya → pilih penugasan → Input Nilai. Wali yang juga ditugaskan sebagai pengampu akan melihat tugas tersebut di Tugas Saya.'
    },
    {
      q: 'Mengapa siswa tertentu tidak muncul di lembar?',
      a: 'Kemungkinan: (1) siswa bukan peserta kegiatan tersebut; (2) siswa beralih ke varian berbeda; (3) siswa sudah keluar/lulus. Cek status siswa di Profil Siswa atau hubungi SPN/admin.'
    },
    {
      q: 'Apakah saya dapat mencetak lembar kelas untuk rapat?',
      a: 'Ya. Gunakan fitur cetak browser (Ctrl/Cmd+P) pada halaman Lembar Kelas, atau unduh Laporan Kelas dalam format PDF dari menu Laporan untuk hasil yang sudah berkop.'
    },
    {
      q: 'Bagaimana cara melihat riwayat kelas siswa di tahun lalu?',
      a: 'Buka Profil Siswa → bagian Riwayat Rombel. Setiap TA tempat siswa pernah terdaftar ditampilkan (kelas, tingkat, tanggal mulai-selesai). Ini berguna untuk melacak perpindahan kelas.'
    }
  ]
};
