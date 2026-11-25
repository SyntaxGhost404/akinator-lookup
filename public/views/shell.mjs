import {languageName} from '../lookup-ui.mjs';
import {effect, onCleanup, signal} from '../ui/reactive.mjs';
import {byId, h, icon, isTextField, listen, setIcon} from '../ui/dom.mjs';
import {chipGroup} from '../ui/controls.mjs';
import {categoryIcon, categoryName} from '../ui/catalog.mjs';

// Top bar, connection status, scope controls and app-wide shortcuts.
export function mountShell({store, panels, haptics, layout}) {
  const app = byId('app');
  const online = signal(navigator.onLine !== false);
  listen(window, 'online', () => {
    online.set(true);
    if (store.connection.peek().status === 'failed') store.connect();
  });
  listen(window, 'offline', () => online.set(false));

  // Connection status appears only when it needs attention.
  const status = byId('connection'), statusText = byId('connection-text'), retry = byId('connection-retry');
  const statusIcon = status.querySelector('.status-icon');
  effect(() => {
    const state = !online() ? 'offline' : store.connection().status === 'idle' ? 'connecting' : store.connection().status;
    status.dataset.state = state;
    app.dataset.connection = state;
    statusText.textContent = {connecting: 'Connecting…', failed: 'Not connected', offline: 'Offline', ready: 'Connected'}[state];
    retry.hidden = state !== 'failed';
    setIcon(statusIcon, state === 'offline' ? 'offline' : 'alert');
  });
  listen(retry, 'click', () => { haptics.play('impact'); store.connect(); });
  listen(byId('settings-button'), 'click', () => panels.openSettings());

  // Language and category.
  const languageButton = byId('language-button');
  effect(() => {
    const code = store.language();
    byId('language-name').textContent = languageName(code);
    byId('language-code').textContent = String(code).toUpperCase();
    languageButton.setAttribute('aria-label', 'Language: ' + languageName(code));
    languageButton.disabled = !store.instances().length;
  });
  listen(languageButton, 'click', () => panels.openLanguage());
  const categories = byId('categories');
  const group = chipGroup(categories, {
    label: 'Category', haptics,
    value: () => store.category(),
    options: () => {
      const available = store.available();
      if (!available.length) return [];
      return [...available.map(instance => ({value: instance.key, label: categoryName(instance), icon: categoryIcon(instance)})),
        {value: 'all', label: 'All', icon: 'all'}];
    },
    onChange: key => store.setCategory(key),
  });
  // Keep the selected chip in view on the scrolling phone row.
  effect(() => {
    const key = store.category();
    store.available();
    const chip = group.node(key), row = byId('scope');
    if (!chip || layout() !== 'compact') return;
    const left = chip.offsetLeft - 12, right = chip.offsetLeft + chip.offsetWidth + 12;
    if (left < row.scrollLeft) row.scrollLeft = left;
    else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth;
  });

  const foot = byId('sidebar-foot');
  foot.append(h('button', {type: 'button', class: 'text-button sq', onclick: () => panels.openAbout()}, icon('info'), h('span', {text: 'How it works'})));

  // The compact top bar shows the query once the large title scrolls away.
  const main = byId('main'), head = byId('results-head'), title = byId('topbar-title');
  effect(() => { title.textContent = store.results().query || ''; });
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(([entry]) => {
      app.toggleAttribute('data-scrolled', !entry.isIntersecting && !head.hidden);
    }, {root: main, threshold: 0});
    observer.observe(head);
    onCleanup(() => observer.disconnect());
  }

  // Toasts sit above the phone dock, whose height follows the keyboard and safe area.
  if (typeof ResizeObserver === 'function') {
    const dock = new ResizeObserver(() => {
      const height = layout() === 'compact' ? byId('scope').offsetHeight + byId('searchform').offsetHeight : 0;
      document.documentElement.style.setProperty('--dock', height + 'px');
    });
    dock.observe(byId('scope'));
    dock.observe(byId('searchform'));
    onCleanup(() => dock.disconnect());
  }

  // "/" or Ctrl/Cmd K focuses search from anywhere outside a text field.
  listen(document, 'keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;
    const query = byId('query');
    const combo = (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey);
    if ((event.key === '/' && !isTextField(document.activeElement) && !event.metaKey && !event.ctrlKey && !event.altKey) || combo) {
      if (app.inert) return;
      event.preventDefault();
      query.focus();
      query.select();
    }
  });
}
