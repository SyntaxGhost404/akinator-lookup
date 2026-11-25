import {effect, signal} from './reactive.mjs';

// Preferences only. Queries, results and search history are never stored.
export const PREFERENCES_KEY = 'lookup.preferences';
export const THEMES = ['system', 'light', 'dark'];
export const FILTERS = ['all', 'pictureless', 'supplied', 'unknown'];
const defaults = {theme: 'system', haptics: true, language: 'en', category: '1', filter: 'all'};

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function readPreferences(store = storage()) {
  let saved = {};
  try { saved = JSON.parse(store?.getItem(PREFERENCES_KEY) || '{}') || {}; } catch { saved = {}; }
  return {
    theme: THEMES.includes(saved.theme) ? saved.theme : defaults.theme,
    haptics: typeof saved.haptics === 'boolean' ? saved.haptics : defaults.haptics,
    language: typeof saved.language === 'string' && /^[a-z]{2,3}$/.test(saved.language) ? saved.language : defaults.language,
    category: typeof saved.category === 'string' && /^(all|[a-z0-9_-]{1,64})$/i.test(saved.category) ? saved.category : defaults.category,
    filter: FILTERS.includes(saved.filter) ? saved.filter : defaults.filter,
  };
}

export function createPreferences(store = storage()) {
  const initial = readPreferences(store);
  const prefs = Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, signal(value)]));
  let first = true;
  effect(() => {
    const value = Object.fromEntries(Object.entries(prefs).map(([key, read]) => [key, read()]));
    if (first) { first = false; return; }
    try { store?.setItem(PREFERENCES_KEY, JSON.stringify(value)); } catch { /* Storage can be full or blocked. */ }
  });
  return prefs;
}
