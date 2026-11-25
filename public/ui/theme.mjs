import {effect, onCleanup, signal} from './reactive.mjs';
import {reducedMotion} from './dom.mjs';

// Browser chrome colors. These match --bg in style.css and the values in boot.js.
export const THEME_COLORS = {light: '#f5f5ef', dark: '#151512'};

export function applyTheme(mode, preference, root = document.documentElement) {
  root.dataset.theme = mode;
  root.dataset.themePreference = preference;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', THEME_COLORS[mode]);
}

// System mode follows the operating system live, including while the app is open.
export function installTheme(preference) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const system = signal(media?.matches ? 'dark' : 'light');
  const onChange = event => system.set(event.matches ? 'dark' : 'light');
  if (media?.addEventListener) {
    media.addEventListener('change', onChange);
    onCleanup(() => media.removeEventListener('change', onChange));
  } else if (media?.addListener) {
    media.addListener(onChange);
    onCleanup(() => media.removeListener(onChange));
  }
  const resolved = () => preference() === 'system' ? system() : preference();
  effect(() => applyTheme(resolved(), preference()));
  return {resolved, system};
}

// A short cross-fade when the person changes the theme themselves.
export function changeWithTransition(update) {
  if (typeof document.startViewTransition !== 'function' || reducedMotion()) { update(); return; }
  try { document.startViewTransition(update); } catch { update(); }
}
