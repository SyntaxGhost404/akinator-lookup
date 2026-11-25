import {effect} from '../ui/reactive.mjs';
import {byId, h, listen} from '../ui/dom.mjs';
import {categoryName} from '../ui/catalog.mjs';

// The search field, its combobox suggestions, and submission.
export function mountSearch({store, haptics}) {
  const form = byId('searchform'), input = byId('query'), clear = byId('clear'), submit = byId('search');
  const panel = byId('suggestion-panel'), list = byId('suggestions'), status = byId('suggestion-status'), main = byId('main');

  const startSearch = () => {
    if (!store.canSearch()) return;
    haptics.play('impact');
    main.scrollTop = 0;
    input.blur();
    store.search();
  };

  listen(form, 'submit', event => { event.preventDefault(); startSearch(); });
  listen(input, 'input', () => store.input(input.value));
  listen(input, 'compositionstart', () => store.compositionStart());
  listen(input, 'compositionend', () => store.compositionEnd());
  listen(input, 'focus', () => store.focus());
  listen(input, 'blur', () => store.blur());
  listen(input, 'keydown', event => {
    if (event.key === 'Escape') { store.dismissSuggestions(); return; }
    const state = store.suggestions.peek();
    if (!state.rows.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      store.moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && state.active >= 0 && !store.composing) {
      event.preventDefault();
      choose(state.rows[state.active]);
    }
  });
  listen(clear, 'click', () => {
    store.clear();
    input.focus();
  });
  listen(byId('dismiss'), 'click', () => store.dismissSuggestions());
  // Scrolling the results while typing puts the keyboard away. Taps are left
  // alone, so the layout never shifts under a finger before its click lands.
  let touch = null;
  listen(main, 'pointerdown', event => {
    touch = event.pointerType === 'touch' && document.activeElement === input ? {id: event.pointerId, y: event.clientY} : null;
  }, {passive: true});
  listen(main, 'pointermove', event => {
    if (!touch || event.pointerId !== touch.id || Math.abs(event.clientY - touch.y) < 10) return;
    touch = null;
    store.dismissSuggestions();
    input.blur();
  }, {passive: true});
  listen(main, 'pointercancel', event => {
    // Native scrolling takes the pointer; that is a scroll too.
    if (!touch || event.pointerId !== touch.id) return;
    touch = null;
    store.dismissSuggestions();
    input.blur();
  }, {passive: true});

  effect(() => {
    const value = store.query();
    if (input.value !== value) input.value = value;
    clear.hidden = !value;
  });
  effect(() => { submit.disabled = !store.canSearch(); });

  // Suggestion rows are keyed by category and label so open rows survive updates.
  const rows = new Map();
  const choose = item => {
    haptics.play('impact');
    main.scrollTop = 0;
    input.blur();
    store.choose(item);
  };
  effect(() => {
    const state = store.suggestions();
    const keys = new Set();
    state.rows.forEach((item, index) => {
      const key = item.instance.key + '\n' + item.label;
      keys.add(key);
      let row = rows.get(key);
      if (!row) {
        const button = h('button', {type: 'button', tabindex: '-1'}, h('strong', {dir: 'auto', text: item.name}),
          item.description ? h('span', {class: 'suggestion-desc', dir: 'auto', text: item.description}) : null,
          state.multi ? h('span', {class: 'suggestion-category', text: categoryName(item.instance)}) : null);
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => choose(row.item));
        row = {node: h('li', {role: 'option'}, button), item};
        row.node.dataset.key = key;
        rows.set(key, row);
      }
      row.item = item;
      row.node.id = 'suggestion-' + index;
      const active = index === state.active;
      row.node.setAttribute('aria-selected', String(active));
      row.node.firstChild.classList.toggle('active', active);
      if (list.children[index] !== row.node) list.insertBefore(row.node, list.children[index] || null);
    });
    for (const [key, row] of rows) if (!keys.has(key)) { row.node.remove(); rows.delete(key); }
    panel.hidden = !state.open;
    input.setAttribute('aria-expanded', String(state.open));
    if (state.active >= 0) {
      input.setAttribute('aria-activedescendant', 'suggestion-' + state.active);
      list.children[state.active]?.scrollIntoView({block: 'nearest'});
    } else input.removeAttribute('aria-activedescendant');
    status.textContent = state.unavailable ? 'Suggestions unavailable. You can still search.'
      : state.pending ? state.rows.length ? 'Updating suggestions…' : 'Finding suggestions…' : 'Suggestions';
  });
}
