import {effect, onCleanup} from '../ui/reactive.mjs';
import {byId, h, icon, listen} from '../ui/dom.mjs';
import {chipGroup} from '../ui/controls.mjs';
import {categoryName, FILTER_OPTIONS, matchesFilter} from '../ui/catalog.mjs';
import {describeError} from '../ui/errors.mjs';
import {renderCard, skeletonCard} from './entry.mjs';

const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 'es');

function emptyState(iconName, title, text, actions = []) {
  return [h('div', {class: 'empty-mark sq', 'aria-hidden': 'true'}, icon(iconName)),
    h('h3', {class: 'empty-title', text: title}), text ? h('p', {class: 'empty-text', text}) : null, ...actions];
}

// Results, incremental by category. Cards are created once per search and kept
// while filtering, so decoded images, focus and layout survive.
export function mountResults({store, details, panels, haptics, layout}) {
  const head = byId('results-head'), title = byId('results-title'), count = byId('count');
  const notice = byId('notice'), progress = byId('progress'), banner = byId('banner');
  const filterBar = byId('filter-bar'), list = byId('results'), empty = byId('empty'), foot = byId('results-foot');

  effect(() => {
    const results = store.results(), visible = store.visibleEntries().length, total = results.entries.length;
    head.hidden = results.status === 'idle';
    title.textContent = results.query || 'Find an entry';
    count.textContent = !total ? '' : store.filter() === 'all' ? plural(total, 'match') : visible + ' of ' + total;
  });

  // Announced status. Visible only while the first results are on their way.
  effect(() => {
    const results = store.results(), total = results.entries.length;
    const searching = results.status === 'searching';
    notice.textContent = searching ? total ? plural(total, 'match') + ' so far' : 'Searching…'
      : results.status === 'done' ? total ? plural(total, 'match') + '.' : results.failures.length ? 'Search couldn’t finish.' : 'No matches.' : '';
    notice.classList.toggle('sr-only', !(searching && !total));
  });

  effect(() => {
    const results = store.results();
    const show = results.scopes.length > 1 && (results.status === 'searching' || results.failures.length > 0);
    progress.hidden = !show;
    progress.replaceChildren(...(show ? results.scopes.map(scope => h('span', {class: 'scope-status sq', 'data-status': scope.status},
      scope.status === 'pending' ? h('span', {class: 'pulse', 'aria-hidden': 'true'}, h('i'), h('i'), h('i'))
        : icon(scope.status === 'done' ? 'check' : 'alert'),
      h('span', {text: scope.name}),
      scope.status === 'done' ? h('span', {class: 'scope-status-count', text: String(scope.count)}) : null)) : []));
  });

  // Connection and search failures, with the original diagnostics one tap away.
  let lastFailures = 0;
  effect(() => {
    const connection = store.connection(), results = store.results();
    const nodes = [];
    if (connection.status === 'failed') {
      const {message, detail} = describeError(connection.error);
      nodes.push(icon('alert'), h('p', {class: 'banner-title', text: 'Couldn’t connect.'}), h('p', {class: 'banner-detail', text: message}),
        h('div', {class: 'banner-actions'},
          h('button', {type: 'button', class: 'text-button sq primary', onclick: () => { haptics.play('impact'); store.connect(); }}, icon('retry'), 'Try again'),
          h('button', {type: 'button', class: 'text-button sq', onclick: () => panels.openDiagnostics({stage: 'connect', message: detail})}, 'Details')));
    } else if (results.failures.length && results.status !== 'searching') {
      const names = results.failures.map(failure => failure.category).join(', ');
      nodes.push(icon('alert'), h('p', {class: 'banner-title', text: 'Couldn’t search ' + names + '.'}),
        h('p', {class: 'banner-detail', text: describeError(results.failures[0].error).message}),
        h('div', {class: 'banner-actions'},
          h('button', {type: 'button', class: 'text-button sq primary', onclick: () => { haptics.play('impact'); store.retryFailed(); }}, icon('retry'), 'Retry'),
          h('button', {type: 'button', class: 'text-button sq', onclick: () => panels.openDiagnostics(results.failures.map(({category, message}) => ({category, message})))}, 'Details')));
    }
    banner.replaceChildren(...nodes);
    banner.hidden = !nodes.length;
    const failures = results.failures.length;
    if (failures > lastFailures && results.status !== 'searching') haptics.play('error');
    lastFailures = failures;
  });

  chipGroup(byId('filters'), {
    label: 'Image filter', className: 'chip filter-chip', haptics,
    value: () => store.filter(),
    options: () => {
      const counts = store.counts();
      return FILTER_OPTIONS.map(option => ({...option, count: counts[option.value]}));
    },
    onChange: value => store.setFilter(value),
  });
  // Filters appear once there is something to filter.
  effect(() => { filterBar.hidden = !store.results().entries.length; });
  // A hairline appears under the filter bar once it sticks.
  const sentinel = h('div', {class: 'sticky-sentinel', 'aria-hidden': 'true'});
  filterBar.before(sentinel);
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(([entry]) => filterBar.classList.toggle('is-stuck', !entry.isIntersecting), {root: byId('main')});
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  }

  const cards = new Map();
  const skeletons = [skeletonCard(), skeletonCard(), skeletonCard()];
  const open = entry => details.open(entry);
  effect(() => {
    const results = store.results(), filter = store.filter();
    if (!results.entries.length && cards.size) { for (const card of cards.values()) card.remove(); cards.clear(); }
    let fresh = 0;
    const instances = store.instances.peek();
    for (const entry of results.entries) {
      let card = cards.get(entry);
      if (!card) {
        card = renderCard(entry, cards.size, {showCategory: results.scopes.length > 1, instances, onOpen: open});
        card.classList.add('arrive');
        card.style.setProperty('--i', String(Math.min(fresh++, 8)));
        card.addEventListener('animationend', () => card.classList.remove('arrive'), {once: true});
        cards.set(entry, card);
        list.append(card);
      }
      card.hidden = !matchesFilter(entry, filter);
    }
    const loading = results.status === 'searching' && !results.entries.length;
    for (const skeleton of skeletons) {
      if (loading && !skeleton.isConnected) list.append(skeleton);
      else if (!loading) skeleton.remove();
    }
    list.setAttribute('aria-busy', String(results.status === 'searching'));
  });
  effect(() => {
    const selected = store.selected(), wide = layout() === 'wide';
    store.results();
    for (const [entry, card] of cards) {
      const current = wide && entry === selected;
      card.classList.toggle('is-selected', current);
      if (current) card.querySelector('.card-open').setAttribute('aria-current', 'true');
      else card.querySelector('.card-open').removeAttribute('aria-current');
    }
  });

  // While no search is showing, a single category's popular entries make the
  // idle screen browsable. Cards are kept per list, so images stay decoded.
  const popularTitle = h('h2', {class: 'results-title', id: 'popular-title'});
  const popularCount = h('span', {class: 'count'});
  const popularList = h('div', {class: 'results'});
  const popularSection = h('section', {class: 'popular', 'aria-labelledby': 'popular-title', hidden: true},
    h('div', {class: 'results-head'}, popularTitle, popularCount), popularList);
  empty.before(popularSection);
  let popularCards = new Map(), popularShown = null;
  effect(() => {
    const entries = store.results().status === 'idle' ? store.popularEntries() : [];
    popularSection.hidden = !entries.length;
    if (!entries.length || entries === popularShown) return;
    popularShown = entries;
    const instances = store.instances.peek();
    const instance = instances.find(item => item.key === store.category.peek());
    popularTitle.textContent = 'Popular in ' + (instance ? categoryName(instance) : 'this category');
    popularCount.textContent = entries.length + (entries.length === 1 ? ' entry' : ' entries');
    popularCards = new Map(entries.map((entry, index) => [entry, renderCard(entry, index, {showCategory: false, instances, onOpen: open})]));
    popularList.replaceChildren(...popularCards.values());
  });
  effect(() => {
    const selected = store.selected(), wide = layout() === 'wide';
    store.popularEntries();
    for (const [entry, card] of popularCards) {
      const current = wide && entry === selected;
      card.classList.toggle('is-selected', current);
      if (current) card.querySelector('.card-open').setAttribute('aria-current', 'true');
      else card.querySelector('.card-open').removeAttribute('aria-current');
    }
  });

  effect(() => {
    const results = store.results(), visible = store.visibleEntries().length;
    let nodes = [];
    if (results.status === 'idle') {
      if (!store.popularEntries().length) nodes = emptyState('search', 'Find an entry', 'Type at least two characters.',
        [h('button', {type: 'button', class: 'text-button sq', onclick: () => panels.openAbout()}, icon('info'), 'How it works')]);
    } else if (results.status === 'done' && !results.entries.length && results.scopes.some(scope => scope.status === 'done')) {
      nodes = emptyState('search', 'No matches', 'Try a shorter name or another spelling.');
    } else if (results.entries.length && !visible) {
      nodes = emptyState('image', 'No entries match this filter.', '',
        [h('button', {type: 'button', class: 'text-button sq', onclick: () => { haptics.play('selection'); store.setFilter('all'); }}, 'Show all')]);
    }
    empty.replaceChildren(...nodes);
  });

  effect(() => {
    const results = store.results();
    foot.hidden = !(results.status === 'done' && results.responses.length);
  });
  listen(byId('responses'), 'click', () => panels.openResponses());
}
