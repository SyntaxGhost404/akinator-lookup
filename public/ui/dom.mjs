import {onCleanup} from './reactive.mjs';

const SVG = 'http://www.w3.org/2000/svg';

// Every response string reaches the page through text nodes or attributes.
// There is no HTML sink and no inline style attribute.
export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    // Element listeners live and die with their element.
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

export function icon(name, className = 'icon') {
  const svg = document.createElementNS(SVG, 'svg');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.append(use);
  return svg;
}

export function setIcon(svg, name) {
  svg.firstElementChild?.setAttribute('href', '#i-' + name);
}

export function listen(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  onCleanup(() => target.removeEventListener(type, handler, options));
  return handler;
}

export function byId(id) { return document.getElementById(id); }

export function reducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// Web Animations when available. Tests and reduced motion settle at once.
export function animate(node, keyframes, options) {
  if (typeof node.animate !== 'function' || reducedMotion()) return null;
  try { return node.animate(keyframes, options); } catch { return null; }
}
export function finished(animation) {
  return animation ? animation.finished.then(() => true, () => false) : Promise.resolve(true);
}

export function isTextField(node) {
  return Boolean(node && (node.isContentEditable || /^(input|textarea|select)$/i.test(node.tagName || '')));
}

// Roving focus for radio groups and listboxes: one tab stop, arrows inside.
export function rovingKeys(container, items, {orientation = 'both', activate} = {}) {
  listen(container, 'keydown', event => {
    const list = items().filter(item => !item.hidden && !item.disabled);
    let index = list.indexOf(document.activeElement);
    if (index < 0) return;
    const forward = orientation === 'vertical' ? ['ArrowDown'] : orientation === 'horizontal' ? ['ArrowRight'] : ['ArrowRight', 'ArrowDown'];
    const backward = orientation === 'vertical' ? ['ArrowUp'] : orientation === 'horizontal' ? ['ArrowLeft'] : ['ArrowLeft', 'ArrowUp'];
    if (forward.includes(event.key)) index = Math.min(list.length - 1, index + 1);
    else if (backward.includes(event.key)) index = Math.max(0, index - 1);
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = list.length - 1;
    else return;
    event.preventDefault();
    for (const [position, item] of list.entries()) item.tabIndex = position === index ? 0 : -1;
    list[index].focus();
    activate?.(list[index]);
  });
}
