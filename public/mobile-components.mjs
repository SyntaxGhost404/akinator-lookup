import {imageURL} from '/image-url.mjs?v=15';

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

export function createAvatar(entry, index, onDetails) {
  const avatar = element('div', undefined, 'avatar');
  const kind = ['missing', 'placeholder'].includes(entry.avatar_status) ? 'pictureless'
    : entry.avatar_status === 'supplied' ? 'custom' : 'unspecified';
  avatar.dataset.imageState = kind;
  const official = '/api/placeholder?v=15';
  const source = kind === 'pictureless'
    ? imageURL(entry.default_avatar_url) || 'https://photos.clarinea.fr/BL_1_fr/none.jpg'
    : kind === 'unspecified' ? '/assets/akinator-placeholder.svg' : imageURL(entry.avatar_url);
  const image = document.createElement('img');
  image.alt = ''; image.width = 80; image.height = 80;
  image.loading = index < 4 ? 'eager' : 'lazy';
  image.fetchPriority = index < 4 ? 'high' : 'auto';
  image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
  const retry = element('button', source ? 'Retry' : 'Details', 'avatar-retry');
  retry.type = 'button'; retry.hidden = true;
  retry.setAttribute('aria-label', source ? 'Reload image for ' + entry.name : 'View image details for ' + entry.name);
  retry.prepend(icon(source ? 'retry' : 'next'));
  let usedFallback = false;
  const failed = () => { image.hidden = true; retry.hidden = false; };
  image.onerror = () => {
    if (kind === 'pictureless' && !usedFallback) {
      usedFallback = true; image.src = official;
    } else failed();
  };
  image.onload = () => { image.hidden = false; retry.hidden = true; };
  retry.onclick = () => {
    if (!source) { onDetails(); return; }
    usedFallback = false; retry.hidden = true; image.hidden = false; image.src = source;
  };
  avatar.append(image, retry);
  if (source) image.src = source; else failed();
  return avatar;
}

export class MobileSheet {
  constructor(layer, app) {
    this.layer = layer;
    this.app = app;
    this.title = layer.querySelector('#sheet-title');
    this.body = layer.querySelector('#sheet-content');
    this.back = layer.querySelector('#sheet-back');
    this.closeButton = layer.querySelector('#sheet-close');
    this.closeButton.onclick = () => this.close();
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key !== 'Tab') return;
      const items = [...layer.querySelectorAll('button:not(:disabled),[tabindex="0"],a[href]')]
        .filter(node => node.tabIndex >= 0 && !node.hidden && !node.closest('[hidden]'));
      if (!items.length) return;
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
  open(title, content, back) {
    if (this.layer.hidden) {
      this.returnFocus = document.activeElement;
      this.app.inert = true;
    }
    this.title.textContent = title;
    this.body.replaceChildren(...content);
    this.back.hidden = !back;
    this.back.onclick = back || null;
    this.layer.hidden = false;
    this.body.scrollTop = 0;
    const selected = this.body.querySelector('[aria-selected="true"]');
    (selected || this.closeButton).focus({preventScroll: true});
  }
  close() {
    this.layer.hidden = true;
    this.app.inert = false;
    if (this.returnFocus?.isConnected && !this.returnFocus.disabled) this.returnFocus.focus({preventScroll: true});
  }
}

// Every choice is a styled, touch-sized row. No native select or radio UI.
export function pickerList(title, options, selected, onSelect) {
  const list = element('div', undefined, 'picker-list');
  list.role = 'listbox';
  list.setAttribute('aria-label', title);
  const rows = options.map(option => {
    const button = element('button', undefined, 'picker-option');
    button.type = 'button';
    button.role = 'option';
    button.dataset.value = option.value;
    button.setAttribute('aria-selected', String(option.value === selected));
    button.tabIndex = option.value === selected ? 0 : -1;
    const text = element('span', undefined, 'picker-text');
    text.append(element('span', option.label, 'picker-name'));
    if (option.caption) text.append(element('span', option.caption, 'picker-caption'));
    const mark = element('span', undefined, 'selection-mark');
    mark.append(icon('check'));
    button.append(text, mark);
    button.onclick = () => {
      for (const row of rows) {
        const checked = row === button;
        row.setAttribute('aria-selected', String(checked));
        row.tabIndex = checked ? 0 : -1;
      }
      button.focus({preventScroll: true});
      if (selected === option.value) return;
      selected = option.value;
      onSelect(option.value);
    };
    return button;
  });
  if (!rows.some(row => row.tabIndex === 0) && rows.length) rows[0].tabIndex = 0;
  list.append(...rows);
  list.addEventListener('keydown', event => {
    let index = rows.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') index = Math.min(rows.length - 1, index + 1);
    else if (event.key === 'ArrowUp') index = Math.max(0, index - 1);
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = rows.length - 1;
    else return;
    event.preventDefault();
    rows.forEach((row, i) => row.tabIndex = i === index ? 0 : -1);
    rows[index]?.focus();
  });
  return list;
}

export function disclosure(label, data) {
  const root = element('div', undefined, 'data-disclosure');
  const button = element('button', label, 'disclosure-button');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.append(icon('next'));
  const body = element('pre', JSON.stringify(data, null, 2));
  body.hidden = true;
  button.onclick = () => {
    body.hidden = !body.hidden;
    button.setAttribute('aria-expanded', String(!body.hidden));
  };
  root.append(button, body);
  return root;
}

export function installMobileLayout() {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  let frame = 0;
  let previousHeight = 0;
  const update = () => {
    frame = 0;
    // Pinch zoom pans the visual viewport; it must not resize the app layout.
    if (viewport && Math.abs((viewport.scale || 1) - 1) > 0.01) return;
    const height = Math.round(viewport?.height || window.innerHeight);
    if (height <= 0 || height === previousHeight) return;
    previousHeight = height;
    root.style.setProperty('--app-height', height + 'px');
    root.style.setProperty('--visual-height', height + 'px');
  };
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
  // Only actual size changes (keyboard, rotation, browser chrome) resize the shell.
  // There are deliberately no document, result-pane, or visual-viewport scroll handlers.
  viewport?.addEventListener('resize', schedule, {passive: true});
  window.addEventListener('resize', schedule, {passive: true});
  update();
  if (window.CSS?.supports?.('corner-shape', 'superellipse(1.5)') || typeof ResizeObserver !== 'function') return;
  const seen = new WeakSet();
  const curves = new ResizeObserver(items => {
    for (const {target: node} of items) {
      const w = node.offsetWidth, h = node.offsetHeight;
      if (!w || !h) continue;
      const style = getComputedStyle(node);
      const radius = value => Math.min(w / 2, h / 2, parseFloat(value) * (value.includes('%') ? w / 100 : 1));
      const a = radius(style.borderTopLeftRadius), b = radius(style.borderTopRightRadius);
      const c = radius(style.borderBottomRightRadius), d = radius(style.borderBottomLeftRadius);
      if (!(a || b || c || d)) continue;
      node.style.clipPath = `path("M ${a} 0 H ${w-b} C ${w} 0 ${w} 0 ${w} ${b} V ${h-c} C ${w} ${h} ${w} ${h} ${w-c} ${h} H ${d} C 0 ${h} 0 ${h} 0 ${h-d} V ${a} C 0 0 0 0 ${a} 0 Z")`;
    }
  });
  const selector = '.card,.avatar,button,.search-field,.suggestion-panel,.sheet,#error,pre';
  const visit = (root, callback) => {
    if (root.nodeType !== 1) return;
    if (root.matches(selector)) callback(root);
    root.querySelectorAll(selector).forEach(callback);
  };
  const observe = node => {
    if (node.isConnected && !seen.has(node)) { seen.add(node); curves.observe(node); }
  };
  visit(document.body, observe);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.removedNodes) visit(node, child => {
        if (!child.isConnected) { curves.unobserve(child); seen.delete(child); }
      });
      for (const node of record.addedNodes) visit(node, observe);
    }
  }).observe(document.body, {childList: true, subtree: true});
}
