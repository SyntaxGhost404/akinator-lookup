// Continuous-curvature corners.
//
// Browsers with CSS corner-shape draw `corner-shape: squircle` natively, which is
// a superellipse with exponent 4 for each corner. Elsewhere (Safari and Firefox
// at the time of writing) this module draws the same curve as a clip path. Each
// corner is two cubic segments with zero curvature where they meet the straight
// edges, so the outline stays G2 continuous. The fit is within 0.08% of the
// corner radius of the true superellipse.
const K1 = 0.5626, K2 = 0.31821, KD = 0.1591;
// Circular radius with the same diagonal depth, used before the clip path lands.
export const CIRCLE_EQUIVALENT = 0.5432;

const round = value => Math.round(value * 100) / 100;

export function squirclePath(width, height, radii, inset = 0, reverse = false) {
  const x = inset, y = inset, w = width - inset * 2, h = height - inset * 2;
  if (w <= 0 || h <= 0) return '';
  let [tl, tr, br, bl] = radii.map(radius => Math.max(0, radius - inset));
  const scale = Math.min(1, w / (tl + tr || 1), w / (bl + br || 1), h / (tl + bl || 1), h / (tr + br || 1));
  tl *= scale; tr *= scale; br *= scale; bl *= scale;
  // Each corner: center point, unit vector back along the incoming edge, unit vector along the outgoing edge.
  const clockwise = [
    [x + w, y, -1, 0, 0, 1, tr],
    [x + w, y + h, 0, -1, -1, 0, br],
    [x, y + h, 1, 0, 0, -1, bl],
    [x, y, 0, 1, 1, 0, tl],
  ];
  const counter = [
    [x, y, 1, 0, 0, 1, tl],
    [x, y + h, 0, -1, 1, 0, bl],
    [x + w, y + h, -1, 0, 0, -1, br],
    [x + w, y, 0, 1, -1, 0, tr],
  ];
  const corners = reverse ? counter : clockwise;
  const point = (cx, cy, dx, dy, k, r) => round(cx + dx * k * r) + ' ' + round(cy + dy * k * r);
  let path = '';
  for (const [index, [cx, cy, ax, ay, bx, by, r]] of corners.entries()) {
    path += (index ? 'L' : 'M') + point(cx, cy, ax, ay, 1, r);
    if (r <= 0) continue;
    path += 'C' + point(cx, cy, ax, ay, K1, r) + ' ' + point(cx, cy, ax, ay, K2, r) + ' ' +
      round(cx + KD * r * (ax + bx)) + ' ' + round(cy + KD * r * (ay + by));
    path += 'C' + point(cx, cy, bx, by, K2, r) + ' ' + point(cx, cy, bx, by, K1, r) + ' ' + point(cx, cy, bx, by, 1, r);
  }
  return path + 'Z';
}

function length(value, size) {
  const text = String(value || '').trim();
  if (!text) return null;
  const number = parseFloat(text);
  if (!Number.isFinite(number)) return null;
  return text.endsWith('%') ? number * size / 100 : number;
}

export function supportsCornerShape(win = window) {
  try { return Boolean(win.CSS?.supports?.('corner-shape', 'squircle')); } catch { return false; }
}

// Observe every `.sq` element and keep its clip, border ring and focus ring paths
// current. Detached nodes are released so removed views do not stay referenced.
export function installSquircles(doc = document) {
  const win = doc.defaultView, root = doc.documentElement;
  if (supportsCornerShape(win)) { root.classList.remove('sq-fallback'); return {active: false, dispose() {}}; }
  root.classList.add('sq-fallback');
  if (typeof win.ResizeObserver !== 'function' || typeof win.MutationObserver !== 'function') return {active: false, dispose() {}};
  const observed = new Set(), painted = new WeakMap();
  const paint = (node, box) => {
    const width = box ? box.inlineSize : node.offsetWidth, height = box ? box.blockSize : node.offsetHeight;
    if (!width || !height) return;
    const style = win.getComputedStyle(node);
    const size = Math.min(width, height);
    const top = length(style.getPropertyValue('--r'), size) ?? 0;
    const bottom = length(style.getPropertyValue('--rb'), size) ?? top;
    const border = parseFloat(style.borderTopWidth) || 0;
    const key = [width, height, top, bottom, border].join(' ');
    if (painted.get(node) === key) return;
    painted.set(node, key);
    const radii = [top, top, bottom, bottom];
    const outer = squirclePath(width, height, radii);
    node.style.setProperty('--sq-clip', `path("${outer}")`);
    node.style.setProperty('--sq-ring', border ? `path("${outer}${squirclePath(width, height, radii, border, true)}")` : 'none');
    node.style.setProperty('--sq-focus', `path("${outer}${squirclePath(width, height, radii, 2, true)}")`);
  };
  const observer = new win.ResizeObserver(entries => {
    for (const entry of entries) paint(entry.target, entry.borderBoxSize?.[0]);
  });
  const each = (node, callback) => {
    if (node.nodeType !== 1) return;
    if (node.classList.contains('sq')) callback(node);
    for (const child of node.querySelectorAll('.sq')) callback(child);
  };
  const observe = node => {
    if (!node.isConnected || observed.has(node)) return;
    observed.add(node);
    observer.observe(node);
  };
  const release = node => {
    if (node.isConnected || !observed.has(node)) return;
    observed.delete(node);
    observer.unobserve(node);
  };
  each(doc.body, observe);
  const mutations = new win.MutationObserver(records => {
    for (const record of records) {
      for (const node of record.removedNodes) each(node, release);
      for (const node of record.addedNodes) each(node, observe);
    }
  });
  mutations.observe(doc.body, {childList: true, subtree: true});
  return {
    active: true,
    observed,
    dispose() { mutations.disconnect(); observer.disconnect(); observed.clear(); },
  };
}
