// Runs before first paint: apply the saved appearance and pick the squircle
// renderer, so the page never flashes the wrong theme or corner shape.
(function () {
  var root = document.documentElement, preference = 'system';
  try {
    var saved = JSON.parse(localStorage.getItem('lookup.preferences') || '{}');
    if (saved && (saved.theme === 'light' || saved.theme === 'dark')) preference = saved.theme;
  } catch (error) { /* Storage can be unavailable. */ }
  var dark = preference === 'dark' || (preference === 'system' && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches));
  var mode = dark ? 'dark' : 'light';
  root.setAttribute('data-theme', mode);
  root.setAttribute('data-theme-preference', preference);
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', dark ? '#151512' : '#f5f5ef');
  var native = false;
  try { native = !!(window.CSS && CSS.supports && CSS.supports('corner-shape', 'squircle')); } catch (error) { native = false; }
  if (!native) root.classList.add('sq-fallback');
})();
