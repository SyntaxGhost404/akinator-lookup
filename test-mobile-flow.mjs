// Runs the real page modules and DOM events in jsdom. No browser rendering is simulated.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const {JSDOM, VirtualConsole} = await import(process.env.JSDOM_MODULE || 'jsdom');
const {default: html} = await import('./lib/ui.mjs');

const failures = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => failures.push('jsdom: ' + error.message));
virtualConsole.on('error', (...args) => failures.push('console: ' + args.map(String).join(' ')));
const dom = new JSDOM(html, {url: 'https://lookup.test', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole});
const w = dom.window, document = w.document;
w.addEventListener('error', event => failures.push(event.error?.message || event.message));

// Environment the app expects from a phone browser.
const viewport = new w.EventTarget();
Object.assign(viewport, {height: 812, width: 375, offsetTop: 0, scale: 1});
Object.defineProperty(w, 'visualViewport', {value: viewport});
const media = new Map();
const mediaDefaults = {'(prefers-color-scheme: dark)': false, '(any-pointer: coarse)': true, '(min-width: 720px)': false, '(min-width: 1180px)': false, '(prefers-reduced-motion: reduce)': false};
const mediaState = query => {
  if (!media.has(query)) media.set(query, {matches: Boolean(mediaDefaults[query]), listeners: new Set()});
  return media.get(query);
};
w.matchMedia = query => {
  const state = mediaState(query);
  return {media: query, get matches() { return state.matches; },
    addEventListener: (type, fn) => state.listeners.add(fn), removeEventListener: (type, fn) => state.listeners.delete(fn),
    addListener: fn => state.listeners.add(fn), removeListener: fn => state.listeners.delete(fn)};
};
const setMedia = (query, matches) => {
  const state = mediaState(query);
  state.matches = matches;
  for (const listener of [...state.listeners]) listener({matches, media: query});
};
const vibrations = [], copied = [];
Object.defineProperty(w.navigator, 'vibrate', {configurable: true, value: pattern => { vibrations.push(pattern); return true; }});
Object.defineProperty(w.navigator, 'clipboard', {configurable: true, value: {writeText: async text => { copied.push(text); }}});
w.HTMLElement.prototype.scrollIntoView = function() {};
w.HTMLElement.prototype.scrollTo = function() {};
const resizeObservers = new Set();
w.ResizeObserver = class {
  constructor() { this.nodes = new Set(); resizeObservers.add(this); }
  observe(node) { this.nodes.add(node); } unobserve(node) { this.nodes.delete(node); } disconnect() { this.nodes.clear(); }
};
const observedNodes = () => new Set([...resizeObservers].flatMap(observer => [...observer.nodes]));
w.CSS = {supports: () => false};
if (typeof w.PointerEvent !== 'function') {
  w.PointerEvent = class extends w.MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'touch'; }
  };
}
w.HTMLElement.prototype.setPointerCapture = function() {};
const style = document.createElement('style');
style.textContent = await fs.readFile(new URL('./public/style.css', import.meta.url), 'utf8');
document.head.append(style);

// A controllable lookup API with engine step bookkeeping.
const calls = [], sessions = new Map(), paused = new Map();
const pause = (action, instance, q) => {
  let release;
  paused.set('/api/' + action + '|' + instance + '|' + q, new Promise(resolve => release = resolve));
  return release;
};
let nextSession = 0, rejectNext = false, rejectInstance = '', popularEnabled = false;
const popularFor = instance => [1, 2, 3].map(rank => ({id: 'p' + rank, name: 'Popular ' + rank, description: 'Popular entry ' + rank,
  category: 'Characters', language: instance.slice(0, 2), instance_key: instance,
  avatar_status: rank === 2 ? 'placeholder' : 'supplied', avatar_url: rank === 2 ? null : 'https://photos.clarinea.fr/BL_15_en/600/partenaire/p' + rank + '.jpg',
  default_avatar_url: rank === 2 ? 'https://photos.clarinea.fr/BL_1_fr/none.jpg' : null,
  raw: {name: 'Popular ' + rank, ranking: rank * 10, nbPlayed: 1000 - rank, awardId: rank}, ranking: rank * 10, times_played: 1000 - rank}));
const directory = ['1', '2', '13', '14'].map((subject_id, index) => ({key: 'en' + index, language: 'en', subject_id, label: subject_id, autocomplete: true}));
for (const language of ['ar', 'cn', 'de', 'es', 'fa', 'fr', 'id', 'il', 'it', 'jp', 'kr', 'nl', 'pl', 'pt', 'ru', 'tr', 'vi']) {
  directory.push({key: language + '0', language, subject_id: '1', label: 'Characters', autocomplete: true});
}
const moin = 'Khwaja Moinuddin Chishti (Sufi Saint, Indian, Muslim, Deliver a message of peace, Ajmair, religious figure)';
const polly = 'Polly (Phoenix Wright Attorney) (Talking parrot, DL6)';
w.fetch = async function(url, options) {
  assert.equal(this, w, 'Native Window.fetch receiver was lost');
  if (url === '/api/instances') return {ok: true, json: async () => ({instances: directory})};
  const input = JSON.parse(options.body);
  calls.push({url, ...input});
  const delayed = paused.get(url + '|' + input.instance + '|' + input.q);
  if (delayed) await delayed;
  await new Promise(resolve => setTimeout(resolve, 8));
  if (rejectNext || (rejectInstance && input.instance === rejectInstance && url.endsWith('search'))) {
    rejectNext = false;
    return {ok: false, json: async () => ({error: 'Akinator set-and-get-searchlist rejected the request (HTTP 422): INCORRECT PARAMETER'})};
  }
  let session = input.session;
  if (!session) { session = {id: String(++nextSession), step: 1, instance: input.instance}; sessions.set(session.id, 1); }
  assert.equal(session.step, sessions.get(session.id), 'Overlapping requests desynchronized the engine step');
  session = {...session, step: session.step + 1};
  sessions.set(session.id, session.step);
  if (url.endsWith('prepare')) return {ok: true, json: async () => ({session, popular: popularEnabled ? popularFor(input.instance) : []})};
  if (url.endsWith('suggest')) return {ok: true, json: async () => ({suggestions: input.q.startsWith('Pol') ? [polly] : input.q.startsWith('Nar') ? ['Nara (Test character)'] : [moin], session})};
  const name = input.q;
  const entries = [
    {id: '1', name, description: 'Test description', category: 'Characters', language: 'en', instance_key: input.instance, avatar_status: 'supplied', avatar_url: 'https://photos.clarinea.fr/BL_15_en/600/partenaire/original.jpg', raw: {name}},
    {id: '2', name: 'Pictureless match', description: 'No custom image', category: 'Characters', language: 'en', instance_key: input.instance, avatar_status: 'placeholder', avatar_url: null, default_avatar_url: 'https://photos.clarinea.fr/BL_1_fr/none.jpg', raw: {name: 'Pictureless match', picturePath: 'none.jpg'}},
    {id: '3', name: 'Unspecified match', description: 'No image metadata', category: 'Characters', language: 'en', instance_key: input.instance, avatar_status: 'unknown', avatar_url: null, raw: {name: 'Unspecified match'}},
  ];
  return {ok: true, json: async () => ({entries, response: {result: {objects: entries}}, session})};
};

// Load the real ES modules into the page context. Each path maps to one cached
// module promise, and Node links the graph recursively from the entry module.
const modules = new Map();
function load(specifier, parent = '/') {
  const path = new URL(specifier.split('?')[0], 'https://modules.test' + parent).pathname;
  if (!modules.has(path)) {
    modules.set(path, fs.readFile(new URL('./public' + path, import.meta.url), 'utf8')
      .then(source => new vm.SourceTextModule(source, {context: dom.getInternalVMContext(), identifier: path})));
  }
  return modules.get(path);
}
const entry = await load('/app.js');
await entry.link((specifier, referencing) => load(specifier, referencing.identifier));
await entry.evaluate();

const $ = id => document.getElementById(id);
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (condition, label) => {
  for (let attempt = 0; attempt < 200; attempt++) { if (condition()) return; await tick(10); }
  throw Error('Timed out: ' + label);
};
const type = text => { const query = $('query'); query.value = text; query.dispatchEvent(new w.Event('input', {bubbles: true})); };
const click = selector => { const node = document.querySelector(selector); assert.ok(node, 'Missing ' + selector); node.click(); };
const option = value => [...document.querySelectorAll('.picker-option')].find(node => node.dataset.value === value);
const row = name => [...document.querySelectorAll('.setting-row')].find(node => node.querySelector('.setting-label')?.textContent === name);
const chip = (group, value) => document.querySelector(`#${group} [data-value="${value}"]`);
const visibleCards = () => [...document.querySelectorAll('#results .card:not(.skeleton)')].filter(card => !card.hidden);
const sheetOpen = () => !$('sheet-layer').hidden;
const pointer = (node, type, init) => node.dispatchEvent(new w.PointerEvent(type, {bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', ...init}));

await waitFor(() => $('app').dataset.connection === 'ready', 'initial connection');
assert.equal(document.documentElement.dataset.theme, 'light');
assert.equal(document.documentElement.classList.contains('sq-fallback'), true, 'Browsers without corner-shape get squircle paths');
assert.ok([...observedNodes()].filter(node => node.classList.contains('sq')).length > 5, 'Squircle surfaces are observed');
assert.equal($('language-code').textContent, 'EN');
assert.deepEqual([...$('categories').children].map(node => node.textContent), ['Characters', 'Objects', 'Movies and TV', 'Animals', 'All']);
assert.equal(chip('categories', 'en0').getAttribute('aria-checked'), 'true');
assert.equal($('search').disabled, true, 'Search waits for two characters');
assert.equal(w.getComputedStyle($('app')).display, 'grid');
assert.equal(w.getComputedStyle($('main')).overflowY, 'auto');
assert.equal(document.querySelectorAll('select,option,dialog,details').length, 0, 'Native pickers or disclosures remain');
assert.equal($('empty').querySelector('.empty-title').textContent, 'Find an entry');

// The shell follows real size changes only.
const rootStyle = document.documentElement.style;
const beforeScroll = rootStyle.cssText;
for (let i = 0; i < 120; i++) {
  viewport.offsetTop = i % 40; viewport.dispatchEvent(new w.Event('scroll'));
  $('main').scrollTop = i * 60; $('main').dispatchEvent(new w.Event('scroll'));
}
await tick(35);
assert.equal(rootStyle.cssText, beforeScroll, 'Scrolling must not move or resize the app shell');
viewport.height = 465; viewport.dispatchEvent(new w.Event('resize'));
await waitFor(() => rootStyle.getPropertyValue('--app-height') === '465px', 'keyboard resize');
assert.equal(document.documentElement.dataset.keyboard, 'open');
viewport.height = 300; viewport.scale = 2; viewport.dispatchEvent(new w.Event('resize'));
await tick(35);
assert.equal(rootStyle.getPropertyValue('--app-height'), '465px', 'Pinch zoom must not resize the app layout');
viewport.height = 812; viewport.scale = 1; viewport.offsetTop = 0; viewport.dispatchEvent(new w.Event('resize'));
await waitFor(() => rootStyle.getPropertyValue('--app-height') === '812px', 'keyboard dismissal');
console.log('Shell, scope controls, scroll-independent layout, keyboard resize and zoom checks passed.');

// Suggestion click searches the full name with the prepared session.
type('Moin');
assert.equal($('search').disabled, false);
await waitFor(() => document.querySelector('#suggestions strong')?.textContent === 'Khwaja Moinuddin Chishti', 'Moin suggestion');
assert.equal($('query').getAttribute('aria-expanded'), 'true');
click('#suggestions button');
await waitFor(() => document.querySelector('.card h3')?.textContent === 'Khwaja Moinuddin Chishti', 'selected result');
assert.equal(calls.at(-1).q, 'Khwaja Moinuddin Chishti');
assert.equal(calls.at(-1).session.step, 2);
assert.equal($('suggestion-panel').hidden, true);
await waitFor(() => $('results').getAttribute('aria-busy') === 'false', 'search settles');
assert.equal($('results-title').textContent, 'Khwaja Moinuddin Chishti');
assert.equal($('count').textContent, '3 matches');
const selectedCard = visibleCards()[0];
const originalAvatar = selectedCard.querySelector('img');
assert.equal(w.getComputedStyle(originalAvatar).objectFit, 'cover');
assert.equal(w.getComputedStyle(originalAvatar).width, '100%');
assert.equal(w.getComputedStyle(originalAvatar).height, '100%');
assert.equal(originalAvatar.src, 'https://photos.clarinea.fr/BL_15_en/600/partenaire/original.jpg');
assert.equal(originalAvatar.hasAttribute('srcset'), false);
assert.equal(originalAvatar.loading, 'eager');
assert.deepEqual([...document.querySelectorAll('#filters [role=radio]')].map(node => node.textContent), ['All3', 'Pictureless1', 'Custom1', 'Unspecified1']);

// Details: sheet title, all fields, footer navigation, arrow keys and swipes.
selectedCard.querySelector('.card-open').click();
assert.equal(sheetOpen(), true);
assert.equal($('sheet-title').textContent, 'Khwaja Moinuddin Chishti');
assert.equal($('app').inert, true);
click('.disclosure-button');
assert.equal(document.querySelector('.disclosure-body').hidden, false);
assert.equal(document.querySelector('.raw dt').textContent, 'name');
assert.equal($('sheet-footer').querySelector('.position').textContent, '1 of 3');
$('sheet-footer').querySelector('[aria-label="Next match"]').click();
assert.equal($('sheet-title').textContent, 'Pictureless match');
assert.equal($('sheet-footer').querySelector('.position').textContent, '2 of 3');
document.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
assert.equal($('sheet-title').textContent, 'Khwaja Moinuddin Chishti');
const swipeHost = document.querySelector('.details-host');
pointer(swipeHost, 'pointerdown', {clientX: 300, clientY: 400});
pointer(swipeHost, 'pointermove', {clientX: 260, clientY: 404});
pointer(swipeHost, 'pointermove', {clientX: 150, clientY: 406});
pointer(swipeHost, 'pointerup', {clientX: 150, clientY: 406});
assert.equal($('sheet-title').textContent, 'Pictureless match', 'A horizontal swipe moves to the next match');
document.querySelector('.details .action').click();
await waitFor(() => copied.length === 1, 'copy name');
assert.equal(copied[0], 'Pictureless match');
await waitFor(() => document.querySelector('.toast')?.textContent === 'Name copied', 'copy confirmation');
click('#sheet-close');
assert.equal(sheetOpen(), false);
assert.equal($('app').inert, false);
console.log('Details title, returned fields, footer and keyboard navigation, swipe and copy passed.');

// Image filters keep card nodes and image states.
chip('filters', 'pictureless').click();
assert.equal(visibleCards().length, 1);
assert.equal($('count').textContent, '1 of 3');
const defaultImage = visibleCards()[0].querySelector('.avatar img');
assert.equal(defaultImage.getAttribute('src'), 'https://photos.clarinea.fr/BL_1_fr/none.jpg');
assert.equal(defaultImage.parentElement.dataset.imageState, 'pictureless');
defaultImage.dispatchEvent(new w.Event('error'));
assert.equal(defaultImage.getAttribute('src'), '/api/placeholder', 'Official image failure must retain authentic Akinator art');
chip('filters', 'unknown').click();
assert.equal(visibleCards().length, 1);
assert.equal(visibleCards()[0].querySelector('.avatar').dataset.imageState, 'unspecified');
assert.equal(visibleCards()[0].querySelector('.avatar img').getAttribute('src'), '/assets/akinator-placeholder.svg');
chip('filters', 'all').click();
assert.equal(visibleCards().length, 3);
assert.equal(visibleCards()[0], selectedCard, 'Filtering must preserve decoded image and card nodes');
originalAvatar.dispatchEvent(new w.Event('error'));
assert.equal(originalAvatar.parentElement.dataset.imageState, 'custom');
assert.equal(originalAvatar.getAttribute('src'), 'https://photos.clarinea.fr/BL_15_en/600/partenaire/original.jpg');
const retry = originalAvatar.parentElement.querySelector('.avatar-retry');
assert.equal(retry.hidden, false);
retry.click();
assert.equal(originalAvatar.hidden, false);
assert.equal(retry.hidden, true);
assert.equal(sheetOpen(), false, 'Retrying an image must not open details');
console.log('Filter counts, preserved cards, image fallbacks and retry passed.');

// Settings, language submenu, focus containment and explicit closing.
click('#settings-button');
assert.equal($('sheet-title').textContent, 'Settings');
row('Language').click();
for (const [code, name] of Object.entries({cn: 'Chinese', il: 'Hebrew', jp: 'Japanese', kr: 'Korean'})) {
  assert.equal(option(code).querySelector('.picker-name').textContent, name);
  assert.equal(option(code).querySelector('.picker-caption').textContent, code.toUpperCase());
}
assert.equal(document.querySelectorAll('.picker-option').length, 18);
assert.ok([...document.querySelectorAll('.picker-name')].every(node => node.textContent.length > 2));
click('.sheet-scrim');
assert.equal(sheetOpen(), true, 'A tap outside must not dismiss the sheet');
option('en').focus();
option('en').dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
assert.equal(document.activeElement.id, 'sheet-back', 'Tab must stay within the sheet');
const body = $('sheet-content');
body.scrollTop = 125;
const french = option('fr');
french.click();
assert.equal(option('fr'), french, 'Selection keeps the submenu nodes');
assert.equal(body.scrollTop, 125, 'Selection preserves the submenu scroll position');
assert.equal($('sheet-title').textContent, 'Language');
assert.equal(french.getAttribute('aria-selected'), 'true');
assert.equal(document.querySelectorAll('.picker-option[aria-selected=true]').length, 1);
click('#sheet-back');
assert.match(row('Language').textContent, /French/);
assert.equal($('language-code').textContent, 'FR');
row('Language').click(); option('jp').click(); click('#sheet-back');
assert.match(row('Language').textContent, /Japanese/);
row('Language').click(); option('en').click(); click('#sheet-back');
assert.equal($('results').children.length, 0, 'Changing language clears the previous results');
console.log('Settings submenu, 18 language labels, focus trap and explicit close passed.');

// Appearance: Light, Dark and System, with live system tracking.
const segment = value => document.querySelector(`.segmented [data-value="${value}"]`);
segment('dark').click();
assert.equal(document.documentElement.dataset.theme, 'dark');
assert.equal(JSON.parse(w.localStorage.getItem('lookup.preferences')).theme, 'dark');
assert.equal(document.querySelector('meta[name="theme-color"]').getAttribute('content'), '#151512');
setMedia('(prefers-color-scheme: dark)', false);
assert.equal(document.documentElement.dataset.theme, 'dark', 'An explicit choice ignores the system');
segment('system').click();
assert.equal(document.documentElement.dataset.theme, 'light');
setMedia('(prefers-color-scheme: dark)', true);
assert.equal(document.documentElement.dataset.theme, 'dark', 'System mode tracks the device live');
setMedia('(prefers-color-scheme: dark)', false);
assert.equal(document.documentElement.dataset.theme, 'light');
segment('light').click();
assert.equal(document.documentElement.dataset.themePreference, 'light');
console.log('Light, Dark and System appearance with live tracking passed.');

// Haptic feedback toggle.
const haptic = $('haptics-switch');
assert.equal(haptic.disabled, false);
assert.equal(haptic.getAttribute('aria-checked'), 'true');
await tick(50);
haptic.click();
assert.equal(haptic.getAttribute('aria-checked'), 'false');
assert.equal(JSON.parse(w.localStorage.getItem('lookup.preferences')).haptics, false);
const quiet = vibrations.length;
await tick(50);
segment('dark').click();
await tick(50);
segment('light').click();
assert.equal(vibrations.length, quiet, 'Disabled haptics stay silent');
await tick(50);
haptic.click();
assert.equal(haptic.getAttribute('aria-checked'), 'true');
assert.ok(vibrations.length > quiet, 'Enabling haptics confirms with a tick');
click('#sheet-close');
console.log('Haptic feedback toggle, persistence and silence when off passed.');

// Category chips, then the Polly suggestion.
await tick(50);
const beforeChip = vibrations.length;
chip('categories', 'en1').click();
assert.equal(chip('categories', 'en1').getAttribute('aria-checked'), 'true');
assert.ok(vibrations.length > beforeChip, 'Selections give a subtle tick');
assert.equal(JSON.parse(w.localStorage.getItem('lookup.preferences')).category, '2');
chip('categories', 'en0').click();
type('Polly');
await waitFor(() => document.querySelector('#suggestions strong')?.textContent === 'Polly (Phoenix Wright Attorney)', 'Polly suggestion');
click('#suggestions button');
await waitFor(() => document.querySelector('.card h3')?.textContent === 'Polly (Phoenix Wright Attorney)', 'Polly result');
assert.equal(calls.at(-1).q, 'Polly (Phoenix Wright Attorney)');

// A late prefix response fills local matches; dismissal stays dismissed.
const releasePrefix = pause('suggest', 'en0', 'Nar');
const releaseFull = pause('suggest', 'en0', 'Nara');
type('Nar'); await waitFor(() => calls.some(call => call.q === 'Nar'), 'prefix request');
type('Nara'); releasePrefix();
await waitFor(() => document.querySelector('#suggestions strong')?.textContent === 'Nara', 'local match from late prefix');
await waitFor(() => calls.some(call => call.q === 'Nara'), 'final query request');
click('#dismiss'); releaseFull();
await tick(40);
assert.equal($('suggestion-panel').hidden, true, 'Late suggestions must not reopen a dismissed dropdown');

// Search never waits for autocomplete, and repeats come from the tab cache.
const releaseTyping = pause('suggest', 'en0', 'Speed');
type('Speed'); await waitFor(() => calls.some(call => call.q === 'Speed' && call.url.endsWith('suggest')), 'pending typing request');
click('#search');
await waitFor(() => document.querySelector('.card h3')?.textContent === 'Speed', 'search bypasses pending autocomplete');
const searchCount = calls.filter(call => call.url.endsWith('search')).length;
click('#search');
await waitFor(() => document.querySelector('.card h3')?.textContent === 'Speed', 'cached repeat search');
assert.equal(calls.filter(call => call.url.endsWith('search')).length, searchCount);
releaseTyping();
console.log('Moin and Polly selections, late prefixes, dismissal, independent search and instant repeat cache passed.');

// All categories arrive incrementally without recreating earlier cards.
chip('categories', 'all').click();
const releaseCategories = ['en1', 'en2', 'en3'].map(instance => pause('search', instance, 'chair'));
type('chair'); click('#search');
await waitFor(() => visibleCards().length === 3, 'first incremental category');
assert.equal($('progress').hidden, false, 'Per-category progress is shown');
assert.equal($('progress').querySelectorAll('[data-status="pending"]').length, 3);
const incrementalCard = visibleCards()[0];
releaseCategories.forEach(release => release());
await waitFor(() => visibleCards().length === 12, 'all-category results');
assert.equal(visibleCards()[0], incrementalCard, 'Later category results must not recreate earlier cards');
assert.equal(new Set(calls.filter(call => call.url.endsWith('search') && call.q === 'chair').map(call => call.instance)).size, 4);
await waitFor(() => $('progress').hidden, 'progress settles');
assert.ok(incrementalCard.querySelector('[data-kind="category"]'), 'Cards name their category when several are searched');

// One failing category is retried alone; the rest stay.
rejectInstance = 'en2';
type('table'); click('#search');
await waitFor(() => !$('banner').hidden, 'partial failure banner');
assert.match($('banner').textContent, /Couldn’t search Movies and TV\./);
assert.match($('banner').textContent, /Akinator rejected the request/);
assert.equal(visibleCards().length, 9);
rejectInstance = '';
const retryButton = [...$('banner').querySelectorAll('button')].find(button => button.textContent === 'Retry');
retryButton.click();
await waitFor(() => visibleCards().length === 12 && $('banner').hidden, 'retried category');
assert.equal(calls.filter(call => call.url.endsWith('search') && call.q === 'table' && call.instance === 'en2').length, 2);
console.log('All categories, incremental cards, progress and single-category retry passed.');

// A request error is recoverable and never strands the controls.
chip('categories', 'en0').click();
rejectNext = true; type('retry');
$('searchform').dispatchEvent(new w.Event('submit', {cancelable: true, bubbles: true}));
await waitFor(() => !$('banner').hidden, 'request failure');
$('searchform').dispatchEvent(new w.Event('submit', {cancelable: true, bubbles: true}));
await waitFor(() => document.querySelector('.card h3')?.textContent === 'retry', 'retry after failure');
click('#settings-button');
const reconnect = [...document.querySelectorAll('#sheet-content button')].find(node => node.textContent === 'Reconnect');
reconnect.click();
await waitFor(() => $('app').dataset.connection === 'ready' && reconnect.textContent === 'Reconnect', 'reconnect');
assert.equal(sheetOpen(), true, 'Reconnect must not dismiss the settings sheet');

// A deliberate downward drag on the sheet dismisses it.
const grabber = document.querySelector('.sheet-grabber');
pointer(grabber, 'pointerdown', {clientX: 180, clientY: 300});
pointer(grabber, 'pointermove', {clientX: 181, clientY: 330});
pointer(grabber, 'pointermove', {clientX: 182, clientY: 560});
pointer(grabber, 'pointerup', {clientX: 182, clientY: 560});
assert.equal(sheetOpen(), false, 'Swipe down closes the sheet');
// A tap right after reopening must land, not be swallowed by the finished drag.
click('#settings-button'); row('Language').click();
assert.equal($('sheet-title').textContent, 'Language', 'A tap after a drag dismissal must land');
click('#sheet-close');
console.log('Error recovery, reconnect and swipe to dismiss passed.');

// Wide layouts keep details beside the results and move an open sheet there.
visibleCards()[1].querySelector('.card-open').click();
assert.equal($('sheet-title').textContent, 'Pictureless match');
setMedia('(min-width: 720px)', true);
setMedia('(min-width: 1180px)', true);
assert.equal(sheetOpen(), false, 'The inspector takes over from the details sheet');
assert.equal($('inspector').querySelector('.details-name').textContent, 'Pictureless match');
assert.equal(visibleCards()[1].classList.contains('is-selected'), true);
visibleCards()[2].querySelector('.card-open').click();
assert.equal(sheetOpen(), false);
assert.equal($('inspector').querySelector('.details-name').textContent, 'Unspecified match');
setMedia('(min-width: 1180px)', false);
setMedia('(min-width: 720px)', false);
assert.equal($('inspector').children.length, 0);
console.log('Wide inspector, selection highlight and layout handover passed.');

// Keyboard shortcut and literal rendering of untrusted text.
$('query').blur();
document.body.dispatchEvent(new w.KeyboardEvent('keydown', {key: '/', bubbles: true, cancelable: true}));
assert.equal(document.activeElement, $('query'), 'Slash focuses search');
type('<img src=x onerror=alert(1)>'); click('#search');
await waitFor(() => document.querySelector('.card h3')?.textContent === '<img src=x onerror=alert(1)>', 'literal untrusted text');
assert.equal(document.querySelectorAll('.card-body img,.card-body script').length, 0);
click('#clear');
assert.equal($('query').value, '');
assert.equal($('results').querySelectorAll('.card').length, 0);

// A single category's popular entries make the idle screen browsable.
popularEnabled = true;
click('#settings-button'); row('Language').click(); option('de').click(); click('#sheet-close');
const popularSection = () => document.querySelector('.popular');
const popularCards = () => [...popularSection().querySelectorAll('.card')];
await waitFor(() => popularSection() && !popularSection().hidden, 'popular browse');
assert.equal(popularCards().length, 3);
assert.equal(popularSection().querySelector('.results-title').textContent, 'Popular in Characters');
assert.equal(popularSection().querySelector('.count').textContent, '3 entries');
assert.equal(popularCards()[0].querySelector('[data-kind="rank"]').textContent, '#10');
assert.equal(popularCards()[1].querySelector('.avatar').dataset.imageState, 'pictureless');
assert.equal($('empty').children.length, 0, 'The idle prompt gives way to popular entries');
const firstPopular = popularCards()[0];
firstPopular.querySelector('.card-open').click();
assert.equal($('sheet-title').textContent, 'Popular 1');
const facts = Object.fromEntries([...document.querySelectorAll('.facts > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
assert.equal(facts['Popularity rank'], '#10');
assert.equal(facts['Times played'], '999');
assert.equal($('sheet-footer').querySelector('.position').textContent, '1 of 3', 'Details step through the popular list');
$('sheet-footer').querySelector('[aria-label="Next match"]').click();
assert.equal($('sheet-title').textContent, 'Popular 2');
click('#sheet-close');
type('Speed'); click('#search');
await waitFor(() => document.querySelector('#results .card h3')?.textContent === 'Speed', 'search replaces popular');
assert.equal(popularSection().hidden, true, 'Search results replace the popular list');
assert.equal(document.querySelector('#results [data-kind="rank"]'), null, 'Search entries carry no popularity rank');
click('#clear');
assert.equal(popularSection().hidden, false, 'Clearing the search brings popular entries back');
assert.equal(popularCards()[0], firstPopular, 'Popular cards are kept, so images stay decoded');
chip('categories', 'all').click();
assert.equal(popularSection().hidden, true, 'All categories shows the search prompt instead');
assert.equal($('empty').querySelector('.empty-title').textContent, 'Find an entry');
chip('categories', 'de0').click();
assert.equal(popularSection().hidden, false);
console.log('Popular browse: per-category list, rank badges, details facts and navigation, search handover and category scope passed.');
await tick(0);
const detached = [...observedNodes()].filter(node => !node.isConnected);
assert.equal(detached.length, 0, 'Detached cards and pickers must leave the resize observer: ' + detached.map(node => node.className).join(', '));
assert.equal(failures.length, 0, failures.join('\n'));
console.log('Real page modules passed: connection, fetch receiver, suggestions, Moin and Polly searches, pickers, all categories, details, images, themes, haptics, gestures, retry and reconnect.');
dom.window.close();
