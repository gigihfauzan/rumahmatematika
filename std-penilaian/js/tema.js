// tema.js — Sistem tema berbasis data-tema pada <html>.
const KUNCI_TEMA = 'enilai_tema';
export const TEMA_VALID = ['light_blue', 'teal', 'indigo', 'slate', 'dark'];

export const TEMA_INFO = {
  light_blue: { label: 'Light Blue', warna: '#0369a1' },
  teal:       { label: 'Teal',       warna: '#0f766e' },
  indigo:     { label: 'Indigo',     warna: '#4338ca' },
  slate:      { label: 'Slate',      warna: '#334155' },
  dark:       { label: 'Gelap',      warna: '#0f172a' }
};

export function temaSaya() { return localStorage.getItem(KUNCI_TEMA); }

export function setTemaSaya(t) {
  if (TEMA_VALID.includes(t)) {
    localStorage.setItem(KUNCI_TEMA, t);
    terapkan(t);
  }
}

export function terapkan(t) {
  if (!TEMA_VALID.includes(t)) t = 'light_blue';
  document.documentElement.setAttribute('data-tema', t);
}

/** Terapkan tema pribadi (atau light_blue) sedini mungkin. */
export function initTema() {
  const pribadi = temaSaya();
  terapkan(pribadi || 'light_blue');
}

/** Setelah login: terapkan tema bawaan sekolah jika pengguna belum punya pilihan pribadi. */
export function terapkanTemaSekolah(t) {
  if (!temaSaya() && TEMA_VALID.includes(t)) terapkan(t);
}
