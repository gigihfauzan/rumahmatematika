// ============================================================================
// MODUL PENYEMATAN MEDIA & RUMUS (EMBED.JS)
// Mengubah tautan YouTube, Google Drive, Form, GeoGebra, media web, dan teks
// rumus menjadi tampilan tersemat langsung di halaman belajar siswa.
// ============================================================================

const EMBED = (function () {
  // Memastikan tautan aman (hanya mengizinkan https:// atau jalur folder lokal)
  function urlAman(url) {
    if (!url) return false;
    const bersih = String(url).trim();
    if (/^https:\/\//i.test(bersih)) return true;
    // Jalur relatif lokal untuk media_web (tidak boleh mengandung '..' atau ':')
    if (!bersih.includes("..") && !bersih.includes(":") && /^[a-zA-Z0-9_\-\/\.]+$/.test(bersih)) {
      return true;
    }
    return false;
  }

  // Mengekstrak ID video dari berbagai format tautan YouTube
  function ambilIdYouTube(url) {
    const pola = [
      /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
    ];
    for (let i = 0; i < pola.length; i++) {
      const cocok = url.match(pola[i]);
      if (cocok && cocok[1]) return cocok[1];
    }
    return "";
  }

  // Mengekstrak ID berkas dari berbagai format tautan Google Drive / Docs
  function ambilIdDrive(url) {
    const pola = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /\/document\/d\/([a-zA-Z0-9_-]+)/,
      /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
      /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/
    ];
    for (let i = 0; i < pola.length; i++) {
      const cocok = url.match(pola[i]);
      if (cocok && cocok[1]) return cocok[1];
    }
    return "";
  }

  // Mengubah tautan asli menjadi tautan siap semat (urlEmbed) sesuai jenis konten
  function konversiUrl(jenis, urlAsli) {
    const jenisBersih = String(jenis || "").trim().toLowerCase();
    const tautan = String(urlAsli || "").trim();

    if (jenisBersih === "teks") {
      return { valid: true, urlEmbed: "", pesanError: "" };
    }

    if (!tautan) {
      return { valid: false, urlEmbed: "", pesanError: "Tautan atau nama folder belum diisi." };
    }

    // 1. YouTube (menggunakan domain privasi youtube-nocookie.com)
    if (jenisBersih === "youtube") {
      const idVideo = ambilIdYouTube(tautan);
      if (!idVideo) {
        return {
          valid: false,
          urlEmbed: "",
          pesanError: "Tautan YouTube tidak dikenali. Tempelkan tautan video YouTube yang lengkap."
        };
      }
      return {
        valid: true,
        urlEmbed: "https://www.youtube-nocookie.com/embed/" + idVideo + "?rel=0",
        pesanError: ""
      };
    }

    // 2. Google Drive / PDF / Dokumen / Gambar / Slide
    if (["pdf", "dokumen", "gambar", "slide", "drive"].indexOf(jenisBersih) !== -1) {
      const idDrive = ambilIdDrive(tautan);
      if (!idDrive) {
        return {
          valid: false,
          urlEmbed: "",
          pesanError: "Tautan Google Drive tidak dikenali. Pastikan menyalin tautan berbagi dari Google Drive."
        };
      }

      if (tautan.indexOf("docs.google.com/document/") !== -1) {
        return {
          valid: true,
          urlEmbed: "https://docs.google.com/document/d/" + idDrive + "/preview",
          pesanError: ""
        };
      }
      if (tautan.indexOf("docs.google.com/presentation/") !== -1) {
        return {
          valid: true,
          urlEmbed: "https://docs.google.com/presentation/d/" + idDrive + "/preview",
          pesanError: ""
        };
      }
      if (tautan.indexOf("docs.google.com/spreadsheets/") !== -1) {
        return {
          valid: true,
          urlEmbed: "https://docs.google.com/spreadsheets/d/" + idDrive + "/preview",
          pesanError: ""
        };
      }

      return {
        valid: true,
        urlEmbed: "https://drive.google.com/file/d/" + idDrive + "/preview",
        pesanError: ""
      };
    }

    // 3. Kuis Google Form
    if (jenisBersih === "kuis_form") {
      if (!/^https:\/\/(docs\.google\.com\/forms|forms\.gle)\//i.test(tautan)) {
        return {
          valid: false,
          urlEmbed: "",
          pesanError: "Tautan Google Form harus diawali https://docs.google.com/forms/ atau https://forms.gle/."
        };
      }
      let urlForm = tautan;
      if (urlForm.indexOf("docs.google.com/forms/") !== -1 && urlForm.indexOf("embedded=true") === -1) {
        urlForm += (urlForm.indexOf("?") === -1 ? "?" : "&") + "embedded=true";
      }
      return { valid: true, urlEmbed: urlForm, pesanError: "" };
    }

    // 4. GeoGebra
    if (jenisBersih === "geogebra") {
      if (!/^https:\/\/(www\.)?geogebra\.org\//i.test(tautan)) {
        return {
          valid: false,
          urlEmbed: "",
          pesanError: "Tautan GeoGebra harus berasal dari situs geogebra.org."
        };
      }
      const cocokGgb = tautan.match(/geogebra\.org\/(?:m|classic|calculator|geometry|3d)\/([a-zA-Z0-9]+)/i);
      if (cocokGgb && cocokGgb[1]) {
        return {
          valid: true,
          urlEmbed: "https://www.geogebra.org/material/iframe/id/" + cocokGgb[1],
          pesanError: ""
        };
      }
      return { valid: true, urlEmbed: tautan, pesanError: "" };
    }

    // 5. Media Web Interaktif (folder di dalam repositori yang sama, mis. media/bilangan-bulat)
    if (jenisBersih === "media_web") {
      const bersih = tautan.replace(/^\/+|\/+$/g, "");
      if (!bersih || bersih.indexOf("..") !== -1 || !/^[a-zA-Z0-9_\-\/\.]+$/.test(bersih)) {
        return {
          valid: false,
          urlEmbed: "",
          pesanError: "Nama folder media tidak valid. Contoh yang benar: media/bilangan-bulat"
        };
      }
      const jalurAkhir = /\.html?$/i.test(bersih) ? "./" + bersih : "./" + bersih + "/index.html";
      return { valid: true, urlEmbed: jalurAkhir, pesanError: "" };
    }

    return { valid: false, urlEmbed: "", pesanError: "Jenis konten tidak dikenali." };
  }

  // Merender rumus matematika menggunakan KaTeX jika pustaka KaTeX sudah dimuat
  function renderRumus(elemen) {
    if (typeof window.renderMathInElement === "function" && elemen) {
      try {
        window.renderMathInElement(elemen, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
          ],
          throwOnError: false
        });
      } catch (e) {
        // Jika ada penulisan rumus yang keliru, teks biasa tetap tampil aman
      }
    }
  }

  // Membuat elemen tampilan lengkap untuk satu item konten (dipakai di halaman siswa & pratinjau admin)
  function buatElemenKonten(item, opsi) {
    const pengaturanOpsi = opsi || {};
    const pembungkus = document.createElement("div");
    const jenis = String(item.jenis || "").trim().toLowerCase();

    // Tampilan untuk jenis TEKS / RUMUS
    if (jenis === "teks") {
      const kotakTeks = document.createElement("div");
      kotakTeks.className = "konten-teks-rumus";
      // Menggunakan textContent agar aman dari penyisipan kode berbahaya
      kotakTeks.textContent = item.teks || "";
      pembungkus.appendChild(kotakTeks);
      renderRumus(kotakTeks);
      return pembungkus;
    }

    // Tampilan untuk jenis MEDIA TERSEMAT (YouTube, Drive, Form, GeoGebra, Media Web)
    let urlFinal = String(item.url_embed || "").trim();
    if (!urlFinal && item.url_asli) {
      const hasilKonversi = konversiUrl(jenis, item.url_asli);
      if (hasilKonversi.valid) {
        urlFinal = hasilKonversi.urlEmbed;
      }
    }

    if (!urlFinal || !urlAman(urlFinal)) {
      const pesanKosong = document.createElement("div");
      pesanKosong.className = "kotak-status peringatan";
      pesanKosong.textContent = "Media ini belum memiliki tautan yang valid untuk ditampilkan.";
      pembungkus.appendChild(pesanKosong);
      return pembungkus;
    }

    const wadahSemat = document.createElement("div");
    wadahSemat.className =
      "wadah-semat " + (jenis === "youtube" ? "rasio-video" : "tinggi-dokumen");

    const iframe = document.createElement("iframe");
    iframe.src = urlFinal;
    iframe.title = item.judul || "Media Pembelajaran Matematika";
    iframe.loading = "lazy";
    iframe.allowFullscreen = true;
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    );
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");

    wadahSemat.appendChild(iframe);
    pembungkus.appendChild(wadahSemat);

    // Bilah aksi di bawah bingkai: tombol Layar Penuh & tautan cadangan kecil
    const bilahAksi = document.createElement("div");
    bilahAksi.className = "bilah-aksi-semat";

    const tombolLayarPenuh = document.createElement("button");
    tombolLayarPenuh.type = "button";
    tombolLayarPenuh.className = "tombol tombol-sekunder tombol-kecil";
    tombolLayarPenuh.textContent = "Layar penuh";
    tombolLayarPenuh.addEventListener("click", function () {
      if (wadahSemat.requestFullscreen) {
        wadahSemat.requestFullscreen().catch(function () {});
      } else if (iframe.requestFullscreen) {
        iframe.requestFullscreen().catch(function () {});
      }
    });
    bilahAksi.appendChild(tombolLayarPenuh);

    const tautanCadanganUrl = item.url_asli && urlAman(item.url_asli) ? item.url_asli : urlFinal;
    const tautanBaru = document.createElement("a");
    tautanBaru.href = tautanCadanganUrl;
    tautanBaru.target = "_blank";
    tautanBaru.rel = "noopener noreferrer";
    tautanBaru.textContent = "Buka di tab baru ↗";
    bilahAksi.appendChild(tautanBaru);

    pembungkus.appendChild(bilahAksi);

    // Peringatan khusus di halaman pratinjau admin untuk berkas Google Drive
    if (
      pengaturanOpsi.modeAdmin &&
      ["pdf", "dokumen", "gambar", "slide", "drive"].indexOf(jenis) !== -1
    ) {
      const catatanDrive = document.createElement("p");
      catatanDrive.className = "bantuan-form";
      catatanDrive.textContent =
        "Catatan: Jika pratinjau di atas tidak muncul, pastikan pengaturan berbagi berkas di Google Drive sudah diubah ke 'Siapa saja yang memiliki tautan dapat melihat'.";
      pembungkus.appendChild(catatanDrive);
    }

    return pembungkus;
  }

  return {
    konversiUrl: konversiUrl,
    renderRumus: renderRumus,
    buatElemenKonten: buatElemenKonten
  };
})();