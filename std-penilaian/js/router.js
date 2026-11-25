// router.js — Routing berbasis hash (#/beranda, #/pengaturan, #/kedepan/:judul).
const rute = new Map();

/** Daftarkan handler untuk path tertentu. handler(params[], sesi). */
export function daftar(path, handler) { rute.set(path, handler); }

export function navigasi(hash) { location.hash = hash; }

let sesiAktif = null;
export function setSesiAktif(s) { sesiAktif = s; }

export function jalan() {
  window.addEventListener('hashchange', muat);
  muat();
}

async function muat() {
  const raw = location.hash.slice(1) || '/beranda';
  const seg = raw.split('/').filter(Boolean);
  const path = seg[0] || 'beranda';
  const params = seg.slice(1);
  const handler = rute.get(path) || rute.get('beranda');
  try {
    await handler(params, sesiAktif);
  } catch (err) {
    const main = document.getElementById('main');
    if (main) main.innerHTML = `<div class="kosong"><p>Gagal memuat halaman: ${String(err)}</p></div>`;
  }
  // tandai nav aktif
  document.querySelectorAll('[data-hash]').forEach(a => {
    a.classList.toggle('aktif', a.dataset.hash === '#' + raw || (path === 'beranda' && a.dataset.hash === '#/beranda'));
  });
  // tutup drawer di layar kecil
  document.querySelector('.sidebar')?.classList.remove('show');
  document.querySelector('.overlay')?.classList.remove('show');
}
