// admin.js — Panduan untuk peran Admin E-Nilai.
// Isi ringkas: kelola akun, kelas, siswa, backup, arsip, tutup tahun ajaran.
// Dipakai oleh pages/panduan.js sesuai peran utama pengguna.

export const PANDUAN = {
  judul: 'Panduan Admin',
  langkah: [
    'Awal tahun: pastikan Tahun Ajaran aktif sudah dibuat di menu Tahun Ajaran. Pilih satu TA aktif agar semua operasi data (kelas, siswa, kegiatan) merujuk TA yang benar.',
    'Kelola Pengguna: buat akun guru, wali kelas, standar penilaian (SPN), dan kepala sekolah. Setiap akun wajib ganti password saat login pertama. Atur peran sesuai tugas — peran menentukan menu yang dapat diakses.',
    'Kelola Kelas: tentukan tingkat, nama kelas, dan wali kelas pada TA aktif. Setiap kelas wajib punya wali — sistem akan menandai kelas tanpa wali di pemeriksaan sistem.',
    'Kelola Siswa: daftarkan siswa aktif, lengkapi NISN/NIS, jenis kelamin, tanggal lahir. Untuk tingkat dengan slot multi-varian (Seni & Prakarya), pilih varian siswa. Gunakan Impor untuk menambah banyak siswa sekaligus.',
    'Naik Kelas & Mutasi: di akhir TA, jalankan Naik Kelas untuk melanjutkan siswa ke tingkat berikutnya, atau Mutasi untuk menandai siswa keluar/lulus.',
    'Kelola Penugasan: tentukan guru pengampu per kelas per slot/varian. Penugasan adalah syarat agar guru dapat menginput nilai.',
    'Setelah seluruh kegiatan diinput & diverifikasi SPN, jalankan Arsip Kegiatan untuk membekukan nilai dan membuat arsip permanen. Cek folder arsip di menu Kepemilikan Folder.',
    'Jalankan Backup berkala (menu Backup) sebelum operasi besar. Backup disimpan di Google Drive folder backup — pastikan admin menjadi pemilik folder.',
    'Tutup Tahun Ajaran: hanya bisa dijalankan jika semua kegiatan sudah diarsipkan & terverifikasi. Backup penuh otomatis dijalankan. Opsional: pangkas data nilai lama untuk menghemat kuota spreadsheet.',
    'Pantau kesehatan sistem di menu Sistem: periksa temuan (siswa tanpa kelas, kelas tanpa wali, NISN ganda), kapasitas tab, status backup & trigger.',
    'Kelola Tempat Sampah: item terhapus disimpan 60 hari. Pulihkan jika salah hapus, atau hapus permanen (hanya admin) untuk benar-benar membebaskan baris.',
    'Atur identitas sekolah (nama, dinas, alamat, kontak, kepala sekolah, logo) di menu Pengaturan — dipakai pada kop laporan PDF.'
  ],
  faq: [
    {
      q: 'Bagaimana cara mengganti pemilik folder backup/arsip?',
      a: 'Buka menu Kepemilikan Folder. Folder dibuat otomatis saat backup/arsip pertama dijalankan. Untuk menambah akses editor/pelihat lain, masukkan email pada form di halaman yang sama. Pemilik folder sebaiknya adalah akun admin utama agar tidak hilang saat admin keluar.'
    },
    {
      q: 'Apakah aman memangkas data nilai saat Tutup TA?',
      a: 'Pangkas hanya jika Anda yakin tidak lagi memerlukan rekap mentah tahun lalu (arsip final tetap tersimpan). Backup penuh otomatis berjalan sebelum pangkas, sehingga data masih bisa dipulihkan dari backup jika diperlukan.'
    },
    {
      q: 'Apa yang terjadi jika ada NISN ganda?',
      a: 'Sistem akan menandai temuan "NISN ganda" di pemeriksaan sistem. Perbaiki di menu Siswa: cari NISN yang ganda, kosongkan atau ubah NISN salah satu siswa. NISN harus unik agar siswa dapat diidentifikasi tanpa ambiguitas.'
    },
    {
      q: 'Trigger harian apa saja yang aktif?',
      a: 'Trigger backup harian (jika dijadwalkan) dan pembersihan sampah kedaluwarsa. Status trigger ditampilkan di menu Sistem. Jika trigger hilang (misal setelah deploy ulang), jalankan ulang fungsi trigger dari editor Apps Script.'
    },
    {
      q: 'Bagaimana cara mengaktifkan mode pemeliharaan?',
      a: 'Mode pemeliharaan diatur server-side (flag maintenanceAktif). Saat aktif, semua aksi ditolak kecuali login admin. Gunakan untuk menghentikan perubahan data sementara saat migrasi atau perbaikan.'
    }
  ]
};
