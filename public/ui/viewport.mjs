import {onCleanup, signal} from './reactive.mjs';

// Size the fixed app shell to the visual viewport, so the search dock rides
// above the on-screen keyboard. Only real size changes are handled: there are
// deliberately no scroll handlers on the document, the results or the viewport.
export function installViewport(win = window) {
  const viewport = win.visualViewport;
  const root = win.document.documentElement;
  let frame = 0, previous = 0;
  const update = () => {
    frame = 0;
    // Pinch zoom pans the visual viewport; it must not resize the app layout.
    if (viewport && Math.abs((viewport.scale || 1) - 1) > 0.01) return;
    const height = Math.round(viewport?.height || win.innerHeight);
    if (height <= 0 || height === previous) return;
    previous = height;
    root.style.setProperty('--app-height', height + 'px');
    // A visual viewport well below the layout viewport means a keyboard is open.
    const keyboard = viewport && win.innerHeight - height > 120;
    root.dataset.keyboard = keyboard ? 'open' : 'closed';
  };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  viewport?.addEventListener('resize', schedule, {passive: true});
  win.addEventListener('resize', schedule, {passive: true});
  onCleanup(() => {
    viewport?.removeEventListener('resize', schedule);
    win.removeEventListener('resize', schedule);
    if (frame) win.cancelAnimationFrame(frame);
  });
  update();
}

// A media query as a signal, live for the lifetime of the current scope.
export function mediaSignal(query, win = window) {
  const media = win.matchMedia?.(query);
  const value = signal(Boolean(media?.matches));
  if (media) {
    const onChange = event => value.set(event.matches);
    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener?.(onChange);
    onCleanup(() => media.removeEventListener ? media.removeEventListener('change', onChange) : media.removeListener?.(onChange));
  }
  return value;
}

// Compact phones use the bottom dock and sheets. Medium screens add the sidebar.
// Wide screens also keep entry details open beside the results.
export function layoutSignal(win = window) {
  const medium = mediaSignal('(min-width: 720px)', win);
  const wide = mediaSignal('(min-width: 1180px)', win);
  return () => wide() ? 'wide' : medium() ? 'medium' : 'compact';
}
