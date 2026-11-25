import {h, icon} from '../ui/dom.mjs';
import {createAvatar} from '../ui/avatar.mjs';
import {categoryName, IMAGE_LABELS, imageKind} from '../ui/catalog.mjs';

export function imageBadge(kind) {
  const label = IMAGE_LABELS[kind];
  return h('span', {class: 'badge sq', 'data-kind': kind}, icon(label.icon), label.badge);
}

export function entryCategory(entry, instances) {
  const instance = instances.find(item => item.key === entry.instance_key);
  return instance ? categoryName(instance) : entry.category || 'Category';
}

// A result card. The title button stretches over the whole card, so the card
// opens with one tap while the image retry control stays separately reachable.
export function renderCard(entry, index, {showCategory, instances, onOpen}) {
  const kind = imageKind(entry);
  const name = entry.name || 'Unnamed entry';
  const open = h('button', {type: 'button', class: 'card-open', dir: 'auto', text: name});
  open.addEventListener('click', () => onOpen(entry));
  return h('article', {class: 'card sq', 'data-image-state': kind},
    createAvatar(entry, index, () => onOpen(entry)),
    h('div', {class: 'card-body'},
      h('h3', {class: 'card-title'}, open),
      h('p', {class: 'card-desc', dir: 'auto', text: entry.description || 'No description.'}),
      h('div', {class: 'card-meta'}, imageBadge(kind),
        entry.ranking != null ? h('span', {class: 'badge sq', 'data-kind': 'rank', 'aria-label': 'Popularity rank ' + entry.ranking, text: '#' + entry.ranking.toLocaleString('en')}) : null,
        showCategory ? h('span', {class: 'badge sq', 'data-kind': 'category', text: entryCategory(entry, instances)}) : null)),
    icon('chevron-right', 'icon card-chevron'));
}

export function skeletonCard() {
  return h('div', {class: 'card sq skeleton', 'aria-hidden': 'true'},
    h('div', {class: 'avatar sq'}),
    h('div', {class: 'card-body'}, h('span', {class: 'line'}), h('span', {class: 'line short'})));
}
