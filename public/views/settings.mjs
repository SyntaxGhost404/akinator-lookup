import {languageName} from '../lookup-ui.mjs';
import {effect} from '../ui/reactive.mjs';
import {h, icon} from '../ui/dom.mjs';
import {pickerList, segmented, switchControl} from '../ui/controls.mjs';
import {changeWithTransition} from '../ui/theme.mjs';

const ABOUT = [
  'Look up characters, objects, animals, and movies or TV shows in Akinator without playing a round.',
  '**Search.** Choose a language and a category, or **All** to search every category in that language. Suggestions appear after two characters. Pick one, or press **Search** to look up your own text. Results appear as each category finishes.',
  '**Images.** Filter matches by image. **Pictureless** entries have no custom image and show Akinator’s default picture. **Custom** entries show their uploaded image. **Unspecified** means Akinator returned no image information. An image that fails to load keeps its original classification.',
  '**Details.** Open a match to see every field Akinator returned, or **All returned data** below the results for the full responses.',
  '**Limits.** Akinator caps how many matches it returns, so a missing result doesn’t prove an entry is absent. Last guessed dates and award eligibility aren’t available. A pictureless entry doesn’t guarantee a Platinum or Black award.',
];

// Static copy uses only bold markers, rendered as text and strong elements.
function paragraph(copy) {
  const node = h('p');
  for (const part of copy.split(/(\*\*[^*]+\*\*)/g)) {
    if (part) node.append(part.startsWith('**') ? h('strong', {text: part.slice(2, -2)}) : document.createTextNode(part));
  }
  return node;
}

const group = (title, ...children) => h('section', {class: 'group'}, title ? h('h3', {class: 'group-title', text: title}) : null, ...children);

export function createPanels({store, prefs, sheet, haptics, toasts}) {
  const panels = {
    openSettings(direction) {
      store.dismissSuggestions();
      sheet.open({title: 'Settings', view: 'settings', direction, render: () => {
        const theme = segmented({
          label: 'Appearance', haptics, value: () => prefs.theme(),
          options: [{value: 'system', label: 'System', icon: 'system'}, {value: 'light', label: 'Light', icon: 'sun'}, {value: 'dark', label: 'Dark', icon: 'moon'}],
          onChange: value => changeWithTransition(() => prefs.theme.set(value)),
        });
        const haptic = switchControl({
          id: 'haptics-switch', label: 'Haptic feedback', haptics,
          description: haptics.supported ? 'Vibrate on taps and selections.' : 'Not available on this device.',
          checked: () => haptics.supported && prefs.haptics(), disabled: !haptics.supported,
          onChange: value => prefs.haptics.set(value),
        });
        const languageValue = h('span', {class: 'setting-value'});
        effect(() => { languageValue.textContent = languageName(store.language()); });
        const language = h('button', {type: 'button', class: 'setting-row', onclick: () => panels.openLanguage(() => panels.openSettings('back'))},
          h('span', {class: 'setting-text'}, h('span', {class: 'setting-label', text: 'Language'})), languageValue, icon('chevron-right'));

        const dot = h('span', {class: 'connection-dot sq', 'aria-hidden': 'true'});
        const state = h('span', {class: 'setting-label'}), caption = h('span', {class: 'setting-caption'});
        const reconnect = h('button', {type: 'button', class: 'wide-button sq'});
        reconnect.addEventListener('click', async () => {
          haptics.play('impact');
          await store.connect();
          if (store.connection.peek().status === 'ready') toasts.show('Connected');
        });
        effect(() => {
          const {status} = store.connection();
          const instances = store.instances();
          dot.dataset.state = status;
          state.textContent = {idle: 'Connecting…', connecting: 'Connecting…', ready: 'Connected', failed: 'Not connected'}[status];
          const languages = new Set(instances.map(instance => instance.language)).size;
          caption.textContent = status === 'ready' ? instances.length + ' categories in ' + languages + (languages === 1 ? ' language' : ' languages') : '';
          caption.hidden = !caption.textContent;
          const busy = status === 'connecting' || status === 'idle';
          reconnect.disabled = busy;
          reconnect.replaceChildren(icon('retry'), busy ? 'Connecting…' : 'Reconnect');
        });
        const connection = h('div', {class: 'setting-row'},
          h('span', {class: 'setting-lead'}, dot, h('span', {class: 'setting-text'}, state, caption)), reconnect);
        const about = h('button', {type: 'button', class: 'setting-row', onclick: () => panels.openAbout(() => panels.openSettings('back'))},
          h('span', {class: 'setting-lead'}, icon('info'), h('span', {class: 'setting-label', text: 'How it works'})), icon('chevron-right'));
        return [
          group('Appearance', theme),
          group('Feedback', h('div', {class: 'group-card sq'}, haptic)),
          group('Search', h('div', {class: 'group-card sq'}, language)),
          group('Connection', h('div', {class: 'group-card sq'}, connection)),
          group('', h('div', {class: 'group-card sq'}, about)),
        ];
      }});
    },

    openLanguage(back) {
      store.dismissSuggestions();
      const options = store.languages()
        .map(code => ({value: code, label: languageName(code), caption: code.toUpperCase()}))
        .sort((a, b) => a.label.localeCompare(b.label));
      sheet.open({title: 'Language', view: 'language', back, render: () =>
        [pickerList('Language', options, store.language.peek(), code => store.setLanguage(code), haptics)]});
    },

    openAbout(back) {
      store.dismissSuggestions();
      sheet.open({title: 'How it works', view: 'about', back, render: () => [h('div', {class: 'about'},
        ...ABOUT.map(paragraph), h('p', {class: 'fine', text: 'Unofficial tool. Not affiliated with Akinator or Elokence.'}))]});
    },

    openResponses() {
      const text = JSON.stringify(store.results.peek().responses, null, 2);
      sheet.open({title: 'Returned data', view: 'data', render: () => [
        h('div', {class: 'sheet-toolbar'}, h('button', {type: 'button', class: 'action sq', onclick: () => {
          haptics.play('success');
          Promise.resolve().then(() => navigator.clipboard.writeText(text))
            .then(() => toasts.show('Data copied'), () => toasts.show('Couldn’t copy.', {kind: 'error'}));
        }}, icon('copy'), 'Copy')),
        h('pre', {class: 'code-block sq', text})]});
    },

    openDiagnostics(payload) {
      sheet.open({title: 'Request details', view: 'data', render: () => [h('pre', {class: 'code-block sq', text: JSON.stringify(payload, null, 2)})]});
    },
  };
  return panels;
}
