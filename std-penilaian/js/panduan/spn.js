// spn.js — Panduan untuk peran Standar Penilaian (SPN).
// Isi ringkas: kelola kegiatan, peserta, input/monitoring nilai, laporan, arsip.
// Dipakai oleh pages/panduan.js sesuai peran utama pengguna.

export const PANDUAN = {
  judul: 'Panduan Standar Penilaian (SPN)',
  langkah: [
    'Buka menu Kegiatan: buat kegiatan penilaian (mis. ASLM, ASAS) untuk tahun ajaran aktif. Tentukan nama, semester, tingkat peserta, slot/varian yang dinilai, dan KKTP per slot.',
    'Tentukan Peserta Kegiatan per kelas. Hanya siswa terdaftar sebagai peserta yang akan muncul di lembar input nilai.',
    'Pastikan Penugasan guru pengampu sudah diatur admin. Tanpa penugasan, guru tidak dapat menginput nilai pada slot tersebut.',
    'Buka Panel Supervisi (menu Panel SPN) untuk melihat progres input per penugasan. Dorong guru yang belum final agar menyelesaikan input tepat waktu.',
    'Tutup input nilai: ubah status kegiatan menjadi "dikunci" setelah semua guru final. Setelah dikunci, nilai tidak bisa diubah tanpa membuka kembali.',
    'Pantau capaian di menu Pemantauan: Lembar Kelas (per kelas), Lembar Paralel (per tingkat), Rekap (perbandingan rombel × slot), Grafik, dan Remedial (siswa di bawah KKTP).',
    'Verifikasi arsip kegiatan: jalankan Arsip di akhir siklus untuk membekukan nilai. Arsip berisi rekap final + PDF per kelas yang dapat dipanggil kembali kapan saja.',
    'Hasilkan Laporan: unduh PDF/Excel rekap per kelas, per siswa, atau per tingkat sesuai kebutuhan. Laporan memakai kop sekolah dari Pengaturan.',
    'Periksa Profil Siswa untuk melihat riwayat nilai lengkap per siswa (identitas, riwayat rombel, kegiatan diikuti, grafik rata-rata, riwayat perubahan nilai).',
    'Kelola Tempat Sampah: item yang salah dihapus dapat dipulihkan selama 60 hari. Hapus permanen hanya bisa oleh admin.'
  ],
  faq: [
    {
      q: 'Apa beda nilai draft dan final?',
      a: 'Nilai draft adalah nilai sementara yang masih dapat diubah guru. Nilai final adalah nilai yang sudah dikunci guru dan ikut dihitung dalam rekap. Pada Pemantauan, Anda dapat memfilter "Hanya final" untuk melihat rekap final saja.'
    },
    {
      q: 'Bagaimana cara membuka kembali kegiatan yang sudah dikunci?',
      a: 'Buka menu Kegiatan → ubah status dari "dikunci" kembali ke "dibuka". Perubahan dicatat di log. Koordinasikan dengan guru pengampu agar tidak ada konflik input.'
    },
    {
      q: 'Apakah SPN dapat menghapus data?',
      a: 'SPN dapat menghapus item ke tabel sampah (soft delete, dapat dipulihkan). Hapus permanen hanya bisa oleh admin. Aksi hapus dicatat di log aktivitas.'
    },
    {
      q: 'Mengapa nilai siswa di bawah KKTP ditandai?',
      a: 'KKTP (Kriteria Ketuntasan Tujuan Pembelajaran) adalah batas tuntas per slot. Nilai di bawah KKTP ditandai kuning pada lembar dan masuk daftar Remedial. Buka tab Remedial di Pemantauan untuk daftar siswa yang perlu perbaikan.'
    },
    {
      q: 'Bagaimana cara melihat siapa yang mengubah nilai?',
      a: 'Buka Profil Siswa → bagian Riwayat Perubahan Nilai. Setiap penimpaan nilai lama dengan nilai baru yang berbeda dicatat (nilai lama, nilai baru, sumber, waktu, dan pengguna).'
    }
  ]
};
