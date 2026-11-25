import {LookupClient, splitSuggestion} from '../lookup-ui.mjs';
import {batch, signal} from './reactive.mjs';
import {categoryName, matchesFilter, sortInstances} from './catalog.mjs';

const emptyResults = () => ({status: 'idle', query: '', entries: [], responses: [], scopes: [], failures: []});
const inLanguage = (instances, language) => sortInstances(instances.filter(instance => instance.language === language));
const pick = (instances, language, category) => inLanguage(instances, language)
  .filter(instance => category === 'all' || instance.key === category);
const visible = (entries, filter) => entries.filter(entry => matchesFilter(entry, filter));
const closedSuggestions = () => ({open: false, rows: [], pending: false, unavailable: false, active: -1, multi: false});

// Lookup state and actions. The request choreography is unchanged from the
// original lookup: tokens drop stale work, each category keeps independent
// sessions, autocomplete waits 40 ms, and local suggestions fill the gap.
export class LookupStore {
  constructor({prefs, client = new LookupClient(), isSheetOpen = () => false}) {
    this.prefs = prefs;
    this.client = client;
    this.isSheetOpen = isSheetOpen;
    this.instances = signal([]);
    this.language = prefs.language;
    this.filter = prefs.filter;
    this.category = signal('');
    this.connection = signal({status: 'idle', error: null});
    this.query = signal('');
    this.results = signal(emptyResults());
    this.suggestions = signal(closedSuggestions());
    this.selected = signal(null);
    this.generation = 0;
    this.suggestionGeneration = 0;
    this.connectionGeneration = 0;
    this.searching = false;
    this.composing = false;
    this.inputFocused = false;
    this.timer = 0;
    this.suggestionContext = undefined;
  }

  // Derived values. Called inside effects, they track what they read.
  connecting() { return this.connection().status === 'connecting'; }
  available() { return inLanguage(this.instances(), this.language()); }
  languages() { return [...new Set(this.instances().map(instance => instance.language))].sort(); }
  selectedInstances() { return pick(this.instances(), this.language(), this.category()); }
  visibleEntries() { return visible(this.results().entries, this.filter()); }
  counts() {
    const entries = this.results().entries;
    return Object.fromEntries(['all', 'pictureless', 'supplied', 'unknown'].map(filter =>
      [filter, entries.filter(entry => matchesFilter(entry, filter)).length]));
  }
  canSearch() {
    const query = this.query().trim();
    return query.length >= 2 && !this.connecting() && this.selectedInstances().length > 0;
  }

  // Untracked equivalents for actions.
  currentInstances() { return pick(this.instances.peek(), this.language.peek(), this.category.peek()); }
  warmSelected() {
    for (const instance of this.currentInstances()) this.client.warm(instance.key, instance.autocomplete);
  }

  setLanguage(code) {
    if (code === this.language.peek()) return;
    const subject = this.currentInstances()[0]?.subject_id || '1';
    batch(() => {
      this.language.set(code);
      this.ensureCategory(subject);
      this.invalidate({clearResults: true});
    });
    this.warmSelected();
  }
  setCategory(key) {
    if (key === this.category.peek()) return;
    batch(() => {
      this.category.set(key);
      this.rememberCategory();
      this.invalidate({clearResults: true});
    });
    this.warmSelected();
  }
  setFilter(value) { this.filter.set(value); }
  rememberCategory() {
    const key = this.category.peek();
    if (key === 'all') { this.prefs.category.set('all'); return; }
    const instance = this.instances.peek().find(item => item.key === key);
    if (instance) this.prefs.category.set(String(instance.subject_id));
  }
  ensureCategory(previousSubject = '1') {
    const available = inLanguage(this.instances.peek(), this.language.peek());
    const category = this.category.peek();
    if (category === 'all' || available.some(instance => instance.key === category)) return;
    this.category.set(available.find(instance => String(instance.subject_id) === String(previousSubject))?.key || available[0]?.key || '');
  }

  invalidate({clearResults = false} = {}) {
    this.generation++;
    this.suggestionGeneration++;
    clearTimeout(this.timer);
    this.searching = false;
    batch(() => {
      this.hideSuggestions();
      if (clearResults) { this.results.set(emptyResults()); this.selected.set(null); }
      else this.settleResults();
    });
  }
  // Stop showing a search as running once its token is no longer current.
  settleResults() {
    const results = this.results.peek();
    if (results.status === 'searching') this.results.set({...results, status: 'done', failures: []});
  }

  async connect() {
    const generation = ++this.connectionGeneration;
    this.invalidate();
    this.connection.set({status: 'connecting', error: null});
    this.client.reset();
    try {
      const data = await this.client.directory();
      if (!Array.isArray(data.instances)) throw Error('Directory unavailable');
      if (generation !== this.connectionGeneration) return;
      batch(() => {
        this.instances.set(data.instances);
        const languages = new Set(data.instances.map(instance => instance.language));
        if (!languages.has(this.language.peek())) this.language.set(languages.has('en') ? 'en' : [...languages][0]);
        if (this.prefs.category.peek() === 'all' && !this.category.peek()) this.category.set('all');
        this.ensureCategory(this.prefs.category.peek() === 'all' ? '1' : this.prefs.category.peek());
        this.connection.set({status: 'ready', error: null});
      });
      this.warmSelected();
    } catch (error) {
      if (generation !== this.connectionGeneration) return;
      batch(() => {
        this.instances.set([]);
        this.connection.set({status: 'failed', error});
      });
    } finally {
      if (generation === this.connectionGeneration && this.inputFocused) this.scheduleSuggestions();
    }
  }

  // Typing abandons the running search and, as before, clears its error.
  input(value) {
    this.query.set(value);
    this.generation++;
    this.searching = false;
    const results = this.results.peek();
    if (results.status === 'searching' || results.failures.length) this.results.set({...results, status: results.status === 'idle' ? 'idle' : 'done', failures: []});
    this.scheduleSuggestions();
  }
  focus() {
    this.inputFocused = true;
    this.warmSelected();
    if (this.query.peek().trim().length >= 2) this.scheduleSuggestions();
  }
  blur() { this.inputFocused = false; }
  compositionStart() { this.composing = true; this.dismissSuggestions(); }
  compositionEnd() { this.composing = false; this.scheduleSuggestions(); }
  clear() {
    batch(() => {
      this.query.set('');
      this.invalidate({clearResults: true});
    });
  }

  hideSuggestions() {
    this.suggestionContext = undefined;
    this.suggestions.set(closedSuggestions());
  }
  dismissSuggestions() {
    this.suggestionGeneration++;
    clearTimeout(this.timer);
    this.hideSuggestions();
  }
  showSuggestions(rows, pending, instances) {
    const choices = rows.slice(0, 20);
    this.suggestions.set({open: Boolean(choices.length || pending), rows: choices, pending, unavailable: false, active: -1, multi: instances.length > 1});
  }
  scheduleSuggestions() {
    clearTimeout(this.timer);
    const token = ++this.suggestionGeneration, query = this.query.peek().trim();
    if (query.length < 2 || this.composing || this.isSheetOpen()) { this.hideSuggestions(); return; }
    const instances = this.currentInstances(), byCategory = new Map();
    let needsRequest = false;
    for (const instance of instances) {
      const cached = this.client.cached(instance.key, query);
      if (cached === undefined) needsRequest = true;
      byCategory.set(instance.key, (cached || this.client.local(instance.key, query)).map(text => ({...splitSuggestion(text), instance})));
    }
    const rows = () => instances.flatMap(instance => byCategory.get(instance.key) || []);
    this.suggestionContext = {query, token, instances, byCategory, rows};
    this.showSuggestions(rows(), needsRequest, instances);
    if (needsRequest) this.timer = setTimeout(() => this.loadSuggestions(query, token, instances, byCategory, rows), 40);
  }
  loadSuggestions(query, token, instances, byCategory, rows) {
    let pending = instances.length, failures = 0;
    const current = () => token === this.suggestionGeneration && !this.searching && !this.isSheetOpen();
    for (const instance of instances) {
      if (this.client.cached(instance.key, query)) { pending--; continue; }
      this.client.request('suggest', instance.key, query, current).then(data => {
        if (data && current()) byCategory.set(instance.key, (data.suggestions || []).map(text => ({...splitSuggestion(text), instance})));
        else if (data) this.refreshLocalSuggestions();
      }).catch(() => { failures++; }).finally(() => {
        pending--;
        if (!current()) return;
        this.showSuggestions(rows(), pending > 0, instances);
        if (!pending && failures && !rows().length) {
          this.suggestions.set({...this.suggestions.peek(), open: true, unavailable: true});
        }
      });
    }
    if (current()) this.showSuggestions(rows(), pending > 0, instances);
  }
  refreshLocalSuggestions() {
    const context = this.suggestionContext;
    if (!context || context.token !== this.suggestionGeneration || this.searching || this.isSheetOpen()) return;
    let pending = false;
    for (const instance of context.instances) {
      const exact = this.client.cached(instance.key, context.query);
      if (exact === undefined) pending = true;
      context.byCategory.set(instance.key, (exact || this.client.local(instance.key, context.query))
        .map(label => ({...splitSuggestion(label), instance})));
    }
    this.showSuggestions(context.rows(), pending, context.instances);
  }
  moveActive(delta) {
    const state = this.suggestions.peek();
    if (!state.rows.length) return;
    this.suggestions.set({...state, active: (state.active + delta + state.rows.length) % state.rows.length});
  }
  choose(item) {
    batch(() => {
      this.query.set(item.name);
      this.category.set(item.instance.key);
      this.rememberCategory();
    });
    return this.search();
  }

  async search() {
    const query = this.query.peek().trim();
    const targets = this.currentInstances();
    if (query.length < 2 || this.composing || this.connection.peek().status === 'connecting' || !targets.length) return false;
    this.dismissSuggestions();
    const token = ++this.generation;
    this.searching = true;
    batch(() => {
      this.selected.set(null);
      this.results.set({status: 'searching', query, entries: [], responses: [], failures: [],
        scopes: targets.map(instance => ({key: instance.key, name: categoryName(instance), status: 'pending', count: 0}))});
    });
    await Promise.all(targets.map(instance => this.searchInstance(instance, query, token)));
    if (token !== this.generation) return true;
    this.searching = false;
    this.results.set({...this.results.peek(), status: 'done'});
    return true;
  }
  async searchInstance(instance, query, token) {
    try {
      const data = await this.client.request('search', instance.key, query, () => token === this.generation);
      if (!data || token !== this.generation) return;
      const results = this.results.peek();
      this.results.set({...results,
        entries: [...results.entries, ...data.entries],
        responses: [...results.responses, {category: categoryName(instance), language: instance.language, response: data.response}],
        scopes: results.scopes.map(scope => scope.key === instance.key ? {...scope, status: 'done', count: data.entries.length} : scope)});
    } catch (error) {
      if (token !== this.generation) return;
      const results = this.results.peek();
      this.results.set({...results,
        failures: [...results.failures, {key: instance.key, category: categoryName(instance), message: error.message, error}],
        scopes: results.scopes.map(scope => scope.key === instance.key ? {...scope, status: 'failed'} : scope)});
    }
  }
  // Retry only the categories that failed, keeping results that arrived.
  async retryFailed() {
    const results = this.results.peek();
    if (!results.failures.length || this.searching) return false;
    const targets = results.failures.map(failure => this.instances.peek().find(instance => instance.key === failure.key)).filter(Boolean);
    const token = ++this.generation;
    this.searching = true;
    this.results.set({...results, status: 'searching', failures: [],
      scopes: results.scopes.map(scope => scope.status === 'failed' ? {...scope, status: 'pending'} : scope)});
    await Promise.all(targets.map(instance => this.searchInstance(instance, results.query, token)));
    if (token !== this.generation) return true;
    this.searching = false;
    this.results.set({...this.results.peek(), status: 'done'});
    return true;
  }

  select(entry) { this.selected.set(entry); }
  step(delta) {
    const list = visible(this.results.peek().entries, this.filter.peek());
    if (!list.length) return null;
    const index = list.indexOf(this.selected.peek());
    const next = list[index < 0 ? 0 : Math.max(0, Math.min(list.length - 1, index + delta))];
    this.selected.set(next);
    return next;
  }
}
