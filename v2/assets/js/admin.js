// ============================================================================
// LOGIKA HALAMAN ADMIN GURU (ADMIN.JS — TAHAP 2)
// Mengatur login sesi, dasbor, pengaturan situs, kelas & bab, pengelolaan
// konten (YouTube, Drive, Form, GeoGebra, Media Web, Teks/Rumus) dengan
// pratinjau tersemat, pengelolaan pengumuman, serta ganti password admin.
// ============================================================================

(function () {
  // Penyimpanan data admin dari server
  let stateAdmin = {
    pengaturan: {},
    daftar_pengaturan: [],
    kelas: [],
    bab: [],
    konten: [],
    pengumuman: []
  };

  let menuAktif = "dasbor";
  let timerToast = null;

  // Daftar definisi kolom pengaturan agar mudah diisi melalui formulir
  const DAFTAR_FIELD_PENGATURAN = [
    { kunci: "nama_situs", label: "Nama Situs", jenis: "text", bantuan: "Judul utama di bagian atas website." },
    { kunci: "slogan", label: "Slogan Situs", jenis: "text", bantuan: "Kalimat singkat di bawah nama situs." },
    { kunci: "nama_guru", label: "Nama Guru Pengampu", jenis: "text", bantuan: "Ditampilkan di halaman Tentang dan bagian bawah situs." },
    { kunci: "nama_sekolah", label: "Nama Sekolah", jenis: "text", bantuan: "Nama SMP tempat Anda mengajar." },
    { kunci: "alamat_sekolah", label: "Alamat Sekolah", jenis: "text", bantuan: "Alamat lengkap sekolah." },
    { kunci: "kontak", label: "Kontak Guru / Sekolah", jenis: "text", bantuan: "Email atau nomor WhatsApp yang dapat dihubungi." },
    { kunci: "tahun_ajaran", label: "Tahun Ajaran Aktif", jenis: "text", bantuan: "Contoh: 2026/2027." },
    { kunci: "logo_url", label: "Tautan Gambar Logo (Opsional)", jenis: "url", bantuan: "Tempelkan tautan gambar https://... atau kosongkan untuk memakai huruf inisial." },
    { kunci: "favicon_url", label: "Tautan Ikon Tab Browser (Opsional)", jenis: "url", bantuan: "Tautan gambar kecil https://... untuk ikon di tab peramban." },
    {
      kunci: "tema",
      label: "Tema Warna Situs",
      jenis: "select",
      opsi: [
        { nilai: "samudra", label: "Samudra (Biru jernih & aksen kuning — bawaan)" },
        { nilai: "hutan", label: "Hutan (Hijau menenangkan & krem)" },
        { nilai: "senja", label: "Senja (Ungu modern & oranye lembut)" },
        { nilai: "netral", label: "Netral (Abu kebiruan bersih)" }
      ],
      bantuan: "Pilih nuansa warna utama website."
    },
    { kunci: "warna_utama", label: "Timpa Warna Utama (Opsional)", jenis: "text", bantuan: "Kode warna hex seperti #0f6cbd, atau kosongkan untuk mengikuti tema." },
    { kunci: "warna_aksen", label: "Timpa Warna Aksen (Opsional)", jenis: "text", bantuan: "Kode warna hex seperti #f59e0b, atau kosongkan untuk mengikuti tema." },
    {
      kunci: "font_judul",
      label: "Jenis Huruf Judul",
      jenis: "select",
      opsi: [
        { nilai: "Nunito", label: "Nunito (Ramah & bulat)" },
        { nilai: "Poppins", label: "Poppins (Modern & tegas)" },
        { nilai: "Inter", label: "Inter (Bersih & netral)" }
      ],
      bantuan: "Huruf yang dipakai pada judul halaman dan kartu."
    },
    {
      kunci: "font_isi",
      label: "Jenis Huruf Teks Isi",
      jenis: "select",
      opsi: [
        { nilai: "Nunito", label: "Nunito" },
        { nilai: "Poppins", label: "Poppins" },
        { nilai: "Inter", label: "Inter" }
      ],
      bantuan: "Huruf untuk paragraf bacaan siswa."
    },
    { kunci: "teks_sambutan", label: "Teks Sambutan Beranda", jenis: "textarea", bantuan: "Pesan pembuka hangat saat siswa membuka halaman awal." },
    { kunci: "menu_aktif", label: "Menu Navigasi Aktif", jenis: "text", bantuan: "Pisahkan dengan koma. Bawaan: beranda,materi,diskusi,tentang" },
    {
      kunci: "diskusi_aktif",
      label: "Aktifkan Fitur Diskusi",
      jenis: "select",
      opsi: [
        { nilai: "ya", label: "Ya (Tampilkan menu Diskusi)" },
        { nilai: "tidak", label: "Tidak (Sembunyikan menu Diskusi)" }
      ],
      bantuan: "Mengatur tampil tidaknya menu Diskusi di halaman siswa."
    },
    { kunci: "filter_kata", label: "Daftar Kata Ditandai Otomatis", jenis: "text", bantuan: "Pisahkan dengan koma. Dipakai untuk menandai kiriman diskusi di Tahap 3." }
  ];

  // Titik awal saat halaman admin selesai dimuat
  document.addEventListener("DOMContentLoaded", function () {
    mulaiHalamanAdmin();
  });

  async function mulaiHalamanAdmin() {
    if (API.ambilToken()) {
      try {
        const data = await API.ambilDataAdmin();
        simpanStateDanMasukDasbor(data);
        return;
      } catch (err) {
        API.logout();
      }
    }
    tampilkanLayarLogin("");
  }

  function simpanStateDanMasukDasbor(data) {
    stateAdmin = {
      pengaturan: data.pengaturan || {},
      daftar_pengaturan: Array.isArray(data.daftar_pengaturan) ? data.daftar_pengaturan : [],
      kelas: Array.isArray(data.kelas) ? data.kelas : [],
      bab: Array.isArray(data.bab) ? data.bab : [],
      konten: Array.isArray(data.konten) ? data.konten : [],
      pengumuman: Array.isArray(data.pengumuman) ? data.pengumuman : []
    };

    terapkanTemaAdmin(stateAdmin.pengaturan);
    renderHeaderAdminSudahLogin();
    renderRuangKerjaAdmin();
  }

  function terapkanTemaAdmin(p) {
    const temaValid = ["samudra", "hutan", "senja", "netral"];
    const temaDipilih = String((p && p.tema) || "samudra").trim().toLowerCase();
    document.documentElement.setAttribute(
      "data-tema",
      temaValid.indexOf(temaDipilih) !== -1 ? temaDipilih : "samudra"
    );

    const judulHeader = document.getElementById("judul-header-admin");
    if (judulHeader) {
      judulHeader.textContent = "Admin — " + ((p && p.nama_situs) || "Ruang Matematika");
    }
  }

  // ==========================================================================
  // LAYAR LOGIN ADMIN
  // ==========================================================================

  function tampilkanLayarLogin(pesanPeringatan) {
    const aksiHeader = document.getElementById("aksi-header-admin");
    if (aksiHeader) aksiHeader.innerHTML = "";

    const wadah = document.getElementById("konten-admin");
    wadah.innerHTML = "";

    const kotak = buatElemen("section", "kotak-login");
    kotak.appendChild(buatTeks("h1", "", "Masuk ke Panel Admin"));
    kotak.appendChild(
      buatTeks(
        "p",
        "bantuan-form",
        "Masukkan password admin yang sudah Anda atur di Google Apps Script."
      )
    );

    if (pesanPeringatan) {
      const info = buatTeks("div", "kotak-status peringatan", pesanPeringatan);
      info.style.padding = "12px";
      info.style.marginTop = "14px";
      kotak.appendChild(info);
    }

    const form = buatElemen("form");
    form.style.marginTop = "20px";

    const grup = buatElemen("div", "grup-form");
    const label = buatTeks("label", "label-form", "Password Admin");
    label.setAttribute("for", "input-password-admin");
    grup.appendChild(label);

    const inputPw = buatElemen("input", "input-form");
    inputPw.type = "password";
    inputPw.id = "input-password-admin";
    inputPw.required = true;
    inputPw.autocomplete = "current-password";
    inputPw.placeholder = "Ketik password admin...";
    grup.appendChild(inputPw);
    form.appendChild(grup);

    const pesanGalat = buatElemen("p");
    pesanGalat.style.color = "var(--warna-bahaya)";
    pesanGalat.style.fontWeight = "600";
    pesanGalat.hidden = true;
    form.appendChild(pesanGalat);

    const tombolMasuk = buatTeks("button", "tombol tombol-utama", "Masuk");
    tombolMasuk.type = "submit";
    tombolMasuk.style.width = "100%";
    form.appendChild(tombolMasuk);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      pesanGalat.hidden = true;
      tombolMasuk.disabled = true;
      tombolMasuk.textContent = "Memeriksa password...";

      try {
        await API.login(inputPw.value);
        const dataAdmin = await API.ambilDataAdmin();
        simpanStateDanMasukDasbor(dataAdmin);
        tampilkanToast("Berhasil masuk ke panel admin.", "sukses");
      } catch (err) {
        pesanGalat.textContent = err.message || "Gagal masuk. Periksa password Anda.";
        pesanGalat.hidden = false;
        tombolMasuk.disabled = false;
        tombolMasuk.textContent = "Masuk";
      }
    });

    kotak.appendChild(form);
    wadah.appendChild(kotak);
  }

  function renderHeaderAdminSudahLogin() {
    const aksiHeader = document.getElementById("aksi-header-admin");
    aksiHeader.innerHTML = "";

    const tautanWeb = buatTeks("a", "tombol tombol-sekunder tombol-kecil", "Lihat Situs Siswa ↗");
    tautanWeb.href = "./index.html";
    tautanWeb.target = "_blank";
    tautanWeb.rel = "noopener noreferrer";
    aksiHeader.appendChild(tautanWeb);

    const tombolKeluar = buatTeks("button", "tombol tombol-bahaya tombol-kecil", "Keluar");
    tombolKeluar.type = "button";
    tombolKeluar.addEventListener("click", function () {
      API.logout();
      tampilkanLayarLogin("Anda telah keluar dari panel admin.");
    });
    aksiHeader.appendChild(tombolKeluar);
  }

  // ==========================================================================
  // KERANGKA RUANG KERJA & MENU ADMIN
  // ==========================================================================

  function renderRuangKerjaAdmin() {
    const wadah = document.getElementById("konten-admin");
    wadah.innerHTML = "";

    const daftarMenu = [
      { kode: "dasbor", label: "1. Dasbor" },
      { kode: "pengaturan", label: "2. Pengaturan Situs" },
      { kode: "kelas_bab", label: "3. Kelas & Bab" },
      { kode: "konten", label: "4. Konten Materi" },
      { kode: "pengumuman", label: "5. Pengumuman" },
      { kode: "password", label: "6. Ganti Password" }
    ];

    const bilahMenu = buatElemen("nav", "daftar-tab");
    bilahMenu.setAttribute("aria-label", "Menu pengelolaan admin");

    daftarMenu.forEach(function (m) {
      const btn = buatTeks(
        "button",
        "tombol-tab" + (menuAktif === m.kode ? " aktif" : ""),
        m.label
      );
      btn.type = "button";
      btn.addEventListener("click", function () {
        menuAktif = m.kode;
        renderRuangKerjaAdmin();
      });
      bilahMenu.appendChild(btn);
    });

    wadah.appendChild(bilahMenu);

    const areaTab = buatElemen("div");
    wadah.appendChild(areaTab);

    if (menuAktif === "dasbor") renderTabDasbor(areaTab);
    else if (menuAktif === "pengaturan") renderTabPengaturan(areaTab);
    else if (menuAktif === "kelas_bab") renderTabKelasDanBab(areaTab);
    else if (menuAktif === "konten") renderTabKonten(areaTab);
    else if (menuAktif === "pengumuman") renderTabPengumuman(areaTab);
    else if (menuAktif === "password") renderTabGantiPassword(areaTab);
  }

  // ==========================================================================
  // TAB 1: DASBOR RINGKASAN
  // ==========================================================================

  function renderTabDasbor(wadah) {
    wadah.appendChild(buatTeks("h1", "judul-bagian", "Ringkasan Website"));

    const babTerbit = stateAdmin.bab.filter(function (b) {
      return b.status === "terbit";
    }).length;
    const babDraf = stateAdmin.bab.filter(function (b) {
      return b.status !== "terbit";
    }).length;
    const kontenTerbit = stateAdmin.konten.filter(function (c) {
      return c.status === "terbit";
    }).length;
    const pengumumanAktif = stateAdmin.pengumuman.filter(function (p) {
      return p.status === "aktif" || p.status === "terbit";
    }).length;

    const grid = buatElemen("div", "grid-dasbor");
    const kartuRingkasan = [
      { judul: "Bab Sudah Terbit", angka: babTerbit },
      { judul: "Bab Masih Draf", angka: babDraf },
      { judul: "Total Materi Terbit", angka: kontenTerbit },
      { judul: "Pengumuman Aktif", angka: pengumumanAktif }
    ];

    kartuRingkasan.forEach(function (item) {
      const kartu = buatElemen("div", "kartu-angka");
      kartu.appendChild(buatTeks("div", "angka", String(item.angka)));
      kartu.appendChild(buatTeks("div", "bantuan-form", item.judul));
      grid.appendChild(kartu);
    });
    wadah.appendChild(grid);

    const kartuPanduan = buatElemen("section", "kartu-materi");
    kartuPanduan.appendChild(buatTeks("h3", "", "Langkah Cepat Mengisi Bahan Ajar"));
    kartuPanduan.appendChild(
      buatTeks(
        "p",
        "",
        "1) Atur identitas sekolah dan tema di '2. Pengaturan Situs'. 2) Buat atau terbitkan bab di '3. Kelas & Bab'. 3) Isi video YouTube, PDF Drive, Kuis Form, GeoGebra, Media Web, atau teks rumus di '4. Konten Materi'. 4) Pasang info jadwal atau tugas penting di '5. Pengumuman'."
      )
    );

    const barisTombol = buatElemen("div");
    barisTombol.style.display = "flex";
    barisTombol.style.flexWrap = "wrap";
    barisTombol.style.gap = "10px";

    const btnKeBab = buatTeks("button", "tombol tombol-utama", "+ Kelola Kelas & Bab");
    btnKeBab.type = "button";
    btnKeBab.addEventListener("click", function () {
      menuAktif = "kelas_bab";
      renderRuangKerjaAdmin();
    });
    barisTombol.appendChild(btnKeBab);

    const btnKeKonten = buatTeks("button", "tombol tombol-sekunder", "+ Tambah Konten Materi");
    btnKeKonten.type = "button";
    btnKeKonten.addEventListener("click", function () {
      menuAktif = "konten";
      renderRuangKerjaAdmin();
    });
    barisTombol.appendChild(btnKeKonten);

    const btnKePengumuman = buatTeks("button", "tombol tombol-sekunder", "+ Buat Pengumuman");
    btnKePengumuman.type = "button";
    btnKePengumuman.addEventListener("click", function () {
      menuAktif = "pengumuman";
      renderRuangKerjaAdmin();
    });
    barisTombol.appendChild(btnKePengumuman);

    kartuPanduan.appendChild(barisTombol);
    wadah.appendChild(kartuPanduan);
  }

  // ==========================================================================
  // TAB 2: PENGATURAN SITUS & TEMA
  // ==========================================================================

  function renderTabPengaturan(wadah) {
    const kartu = buatElemen("section", "kartu-materi");
    kartu.appendChild(buatTeks("h2", "", "Pengaturan Identitas & Tampilan Situs"));
    kartu.appendChild(
      buatTeks(
        "p",
        "bantuan-form",
        "Semua perubahan di bawah ini langsung tersimpan ke tab Pengaturan di Google Sheet."
      )
    );

    const form = buatElemen("form");
    form.style.marginTop = "20px";

    const petaInput = {};

    DAFTAR_FIELD_PENGATURAN.forEach(function (def) {
      const grup = buatElemen("div", "grup-form");
      const idInput = "set-" + def.kunci;

      const label = buatTeks("label", "label-form", def.label);
      label.setAttribute("for", idInput);
      grup.appendChild(label);

      const nilaiSekarang = stateAdmin.pengaturan[def.kunci] || "";
      let elemenInput;

      if (def.jenis === "select") {
        elemenInput = buatElemen("select", "select-form");
        def.opsi.forEach(function (op) {
          const opt = document.createElement("option");
          opt.value = op.nilai;
          opt.textContent = op.label;
          if (nilaiSekarang === op.nilai) opt.selected = true;
          elemenInput.appendChild(opt);
        });

        if (def.kunci === "tema") {
          elemenInput.addEventListener("change", function () {
            document.documentElement.setAttribute("data-tema", elemenInput.value);
          });
        }
      } else if (def.jenis === "textarea") {
        elemenInput = buatElemen("textarea", "textarea-form");
        elemenInput.rows = 3;
        elemenInput.value = nilaiSekarang;
      } else {
        elemenInput = buatElemen("input", "input-form");
        elemenInput.type = def.jenis;
        elemenInput.value = nilaiSekarang;
      }

      elemenInput.id = idInput;
      petaInput[def.kunci] = elemenInput;
      grup.appendChild(elemenInput);

      if (def.bantuan) {
        grup.appendChild(buatTeks("span", "bantuan-form", def.bantuan));
      }

      form.appendChild(grup);
    });

    const tombolSimpan = buatTeks("button", "tombol tombol-utama", "Simpan Semua Pengaturan");
    tombolSimpan.type = "submit";
    form.appendChild(tombolSimpan);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      tombolSimpan.disabled = true;
      tombolSimpan.textContent = "Menyimpan pengaturan...";

      const daftarKirim = DAFTAR_FIELD_PENGATURAN.map(function (def) {
        return {
          kunci: def.kunci,
          nilai: petaInput[def.kunci].value.trim(),
          keterangan: def.bantuan || ""
        };
      });

      try {
        const dataBaru = await API.simpanPengaturan(daftarKirim);
        stateAdmin = Object.assign(stateAdmin, dataBaru);
        terapkanTemaAdmin(stateAdmin.pengaturan);
        tampilkanToast("Pengaturan berhasil disimpan!", "sukses");
      } catch (err) {
        tanganiGalatAdmin(err);
      } finally {
        tombolSimpan.disabled = false;
        tombolSimpan.textContent = "Simpan Semua Pengaturan";
      }
    });

    kartu.appendChild(form);
    wadah.appendChild(kartu);
  }

  // ==========================================================================
  // TAB 3: KELOLA KELAS & BAB
  // ==========================================================================

  function renderTabKelasDanBab(wadah) {
    const kartuKelas = buatElemen("section", "kartu-materi");
    kartuKelas.style.marginBottom = "24px";
    kartuKelas.appendChild(buatTeks("h2", "", "Daftar Kelas"));

    stateAdmin.kelas.forEach(function (kls) {
      const baris = buatElemen("div", "item-daftar-admin");
      const info = buatElemen("div");
      info.appendChild(buatTeks("strong", "", kls.nama + " "));
      info.appendChild(
        buatTeks(
          "span",
          "lencana " + (kls.aktif === "ya" ? "lencana-terbit" : "lencana-draf"),
          kls.aktif === "ya" ? "Aktif" : "Disembunyikan"
        )
      );
      info.appendChild(buatTeks("div", "bantuan-form", "Urutan tampil: " + kls.urutan));
      baris.appendChild(info);

      const tombolToggle = buatTeks(
        "button",
        "tombol tombol-sekunder tombol-kecil",
        kls.aktif === "ya" ? "Sembunyikan Kelas" : "Aktifkan Kelas"
      );
      tombolToggle.type = "button";
      tombolToggle.addEventListener("click", async function () {
        tombolToggle.disabled = true;
        try {
          const dataBaru = await API.simpanKelas({
            id: kls.id,
            nama: kls.nama,
            urutan: kls.urutan,
            aktif: kls.aktif === "ya" ? "tidak" : "ya"
          });
          stateAdmin = Object.assign(stateAdmin, dataBaru);
          tampilkanToast("Status kelas diperbarui.", "sukses");
          renderRuangKerjaAdmin();
        } catch (err) {
          tanganiGalatAdmin(err);
          tombolToggle.disabled = false;
        }
      });
      baris.appendChild(tombolToggle);
      kartuKelas.appendChild(baris);
    });

    wadah.appendChild(kartuKelas);

    const kartuFormBab = buatElemen("section", "kartu-materi");
    kartuFormBab.style.marginBottom = "24px";

    const judulFormBab = buatTeks("h2", "", "Tambah Bab Baru");
    kartuFormBab.appendChild(judulFormBab);

    const formBab = buatElemen("form");
    let idBabEdit = "";

    const baris1 = buatElemen("div", "baris-dua-kolom");

    const grupKelas = buatElemen("div", "grup-form");
    grupKelas.appendChild(buatTeks("label", "label-form", "Pilih Kelas"));
    const selectKelas = buatElemen("select", "select-form");
    stateAdmin.kelas.forEach(function (kls) {
      const opt = document.createElement("option");
      opt.value = kls.id;
      opt.textContent = kls.nama;
      selectKelas.appendChild(opt);
    });
    grupKelas.appendChild(selectKelas);
    baris1.appendChild(grupKelas);

    const grupIkon = buatElemen("div", "grup-form");
    grupIkon.appendChild(buatTeks("label", "label-form", "Ikon Bab (Emoji)"));
    const inputIkon = buatElemen("input", "input-form");
    inputIkon.type = "text";
    inputIkon.value = "📘";
    inputIkon.placeholder = "Contoh: 📘, 📐, 📊, 🔢";
    grupIkon.appendChild(inputIkon);
    baris1.appendChild(grupIkon);

    formBab.appendChild(baris1);

    const grupJudul = buatElemen("div", "grup-form");
    grupJudul.appendChild(buatTeks("label", "label-form", "Judul Bab"));
    const inputJudul = buatElemen("input", "input-form");
    inputJudul.type = "text";
    inputJudul.required = true;
    inputJudul.placeholder = "Contoh: Bilangan Bulat";
    grupJudul.appendChild(inputJudul);
    formBab.appendChild(grupJudul);

    const grupDesk = buatElemen("div", "grup-form");
    grupDesk.appendChild(buatTeks("label", "label-form", "Deskripsi Singkat"));
    const inputDesk = buatElemen("input", "input-form");
    inputDesk.type = "text";
    inputDesk.placeholder = "Ringkasan 1 kalimat tentang isi bab ini.";
    grupDesk.appendChild(inputDesk);
    formBab.appendChild(grupDesk);

    const grupTujuan = buatElemen("div", "grup-form");
    grupTujuan.appendChild(buatTeks("label", "label-form", "Tujuan Pembelajaran (Tab Mulai)"));
    const inputTujuan = buatElemen("textarea", "textarea-form");
    inputTujuan.rows = 3;
    inputTujuan.placeholder = "Setelah mempelajari bab ini, siswa mampu...";
    grupTujuan.appendChild(inputTujuan);
    formBab.appendChild(grupTujuan);

    const grupPemantik = buatElemen("div", "grup-form");
    grupPemantik.appendChild(buatTeks("label", "label-form", "Pertanyaan Pemantik (Tab Mulai)"));
    const inputPemantik = buatElemen("textarea", "textarea-form");
    inputPemantik.rows = 2;
    inputPemantik.placeholder = "Pertanyaan pembuka yang memicu rasa ingin tahu siswa...";
    grupPemantik.appendChild(inputPemantik);
    formBab.appendChild(grupPemantik);

    const baris2 = buatElemen("div", "baris-dua-kolom");

    const grupUrutan = buatElemen("div", "grup-form");
    grupUrutan.appendChild(buatTeks("label", "label-form", "Nomor Urut Bab"));
    const inputUrutan = buatElemen("input", "input-form");
    inputUrutan.type = "number";
    inputUrutan.min = 1;
    inputUrutan.value = String(stateAdmin.bab.length + 1);
    grupUrutan.appendChild(inputUrutan);
    baris2.appendChild(grupUrutan);

    const grupStatus = buatElemen("div", "grup-form");
    grupStatus.appendChild(buatTeks("label", "label-form", "Status Publikasi"));
    const selectStatus = buatElemen("select", "select-form");
    [
      { nilai: "terbit", label: "Terbit (Tampil di halaman siswa)" },
      { nilai: "draf", label: "Draf (Disembunyikan dari siswa)" }
    ].forEach(function (st) {
      const opt = document.createElement("option");
      opt.value = st.nilai;
      opt.textContent = st.label;
      selectStatus.appendChild(opt);
    });
    grupStatus.appendChild(selectStatus);
    baris2.appendChild(grupStatus);

    formBab.appendChild(baris2);

    const barisAksiBab = buatElemen("div");
    barisAksiBab.style.display = "flex";
    barisAksiBab.style.gap = "10px";

    const tombolSimpanBab = buatTeks("button", "tombol tombol-utama", "Simpan Bab");
    tombolSimpanBab.type = "submit";
    barisAksiBab.appendChild(tombolSimpanBab);

    const tombolBatalEditBab = buatTeks("button", "tombol tombol-sekunder", "Batal Ubah");
    tombolBatalEditBab.type = "button";
    tombolBatalEditBab.hidden = true;
    tombolBatalEditBab.addEventListener("click", function () {
      idBabEdit = "";
      judulFormBab.textContent = "Tambah Bab Baru";
      formBab.reset();
      inputIkon.value = "📘";
      inputUrutan.value = String(stateAdmin.bab.length + 1);
      tombolBatalEditBab.hidden = true;
    });
    barisAksiBab.appendChild(tombolBatalEditBab);

    formBab.appendChild(barisAksiBab);

    formBab.addEventListener("submit", async function (e) {
      e.preventDefault();
      tombolSimpanBab.disabled = true;
      tombolSimpanBab.textContent = "Menyimpan bab...";

      try {
        const dataBaru = await API.simpanBab({
          id: idBabEdit,
          id_kelas: selectKelas.value,
          judul: inputJudul.value.trim(),
          deskripsi: inputDesk.value.trim(),
          ikon: inputIkon.value.trim() || "📘",
          tujuan_belajar: inputTujuan.value.trim(),
          pertanyaan_pemantik: inputPemantik.value.trim(),
          urutan: Number(inputUrutan.value || 1),
          status: selectStatus.value
        });
        stateAdmin = Object.assign(stateAdmin, dataBaru);
        tampilkanToast("Data bab berhasil disimpan!", "sukses");
        renderRuangKerjaAdmin();
      } catch (err) {
        tanganiGalatAdmin(err);
        tombolSimpanBab.disabled = false;
        tombolSimpanBab.textContent = "Simpan Bab";
      }
    });

    kartuFormBab.appendChild(formBab);
    wadah.appendChild(kartuFormBab);

    const kartuDaftarBab = buatElemen("section", "kartu-materi");
    kartuDaftarBab.appendChild(buatTeks("h2", "", "Daftar Semua Bab (" + stateAdmin.bab.length + ")"));

    if (stateAdmin.bab.length === 0) {
      kartuDaftarBab.appendChild(
        buatTeks("p", "bantuan-form", "Belum ada bab. Silakan buat bab pertama melalui formulir di atas.")
      );
    } else {
      stateAdmin.bab.forEach(function (bab) {
        const kelasObj = stateAdmin.kelas.find(function (k) {
          return k.id === bab.id_kelas;
        });

        const baris = buatElemen("div", "item-daftar-admin");
        const kiri = buatElemen("div");
        kiri.appendChild(buatTeks("strong", "", (bab.ikon || "📘") + " " + bab.judul + " "));
        kiri.appendChild(
          buatTeks(
            "span",
            "lencana " + (bab.status === "terbit" ? "lencana-terbit" : "lencana-draf"),
            bab.status === "terbit" ? "Terbit" : "Draf"
          )
        );
        kiri.appendChild(
          buatTeks(
            "div",
            "bantuan-form",
            (kelasObj ? kelasObj.nama : bab.id_kelas) + " • Urutan: " + bab.urutan
          )
        );
        baris.appendChild(kiri);

        const kanan = buatElemen("div");
        kanan.style.display = "flex";
        kanan.style.flexWrap = "wrap";
        kanan.style.gap = "8px";

        const btnUbah = buatTeks("button", "tombol tombol-sekunder tombol-kecil", "Ubah");
        btnUbah.type = "button";
        btnUbah.addEventListener("click", function () {
          idBabEdit = bab.id;
          judulFormBab.textContent = "Ubah Bab: " + bab.judul;
          selectKelas.value = bab.id_kelas;
          inputIkon.value = bab.ikon || "📘";
          inputJudul.value = bab.judul;
          inputDesk.value = bab.deskripsi || "";
          inputTujuan.value = bab.tujuan_belajar || "";
          inputPemantik.value = bab.pertanyaan_pemantik || "";
          inputUrutan.value = String(bab.urutan || 1);
          selectStatus.value = bab.status || "draf";
          tombolBatalEditBab.hidden = false;
          kartuFormBab.scrollIntoView({ behavior: "smooth" });
        });
        kanan.appendChild(btnUbah);

        const btnHapus = buatTeks("button", "tombol tombol-bahaya tombol-kecil", "Hapus");
        btnHapus.type = "button";
        btnHapus.addEventListener("click", async function () {
          const yakin = window.confirm(
            "Yakin ingin menghapus bab '" +
              bab.judul +
              "'? Semua materi/konten di dalam bab ini juga akan ikut terhapus."
          );
          if (!yakin) return;

          btnHapus.disabled = true;
          try {
            const dataBaru = await API.hapusBab(bab.id);
            stateAdmin = Object.assign(stateAdmin, dataBaru);
            tampilkanToast("Bab berhasil dihapus.", "sukses");
            renderRuangKerjaAdmin();
          } catch (err) {
            tanganiGalatAdmin(err);
            btnHapus.disabled = false;
          }
        });
        kanan.appendChild(btnHapus);

        baris.appendChild(kanan);
        kartuDaftarBab.appendChild(baris);
      });
    }

    wadah.appendChild(kartuDaftarBab);
  }

  // ==========================================================================
  // TAB 4: KELOLA KONTEN MATERI & PRATINJAU TERSEMAT
  // ==========================================================================

  function renderTabKonten(wadah) {
    if (stateAdmin.bab.length === 0) {
      const kosong = buatElemen("div", "kotak-status peringatan");
      kosong.appendChild(buatTeks("h2", "", "Belum ada Bab"));
      kosong.appendChild(
        buatTeks("p", "", "Buat minimal satu bab di menu '3. Kelas & Bab' sebelum menambahkan konten materi.")
      );
      wadah.appendChild(kosong);
      return;
    }

    const kartuForm = buatElemen("section", "kartu-materi");
    kartuForm.style.marginBottom = "24px";

    const judulForm = buatTeks("h2", "", "Tambah Konten Materi");
    kartuForm.appendChild(judulForm);

    const form = buatElemen("form");
    let idKontenEdit = "";

    const baris1 = buatElemen("div", "baris-dua-kolom");

    const grupBab = buatElemen("div", "grup-form");
    grupBab.appendChild(buatTeks("label", "label-form", "Pilih Bab"));
    const selectBab = buatElemen("select", "select-form");
    stateAdmin.bab.forEach(function (bab) {
      const kelasObj = stateAdmin.kelas.find(function (k) {
        return k.id === bab.id_kelas;
      });
      const opt = document.createElement("option");
      opt.value = bab.id;
      opt.textContent = (kelasObj ? kelasObj.nama + " — " : "") + bab.judul;
      selectBab.appendChild(opt);
    });
    grupBab.appendChild(selectBab);
    baris1.appendChild(grupBab);

    const grupTab = buatElemen("div", "grup-form");
    grupTab.appendChild(buatTeks("label", "label-form", "Letakkan di Tab"));
    const selectTab = buatElemen("select", "select-form");
    [
      { nilai: "pahami", label: "Pahami (Ringkasan, PDF, Slide)" },
      { nilai: "tonton", label: "Tonton (Video Pembelajaran)" },
      { nilai: "coba", label: "Coba (LKPD, Simulasi, Latihan)" },
      { nilai: "uji", label: "Uji (Kuis & Pembahasan)" },
      { nilai: "mulai", label: "Mulai (Pengantar Tambahan)" }
    ].forEach(function (t) {
      const opt = document.createElement("option");
      opt.value = t.nilai;
      opt.textContent = t.label;
      selectTab.appendChild(opt);
    });
    grupTab.appendChild(selectTab);
    baris1.appendChild(grupTab);

    form.appendChild(baris1);

    const grupJudul = buatElemen("div", "grup-form");
    grupJudul.appendChild(buatTeks("label", "label-form", "Judul Materi"));
    const inputJudul = buatElemen("input", "input-form");
    inputJudul.type = "text";
    inputJudul.required = true;
    inputJudul.placeholder = "Contoh: Video Penjelasan Penjumlahan Bilangan Bulat";
    grupJudul.appendChild(inputJudul);
    form.appendChild(grupJudul);

    const grupJenis = buatElemen("div", "grup-form");
    grupJenis.appendChild(buatTeks("label", "label-form", "Jenis Konten"));
    const selectJenis = buatElemen("select", "select-form");
    [
      { nilai: "youtube", label: "Video YouTube" },
      { nilai: "pdf", label: "Berkas PDF dari Google Drive" },
      { nilai: "dokumen", label: "Dokumen / Google Docs dari Drive" },
      { nilai: "slide", label: "Presentasi / Google Slides dari Drive" },
      { nilai: "gambar", label: "Gambar / Poster dari Google Drive" },
      { nilai: "kuis_form", label: "Kuis Google Form" },
      { nilai: "geogebra", label: "Simulasi GeoGebra" },
      { nilai: "media_web", label: "Media Web Interaktif (Folder media/...)" },
      { nilai: "teks", label: "Teks & Rumus Matematika (KaTeX)" }
    ].forEach(function (j) {
      const opt = document.createElement("option");
      opt.value = j.nilai;
      opt.textContent = j.label;
      selectJenis.appendChild(opt);
    });
    grupJenis.appendChild(selectJenis);
    form.appendChild(grupJenis);

    // Input Tautan atau Jalur Folder Media Web
    const grupUrl = buatElemen("div", "grup-form");
    const labelUrl = buatTeks("label", "label-form", "Tautan Asli (YouTube / Google Drive / Form / GeoGebra)");
    grupUrl.appendChild(labelUrl);
    const inputUrl = buatElemen("input", "input-form");
    inputUrl.type = "url";
    inputUrl.placeholder = "Tempelkan tautan https://... di sini";
    grupUrl.appendChild(inputUrl);
    const bantuanUrl = buatTeks(
      "span",
      "bantuan-form",
      "Untuk berkas Google Drive, pastikan akses berbagi sudah diatur ke 'Siapa saja yang memiliki tautan dapat melihat'."
    );
    grupUrl.appendChild(bantuanUrl);
    form.appendChild(grupUrl);

    // Input Teks & Rumus (khusus jenis "teks")
    const grupTeks = buatElemen("div", "grup-form");
    grupTeks.hidden = true;
    grupTeks.appendChild(buatTeks("label", "label-form", "Isi Teks & Rumus Matematika"));
    const inputTeks = buatElemen("textarea", "textarea-form");
    inputTeks.rows = 6;
    inputTeks.placeholder =
      "Tulis penjelasan di sini. Gunakan $...$ untuk rumus di dalam kalimat (contoh: $a^2 + b^2 = c^2$) atau $$...$$ untuk rumus satu baris penuh.";
    grupTeks.appendChild(inputTeks);
    form.appendChild(grupTeks);

    // Wadah Pratinjau Tersemat
    const wadahPratinjau = buatElemen("div", "grup-form");
    wadahPratinjau.hidden = true;
    form.appendChild(wadahPratinjau);

    function perbaruiTampilanInputJenis() {
      const jenis = selectJenis.value;
      const adalahTeks = jenis === "teks";
      const adalahMediaWeb = jenis === "media_web";

      grupUrl.hidden = adalahTeks;
      grupTeks.hidden = !adalahTeks;
      wadahPratinjau.hidden = true;
      wadahPratinjau.innerHTML = "";

      if (adalahMediaWeb) {
        inputUrl.type = "text";
        labelUrl.textContent = "Nama Folder Media Web di Repositori";
        inputUrl.placeholder = "Contoh: media/bilangan-bulat";
        bantuanUrl.textContent =
          "Masukkan jalur folder di dalam repositori GitHub Anda yang berisi berkas index.html (contoh: media/bilangan-bulat).";
      } else if (jenis === "kuis_form") {
        inputUrl.type = "url";
        labelUrl.textContent = "Tautan Kuis Google Form";
        inputUrl.placeholder = "https://docs.google.com/forms/d/e/.../viewform atau https://forms.gle/...";
        bantuanUrl.textContent =
          "Tempelkan tautan formulir dari tombol Kirim (Send) di Google Form.";
      } else if (jenis === "geogebra") {
        inputUrl.type = "url";
        labelUrl.textContent = "Tautan Aktivitas / Applet GeoGebra";
        inputUrl.placeholder = "https://www.geogebra.org/m/...";
        bantuanUrl.textContent =
          "Tempelkan tautan materi dari situs geogebra.org.";
      } else {
        inputUrl.type = "url";
        labelUrl.textContent = "Tautan Asli (YouTube atau Google Drive)";
        inputUrl.placeholder = "Tempelkan tautan https://... di sini";
        bantuanUrl.textContent =
          "Untuk berkas Google Drive, pastikan akses berbagi sudah diatur ke 'Siapa saja yang memiliki tautan dapat melihat'.";
      }
    }

    selectJenis.addEventListener("change", perbaruiTampilanInputJenis);

    function tampilkanPratinjau() {
      wadahPratinjau.innerHTML = "";
      wadahPratinjau.hidden = false;

      const jenis = selectJenis.value;
      if (jenis === "teks") {
        if (!inputTeks.value.trim()) {
          wadahPratinjau.appendChild(
            buatTeks("div", "kotak-status peringatan", "Ketik teks atau rumus terlebih dahulu untuk melihat pratinjau.")
          );
          return;
        }
        const kotak = buatElemen("div", "kartu-materi");
        kotak.appendChild(buatTeks("strong", "", "Pratinjau Tampilan Siswa:"));
        const isi = EMBED.buatElemenKonten(
          { jenis: "teks", teks: inputTeks.value },
          { modeAdmin: true }
        );
        isi.style.marginTop = "12px";
        kotak.appendChild(isi);
        wadahPratinjau.appendChild(kotak);
        return;
      }

      const hasilKonversi = EMBED.konversiUrl(jenis, inputUrl.value);
      if (!hasilKonversi.valid) {
        wadahPratinjau.appendChild(
          buatTeks("div", "kotak-status galat", hasilKonversi.pesanError)
        );
        return;
      }

      const kotakSemat = buatElemen("div", "kartu-materi");
      kotakSemat.appendChild(buatTeks("strong", "", "Pratinjau Tersemat:"));
      const isiSemat = EMBED.buatElemenKonten(
        {
          judul: inputJudul.value || "Pratinjau Materi",
          jenis: jenis,
          url_asli: inputUrl.value.trim(),
          url_embed: hasilKonversi.urlEmbed
        },
        { modeAdmin: true }
      );
      isiSemat.style.marginTop = "12px";
      kotakSemat.appendChild(isiSemat);
      wadahPratinjau.appendChild(kotakSemat);
    }

    const baris2 = buatElemen("div", "baris-dua-kolom");

    const grupUrutan = buatElemen("div", "grup-form");
    grupUrutan.appendChild(buatTeks("label", "label-form", "Urutan Tampil"));
    const inputUrutan = buatElemen("input", "input-form");
    inputUrutan.type = "number";
    inputUrutan.min = 1;
    inputUrutan.value = "1";
    grupUrutan.appendChild(inputUrutan);
    baris2.appendChild(grupUrutan);

    const grupStatus = buatElemen("div", "grup-form");
    grupStatus.appendChild(buatTeks("label", "label-form", "Status"));
    const selectStatus = buatElemen("select", "select-form");
    [
      { nilai: "terbit", label: "Terbit (Tampil di halaman siswa)" },
      { nilai: "draf", label: "Draf (Disembunyikan sementara)" }
    ].forEach(function (st) {
      const opt = document.createElement("option");
      opt.value = st.nilai;
      opt.textContent = st.label;
      selectStatus.appendChild(opt);
    });
    grupStatus.appendChild(selectStatus);
    baris2.appendChild(grupStatus);

    form.appendChild(baris2);

    const barisTombol = buatElemen("div");
    barisTombol.style.display = "flex";
    barisTombol.style.flexWrap = "wrap";
    barisTombol.style.gap = "10px";

    const tombolPratinjau = buatTeks("button", "tombol tombol-sekunder", "Lihat Pratinjau");
    tombolPratinjau.type = "button";
    tombolPratinjau.addEventListener("click", tampilkanPratinjau);
    barisTombol.appendChild(tombolPratinjau);

    const tombolSimpan = buatTeks("button", "tombol tombol-utama", "Simpan Konten");
    tombolSimpan.type = "submit";
    barisTombol.appendChild(tombolSimpan);

    const tombolBatal = buatTeks("button", "tombol tombol-sekunder", "Batal Ubah");
    tombolBatal.type = "button";
    tombolBatal.hidden = true;
    tombolBatal.addEventListener("click", function () {
      idKontenEdit = "";
      judulForm.textContent = "Tambah Konten Materi";
      form.reset();
      perbaruiTampilanInputJenis();
      tombolBatal.hidden = true;
    });
    barisTombol.appendChild(tombolBatal);

    form.appendChild(barisTombol);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const jenis = selectJenis.value;
      let urlAsli = "";
      let urlEmbed = "";
      let teks = "";

      if (jenis === "teks") {
        teks = inputTeks.value;
        if (!teks.trim()) {
          tampilkanToast("Isi teks atau rumus tidak boleh kosong.", "galat");
          return;
        }
      } else {
        urlAsli = inputUrl.value.trim();
        const konversi = EMBED.konversiUrl(jenis, urlAsli);
        if (!konversi.valid) {
          tampilkanToast(konversi.pesanError, "galat");
          return;
        }
        urlEmbed = konversi.urlEmbed;
      }

      tombolSimpan.disabled = true;
      tombolSimpan.textContent = "Menyimpan konten...";

      try {
        const dataBaru = await API.simpanKonten({
          id: idKontenEdit,
          id_bab: selectBab.value,
          tab: selectTab.value,
          judul: inputJudul.value.trim(),
          jenis: jenis,
          url_asli: urlAsli,
          url_embed: urlEmbed,
          teks: teks,
          urutan: Number(inputUrutan.value || 1),
          status: selectStatus.value
        });
        stateAdmin = Object.assign(stateAdmin, dataBaru);
        tampilkanToast("Konten materi berhasil disimpan!", "sukses");
        renderRuangKerjaAdmin();
      } catch (err) {
        tanganiGalatAdmin(err);
        tombolSimpan.disabled = false;
        tombolSimpan.textContent = "Simpan Konten";
      }
    });

    kartuForm.appendChild(form);
    wadah.appendChild(kartuForm);

    const kartuDaftar = buatElemen("section", "kartu-materi");
    kartuDaftar.appendChild(buatTeks("h2", "", "Daftar Semua Konten (" + stateAdmin.konten.length + ")"));

    if (stateAdmin.konten.length === 0) {
      kartuDaftar.appendChild(
        buatTeks("p", "bantuan-form", "Belum ada konten materi. Tambahkan melalui formulir di atas.")
      );
    } else {
      stateAdmin.konten.forEach(function (item) {
        const babObj = stateAdmin.bab.find(function (b) {
          return b.id === item.id_bab;
        });

        const baris = buatElemen("div", "item-daftar-admin");
        const kiri = buatElemen("div");
        kiri.appendChild(buatTeks("strong", "", item.judul + " "));
        kiri.appendChild(
          buatTeks(
            "span",
            "lencana " + (item.status === "terbit" ? "lencana-terbit" : "lencana-draf"),
            item.status === "terbit" ? "Terbit" : "Draf"
          )
        );
        kiri.appendChild(
          buatTeks(
            "div",
            "bantuan-form",
            (babObj ? babObj.judul : item.id_bab) +
              " • Tab: " +
              item.tab.toUpperCase() +
              " • Jenis: " +
              item.jenis +
              " • Urutan: " +
              item.urutan
          )
        );
        baris.appendChild(kiri);

        const kanan = buatElemen("div");
        kanan.style.display = "flex";
        kanan.style.gap = "8px";

        const btnUbah = buatTeks("button", "tombol tombol-sekunder tombol-kecil", "Ubah");
        btnUbah.type = "button";
        btnUbah.addEventListener("click", function () {
          idKontenEdit = item.id;
          judulForm.textContent = "Ubah Konten: " + item.judul;
          selectBab.value = item.id_bab;
          selectTab.value = item.tab;
          inputJudul.value = item.judul;
          selectJenis.value = item.jenis;
          perbaruiTampilanInputJenis();
          inputUrl.value = item.url_asli || "";
          inputTeks.value = item.teks || "";
          inputUrutan.value = String(item.urutan || 1);
          selectStatus.value = item.status || "draf";
          tombolBatal.hidden = false;
          tampilkanPratinjau();
          kartuForm.scrollIntoView({ behavior: "smooth" });
        });
        kanan.appendChild(btnUbah);

        const btnHapus = buatTeks("button", "tombol tombol-bahaya tombol-kecil", "Hapus");
        btnHapus.type = "button";
        btnHapus.addEventListener("click", async function () {
          const yakin = window.confirm("Yakin ingin menghapus konten '" + item.judul + "'?");
          if (!yakin) return;

          btnHapus.disabled = true;
          try {
            const dataBaru = await API.hapusKonten(item.id);
            stateAdmin = Object.assign(stateAdmin, dataBaru);
            tampilkanToast("Konten berhasil dihapus.", "sukses");
            renderRuangKerjaAdmin();
          } catch (err) {
            tanganiGalatAdmin(err);
            btnHapus.disabled = false;
          }
        });
        kanan.appendChild(btnHapus);

        baris.appendChild(kanan);
        kartuDaftar.appendChild(baris);
      });
    }

    wadah.appendChild(kartuDaftar);
  }

  // ==========================================================================
  // TAB 5: KELOLA PENGUMUMAN BERANDA
  // ==========================================================================

  function renderTabPengumuman(wadah) {
    const kartuForm = buatElemen("section", "kartu-materi");
    kartuForm.style.marginBottom = "24px";

    const judulForm = buatTeks("h2", "", "Buat Pengumuman Baru");
    kartuForm.appendChild(judulForm);
    kartuForm.appendChild(
      buatTeks(
        "p",
        "bantuan-form",
        "Pengumuman berstatus Aktif akan tampil di halaman Beranda siswa sampai tanggal batas tayang berakhir."
      )
    );

    const form = buatElemen("form");
    form.style.marginTop = "16px";
    let idEdit = "";

    const grupJudul = buatElemen("div", "grup-form");
    grupJudul.appendChild(buatTeks("label", "label-form", "Judul Pengumuman"));
    const inputJudul = buatElemen("input", "input-form");
    inputJudul.type = "text";
    inputJudul.required = true;
    inputJudul.placeholder = "Contoh: Jadwal Penilaian Harian Bab Bilangan Bulat";
    grupJudul.appendChild(inputJudul);
    form.appendChild(grupJudul);

    const grupIsi = buatElemen("div", "grup-form");
    grupIsi.appendChild(buatTeks("label", "label-form", "Isi Pengumuman"));
    const inputIsi = buatElemen("textarea", "textarea-form");
    inputIsi.rows = 3;
    inputIsi.required = true;
    inputIsi.placeholder = "Tuliskan informasi lengkap untuk siswa...";
    grupIsi.appendChild(inputIsi);
    form.appendChild(grupIsi);

    const baris2 = buatElemen("div", "baris-dua-kolom");

    const grupTanggal = buatElemen("div", "grup-form");
    grupTanggal.appendChild(buatTeks("label", "label-form", "Aktif Sampai Tanggal (Opsional)"));
    const inputTanggal = buatElemen("input", "input-form");
    inputTanggal.type = "date";
    grupTanggal.appendChild(inputTanggal);
    grupTanggal.appendChild(
      buatTeks("span", "bantuan-form", "Kosongkan jika pengumuman ingin terus tampil sampai dinonaktifkan.")
    );
    baris2.appendChild(grupTanggal);

    const grupStatus = buatElemen("div", "grup-form");
    grupStatus.appendChild(buatTeks("label", "label-form", "Status Pengumuman"));
    const selectStatus = buatElemen("select", "select-form");
    [
      { nilai: "aktif", label: "Aktif (Tampil di Beranda)" },
      { nilai: "nonaktif", label: "Nonaktif (Disembunyikan)" }
    ].forEach(function (st) {
      const opt = document.createElement("option");
      opt.value = st.nilai;
      opt.textContent = st.label;
      selectStatus.appendChild(opt);
    });
    grupStatus.appendChild(selectStatus);
    baris2.appendChild(grupStatus);

    form.appendChild(baris2);

    const barisTombol = buatElemen("div");
    barisTombol.style.display = "flex";
    barisTombol.style.gap = "10px";

    const tombolSimpan = buatTeks("button", "tombol tombol-utama", "Simpan Pengumuman");
    tombolSimpan.type = "submit";
    barisTombol.appendChild(tombolSimpan);

    const tombolBatal = buatTeks("button", "tombol tombol-sekunder", "Batal Ubah");
    tombolBatal.type = "button";
    tombolBatal.hidden = true;
    tombolBatal.addEventListener("click", function () {
      idEdit = "";
      judulForm.textContent = "Buat Pengumuman Baru";
      form.reset();
      tombolBatal.hidden = true;
    });
    barisTombol.appendChild(tombolBatal);

    form.appendChild(barisTombol);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      tombolSimpan.disabled = true;
      tombolSimpan.textContent = "Menyimpan...";

      try {
        const dataBaru = await API.simpanPengumuman({
          id: idEdit,
          judul: inputJudul.value.trim(),
          isi: inputIsi.value.trim(),
          aktif_sampai: inputTanggal.value,
          status: selectStatus.value
        });
        stateAdmin = Object.assign(stateAdmin, dataBaru);
        tampilkanToast("Pengumuman berhasil disimpan!", "sukses");
        renderRuangKerjaAdmin();
      } catch (err) {
        tanganiGalatAdmin(err);
        tombolSimpan.disabled = false;
        tombolSimpan.textContent = "Simpan Pengumuman";
      }
    });

    kartuForm.appendChild(form);
    wadah.appendChild(kartuForm);

    const kartuDaftar = buatElemen("section", "kartu-materi");
    kartuDaftar.appendChild(buatTeks("h2", "", "Daftar Pengumuman (" + stateAdmin.pengumuman.length + ")"));

    if (stateAdmin.pengumuman.length === 0) {
      kartuDaftar.appendChild(
        buatTeks("p", "bantuan-form", "Belum ada pengumuman yang dibuat.")
      );
    } else {
      stateAdmin.pengumuman.forEach(function (item) {
        const aktif = item.status === "aktif" || item.status === "terbit";
        const baris = buatElemen("div", "item-daftar-admin");

        const kiri = buatElemen("div");
        kiri.appendChild(buatTeks("strong", "", item.judul + " "));
        kiri.appendChild(
          buatTeks(
            "span",
            "lencana " + (aktif ? "lencana-terbit" : "lencana-draf"),
            aktif ? "Aktif" : "Nonaktif"
          )
        );
        kiri.appendChild(
          buatTeks(
            "div",
            "bantuan-form",
            (item.aktif_sampai ? "Berlaku s.d. " + item.aktif_sampai + " • " : "") +
              item.isi.slice(0, 90) +
              (item.isi.length > 90 ? "..." : "")
          )
        );
        baris.appendChild(kiri);

        const kanan = buatElemen("div");
        kanan.style.display = "flex";
        kanan.style.gap = "8px";

        const btnUbah = buatTeks("button", "tombol tombol-sekunder tombol-kecil", "Ubah");
        btnUbah.type = "button";
        btnUbah.addEventListener("click", function () {
          idEdit = item.id;
          judulForm.textContent = "Ubah Pengumuman: " + item.judul;
          inputJudul.value = item.judul;
          inputIsi.value = item.isi;
          inputTanggal.value = item.aktif_sampai || "";
          selectStatus.value = aktif ? "aktif" : "nonaktif";
          tombolBatal.hidden = false;
          kartuForm.scrollIntoView({ behavior: "smooth" });
        });
        kanan.appendChild(btnUbah);

        const btnHapus = buatTeks("button", "tombol tombol-bahaya tombol-kecil", "Hapus");
        btnHapus.type = "button";
        btnHapus.addEventListener("click", async function () {
          const yakin = window.confirm("Yakin ingin menghapus pengumuman '" + item.judul + "'?");
          if (!yakin) return;

          btnHapus.disabled = true;
          try {
            const dataBaru = await API.hapusPengumuman(item.id);
            stateAdmin = Object.assign(stateAdmin, dataBaru);
            tampilkanToast("Pengumuman berhasil dihapus.", "sukses");
            renderRuangKerjaAdmin();
          } catch (err) {
            tanganiGalatAdmin(err);
            btnHapus.disabled = false;
          }
        });
        kanan.appendChild(btnHapus);

        baris.appendChild(kanan);
        kartuDaftar.appendChild(baris);
      });
    }

    wadah.appendChild(kartuDaftar);
  }

  // ==========================================================================
  // TAB 6: GANTI PASSWORD ADMIN
  // ==========================================================================

  function renderTabGantiPassword(wadah) {
    const kartu = buatElemen("section", "kartu-materi");
    kartu.style.maxWidth = "520px";
    kartu.appendChild(buatTeks("h2", "", "Ganti Password Admin"));
    kartu.appendChild(
      buatTeks(
        "p",
        "bantuan-form",
        "Password baru minimal 8 karakter dan akan langsung diamankan sebagai kode acak (hash) di server."
      )
    );

    const form = buatElemen("form");
    form.style.marginTop = "20px";

    const grupLama = buatElemen("div", "grup-form");
    grupLama.appendChild(buatTeks("label", "label-form", "Password Lama"));
    const inputLama = buatElemen("input", "input-form");
    inputLama.type = "password";
    inputLama.required = true;
    grupLama.appendChild(inputLama);
    form.appendChild(grupLama);

    const grupBaru = buatElemen("div", "grup-form");
    grupBaru.appendChild(buatTeks("label", "label-form", "Password Baru (Minimal 8 Karakter)"));
    const inputBaru = buatElemen("input", "input-form");
    inputBaru.type = "password";
    inputBaru.minLength = 8;
    inputBaru.required = true;
    grupBaru.appendChild(inputBaru);
    form.appendChild(grupBaru);

    const grupKonfirm = buatElemen("div", "grup-form");
    grupKonfirm.appendChild(buatTeks("label", "label-form", "Ulangi Password Baru"));
    const inputKonfirm = buatElemen("input", "input-form");
    inputKonfirm.type = "password";
    inputKonfirm.minLength = 8;
    inputKonfirm.required = true;
    grupKonfirm.appendChild(inputKonfirm);
    form.appendChild(grupKonfirm);

    const tombolSimpan = buatTeks("button", "tombol tombol-utama", "Perbarui Password");
    tombolSimpan.type = "submit";
    form.appendChild(tombolSimpan);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (inputBaru.value !== inputKonfirm.value) {
        tampilkanToast("Konfirmasi password baru tidak cocok.", "galat");
        return;
      }

      tombolSimpan.disabled = true;
      tombolSimpan.textContent = "Memperbarui...";

      try {
        await API.gantiPassword(inputLama.value, inputBaru.value);
        form.reset();
        tampilkanToast("Password admin berhasil diperbarui!", "sukses");
      } catch (err) {
        tanganiGalatAdmin(err);
      } finally {
        tombolSimpan.disabled = false;
        tombolSimpan.textContent = "Perbarui Password";
      }
    });

    kartu.appendChild(form);
    wadah.appendChild(kartu);
  }

  // ==========================================================================
  // NOTIFIKASI TOAST, PENANGANAN SESI, & BANTUAN DOM
  // ==========================================================================

  function tampilkanToast(pesan, jenis) {
    const toast = document.getElementById("notifikasi-toast");
    if (!toast) return;

    toast.textContent = pesan;
    toast.className = "notifikasi-toast " + (jenis || "");
    toast.hidden = false;

    if (timerToast) clearTimeout(timerToast);
    timerToast = setTimeout(function () {
      toast.hidden = true;
    }, 4000);
  }

  function tanganiGalatAdmin(err) {
    if (err && err.kode === "SESI_HABIS") {
      tampilkanLayarLogin("Sesi Anda telah berakhir. Silakan masuk kembali.");
      return;
    }
    tampilkanToast((err && err.message) || "Terjadi kesalahan. Silakan coba lagi.", "galat");
  }

  function buatElemen(tag, namaKelas) {
    const el = document.createElement(tag);
    if (namaKelas) el.className = namaKelas;
    return el;
  }

  function buatTeks(tag, namaKelas, teks) {
    const el = buatElemen(tag, namaKelas);
    el.textContent = teks || "";
    return el;
  }
})();