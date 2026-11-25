import {LookupClient} from './lookup-ui.mjs';
import {scope} from './ui/reactive.mjs';
import {byId} from './ui/dom.mjs';
import {createPreferences} from './ui/prefs.mjs';
import {installTheme} from './ui/theme.mjs';
import {createHaptics} from './ui/haptics.mjs';
import {installSquircles} from './ui/squircle.mjs';
import {installViewport, layoutSignal} from './ui/viewport.mjs';
import {Sheet} from './ui/sheet.mjs';
import {createToasts} from './ui/controls.mjs';
import {LookupStore} from './ui/store.mjs';
import {mountShell} from './views/shell.mjs';
import {mountSearch} from './views/search.mjs';
import {mountResults} from './views/results.mjs';
import {createDetails} from './views/details.mjs';
import {createPanels} from './views/settings.mjs';

// Composition root. Everything created here is owned by one scope.
scope(() => {
  const prefs = createPreferences();
  installTheme(prefs.theme);
  installViewport();
  const layout = layoutSignal();
  const haptics = createHaptics(prefs.haptics);
  const sheet = new Sheet({layer: byId('sheet-layer'), app: byId('app'), layout, haptics});
  const toasts = createToasts(byId('toasts'));
  const store = new LookupStore({prefs, client: new LookupClient(), isSheetOpen: () => sheet.isOpen()});
  const context = {prefs, layout, haptics, sheet, toasts, store};
  context.panels = createPanels(context);
  context.details = createDetails(context);
  mountShell(context);
  mountSearch(context);
  mountResults(context);
  installSquircles();
  store.connect();
});
