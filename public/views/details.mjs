import {languageName} from '../lookup-ui.mjs';
import {imageURL} from '../image-url.mjs';
import {effect} from '../ui/reactive.mjs';
import {animate, byId, h, icon, isTextField, listen} from '../ui/dom.mjs';
import {createAvatar} from '../ui/avatar.mjs';
import {disclosure} from '../ui/controls.mjs';
import {IMAGE_LABELS, imageKind} from '../ui/catalog.mjs';
import {entryCategory, imageBadge} from './entry.mjs';

const fact = (label, value, note) => h('div', {}, h('dt', {text: label}), h('dd', {}, value, note ? h('small', {text: note}) : null));
const format = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value);

function rawFields(raw) {
  const fields = raw && typeof raw === 'object' ? Object.entries(raw) : [];
  if (!fields.length) return h('p', {class: 'empty-text', text: 'No fields returned.'});
  return h('dl', {class: 'raw sq'}, ...fields.map(([key, value]) => h('div', {}, h('dt', {text: key}), h('dd', {dir: 'auto', text: format(value)}))));
}

// Horizontal swipes step through the visible results. Vertical movement is
// left to scrolling and to the sheet's own dismiss gesture.
function installSwipe(node, step, haptics) {
  let gesture = null;
  node.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    gesture = {id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, axis: '', dx: 0};
  });
  node.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.hypot(dx, dy) < 9) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
      if (gesture.axis === 'x') { try { node.setPointerCapture(event.pointerId); } catch { /* Pointer already released. */ } }
    }
    if (gesture.axis !== 'x') return;
    gesture.dx = dx;
    node.style.setProperty('transform', `translateX(${dx * 0.85}px)`);
    node.style.setProperty('opacity', String(1 - Math.min(Math.abs(dx) / 700, 0.3)));
  });
  const end = event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const {axis, dx, t} = gesture;
    gesture = null;
    if (axis !== 'x') return;
    const fast = Math.abs(dx) / Math.max(1, event.timeStamp - t) > 0.45;
    node.style.removeProperty('transform');
    node.style.removeProperty('opacity');
    if (event.type !== 'pointercancel' && (Math.abs(dx) > 72 || (fast && Math.abs(dx) > 30)) && step(dx < 0 ? 1 : -1)) {
      haptics.play('selection');
      return;
    }
    animate(node, [{transform: `translateX(${dx * 0.85}px)`}, {transform: 'none'}], {duration: 260, easing: 'cubic-bezier(.22,1,.36,1)'});
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
}

export function createDetails({store, sheet, layout, haptics, toasts}) {
  const inspector = byId('inspector');

  const copy = (text, message) => {
    haptics.play('success');
    Promise.resolve().then(() => navigator.clipboard.writeText(text))
      .then(() => toasts.show(message), () => toasts.show('Couldn’t copy.', {kind: 'error'}));
  };

  function renderDetails(entry, showName) {
    const kind = imageKind(entry), label = IMAGE_LABELS[kind];
    const instances = store.instances.peek();
    const link = kind === 'custom' ? imageURL(entry.avatar_url) : null;
    return h('div', {class: 'details', 'data-image-state': kind},
      h('div', {class: 'details-hero'},
        createAvatar(entry, 0, null, {large: true}),
        h('div', {class: 'details-heading'},
          showName ? h('h3', {class: 'details-name', dir: 'auto', text: entry.name || 'Unnamed entry'}) : null,
          h('p', {class: 'details-desc', dir: 'auto', text: entry.description || 'No description.'}),
          h('div', {class: 'details-badges'}, imageBadge(kind)))),
      h('dl', {class: 'facts sq'},
        fact('Image', label.badge, label.detail),
        fact('Category', entryCategory(entry, instances)),
        fact('Language', [languageName(entry.language), h('span', {class: 'code', text: String(entry.language || '').toUpperCase()})]),
        fact('ID', entry.id || 'Not returned')),
      h('div', {class: 'details-actions'},
        h('button', {type: 'button', class: 'action sq', onclick: () => copy(entry.name || '', 'Name copied')}, icon('copy'), 'Copy name'),
        h('button', {type: 'button', class: 'action sq', onclick: () => copy(JSON.stringify(entry.raw, null, 2), 'Fields copied')}, icon('data'), 'Copy fields'),
        link ? h('a', {class: 'action sq', href: link, target: '_blank', rel: 'noreferrer noopener'}, icon('external'), 'Open image') : null),
      disclosure('All returned fields', () => rawFields(entry.raw)));
  }

  const position = () => {
    const list = store.visibleEntries(), index = list.indexOf(store.selected());
    return {index, total: list.length};
  };
  const step = delta => {
    const before = store.selected.peek();
    const next = store.step(delta);
    return Boolean(next && next !== before);
  };

  // Previous and next. Phones get large buttons in the sheet footer, within
  // thumb reach; the wide inspector keeps compact ones in its header.
  function navigation({footer = false} = {}) {
    const label = h('span', {class: 'position', 'aria-live': 'polite'});
    const kind = footer ? 'wide-button sq' : 'icon-button sq';
    const previous = h('button', {type: 'button', class: kind, 'aria-label': 'Previous match'}, icon('chevron-left'));
    const next = h('button', {type: 'button', class: kind, 'aria-label': 'Next match'}, icon('chevron-right'));
    previous.addEventListener('click', () => { if (step(-1)) haptics.play('selection'); });
    next.addEventListener('click', () => { if (step(1)) haptics.play('selection'); });
    effect(() => {
      const {index, total} = position();
      label.textContent = index >= 0 && total > 1 ? (index + 1) + ' of ' + total : '';
      previous.disabled = index <= 0;
      next.disabled = index < 0 || index >= total - 1;
      previous.hidden = next.hidden = total < 2;
    });
    return footer ? [previous, label, next] : [label, previous, next];
  }

  // The host re-renders when the selection moves, sliding in the direction of travel.
  function host({onTitle, onEmpty, showName = false}) {
    const node = h('div', {class: 'details-host'});
    let shown = null;
    effect(() => {
      const entry = store.selected();
      if (!entry) { node.replaceChildren(); shown = null; onEmpty?.(); return; }
      if (entry === shown) return;
      const list = store.results.peek().entries;
      const direction = shown ? Math.sign(list.indexOf(entry) - list.indexOf(shown)) : 0;
      shown = entry;
      onTitle?.(entry.name || 'Unnamed entry');
      node.replaceChildren(renderDetails(entry, showName));
      node.parentElement?.scrollTo?.({top: 0});
      if (direction) animate(node, [{opacity: 0, transform: `translateX(${direction * 28}px)`}, {opacity: 1, transform: 'none'}], {duration: 220, easing: 'cubic-bezier(.22,1,.36,1)'});
    });
    installSwipe(node, step, haptics);
    return node;
  }

  function openSheet() {
    sheet.open({
      title: store.selected.peek()?.name || 'Unnamed entry',
      view: 'details',
      render: () => [host({onTitle: title => { sheet.title.textContent = title; }, onEmpty: () => queueMicrotask(() => sheet.close())})],
      footer: () => store.visibleEntries().length > 1 ? navigation({footer: true}) : [],
    });
  }

  // Wide screens keep the inspector beside the results.
  effect(() => {
    if (layout() !== 'wide') { inspector.replaceChildren(); return; }
    if (sheet.isOpen() && sheet.view.peek() === 'details') sheet.close();
    const title = h('h2', {class: 'sheet-title', id: 'inspector-title', tabindex: '-1', text: 'Details'});
    const close = h('button', {type: 'button', class: 'icon-button sq', 'aria-label': 'Close details'}, icon('close'));
    close.addEventListener('click', () => store.select(null));
    const header = h('header', {class: 'inspector-header'}, title, ...navigation(), close);
    const body = h('div', {class: 'inspector-body'});
    const placeholder = h('div', {class: 'inspector-empty'},
      h('div', {class: 'empty-mark sq', 'aria-hidden': 'true'}, icon('info')), h('p', {text: 'Select a match to see its details.'}));
    const content = host({showName: true});
    body.append(content, placeholder);
    effect(() => {
      const entry = store.selected();
      placeholder.hidden = Boolean(entry);
      close.hidden = !entry;
    });
    inspector.replaceChildren(header, body);
  });

  // Arrow keys and J or K move between matches while details are showing.
  listen(document, 'keydown', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTextField(document.activeElement)) return;
    const showing = (sheet.isOpen() && sheet.view.peek() === 'details') || (layout() === 'wide' && store.selected.peek());
    if (!showing || document.activeElement?.closest?.('[role="radiogroup"],[role="listbox"]')) return;
    const delta = {ArrowRight: 1, ArrowLeft: -1, j: 1, k: -1}[event.key];
    if (!delta) return;
    if (step(delta)) { event.preventDefault(); haptics.play('selection'); }
  });

  return {
    open(entry) {
      store.select(entry);
      if (layout() === 'wide') byId('inspector-title')?.focus({preventScroll: true});
      else openSheet();
    },
  };
}
