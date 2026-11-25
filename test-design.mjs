// Design rules and frontend units that run without a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import html from './lib/ui.mjs';
import {batch, effect, onCleanup, scope, signal} from './public/ui/reactive.mjs';
import {CIRCLE_EQUIVALENT, squirclePath} from './public/ui/squircle.mjs';
import {describeError} from './public/ui/errors.mjs';
import {PREFERENCES_KEY, readPreferences, createPreferences} from './public/ui/prefs.mjs';
import {createHaptics, detectHaptics} from './public/ui/haptics.mjs';
import {imageKind, matchesFilter, sortInstances} from './public/ui/catalog.mjs';
import {THEME_COLORS} from './public/ui/theme.mjs';

// Every file that ships to the browser.
async function walk(directory) {
  const out = [];
  for (const item of await fs.readdir(directory, {withFileTypes: true})) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) out.push(...await walk(file));
    else if (/\.(m?js|css|svg)$/.test(item.name)) out.push(file);
  }
  return out;
}
const sources = new Map([['lib/ui.mjs', html], ...await Promise.all((await walk('public')).map(async file => [file, await fs.readFile(file, 'utf8')]))]);

// No emoji anywhere, and no em, en, figure or bar dashes, even in comments.
for (const [file, text] of sources) {
  const emoji = text.match(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/u);
  assert.equal(emoji, null, `${file} contains an emoji: ${emoji?.[0]}`);
  const dash = text.match(/[‒–—―−]/);
  assert.equal(dash, null, `${file} contains a dash character`);
}

// Copy: string literals and page text never use a standalone hyphen as punctuation.
function literals(code) {
  const found = [];
  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    if (char === '/' && code[index + 1] === '/') { index = code.indexOf('\n', index); if (index < 0) break; continue; }
    if (char === '/' && code[index + 1] === '*') { index = code.indexOf('*/', index + 2) + 1; continue; }
    if (char !== '\'' && char !== '"' && char !== '`') continue;
    let end = index + 1, value = '';
    while (end < code.length && code[end] !== char) {
      if (code[end] === '\\') { value += code[end + 1]; end += 2; continue; }
      if (char === '`' && code[end] === '$' && code[end + 1] === '{') {
        let depth = 1; end += 2;
        while (end < code.length && depth) { if (code[end] === '{') depth++; else if (code[end] === '}') depth--; end++; }
        value += ' ';
        continue;
      }
      value += code[end++];
    }
    found.push(value);
    index = end;
  }
  return found;
}
const prose = value => /[a-z]{2}/i.test(value) && !/^[\w.#:/\-[\]="'()*,>+~ ]*$/.test(value) || / /.test(value);
for (const [file, text] of sources) {
  if (!/\.m?js$/.test(file)) continue;
  for (const value of literals(text)) {
    if (!prose(value) || /^[MmLlHhVvCcZz0-9 .,-]+$/.test(value)) continue;
    assert.doesNotMatch(value, /(^|\s)-(\s|$)/, `${file} uses a standalone hyphen in "${value}"`);
  }
}
assert.deepEqual(literals("const a = 'Try again - now'; // a - b\nconst b = `x ${1 - 2} y`;"), ['Try again - now', 'x   y'], 'The literal scanner skips comments and code');
assert.ok(prose('Try again - now') && /(^|\s)-(\s|$)/.test('Try again - now'), 'The hyphen rule catches spaced hyphens');
const pageText = html.replace(/<svg class="symbols"[\s\S]*?<\/svg>/, '').replace(/<[^>]+>/g, ' ');
assert.doesNotMatch(pageText, /(^|\s)-(\s|$)/, 'Page text uses a standalone hyphen');
for (const [, value] of html.matchAll(/(?:aria-label|placeholder|title)="([^"]*)"/g)) {
  assert.doesNotMatch(value, /(^|\s)-(\s|$)/, `Attribute uses a standalone hyphen: ${value}`);
}
console.log('No emoji, no dash characters, and no standalone hyphens in copy.');

// Colors: neutrals, gold, red and green only. Pink, purple, violet, blue,
// orange and brown are rejected by hue, chroma and lightness in OKLCH.
const linear = channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
function oklch([r, g, b]) {
  [r, g, b] = [r, g, b].map(value => linear(value / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return {L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360};
}
export function colorFamily(rgb) {
  const {L, C, h} = oklch(rgb);
  if (C < 0.022) return 'neutral';
  if (h >= 86 && h <= 112 && L >= 0.6) return 'gold';
  if (h >= 118 && h <= 165) return 'green';
  if (h >= 20 && h <= 34 && C >= 0.14 && L <= 0.72) return 'red';
  return `banned (L ${L.toFixed(2)}, C ${C.toFixed(3)}, h ${h.toFixed(0)})`;
}
const colors = [];
for (const [file, text] of sources) {
  for (const [match] of text.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    let hex = match.slice(1);
    if (![3, 4, 6, 8].includes(hex.length) || /^i-/.test(hex)) continue;
    if (hex.length <= 4) hex = [...hex].map(char => char + char).join('');
    colors.push([file, match, [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16))]);
  }
  for (const [match, values] of text.matchAll(/rgba?\(([^)]*)\)/g)) {
    const channels = values.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (channels.every(Number.isFinite)) colors.push([file, match, channels]);
  }
}
assert.ok(colors.length > 40, 'The color scan found the palette');
for (const [file, literal, rgb] of colors) {
  assert.doesNotMatch(colorFamily(rgb), /banned/, `${file} uses ${literal}, outside the allowed families`);
}
for (const banned of [[255, 105, 180], [128, 0, 128], [138, 43, 226], [0, 0, 255], [30, 144, 255], [255, 165, 0], [139, 69, 19], [134, 112, 71], [24, 35, 51]]) {
  assert.match(colorFamily(banned), /banned/, `The guard must reject rgb(${banned})`);
}
console.log(`${colors.length} color literals checked against the banned hues.`);

// Theme colors agree across the page, boot script, theme module and stylesheet.
const css = sources.get('public/style.css');
const token = (selector, name) => new RegExp(`${selector.replace(/[[\]"]/g, match => '\\' + match)}\\s*\\{[^}]*--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1];
assert.equal(token(':root', 'bg'), THEME_COLORS.light);
assert.equal(token(':root[data-theme="dark"]', 'bg'), THEME_COLORS.dark);
assert.match(html, new RegExp(`content="${THEME_COLORS.light}" media="\\(prefers-color-scheme: light\\)"`));
assert.match(html, new RegExp(`content="${THEME_COLORS.dark}" media="\\(prefers-color-scheme: dark\\)"`));
assert.ok(sources.get('public/boot.js').includes(THEME_COLORS.light) && sources.get('public/boot.js').includes(THEME_COLORS.dark));
assert.equal(/style="/.test(html), false, 'The page has no inline style attributes');
assert.equal(/\son[a-z]+="/i.test(html), false, 'The page has no inline handlers');
console.log('Theme colors are consistent; the page has no inline styles or handlers.');

// Reactive core: tracking, batching, nested ownership and cleanup.
{
  const count = signal(1), log = [];
  const stop = effect(() => { log.push(count()); onCleanup(() => log.push('cleanup')); });
  count.set(2); count.set(2);
  batch(() => { count.set(3); count.set(4); });
  stop(); count.set(5);
  assert.deepEqual(log, [1, 'cleanup', 2, 'cleanup', 4, 'cleanup']);
  const outer = signal(0), inner = signal(0), runs = [];
  const dispose = scope(() => effect(() => { outer(); effect(() => runs.push('inner ' + inner())); }));
  inner.set(1); outer.set(1); inner.set(2);
  assert.deepEqual(runs, ['inner 0', 'inner 1', 'inner 1', 'inner 2'], 'A re-run disposes nested effects');
  dispose(); inner.set(3);
  assert.equal(runs.length, 4, 'Disposing a scope stops its effects');
  const loop = signal(0);
  const errors = [];
  const original = globalThis.reportError;
  globalThis.reportError = error => errors.push(error.message);
  try { effect(() => loop.set(loop() + 1)); } finally { globalThis.reportError = original; }
  assert.ok(loop.peek() > 100 && errors.some(message => /did not settle/.test(message)), 'A runaway effect is stopped and reported instead of hanging');
}
console.log('Reactive signals, batching, ownership and cleanup passed.');

// Squircle geometry matches the superellipse |x|^4 + |y|^4 = 1 per corner.
{
  const path = squirclePath(200, 100, [40, 40, 40, 40]);
  assert.match(path, /^M160 0C/);
  assert.equal(path.match(/C/g).length, 8, 'Two cubic segments per corner');
  assert.ok(path.endsWith('Z'));
  const numbers = [...path.matchAll(/C([\d. ]+)/g)].map(match => match[1].trim().split(' ').map(Number));
  const [p0, p1, p2, p3] = [[160, 0], [numbers[0][0], numbers[0][1]], [numbers[0][2], numbers[0][3]], [numbers[0][4], numbers[0][5]]];
  assert.deepEqual([p1[1], p2[1]], [0, 0], 'Control points stay on the edge for zero curvature at the join');
  for (let t = 0; t <= 1; t += 0.125) {
    const x = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t ** 3 * p3[0];
    const y = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t ** 3 * p3[1];
    const u = (x - 160) / 40, v = (40 - y) / 40;
    assert.ok(Math.abs(u ** 4 + v ** 4 - 1) < 0.01, `Point ${t} lies on the superellipse`);
  }
  const clamped = squirclePath(40, 40, [100, 100, 100, 100]);
  assert.match(clamped, /^M20 0C/, 'Radii larger than the box scale down like CSS');
  const sheet = squirclePath(300, 200, [30, 30, 0, 0]);
  assert.ok(sheet.includes('L300 200L0 200'), 'Zero radius corners stay square');
  const ring = squirclePath(100, 50, [20, 20, 20, 20], 1, true);
  assert.match(ring, /^M20 1C/, 'Inner ring starts inset by the border width');
  assert.equal(squirclePath(1, 1, [4, 4, 4, 4], 2), '', 'Insets larger than the box draw nothing');
  assert.ok(css.includes('calc(var(--r) * ' + String(CIRCLE_EQUIVALENT).replace(/^0/, '') + ')'), 'The pre-paint circular radius matches the module constant');
}
console.log('Squircle paths: superellipse fit, G2 joins, scaling, square corners and rings passed.');

// Errors become plain guidance while keeping the original detail.
for (const [error, message] of [
  [Object.assign(Error('signal is aborted without reason'), {name: 'AbortError'}), 'The request timed out. Try again.'],
  [new TypeError('Failed to fetch'), 'No connection. Check your network and try again.'],
  [new TypeError('Load failed'), 'No connection. Check your network and try again.'],
  [new SyntaxError('Unexpected token < in JSON'), 'The service sent an unexpected response. Reload the page and try again.'],
  [Error('Too many requests. Try again shortly.'), 'Too many requests. Wait a moment, then try again.'],
  [Error('The lookup is busy. Try again shortly.'), 'The service is busy. Try again in a moment.'],
  [Error('Invalid session. Try again to reconnect.'), 'The session expired. Try again.'],
  [Error('Akinator suggest-objects rejected the request (HTTP 422): bad'), 'Akinator rejected the request. Try again or reconnect.'],
  [Error('Something unexpected'), 'The lookup couldn’t finish. Try again or reconnect.'],
]) {
  assert.deepEqual(describeError(error), {message, detail: error.message});
}
console.log('Error messages are actionable and keep diagnostics.');

// Preferences persist settings only, with validation.
{
  const store = new Map();
  const storage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value)};
  assert.deepEqual(readPreferences(storage), {theme: 'system', haptics: true, language: 'en', category: '1', filter: 'all'});
  store.set(PREFERENCES_KEY, JSON.stringify({theme: 'neon', haptics: 'yes', language: '<script>', category: '13', filter: 'pictureless', query: 'secret'}));
  assert.deepEqual(readPreferences(storage), {theme: 'system', haptics: true, language: 'en', category: '13', filter: 'pictureless'});
  store.set(PREFERENCES_KEY, '{broken');
  assert.equal(readPreferences(storage).theme, 'system');
  const prefs = createPreferences(storage);
  prefs.theme.set('dark');
  prefs.haptics.set(false);
  assert.deepEqual(JSON.parse(store.get(PREFERENCES_KEY)), {theme: 'dark', haptics: false, language: 'en', category: '1', filter: 'all'});
  const blocked = {getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }};
  assert.doesNotThrow(() => createPreferences(blocked).theme.set('light'));
}
console.log('Preferences: validation, persistence and blocked storage passed.');

// Haptics: vibration where available, the iOS switch tick otherwise, silence elsewhere.
{
  const media = coarse => query => ({matches: query === '(any-pointer: coarse)' && coarse});
  assert.equal(detectHaptics({matchMedia: media(false), navigator: {vibrate() {}}}), 'none', 'Desktop pointers stay silent');
  assert.equal(detectHaptics({matchMedia: media(true), navigator: {vibrate() {}}}), 'vibrate');
  class Input {} Input.prototype.switch = false;
  assert.equal(detectHaptics({matchMedia: media(true), navigator: {}, HTMLInputElement: Input}), 'switch');
  assert.equal(detectHaptics({matchMedia: media(true), navigator: {}}), 'none');
  const patterns = [];
  let now = 0;
  const enabled = signal(true);
  const haptics = createHaptics(enabled, {matchMedia: media(true), navigator: {vibrate: pattern => { patterns.push(pattern); return true; }}, performance: {now: () => now}});
  assert.equal(haptics.play('selection'), true);
  assert.equal(haptics.play('selection'), false, 'Rapid repeats are throttled');
  now = 100; haptics.play('error');
  enabled.set(false); now = 200; haptics.play('impact');
  assert.deepEqual(patterns, [6, [16, 60, 16, 60, 16]]);
  const clicks = [], appended = [];
  const element = tag => ({tag, style: {setProperty(name, value) { this[name] = value; }}, setAttribute() {}, append() {}, click() { clicks.push(tag); }, isConnected: true});
  const ios = createHaptics(signal(true), {matchMedia: media(true), navigator: {}, HTMLInputElement: Input, performance: {now: () => (now += 100)},
    document: {createElement: element, head: {append: node => appended.push(node)}}});
  ios.play(); ios.play();
  assert.deepEqual(clicks, ['label', 'label']);
  assert.equal(appended.length, 1, 'The hidden switch is created once');
  assert.equal(appended[0].style.display, 'none', 'The switch can never take focus or close the keyboard');
}
console.log('Haptics: detection, patterns, throttling, toggle and iOS switch proxy passed.');

// Catalog helpers keep the original image classification and category order.
assert.equal(imageKind({avatar_status: 'missing'}), 'pictureless');
assert.equal(imageKind({avatar_status: 'placeholder'}), 'pictureless');
assert.equal(imageKind({avatar_status: 'supplied'}), 'custom');
assert.equal(imageKind({avatar_status: 'unknown'}), 'unspecified');
assert.equal(matchesFilter({avatar_status: 'missing'}, 'pictureless'), true);
assert.equal(matchesFilter({avatar_status: 'supplied'}, 'unknown'), false);
assert.deepEqual(sortInstances([{subject_id: '14'}, {subject_id: '2'}, {subject_id: '99', label: 'Places'}, {subject_id: '1'}, {subject_id: '13'}]).map(item => item.subject_id), ['1', '2', '13', '14', '99']);
console.log('Catalog classification and ordering passed.');
