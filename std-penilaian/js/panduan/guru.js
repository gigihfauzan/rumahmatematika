// guru.js — Panduan untuk peran Guru pengampu (non-wali).
// Isi ringkas: tugas mengajar, input nilai, progres.
// Dipakai oleh pages/panduan.js sesuai peran utama pengguna.

export const PANDUAN = {
  judul: 'Panduan Guru',
  langkah: [
    'Buka menu Tugas Saya untuk melihat daftar penugasan mengajar Anda (per kelas, per slot/varian, per kegiatan) pada tahun ajaran aktif.',
    'Pilih kartu tugas untuk masuk ke halaman Input Nilai. Anda hanya dapat menginput pada slot/varian yang ditugaskan kepada Anda.',
    'Isi nilai per siswa. Sel kosong berarti belum ada nilai. Nilai di bawah KKTP akan ditandai kuning sebagai peringatan — bukan kesalahan input.',
    'Tekan Simpan untuk menyimpan nilai sebagai draft. Nilai draft masih dapat diubah kapan saja selama kegiatan masih "dibuka".',
    'Jika sudah yakin semua nilai final, tekan tombol Final pada penugasan. Setelah final, nilai ikut dihitung dalam rekap pemantauan.',
    'Pantau Progres input di menu Progres: lihat persentase pengisian per kelas, per slot, dan jumlah siswa yang belum dinilai.',
    'Untuk menambah banyak nilai sekaligus, gunakan Impor Nilai (menu Impor): unduh template, isi di Excel, lalu unggah kembali. Sistem akan menampilkan pratinjau sebelum menyimpan.',
    'Buka Profil Siswa (jika diberi akses) untuk melihat riwayat nilai siswa yang Anda ajar — termasuk kegiatan lain yang diikuti.'
  ],
  faq: [
    {
      q: 'Saya tidak bisa menginput nilai. Apa penyebabnya?',
      a: 'Periksa: (1) status kegiatan harus "dibuka" — jika "dikunci", minta SPN membuka kembali; (2) penugasan Anda harus ada pada kelas & slot tersebut; (3) pastikan Anda login dengan akun yang ditugaskan, bukan akun lain.'
    },
    {
      q: 'Apa yang terjadi jika saya menimpa nilai lama?',
      a: 'Nilai lama akan diganti dengan nilai baru. Sistem mencatat riwayat perubahan (nilai lama → nilai baru, siapa, kapan, sumber) di Profil Siswa. Pastikan perubahan disengaja.'
    },
    {
      q: 'Bisakah saya mengubah nilai setelah final?',
      a: 'Anda dapat membuka kembali tombol Final (toggle) selama kegiatan masih "dibuka". Jika kegiatan sudah "dikunci" oleh SPN, minta SPN membuka kunci lebih dulu.'
    },
    {
      q: 'Bagaimana cara mengetahui nilai di bawah KKTP?',
      a: 'Saat input, sel nilai di bawah KKTP otomatis diberi latar kuning. Anda juga dapat melihat daftar siswa remedial di menu Pemantauan → tab Remedial (jika berhak mengakses).'
    },
    {
      q: 'Apakah Impor Nilai menghapus nilai lama?',
      a: 'Tidak. Impor hanya menimpa nilai untuk baris yang Anda isi pada template. Sel kosong pada template tidak menghapus nilai yang sudah ada. Pratinjau akan menunjukkan perubahan sebelum Anda konfirmasi.'
    }
  ]
};
