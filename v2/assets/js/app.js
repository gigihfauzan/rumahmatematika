// ============================================================================
// LOGIKA HALAMAN UMUM SISWA (APP.JS — TAHAP 2)
// Mengatur tema, header, navigasi (#/), beranda + pengumuman, pencarian &
// filter materi, label Baru, halaman bab bertab, daftar centang kemajuan,
// tombol bab sebelumnya/berikutnya, serta halaman Tentang.
// ============================================================================

(function () {
  // Penyimpanan data yang dimuat dari server
  let stateData = {
    pengaturan: {},
    kelas: [],
    bab: [],
    konten: [],
    pengumuman: []
  };

  // Kunci penyimpanan kemajuan belajar di browser siswa (tanpa login)
  const KUNCI_KEMAJUAN = "wbm_kemajuan_belajar";

  // Urutan dan label tab pembelajaran pada setiap bab
  const DAFTAR_TAB_BAB = [
    { kode: "mulai", label: "Mulai" },
    { kode: "pahami", label: "Pahami" },
    { kode: "tonton", label: "Tonton" },
    { kode: "coba", label: "Coba" },
    { kode: "uji", label: "Uji" }
  ];

  // Pilihan huruf yang diizinkan dari Google Sheet
  const PETA_FONT = {
    Nunito: "'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    Poppins: "'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    Inter: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  };

  // Titik awal saat halaman selesai dimuat
  document.addEventListener("DOMContentLoaded", function () {
    mulaiAplikasi();
  });

  window.addEventListener("hashchange", function () {
    renderHalamanSesuaiRute();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("load", function () {
    const utama = document.getElementById("konten-utama");
    if (utama && typeof EMBED !== "undefined") {
      EMBED.renderRumus(utama);
    }
  });

  async function mulaiAplikasi() {
    const wadahUtama = document.getElementById("konten-utama");
    try {
      const data = await API.ambilDataPublik();
      stateData = {
        pengaturan: data.pengaturan || {},
        kelas: Array.isArray(data.kelas) ? data.kelas : [],
        bab: Array.isArray(data.bab) ? data.bab : [],
        konten: Array.isArray(data.konten) ? data.konten : [],
        pengumuman: Array.isArray(data.pengumuman) ? data.pengumuman : []
      };

      terapkanTemaDanIdentitas();
      renderFooter();
      renderHalamanSesuaiRute();
    } catch (err) {
      wadahUtama.innerHTML = "";
      const kotakGalat = buatElemen("div", "kotak-status galat");
      kotakGalat.appendChild(buatTeks("h2", "", "Halaman belum dapat dimuat"));
      kotakGalat.appendChild(
        buatTeks(
          "p",
          "",
          err && err.message
            ? err.message
            : "Terjadi gangguan saat mengambil data dari server."
        )
      );
      const tombolMuatUlang = buatTeks(
        "button",
        "tombol tombol-utama",
        "Muat ulang halaman"
      );
      tombolMuatUlang.type = "button";
      tombolMuatUlang.addEventListener("click", function () {
        window.location.reload();
      });
      kotakGalat.appendChild(tombolMuatUlang);
      wadahUtama.appendChild(kotakGalat);
    }
  }

  // ==========================================================================
  // TEMA, WARNA, FONT, LOGO, & FAVICON DARI TAB PENGATURAN
  // ==========================================================================

  function terapkanTemaDanIdentitas() {
    const p = stateData.pengaturan;
    const akar = document.documentElement;

    const temaValid = ["samudra", "hutan", "senja", "netral"];
    const temaDipilih = String(p.tema || "samudra").trim().toLowerCase();
    akar.setAttribute(
      "data-tema",
      temaValid.indexOf(temaDipilih) !== -1 ? temaDipilih : "samudra"
    );

    if (kodeWarnaHexSah(p.warna_utama)) {
      akar.style.setProperty("--warna-utama", p.warna_utama.trim());
      akar.style.setProperty("--warna-utama-gelap", p.warna_utama.trim());
    }
    if (kodeWarnaHexSah(p.warna_aksen)) {
      akar.style.setProperty("--warna-aksen", p.warna_aksen.trim());
    }

    if (p.font_judul && PETA_FONT[p.font_judul]) {
      akar.style.setProperty("--font-judul", PETA_FONT[p.font_judul]);
    }
    if (p.font_isi && PETA_FONT[p.font_isi]) {
      akar.style.setProperty("--font-isi", PETA_FONT[p.font_isi]);
    }

    if (p.favicon_url && /^https:\/\//i.test(p.favicon_url.trim())) {
      const linkFavicon = document.getElementById("favicon-situs");
      if (linkFavicon) {
        linkFavicon.href = p.favicon_url.trim();
      }
    }
  }

  function kodeWarnaHexSah(nilai) {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(nilai || "").trim());
  }

  // ==========================================================================
  // HEADER, NAVIGASI, & FOOTER
  // ==========================================================================

  function renderHeader(menuAktifSekarang) {
    const p = stateData.pengaturan;
    const header = document.getElementById("header-situs");
    header.innerHTML = "";

    const dalam = buatElemen("div", "header-dalam");

    const merek = buatElemen("a", "merek-situs");
    merek.href = "#/";

    const namaSitus = p.nama_situs || "Ruang Matematika";
    const sloganSitus = p.slogan || "Belajar matematika langkah demi langkah";

    if (p.logo_url && /^https:\/\//i.test(p.logo_url.trim())) {
      const imgLogo = buatElemen("img", "logo-situs");
      imgLogo.src = p.logo_url.trim();
      imgLogo.alt = "Logo " + namaSitus;
      merek.appendChild(imgLogo);
    } else {
      const inisial = namaSitus.trim().charAt(0).toUpperCase() || "M";
      merek.appendChild(buatTeks("div", "logo-cadangan", inisial));
    }

    const wadahJudul = buatElemen("div");
    wadahJudul.appendChild(buatTeks("p", "judul-situs", namaSitus));
    wadahJudul.appendChild(buatTeks("p", "slogan-situs", sloganSitus));
    merek.appendChild(wadahJudul);
    dalam.appendChild(merek);

    const daftarMenuAktif = String(
      p.menu_aktif || "beranda,materi,diskusi,tentang"
    )
      .split(",")
      .map(function (m) {
        return m.trim().toLowerCase();
      });

    const semuaMenu = [
      { kode: "beranda", label: "Beranda", href: "#/" },
      { kode: "materi", label: "Materi", href: "#/materi" },
      { kode: "diskusi", label: "Diskusi", href: "#/diskusi" },
      { kode: "tentang", label: "Tentang", href: "#/tentang" }
    ];

    const nav = buatElemen("nav", "navigasi-utama");
    nav.setAttribute("aria-label", "Menu utama");

    semuaMenu.forEach(function (item) {
      if (daftarMenuAktif.indexOf(item.kode) === -1) return;
      if (
        item.kode === "diskusi" &&
        String(p.diskusi_aktif || "ya").toLowerCase() === "tidak"
      ) {
        return;
      }
      const tautan = buatTeks(
        "a",
        "tautan-nav" + (menuAktifSekarang === item.kode ? " aktif" : ""),
        item.label
      );
      tautan.href = item.href;
      nav.appendChild(tautan);
    });

    dalam.appendChild(nav);
    header.appendChild(dalam);
  }

  function renderFooter() {
    const p = stateData.pengaturan;
    const footer = document.getElementById("footer-situs");
    footer.innerHTML = "";

    const wadah = buatElemen("div", "wadah");
    const bagian = [];
    if (p.nama_sekolah) bagian.push(p.nama_sekolah);
    if (p.tahun_ajaran) bagian.push("Tahun Ajaran " + p.tahun_ajaran);
    if (p.nama_guru) bagian.push("Pengampu: " + p.nama_guru);

    const teksFooter =
      bagian.length > 0
        ? bagian.join(" • ")
        : p.nama_situs || "Website Bahan Ajar Matematika";

    wadah.appendChild(buatTeks("p", "", teksFooter));
    footer.appendChild(wadah);
  }

  // ==========================================================================
  // PENGATUR RUTE HALAMAN (#/...)
  // ==========================================================================

  function renderHalamanSesuaiRute() {
    const hash = window.location.hash.replace(/^#/, "") || "/";
    const bagian = hash.split("/").filter(Boolean);
    const namaSitus = stateData.pengaturan.nama_situs || "Ruang Matematika";

    if (bagian.length === 0) {
      document.title = namaSitus;
      renderHeader("beranda");
      renderBeranda();
      return;
    }

    if (bagian[0] === "materi") {
      document.title = "Materi — " + namaSitus;
      renderHeader("materi");
      renderDaftarMateri("");
      return;
    }

    if (bagian[0] === "kelas" && bagian[1]) {
      const idKelas = decodeURIComponent(bagian[1]);
      const kelasObj = cariKelas(idKelas);
      document.title = (kelasObj ? kelasObj.nama : "Kelas") + " — " + namaSitus;
      renderHeader("materi");
      renderDaftarMateri(idKelas);
      return;
    }

    if (bagian[0] === "bab" && bagian[1]) {
      const idBab = decodeURIComponent(bagian[1]);
      const babObj = stateData.bab.find(function (b) {
        return b.id === idBab;
      });
      document.title = (babObj ? babObj.judul : "Bab Belajar") + " — " + namaSitus;
      renderHeader("materi");
      renderHalamanBab(idBab);
      return;
    }

    if (bagian[0] === "diskusi") {
      document.title = "Diskusi — " + namaSitus;
      renderHeader("diskusi");
      renderHalamanDiskusiSementara();
      return;
    }

    if (bagian[0] === "tentang") {
      document.title = "Tentang — " + namaSitus;
      renderHeader("tentang");
      renderHalamanTentang();
      return;
    }

    window.location.hash = "#/";
  }

  // ==========================================================================
  // HALAMAN 1: BERANDA (SAPAAN, PENGUMUMAN AKTIF, PILIH KELAS, BAB TERBARU)
  // ==========================================================================

  function renderBeranda() {
    const p = stateData.pengaturan;
    const utama = document.getElementById("konten-utama");
    utama.innerHTML = "";

    // 1. Kotak sapaan hangat
    const hero = buatElemen("section", "hero-beranda");
    hero.appendChild(
      buatTeks("h1", "", p.nama_situs || "Selamat Datang di Ruang Matematika")
    );
    hero.appendChild(
      buatTeks(
        "p",
        "",
        p.teks_sambutan ||
          "Pilih kelasmu di bawah ini dan pelajari materi matematika langkah demi langkah."
      )
    );
    utama.appendChild(hero);

    // 2. Pengumuman aktif (jika ada di Google Sheet)
    if (stateData.pengumuman.length > 0) {
      const judulPgm = buatElemen("div", "judul-bagian");
      judulPgm.appendChild(buatTeks("h2", "", "📢 Pengumuman"));
      utama.appendChild(judulPgm);

      const wadahPgm = buatElemen("div", "daftar-pengumuman");
      stateData.pengumuman.forEach(function (item) {
        const kartu = buatElemen("article", "kartu-pengumuman");
        const kepala = buatElemen("div", "kepala-pengumuman");
        kepala.appendChild(buatTeks("h3", "", item.judul));
        if (item.aktif_sampai) {
          kepala.appendChild(
            buatTeks("span", "lencana lencana-baru", "Berlaku s.d. " + item.aktif_sampai)
          );
        }
        kartu.appendChild(kepala);
        kartu.appendChild(buatTeks("p", "", item.isi));
        wadahPgm.appendChild(kartu);
      });
      utama.appendChild(wadahPgm);
    }

    // 3. Bagian Pilih Kelas
    const judulKelas = buatElemen("div", "judul-bagian");
    judulKelas.appendChild(buatTeks("h2", "", "Pilih Kelas"));
    utama.appendChild(judulKelas);

    if (stateData.kelas.length === 0) {
      const kosongKelas = buatElemen("div", "kotak-status");
      kosongKelas.textContent = "Daftar kelas belum tersedia saat ini.";
      utama.appendChild(kosongKelas);
    } else {
      const gridKelas = buatElemen("div", "grid-kelas");
      stateData.kelas.forEach(function (kls) {
        const jumlahBab = stateData.bab.filter(function (b) {
          return b.id_kelas === kls.id;
        }).length;

        const kartu = buatElemen("a", "kartu-kelas");
        kartu.href = "#/kelas/" + encodeURIComponent(kls.id);

        const atas = buatElemen("div");
        atas.appendChild(buatTeks("h3", "", kls.nama));
        atas.appendChild(
          buatTeks(
            "p",
            "",
            jumlahBab > 0
              ? jumlahBab + " bab materi siap dipelajari."
              : "Materi sedang disiapkan oleh guru."
          )
        );
        kartu.appendChild(atas);
        kartu.appendChild(buatTeks("span", "panah-kartu", "Lihat daftar bab →"));
        gridKelas.appendChild(kartu);
      });
      utama.appendChild(gridKelas);
    }

    // 4. Bagian Bab Tersedia
    if (stateData.bab.length > 0) {
      const judulTerbaru = buatElemen("div", "judul-bagian");
      judulTerbaru.appendChild(buatTeks("h2", "", "Bab Materi Tersedia"));
      const tautanSemua = buatTeks(
        "a",
        "tombol tombol-sekunder tombol-kecil",
        "Cari & lihat semua bab"
      );
      tautanSemua.href = "#/materi";
      judulTerbaru.appendChild(tautanSemua);
      utama.appendChild(judulTerbaru);

      const gridBab = buatElemen("div", "grid-bab");
      stateData.bab.slice(0, 6).forEach(function (bab) {
        gridBab.appendChild(buatKartuBab(bab));
      });
      utama.appendChild(gridBab);
    }
  }

  // ==========================================================================
  // HALAMAN 2: DAFTAR MATERI / BAB PER KELAS + PENCARIAN & FILTER
  // ==========================================================================

  function renderDaftarMateri(idKelasFilter) {
    const utama = document.getElementById("konten-utama");
    utama.innerHTML = "";

    const kelasTerpilih = idKelasFilter ? cariKelas(idKelasFilter) : null;

    // Jejak halaman
    const jejak = buatElemen("nav", "jejak-halaman");
    jejak.setAttribute("aria-label", "Jejak halaman");
    const linkBeranda = buatTeks("a", "", "Beranda");
    linkBeranda.href = "#/";
    jejak.appendChild(linkBeranda);
    jejak.appendChild(buatTeks("span", "", "›"));
    jejak.appendChild(
      buatTeks("span", "", kelasTerpilih ? kelasTerpilih.nama : "Semua Materi")
    );
    utama.appendChild(jejak);

    // Judul halaman
    const kepala = buatElemen("div", "judul-bagian");
    kepala.appendChild(
      buatTeks(
        "h1",
        "",
        kelasTerpilih ? "Materi " + kelasTerpilih.nama : "Daftar Bab Matematika"
      )
    );
    utama.appendChild(kepala);

    // Tombol pemilih kelas
    const barKelas = buatElemen("div", "daftar-tab");
    const tombolSemua = buatTeks(
      "a",
      "tombol-tab" + (!idKelasFilter ? " aktif" : ""),
      "Semua Kelas"
    );
    tombolSemua.href = "#/materi";
    tombolSemua.style.textDecoration = "none";
    barKelas.appendChild(tombolSemua);

    stateData.kelas.forEach(function (kls) {
      const tombolKls = buatTeks(
        "a",
        "tombol-tab" + (idKelasFilter === kls.id ? " aktif" : ""),
        kls.nama
      );
      tombolKls.href = "#/kelas/" + encodeURIComponent(kls.id);
      tombolKls.style.textDecoration = "none";
      barKelas.appendChild(tombolKls);
    });
    utama.appendChild(barKelas);

    // Bilah pencarian kata kunci dan filter jenis media
    const bilahCari = buatElemen("div", "bilah-cari-filter");

    const inputCari = buatElemen("input", "input-form");
    inputCari.type = "search";
    inputCari.placeholder = "Cari judul bab atau topik materi (mis. pecahan, aljabar, bangun ruang)...";
    inputCari.setAttribute("aria-label", "Cari judul bab atau topik materi");
    bilahCari.appendChild(inputCari);

    const selectJenis = buatElemen("select", "select-form");
    selectJenis.setAttribute("aria-label", "Saring berdasarkan jenis media");
    [
      { nilai: "", label: "Semua Jenis Media" },
      { nilai: "youtube", label: "Video YouTube" },
      { nilai: "dokumen_drive", label: "PDF / Dokumen / Slide" },
      { nilai: "kuis_form", label: "Kuis Google Form" },
      { nilai: "geogebra", label: "Simulasi GeoGebra" },
      { nilai: "media_web", label: "Media Web Interaktif" },
      { nilai: "teks", label: "Teks & Rumus" }
    ].forEach(function (op) {
      const opt = document.createElement("option");
      opt.value = op.nilai;
      opt.textContent = op.label;
      selectJenis.appendChild(opt);
    });
    bilahCari.appendChild(selectJenis);

    utama.appendChild(bilahCari);

    // Wadah daftar hasil pencarian / penyaringan
    const wadahHasil = buatElemen("div");
    utama.appendChild(wadahHasil);

    function perbaruiDaftarBab() {
      wadahHasil.innerHTML = "";
      const kataKunci = inputCari.value.trim().toLowerCase();
      const filterMedia = selectJenis.value;

      const babTersaring = stateData.bab.filter(function (bab) {
        if (idKelasFilter && bab.id_kelas !== idKelasFilter) return false;

        const kontenMilikBab = stateData.konten.filter(function (c) {
          return c.id_bab === bab.id;
        });

        // Cek kesesuaian filter jenis media
        if (filterMedia) {
          const cocokMedia = kontenMilikBab.some(function (c) {
            if (filterMedia === "dokumen_drive") {
              return ["pdf", "dokumen", "slide", "gambar", "drive"].indexOf(c.jenis) !== -1;
            }
            return c.jenis === filterMedia;
          });
          if (!cocokMedia) return false;
        }

        // Cek kesesuaian kata kunci pencarian pada judul/deskripsi bab atau judul konten
        if (kataKunci) {
          const cocokJudulBab = (bab.judul || "").toLowerCase().indexOf(kataKunci) !== -1;
          const cocokDeskBab = (bab.deskripsi || "").toLowerCase().indexOf(kataKunci) !== -1;
          const cocokKonten = kontenMilikBab.some(function (c) {
            return (c.judul || "").toLowerCase().indexOf(kataKunci) !== -1;
          });
          if (!cocokJudulBab && !cocokDeskBab && !cocokKonten) return false;
        }

        return true;
      });

      if (babTersaring.length === 0) {
        const kotakKosong = buatElemen("div", "kotak-status");
        kotakKosong.appendChild(
          buatTeks(
            "h3",
            "",
            kataKunci || filterMedia
              ? "Tidak ditemukan bab yang sesuai"
              : "Belum ada bab yang diterbitkan"
          )
        );
        kotakKosong.appendChild(
          buatTeks(
            "p",
            "",
            kataKunci || filterMedia
              ? "Coba ganti kata kunci pencarian atau pilih 'Semua Jenis Media'."
              : "Materi untuk pilihan kelas ini sedang disiapkan oleh guru."
          )
        );
        wadahHasil.appendChild(kotakKosong);
        return;
      }

      const gridBab = buatElemen("div", "grid-bab");
      babTersaring.forEach(function (bab) {
        gridBab.appendChild(buatKartuBab(bab));
      });
      wadahHasil.appendChild(gridBab);
    }

    inputCari.addEventListener("input", perbaruiDaftarBab);
    selectJenis.addEventListener("change", perbaruiDaftarBab);

    perbaruiDaftarBab();
  }

  function buatKartuBab(bab) {
    const kelasObj = cariKelas(bab.id_kelas);
    const kartu = buatElemen("a", "kartu-bab");
    kartu.href = "#/bab/" + encodeURIComponent(bab.id);

    const kepala = buatElemen("div", "kepala-kartu-bab");
    kepala.appendChild(buatTeks("span", "ikon-bab", bab.ikon || "📘"));

    const grupLencana = buatElemen("div", "grup-lencana-bab");
    if (adalahBabBaru(bab.diubah_pada)) {
      grupLencana.appendChild(buatTeks("span", "lencana lencana-baru", "Baru"));
    }
    if (kelasObj) {
      grupLencana.appendChild(buatTeks("span", "lencana", kelasObj.nama));
    }
    kepala.appendChild(grupLencana);
    kartu.appendChild(kepala);

    kartu.appendChild(buatTeks("h3", "", bab.judul));
    if (bab.deskripsi) {
      kartu.appendChild(buatTeks("p", "", bab.deskripsi));
    }

    const jumlahMateri = stateData.konten.filter(function (c) {
      return c.id_bab === bab.id;
    }).length;
    kartu.appendChild(
      buatTeks(
        "span",
        "panah-kartu",
        jumlahMateri > 0 ? "Buka materi (" + jumlahMateri + " bagian) →" : "Buka bab →"
      )
    );

    return kartu;
  }

  // Mengecek apakah bab diterbitkan/diperbarui dalam 14 hari terakhir
  function adalahBabBaru(waktuIso) {
    if (!waktuIso) return false;
    const tanggal = new Date(waktuIso);
    if (isNaN(tanggal.getTime())) return false;
    const selisihMs = Date.now() - tanggal.getTime();
    const empatBelasHariMs = 14 * 24 * 60 * 60 * 1000;
    return selisihMs >= 0 && selisihMs <= empatBelasHariMs;
  }

  // ==========================================================================
  // HALAMAN 3: DETAIL BAB BERTAB + DAFTAR CENTANG KEMAJUAN + NAVIGASI BAB
  // ==========================================================================

  function renderHalamanBab(idBab) {
    const utama = document.getElementById("konten-utama");
    utama.innerHTML = "";

    const bab = stateData.bab.find(function (b) {
      return b.id === idBab;
    });

    if (!bab) {
      const tidakAda = buatElemen("div", "kotak-status peringatan");
      tidakAda.appendChild(buatTeks("h2", "", "Bab tidak ditemukan"));
      tidakAda.appendChild(
        buatTeks("p", "", "Bab yang kamu buka mungkin belum diterbitkan atau tautannya berubah.")
      );
      const kembali = buatTeks("a", "tombol tombol-utama", "Kembali ke daftar materi");
      kembali.href = "#/materi";
      tidakAda.appendChild(kembali);
      utama.appendChild(tidakAda);
      return;
    }

    const kelasObj = cariKelas(bab.id_kelas);

    // Jejak halaman: Beranda › Kelas X › Judul Bab
    const jejak = buatElemen("nav", "jejak-halaman");
    jejak.setAttribute("aria-label", "Jejak halaman");
    const linkBeranda = buatTeks("a", "", "Beranda");
    linkBeranda.href = "#/";
    jejak.appendChild(linkBeranda);
    jejak.appendChild(buatTeks("span", "", "›"));

    if (kelasObj) {
      const linkKelas = buatTeks("a", "", kelasObj.nama);
      linkKelas.href = "#/kelas/" + encodeURIComponent(kelasObj.id);
      jejak.appendChild(linkKelas);
      jejak.appendChild(buatTeks("span", "", "›"));
    }
    jejak.appendChild(buatTeks("span", "", bab.judul));
    utama.appendChild(jejak);

    // Kepala bab
    const kepalaBab = buatElemen("section", "kepala-bab");
    const barisLencana = buatElemen("div", "grup-lencana-bab");
    barisLencana.style.marginBottom = "10px";
    if (kelasObj) {
      barisLencana.appendChild(buatTeks("span", "lencana", kelasObj.nama));
    }
    if (adalahBabBaru(bab.diubah_pada)) {
      barisLencana.appendChild(buatTeks("span", "lencana lencana-baru", "Baru"));
    }
    if (barisLencana.childNodes.length > 0) {
      kepalaBab.appendChild(barisLencana);
    }

    kepalaBab.appendChild(
      buatTeks("h1", "", (bab.ikon ? bab.ikon + " " : "") + bab.judul)
    );
    if (bab.deskripsi) {
      const desc = buatTeks("p", "", bab.deskripsi);
      desc.style.margin = "0";
      desc.style.color = "var(--warna-teks-redup)";
      kepalaBab.appendChild(desc);
    }
    utama.appendChild(kepalaBab);

    // Kumpulkan konten untuk bab ini
    const kontenBab = stateData.konten.filter(function (c) {
      return c.id_bab === bab.id;
    });

    // Tentukan tab mana saja yang memiliki isi (tab kosong disembunyikan)
    const tabTersedia = DAFTAR_TAB_BAB.filter(function (t) {
      if (t.kode === "mulai") {
        const adaInfoAwal = Boolean(bab.tujuan_belajar || bab.pertanyaan_pemantik);
        const adaKontenMulai = kontenBab.some(function (c) {
          return c.tab === "mulai";
        });
        return adaInfoAwal || adaKontenMulai;
      }
      return kontenBab.some(function (c) {
        return c.tab === t.kode;
      });
    });

    if (tabTersedia.length === 0) {
      const belumAdaIsi = buatElemen("div", "kotak-status");
      belumAdaIsi.textContent = "Isi pembelajaran pada bab ini sedang disiapkan oleh guru.";
      utama.appendChild(belumAdaIsi);
      renderNavigasiAntarBab(utama, bab);
      return;
    }

    // Bilah tombol tab dan wadah isi tab
    const bilahTab = buatElemen("div", "daftar-tab");
    bilahTab.setAttribute("role", "tablist");
    const wadahPanel = buatElemen("div", "panel-konten");

    function bukaTab(kodeTabAktif) {
      const semuaTombol = bilahTab.querySelectorAll(".tombol-tab");
      semuaTombol.forEach(function (btn) {
        const aktif = btn.getAttribute("data-tab") === kodeTabAktif;
        btn.classList.toggle("aktif", aktif);
        btn.setAttribute("aria-selected", aktif ? "true" : "false");
      });

      wadahPanel.innerHTML = "";

      if (kodeTabAktif === "mulai") {
        if (bab.tujuan_belajar) {
          const kartuTujuan = buatElemen("article", "kartu-materi");
          kartuTujuan.appendChild(buatTeks("h3", "", "🎯 Tujuan Pembelajaran"));
          const isiTujuan = buatTeks("div", "konten-teks-rumus", bab.tujuan_belajar);
          kartuTujuan.appendChild(isiTujuan);
          EMBED.renderRumus(isiTujuan);
          wadahPanel.appendChild(kartuTujuan);
        }

        if (bab.pertanyaan_pemantik) {
          const kartuPemantik = buatElemen("article", "kartu-materi");
          kartuPemantik.appendChild(buatTeks("h3", "", "💡 Pertanyaan Pemantik"));
          const isiPemantik = buatTeks("div", "konten-teks-rumus", bab.pertanyaan_pemantik);
          kartuPemantik.appendChild(isiPemantik);
          EMBED.renderRumus(isiPemantik);
          wadahPanel.appendChild(kartuPemantik);
        }
      }

      const itemTabIni = kontenBab.filter(function (c) {
        return c.tab === kodeTabAktif;
      });

      itemTabIni.forEach(function (item) {
        const kartu = buatElemen("article", "kartu-materi");
        kartu.appendChild(buatTeks("h3", "", item.judul));
        kartu.appendChild(EMBED.buatElemenKonten(item, { modeAdmin: false }));
        wadahPanel.appendChild(kartu);
      });
    }

    tabTersedia.forEach(function (t) {
      const tombol = buatTeks("button", "tombol-tab", t.label);
      tombol.type = "button";
      tombol.setAttribute("role", "tab");
      tombol.setAttribute("data-tab", t.kode);
      tombol.addEventListener("click", function () {
        bukaTab(t.kode);
      });
      bilahTab.appendChild(tombol);
    });

    utama.appendChild(bilahTab);
    utama.appendChild(wadahPanel);

    // Buka tab pertama yang tersedia secara otomatis
    bukaTab(tabTersedia[0].kode);

    // Kotak daftar centang kemajuan belajar siswa (disimpan di browser siswa)
    renderDaftarCentangKemajuan(utama, bab, kontenBab);

    // Tombol Bab Sebelumnya / Berikutnya
    renderNavigasiAntarBab(utama, bab);
  }

  function renderDaftarCentangKemajuan(wadah, bab, kontenBab) {
    const daftarTarget = [];

    if (bab.tujuan_belajar || bab.pertanyaan_pemantik) {
      daftarTarget.push({
        kunci: "mulai-" + bab.id,
        label: "[Mulai] Membaca tujuan pembelajaran & pertanyaan pemantik"
      });
    }

    kontenBab.forEach(function (item) {
      const labelTab = item.tab ? item.tab.charAt(0).toUpperCase() + item.tab.slice(1) : "Materi";
      daftarTarget.push({
        kunci: "konten-" + item.id,
        label: "[" + labelTab + "] " + item.judul
      });
    });

    if (daftarTarget.length === 0) return;

    const kotak = buatElemen("section", "kotak-kemajuan");
    const kepala = buatElemen("div", "kepala-kemajuan");
    kepala.appendChild(buatTeks("h3", "", "✅ Catatan Kemajuan Belajarku"));
    const teksPersen = buatTeks("span", "lencana", "0% selesai");
    kepala.appendChild(teksPersen);
    kotak.appendChild(kepala);

    const bilahProgres = buatElemen("div", "bilah-progres");
    const isiProgres = buatElemen("div", "isi-progres");
    isiProgres.style.width = "0%";
    bilahProgres.appendChild(isiProgres);
    kotak.appendChild(bilahProgres);

    const daftarCentang = buatElemen("div", "daftar-centang-kemajuan");
    const dataTersimpan = bacaKemajuanLokal();

    function perbaruiTampilanProgres() {
      const terkini = bacaKemajuanLokal();
      let selesai = 0;
      daftarTarget.forEach(function (t) {
        if (terkini[t.kunci]) selesai++;
      });
      const persen = Math.round((selesai / daftarTarget.length) * 100);
      isiProgres.style.width = persen + "%";
      teksPersen.textContent =
        selesai + " dari " + daftarTarget.length + " selesai (" + persen + "%)";
    }

    daftarTarget.forEach(function (target) {
      const sudahSelesai = Boolean(dataTersimpan[target.kunci]);
      const labelItem = buatElemen("label", "item-centang" + (sudahSelesai ? " selesai" : ""));

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = sudahSelesai;
      checkbox.addEventListener("change", function () {
        labelItem.classList.toggle("selesai", checkbox.checked);
        simpanKemajuanLokal(target.kunci, checkbox.checked);
        perbaruiTampilanProgres();
      });

      labelItem.appendChild(checkbox);
      labelItem.appendChild(buatTeks("span", "", target.label));
      daftarCentang.appendChild(labelItem);
    });

    kotak.appendChild(daftarCentang);
    const catatanLokal = buatTeks(
      "span",
      "bantuan-form",
      "Catatan centang ini tersimpan otomatis di perangkatmu untuk membantumu mengingat bagian yang sudah dipelajari."
    );
    catatanLokal.style.marginTop = "10px";
    kotak.appendChild(catatanLokal);

    wadah.appendChild(kotak);
    perbaruiTampilanProgres();
  }

  function renderNavigasiAntarBab(wadah, babSekarang) {
    const babSekelas = stateData.bab.filter(function (b) {
      return b.id_kelas === babSekarang.id_kelas;
    });

    const indeks = babSekelas.findIndex(function (b) {
      return b.id === babSekarang.id;
    });

    if (indeks === -1 || babSekelas.length <= 1) return;

    const babSebelumnya = indeks > 0 ? babSekelas[indeks - 1] : null;
    const babBerikutnya = indeks < babSekelas.length - 1 ? babSekelas[indeks + 1] : null;

    const nav = buatElemen("nav", "navigasi-antar-bab");
    nav.setAttribute("aria-label", "Navigasi antarbab");

    if (babSebelumnya) {
      const btnPrev = buatTeks(
        "a",
        "tombol tombol-sekunder",
        "← Bab sebelumnya: " + babSebelumnya.judul
      );
      btnPrev.href = "#/bab/" + encodeURIComponent(babSebelumnya.id);
      nav.appendChild(btnPrev);
    } else {
      nav.appendChild(document.createElement("span"));
    }

    if (babBerikutnya) {
      const btnNext = buatTeks(
        "a",
        "tombol tombol-utama",
        "Bab berikutnya: " + babBerikutnya.judul + " →"
      );
      btnNext.href = "#/bab/" + encodeURIComponent(babBerikutnya.id);
      nav.appendChild(btnNext);
    }

    wadah.appendChild(nav);
  }

  function bacaKemajuanLokal() {
    try {
      const mentah = localStorage.getItem(KUNCI_KEMAJUAN);
      return mentah ? JSON.parse(mentah) : {};
    } catch (e) {
      return {};
    }
  }

  function simpanKemajuanLokal(kunci, nilai) {
    try {
      const data = bacaKemajuanLokal();
      if (nilai) {
        data[kunci] = true;
      } else {
        delete data[kunci];
      }
      localStorage.setItem(KUNCI_KEMAJUAN, JSON.stringify(data));
    } catch (e) {
      // Abaikan jika penyimpanan lokal dibatasi browser
    }
  }

  // ==========================================================================
  // HALAMAN 4: DISKUSI (PERSIAPAN TAHAP 3)
  // ==========================================================================

  function renderHalamanDiskusiSementara() {
    const utama = document.getElementById("konten-utama");
    utama.innerHTML = "";

    const kotak = buatElemen("div", "kotak-status");
    kotak.appendChild(buatTeks("h1", "", "Ruang Diskusi Kelas"));
    kotak.appendChild(
      buatTeks(
        "p",
        "",
        "Fitur tanya jawab bersama guru dan teman sekelas sedang disiapkan dan akan segera hadir."
      )
    );
    const tombolMateri = buatTeks("a", "tombol tombol-utama", "Jelajahi Materi Belajar");
    tombolMateri.href = "#/materi";
    kotak.appendChild(tombolMateri);
    utama.appendChild(kotak);
  }

  // ==========================================================================
  // HALAMAN 5: TENTANG GURU & SEKOLAH
  // ==========================================================================

  function renderHalamanTentang() {
    const p = stateData.pengaturan;
    const utama = document.getElementById("konten-utama");
    utama.innerHTML = "";

    const kartu = buatElemen("section", "kartu-materi");
    kartu.appendChild(buatTeks("h1", "", "Tentang " + (p.nama_situs || "Website Ini")));

    const daftarInfo = [
      { label: "Guru Pengampu", nilai: p.nama_guru },
      { label: "Sekolah", nilai: p.nama_sekolah },
      { label: "Alamat Sekolah", nilai: p.alamat_sekolah },
      { label: "Tahun Ajaran", nilai: p.tahun_ajaran },
      { label: "Kontak", nilai: p.kontak }
    ];

    let adaInfo = false;
    daftarInfo.forEach(function (baris) {
      if (!baris.nilai) return;
      adaInfo = true;
      const pBaris = buatElemen("p");
      const tebal = buatTeks("strong", "", baris.label + ": ");
      pBaris.appendChild(tebal);
      pBaris.appendChild(document.createTextNode(baris.nilai));
      kartu.appendChild(pBaris);
    });

    if (!adaInfo) {
      kartu.appendChild(
        buatTeks("p", "", "Informasi profil guru dan sekolah dapat diisi melalui halaman admin.")
      );
    }

    utama.appendChild(kartu);
  }

  // ==========================================================================
  // FUNGSI BANTUAN DOM AMAN
  // ==========================================================================

  function cariKelas(idKelas) {
    return stateData.kelas.find(function (k) {
      return k.id === idKelas;
    });
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