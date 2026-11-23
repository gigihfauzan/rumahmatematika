// ============================================================================
// MODUL KOMUNIKASI API (PENGHUBUNG TAMPILAN KE GOOGLE APPS SCRIPT)
// Berkas ini mengatur pengiriman permintaan baca (GET) dan tulis (POST).
// ============================================================================

const API = (function () {
  const KUNCI_TOKEN = "wbm_admin_token";

  // Memastikan tautan server di config.js sudah diisi dengan benar
  function ambilUrlServer() {
    if (
      typeof CONFIG === "undefined" ||
      !CONFIG.API_URL ||
      CONFIG.API_URL.indexOf("TEMPEL_TAUTAN") !== -1
    ) {
      throw new Error("Alamat server belum diatur di berkas assets/js/config.js.");
    }
    return CONFIG.API_URL.trim();
  }

  // Mengambil data dari server (metode GET)[cite: 1]
  async function get(aksi, parameter) {
    const baseUrl = ambilUrlServer();
    const url = new URL(baseUrl);
    url.searchParams.set("action", aksi);

    if (parameter && typeof parameter === "object") {
      Object.keys(parameter).forEach(function (kunci) {
        if (parameter[kunci] !== undefined && parameter[kunci] !== null) {
          url.searchParams.set(kunci, String(parameter[kunci]));
        }
      });
    }

    let respons;
    try {
      respons = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow"
      });
    } catch (err) {
      throw new Error("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.");
    }

    if (!respons.ok) {
      throw new Error("Server memberikan respons gagal (kode " + respons.status + ").");
    }

    let hasil;
    try {
      hasil = await respons.json();
    } catch (err) {
      throw new Error("Format jawaban server tidak sesuai. Pastikan deployment Apps Script benar.");
    }

    if (!hasil.ok) {
      throw new Error(hasil.error || "Terjadi kesalahan saat memuat data.");
    }

    return hasil.data;
  }

  // Mengirim atau mengubah data di server (metode POST dengan text/plain)[cite: 1]
  async function post(aksi, muatan, wajibToken) {
    const baseUrl = ambilUrlServer();
    const paket = Object.assign({ action: aksi }, muatan || {});

    if (wajibToken) {
      const token = ambilToken();
      if (!token) {
        const errSesi = new Error("Sesi admin telah berakhir. Silakan login kembali.");
        errSesi.kode = "SESI_HABIS";
        throw errSesi;
      }
      paket.token = token;
    }

    let respons;
    try {
      respons = await fetch(baseUrl, {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(paket)
      });
    } catch (err) {
      throw new Error("Gagal mengirim data ke server. Periksa koneksi internet Anda.");
    }

    if (!respons.ok) {
      throw new Error("Server gagal memproses permintaan (kode " + respons.status + ").");
    }

    let hasil;
    try {
      hasil = await respons.json();
    } catch (err) {
      throw new Error("Format jawaban server tidak dikenali.");
    }

    if (!hasil.ok) {
      if (hasil.kode === "SESI_HABIS") {
        hapusToken();
      }
      const errServer = new Error(hasil.error || "Permintaan ditolak oleh server.");
      errServer.kode = hasil.kode || "";
      throw errServer;
    }

    return hasil.data;
  }

  // Penyimpanan token sesi sementara di tab browser admin
  function simpanToken(token) {
    if (token) {
      sessionStorage.setItem(KUNCI_TOKEN, token);
    }
  }

  function ambilToken() {
    return sessionStorage.getItem(KUNCI_TOKEN) || "";
  }

  function hapusToken() {
    sessionStorage.removeItem(KUNCI_TOKEN);
  }

  // Daftar fungsi siap pakai untuk halaman siswa dan halaman admin
  return {
    get: get,
    post: post,
    simpanToken: simpanToken,
    ambilToken: ambilToken,
    hapusToken: hapusToken,

    // Halaman umum (siswa)
    ambilDataPublik: function () {
      return get("init");
    },

    // Halaman admin
    login: async function (password) {
      const data = await post("login", { password: password }, false);
      if (data && data.token) {
        simpanToken(data.token);
      }
      return data;
    },
    logout: function () {
      hapusToken();
    },
    ambilDataAdmin: function () {
      return post("admin_init", {}, true);
    },
    simpanPengaturan: function (daftarPengaturan) {
      return post("simpan_pengaturan", { items: daftarPengaturan }, true);
    },
    simpanKelas: function (dataKelas) {
      return post("simpan_kelas", dataKelas, true);
    },
    simpanBab: function (dataBab) {
      return post("simpan_bab", dataBab, true);
    },
    hapusBab: function (idBab) {
      return post("hapus_bab", { id: idBab }, true);
    },
    simpanKonten: function (dataKonten) {
      return post("simpan_konten", dataKonten, true);
    },
    hapusKonten: function (idKonten) {
      return post("hapus_konten", { id: idKonten }, true);
    },
    gantiPassword: function (passwordLama, passwordBaru) {
      return post(
        "ganti_password",
        { password_lama: passwordLama, password_baru: passwordBaru },
        true
      );
    }
  };
})();