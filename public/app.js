import {LookupClient, splitSuggestion, languageName} from '/lookup-ui.mjs?v=15';
import {element, icon, createAvatar, MobileSheet, pickerList, disclosure, installMobileLayout} from '/mobile-components.mjs?v=15';

const $ = id => document.getElementById(id);
const client = new LookupClient();
const entryCards = new WeakMap();
const sheet = new MobileSheet($('sheet-layer'), $('app'));
const state = {
  instances: [], language: 'en', category: '', filter: 'all',
  entries: [], responses: [], choices: [], active: -1,
  generation: 0, suggestionGeneration: 0, connectionGeneration: 0,
  searching: false, connecting: false, composing: false,
};
let timer, suggestionContext;
const categories = {'1': 'Characters', '2': 'Objects', '13': 'Movies and TV', '14': 'Animals'};
const filters = [
  {value: 'all', label: 'All entries'},
  {value: 'pictureless', label: 'Pictureless entries'},
  {value: 'supplied', label: 'Custom images'},
  {value: 'unknown', label: 'Unspecified'},
];
const categoryName = instance => categories[instance.subject_id] || instance.label;
const selected = () => state.instances.filter(instance => instance.language === state.language &&
  (state.category === 'all' || instance.key === state.category));
function warmSelected() {
  for (const instance of selected()) client.warm(instance.key, instance.autocomplete);
}

function showError(message) {
  $('error').textContent = message || '';
  $('error').hidden = !message;
}
function hideSuggestions() {
  suggestionContext = undefined;
  state.choices = [];
  state.active = -1;
  $('suggestion-panel').hidden = true;
  $('suggestions').replaceChildren();
  $('query').setAttribute('aria-expanded', 'false');
  $('query').removeAttribute('aria-activedescendant');
}
function currentCategoryName() {
  const choices = selected();
  return state.category === 'all' ? 'All categories' : choices.length ? categoryName(choices[0]) : 'Category';
}
function syncControls() {
  $('search').disabled = !selected().length || state.connecting;
  $('clear').hidden = !$('query').value;
}
function invalidate({clearResults = false} = {}) {
  state.generation++;
  state.suggestionGeneration++;
  clearTimeout(timer);
  state.searching = false;
  $('results').setAttribute('aria-busy', 'false');
  hideSuggestions();
  showError('');
  if (clearResults) {
    state.entries = [];
    state.responses = [];
    $('responses').hidden = true;
    $('resulttitle').textContent = 'Find an entry';
    $('notice').textContent = 'Choose a category and start typing.';
    renderEntries();
  }
  syncControls();
}
function ensureCategory(previousSubject = '1') {
  const available = state.instances.filter(instance => instance.language === state.language);
  if (state.category === 'all' || available.some(instance => instance.key === state.category)) return;
  state.category = available.find(instance => instance.subject_id === previousSubject)?.key || available[0]?.key || '';
}
async function connect() {
  const generation = ++state.connectionGeneration;
  invalidate();
  state.connecting = true;
  client.reset();
  syncControls();
  $('connection').textContent = 'Connecting…';
  try {
    const data = await client.directory();
    if (!Array.isArray(data.instances)) throw Error('Directory unavailable');
    if (generation !== state.connectionGeneration) return;
    state.instances = data.instances;
    const languages = new Set(state.instances.map(instance => instance.language));
    if (!languages.has(state.language)) state.language = languages.has('en') ? 'en' : [...languages][0];
    ensureCategory();
    $('connection').textContent = 'Ready';
    warmSelected();
  } catch {
    if (generation !== state.connectionGeneration) return;
    state.instances = [];
    showError('Could not connect. Open search options to reconnect.');
    $('connection').textContent = 'Connection unavailable';
  } finally {
    if (generation === state.connectionGeneration) {
      state.connecting = false; syncControls();
      if (document.activeElement === $('query')) scheduleSuggestions();
    }
  }
}

function settingRow(name, value, callback) {
  const button = element('button', undefined, 'setting-row');
  button.type = 'button';
  const text = element('span', undefined, 'setting-text');
  text.append(element('span', name, 'setting-label'), element('span', value, 'setting-value'));
  button.append(text, icon('next'));
  button.onclick = callback;
  return button;
}
function openPicker(kind, back) {
  let title, options, value;
  if (kind === 'category') {
    title = 'Category'; value = state.category;
    options = state.instances.filter(instance => instance.language === state.language)
      .map(instance => ({value: instance.key, label: categoryName(instance)}));
    options.push({value: 'all', label: 'All categories'});
  } else if (kind === 'language') {
    title = 'Language'; value = state.language;
    options = [...new Set(state.instances.map(instance => instance.language))].sort()
      .map(code => ({value: code, label: languageName(code), caption: code.toUpperCase()}));
  } else { title = 'Images'; value = state.filter; options = filters; }
  const list = pickerList(title, options, value, next => {
    if (kind === 'language') {
      const subject = selected()[0]?.subject_id || '1';
      state.language = next;
      ensureCategory(subject);
      invalidate({clearResults: true});
      warmSelected();
    } else if (kind === 'category') {
      state.category = next;
      invalidate({clearResults: true});
      warmSelected();
    } else { state.filter = next; syncControls(); renderEntries(); }
  });
  sheet.open(title, [list], back);
}
function openSettings() {
  dismissSuggestions();
  const content = [
    settingRow('Category', currentCategoryName(), () => openPicker('category', openSettings)),
    settingRow('Language', languageName(state.language), () => openPicker('language', openSettings)),
    settingRow('Images', filters.find(filter => filter.value === state.filter).label, () => openPicker('filter', openSettings)),
  ];
  const reconnect = element('button', state.connecting ? 'Connecting…' : 'Reconnect', 'wide-button');
  reconnect.type = 'button'; reconnect.disabled = state.connecting;
  reconnect.prepend(icon('retry'));
  reconnect.onclick = async () => {
    reconnect.disabled = true;
    reconnect.textContent = 'Connecting…';
    await connect();
    if (!sheet.layer.hidden && sheet.title.textContent === 'Search options') openSettings();
  };
  content.push(reconnect);
  sheet.open('Search options', content);
}

function renderEntries() {
  const visible = state.entries.filter(entry => state.filter === 'all' ||
    state.filter === 'pictureless' && ['missing', 'placeholder'].includes(entry.avatar_status) || entry.avatar_status === state.filter);
  $('count').textContent = state.entries.length ? String(visible.length) : '';
  const nodes = [];
  if (!visible.length && state.entries.length) {
    const empty = element('div', undefined, 'empty');
    empty.append(element('h3', 'No entries match this filter.'), element('p', 'Change the image filter in search options.'));
    nodes.push(empty);
  }
  for (const [index, entry] of visible.entries()) {
    const existing = entryCards.get(entry);
    if (existing) { nodes.push(existing); continue; }
    const card = element('article', undefined, 'card');
    const avatar = createAvatar(entry, index, () => more.click());
    const text = element('div', undefined, 'entrytext');
    text.append(element('h3', entry.name || 'Unnamed entry'), element('p', entry.description || 'No description returned.', 'desc'));
    const instance = state.instances.find(instance => instance.key === entry.instance_key);
    const category = instance ? categoryName(instance) : entry.category;
    const footer = element('div', undefined, 'entry-footer');
    const more = element('button', 'Details');
    more.type = 'button'; more.append(icon('next'));
    more.onclick = () => sheet.open(entry.name, [
      element('p', entry.description || 'No description returned.'),
      element('p', category + ' · ' + entry.language.toUpperCase() + ' · ID ' + (entry.id || 'not returned'), 'meta'),
      disclosure('All returned fields', entry.raw),
    ]);
    footer.append(element('span', category, 'meta'), more);
    card.append(avatar, text, footer);
    entryCards.set(entry, card);
    nodes.push(card);
  }
  // Keep decoded images, focus, and card layout intact as categories finish.
  const root = $('results'), wanted = new Set(nodes);
  for (const node of [...root.children]) if (!wanted.has(node)) node.remove();
  nodes.forEach((node, index) => { if (root.children[index] !== node) root.insertBefore(node, root.children[index] || null); });
}

function showSuggestions(rows, pending) {
  state.choices = rows.slice(0, 20);
  state.active = -1;
  const root = $('suggestions');
  const existing = new Map([...root.children].map(node => [node.dataset.key, node]));
  const keys = new Set();
  for (const [index, item] of state.choices.entries()) {
    const key = item.instance.key + '\n' + item.label;
    keys.add(key);
    let row = existing.get(key);
    if (!row) {
      row = element('li'); row.dataset.key = key; row.role = 'option';
      const button = element('button'); button.type = 'button'; button.tabIndex = -1;
      button.append(element('strong', item.name));
      if (item.description) button.append(element('span', item.description));
      if (selected().length > 1) button.append(element('span', categoryName(item.instance)));
      button.onmousedown = event => event.preventDefault();
      button.onclick = () => choose(item);
      row.append(button);
    }
    row.id = 'suggestion-' + index;
    row.setAttribute('aria-selected', 'false');
    row.firstChild.classList.remove('active');
    if (root.children[index] !== row) root.insertBefore(row, root.children[index] || null);
  }
  for (const row of [...root.children]) if (!keys.has(row.dataset.key)) row.remove();
  $('suggestion-panel').hidden = !state.choices.length && !pending;
  $('query').setAttribute('aria-expanded', String(!$('suggestion-panel').hidden));
  $('query').removeAttribute('aria-activedescendant');
  $('suggestion-status').textContent = pending ? state.choices.length ? 'Updating suggestions…' : 'Finding suggestions…' : 'Suggestions';
}
function scheduleSuggestions() {
  clearTimeout(timer);
  const token = ++state.suggestionGeneration, query = $('query').value.trim();
  $('clear').hidden = !query;
  if (query.length < 2 || state.composing || !sheet.layer.hidden) { hideSuggestions(); return; }
  const instances = selected(), byCategory = new Map();
  let needsRequest = false;
  for (const instance of instances) {
    const cached = client.cached(instance.key, query);
    if (cached === undefined) needsRequest = true;
    byCategory.set(instance.key, (cached || client.local(instance.key, query))
      .map(text => ({...splitSuggestion(text), instance})));
  }
  const rows = () => instances.flatMap(instance => byCategory.get(instance.key) || []);
  suggestionContext = {query, token, instances, byCategory, rows};
  showSuggestions(rows(), needsRequest);
  if (needsRequest) timer = setTimeout(() => loadSuggestions(query, token, instances, byCategory, rows), 40);
}
function loadSuggestions(query, token, instances, byCategory, rows) {
  let pending = instances.length, failures = 0;
  const current = () => token === state.suggestionGeneration && !state.searching && sheet.layer.hidden;
  for (const instance of instances) {
    if (client.cached(instance.key, query)) { pending--; continue; }
    client.request('suggest', instance.key, query, current).then(data => {
      if (data && current()) byCategory.set(instance.key, data.suggestions.map(text => ({...splitSuggestion(text), instance})));
      else if (data) refreshLocalSuggestions();
    }).catch(() => { failures++; }).finally(() => {
      pending--;
      if (!current()) return;
      showSuggestions(rows(), pending > 0);
      if (!pending && failures && !rows().length) {
        $('suggestion-panel').hidden = false;
        $('query').setAttribute('aria-expanded', 'true');
        $('suggestion-status').textContent = 'Suggestions unavailable. You can still search.';
      }
    });
  }
  if (current()) showSuggestions(rows(), pending > 0);
}
function refreshLocalSuggestions() {
  const context = suggestionContext;
  if (!context || context.token !== state.suggestionGeneration || state.searching || !sheet.layer.hidden) return;
  let pending = false;
  for (const instance of context.instances) {
    const exact = client.cached(instance.key, context.query);
    if (exact === undefined) pending = true;
    context.byCategory.set(instance.key, (exact || client.local(instance.key, context.query))
      .map(label => ({...splitSuggestion(label), instance})));
  }
  showSuggestions(context.rows(), pending);
}
function dismissSuggestions() {
  state.suggestionGeneration++;
  clearTimeout(timer);
  hideSuggestions();
}
function choose(item) {
  $('query').value = item.name;
  state.category = item.instance.key;
  syncControls();
  search();
}
async function search() {
  const query = $('query').value.trim();
  if (query.length < 2 || state.composing || state.connecting || !selected().length) return;
  dismissSuggestions();
  const token = ++state.generation;
  state.searching = true;
  state.entries = []; state.responses = [];
  $('main').scrollTop = 0;
  renderEntries(); showError(''); syncControls();
  $('query').blur();
  $('resulttitle').textContent = query;
  $('notice').textContent = 'Searching…';
  $('results').setAttribute('aria-busy', 'true');
  $('responses').hidden = true;
  const failures = [];
  let completed = 0;
  await Promise.all(selected().map(async instance => {
    try {
      const data = await client.request('search', instance.key, query, () => token === state.generation);
      if (!data || token !== state.generation) return;
      state.entries.push(...data.entries);
      state.responses.push({category: categoryName(instance), language: instance.language, response: data.response});
      completed++; renderEntries();
      $('notice').textContent = state.entries.length + ' matches';
    } catch (error) {
      if (token === state.generation) failures.push({category: categoryName(instance), message: error.message});
    }
  }));
  if (token !== state.generation) return;
  state.searching = false;
  $('results').setAttribute('aria-busy', 'false');
  $('responses').hidden = !state.responses.length;
  $('notice').textContent = completed ? state.entries.length ? state.entries.length + ' matches. Akinator limits the results returned.' : 'No matches returned. Try a shorter name or another spelling.' : 'Search could not finish.';
  if (failures.length) {
    showError('Could not search ' + failures.map(failure => failure.category).join(', ') + '. Try again or reconnect in search options.');
    const details = element('button', 'View error details', 'text-button'); details.type = 'button';
    details.onclick = () => sheet.open('Request details', [element('pre', JSON.stringify(failures, null, 2))]);
    $('error').append(details);
  }
  syncControls();
}

$('searchform').onsubmit = event => { event.preventDefault(); search(); };
$('query').oninput = () => { state.generation++; state.searching = false; $('results').setAttribute('aria-busy', 'false'); showError(''); scheduleSuggestions(); };
$('query').oncompositionstart = () => { state.composing = true; dismissSuggestions(); };
$('query').oncompositionend = () => { state.composing = false; scheduleSuggestions(); };
$('query').onfocus = () => { warmSelected(); if ($('query').value.trim().length >= 2) scheduleSuggestions(); };
$('query').onkeydown = event => {
  if (event.key === 'Escape') dismissSuggestions();
  if (!state.choices.length) return;
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    state.active = (state.active + (event.key === 'ArrowDown' ? 1 : -1) + state.choices.length) % state.choices.length;
    [...$('suggestions').children].forEach((row, index) => {
      row.firstChild.classList.toggle('active', index === state.active);
      row.setAttribute('aria-selected', String(index === state.active));
    });
    $('query').setAttribute('aria-activedescendant', 'suggestion-' + state.active);
    $('suggestions').children[state.active]?.scrollIntoView({block: 'nearest'});
  } else if (event.key === 'Enter' && state.active >= 0 && !state.composing) { event.preventDefault(); choose(state.choices[state.active]); }
};
$('clear').onclick = () => { $('query').value = ''; invalidate({clearResults: true}); $('query').focus(); };
$('dismiss').onclick = dismissSuggestions;
$('options').onclick = openSettings;
$('responses').onclick = () => sheet.open('Returned data', [element('pre', JSON.stringify(state.responses, null, 2))]);
const aboutCopy = [
  'Look up characters, objects, animals, and movies or TV shows in Akinator without playing a guessing round.',
  '**Find a match.** Choose a language and category in **Settings**, or select **All categories** to search every category available in that language. Type at least two characters to see suggestions. Tap a suggestion to look up its name, or tap **Search** to find matches for your own query. Results appear as each category finishes.',
  '**Filter by image.** Open **Images** in Settings to filter the matches already returned. **Pictureless entries** have no custom avatar reported by Akinator and show its official placeholder. **Custom images** show an entry’s uploaded avatar. **Unspecified** means the image information is missing and a generic placeholder is shown. An image that fails to load keeps its original classification.',
  '**Explore the details.** Each match shows its name, description, and avatar when available. Tap **Details** to inspect all returned fields, or **All returned data** to view the full results together.',
  '**Know the limits.** Akinator limits how many matches it returns. No results does not prove that an entry is absent. Last guessed dates and award eligibility are not available here. A pictureless entry does not guarantee a Platinum or Black award.',
];
$('info').onclick = () => sheet.open('About this lookup', aboutCopy.map(copy => {
  const paragraph = element('p');
  // The static copy uses only Markdown bold. Render it as text and strong
  // elements so the sheet needs neither an HTML sink nor a Markdown dependency.
  for (const part of copy.split(/(\*\*[^*]+\*\*)/g)) {
    paragraph.append(part.startsWith('**') ? element('strong', part.slice(2, -2)) : document.createTextNode(part));
  }
  return paragraph;
}));
installMobileLayout();
connect();
