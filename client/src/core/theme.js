/** Light / dark / system theme, saved in this browser and applied before React renders (no flash). */
const KEY = 'ibt.theme';
export const getThemePref = () => { try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; } };
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && media()?.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  applyTheme(pref);
}
media()?.addEventListener?.('change', () => { if (getThemePref() === 'system') applyTheme('system'); });
