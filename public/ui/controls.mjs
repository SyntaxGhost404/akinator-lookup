import {effect, onCleanup} from './reactive.mjs';
import {animate, h, icon, listen, rovingKeys} from './dom.mjs';

// Every choice is a styled, touch-sized control. No native select, radio,
// dialog or details elements are used.

// A list of options that keeps the submenu open after a choice.
export function pickerList(title, options, selected, onSelect, haptics) {
  const list = h('div', {class: 'picker-list sq', role: 'listbox', 'aria-label': title});
  const rows = options.map(option => {
    const row = h('button', {type: 'button', class: 'picker-option', role: 'option', 'data-value': option.value,
      'aria-selected': String(option.value === selected), tabindex: option.value === selected ? '0' : '-1'},
    h('span', {class: 'picker-text'},
      h('span', {class: 'picker-name', text: option.label}),
      option.caption ? h('span', {class: 'picker-caption', text: option.caption}) : null),
    h('span', {class: 'selection-mark sq'}, icon('check')));
    listen(row, 'click', () => {
      for (const other of rows) {
        const checked = other === row;
        other.setAttribute('aria-selected', String(checked));
        other.tabIndex = checked ? 0 : -1;
      }
      row.focus({preventScroll: true});
      if (selected === option.value) return;
      selected = option.value;
      haptics?.play('selection');
      onSelect(option.value);
    });
    return row;
  });
  if (rows.length && !rows.some(row => row.tabIndex === 0)) rows[0].tabIndex = 0;
  list.append(...rows);
  rovingKeys(list, () => rows, {orientation: 'vertical'});
  return list;
}

// Single choice among a few options, shown side by side.
export function segmented({label, options, value, onChange, haptics, className = ''}) {
  const group = h('div', {class: 'segmented sq ' + className, role: 'radiogroup', 'aria-label': label});
  const thumb = h('span', {class: 'segment-thumb sq', 'aria-hidden': 'true'});
  const buttons = options.map(option => {
    const button = h('button', {type: 'button', class: 'segment', role: 'radio', 'data-value': option.value},
      option.icon ? icon(option.icon) : null, h('span', {text: option.label}));
    listen(button, 'click', () => {
      if (value() === option.value) return;
      haptics?.play('selection');
      onChange(option.value);
    });
    return button;
  });
  group.append(thumb, ...buttons);
  group.style.setProperty('--segments', String(options.length));
  effect(() => {
    const current = value();
    const index = Math.max(0, options.findIndex(option => option.value === current));
    group.style.setProperty('--index', String(index));
    for (const [position, button] of buttons.entries()) {
      const checked = position === index;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked ? 0 : -1;
    }
  });
  rovingKeys(group, () => buttons, {orientation: 'horizontal', activate: button => button.click()});
  return group;
}

// An on and off switch drawn with squircle geometry.
export function switchControl({label, description, checked, onChange, disabled = false, haptics, id}) {
  const descriptionId = id ? id + '-description' : undefined;
  const control = h('button', {type: 'button', class: 'switch sq', role: 'switch', id,
    'aria-label': label, 'aria-describedby': description ? descriptionId : null, disabled},
  h('span', {class: 'switch-knob sq', 'aria-hidden': 'true'}));
  effect(() => control.setAttribute('aria-checked', String(Boolean(checked()))));
  listen(control, 'click', () => {
    const next = !checked();
    onChange(next);
    if (next) haptics?.play('selection');
  });
  const row = h('div', {class: 'setting-row switch-row'},
    h('span', {class: 'setting-text'},
      h('label', {class: 'setting-label', for: id, text: label}),
      description ? h('span', {class: 'setting-caption', id: descriptionId, text: description}) : null),
    control);
  return row;
}

export function disclosure(label, render, {open = false} = {}) {
  const root = h('div', {class: 'disclosure'});
  const button = h('button', {type: 'button', class: 'disclosure-button sq', 'aria-expanded': 'false'},
    h('span', {text: label}), icon('chevron-right', 'icon disclosure-chevron'));
  const body = h('div', {class: 'disclosure-body', hidden: true});
  let rendered = false;
  const set = expanded => {
    if (expanded && !rendered) { rendered = true; body.append(...[render()].flat()); }
    body.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    if (expanded) animate(body, [{opacity: 0, transform: 'translateY(-4px)'}, {opacity: 1, transform: 'none'}], {duration: 160, easing: 'ease-out'});
  };
  listen(button, 'click', () => set(body.hidden));
  if (open) set(true);
  root.append(button, body);
  return root;
}

// One message at a time, announced politely.
export function createToasts(container) {
  let timer = 0, current = null;
  const dismiss = node => {
    if (!node?.isConnected) return;
    const motion = animate(node, [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(6px)'}], {duration: 160, easing: 'ease-in'});
    if (motion) motion.finished.then(() => node.remove(), () => node.remove()); else node.remove();
  };
  return {
    show(message, {kind = 'info'} = {}) {
      clearTimeout(timer);
      if (current) dismiss(current);
      current = h('div', {class: 'toast sq', 'data-kind': kind, role: 'status'},
        icon(kind === 'error' ? 'alert' : 'check'), h('span', {text: message}));
      container.append(current);
      animate(current, [{opacity: 0, transform: 'translateY(8px) scale(.98)'}, {opacity: 1, transform: 'none'}], {duration: 200, easing: 'cubic-bezier(.22,1,.36,1)'});
      const shown = current;
      timer = setTimeout(() => { dismiss(shown); if (current === shown) current = null; }, 2600);
    },
  };
}

// A set of single-choice chips. Nodes are keyed by value, so focus and
// position survive as labels and counts update.
export function chipGroup(container, {label, options, value, onChange, haptics, className = 'chip'}) {
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', label);
  const nodes = new Map();
  listen(container, 'click', event => {
    const chip = event.target.closest('[role="radio"]');
    if (!chip || chip.disabled || !container.contains(chip) || chip.dataset.value === value()) return;
    haptics?.play('selection');
    onChange(chip.dataset.value);
  });
  rovingKeys(container, () => [...nodes.values()].map(node => node.button), {activate: chip => chip.click()});
  effect(() => {
    const list = options(), current = value(), keep = new Set();
    list.forEach((option, index) => {
      keep.add(option.value);
      let node = nodes.get(option.value);
      if (!node) {
        node = {
          button: h('button', {type: 'button', class: className + ' sq', role: 'radio', 'data-value': option.value}),
          label: h('span', {class: 'chip-label'}), count: h('span', {class: 'chip-count'}),
        };
        if (option.icon) node.button.append(icon(option.icon));
        node.button.append(node.label, node.count);
        nodes.set(option.value, node);
      }
      if (node.label.textContent !== option.label) node.label.textContent = option.label;
      const count = option.count == null ? '' : String(option.count);
      if (node.count.textContent !== count) node.count.textContent = count;
      node.count.hidden = !count;
      const checked = option.value === current;
      node.button.setAttribute('aria-checked', String(checked));
      node.button.tabIndex = checked ? 0 : -1;
      if (container.children[index] !== node.button) container.insertBefore(node.button, container.children[index] || null);
    });
    for (const [key, node] of nodes) if (!keep.has(key)) { node.button.remove(); nodes.delete(key); }
    const first = nodes.values().next().value;
    if (first && ![...nodes.values()].some(node => node.button.tabIndex === 0)) first.button.tabIndex = 0;
  });
  onCleanup(() => { container.replaceChildren(); nodes.clear(); });
  return {node: key => nodes.get(key)?.button};
}
