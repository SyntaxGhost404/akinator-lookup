import {effect, scope, signal} from './reactive.mjs';
import {animate, append, finished} from './dom.mjs';

const SHEET_IN = 'cubic-bezier(.32,.72,0,1)';
const SETTLE = 'cubic-bezier(.22,1,.36,1)';

// One modal layer for every sheet and dialog. Phones get a bottom sheet that
// follows the finger; larger screens get a centered dialog. Selections never
// close it: Back, Close, Escape and a deliberate downward swipe do.
export class Sheet {
  constructor({layer, app, layout, haptics}) {
    Object.assign(this, {layer, app, layout, haptics});
    this.panel = layer.querySelector('#sheet');
    this.scrim = layer.querySelector('.sheet-scrim');
    this.title = layer.querySelector('#sheet-title');
    this.body = layer.querySelector('#sheet-content');
    this.back = layer.querySelector('#sheet-back');
    this.actions = layer.querySelector('#sheet-actions');
    this.footer = layer.querySelector('#sheet-footer');
    this.closeButton = layer.querySelector('#sheet-close');
    this.state = signal('closed');
    this.view = signal('');
    this.disposeContent = null;
    this.motion = [];
    this.closeButton.addEventListener('click', () => this.close());
    this.back.addEventListener('click', () => this.onBack?.());
    this.scrim.addEventListener('click', () => this.nudge());
    // Pressing the scrim must not move focus out of the dialog.
    this.scrim.addEventListener('mousedown', event => event.preventDefault());
    document.addEventListener('keydown', event => { if (this.isOpen()) this.keydown(event); });
    effect(() => { layer.dataset.presentation = layout() === 'compact' ? 'sheet' : 'dialog'; });
    this.installDrag();
    // Track whether the body scrolls, including when content grows after opening.
    if (typeof ResizeObserver === 'function') this.scrollWatch = new ResizeObserver(() => this.measure());
    if (typeof MutationObserver === 'function') {
      new MutationObserver(() => this.watchContent()).observe(this.body, {childList: true});
    }
  }

  watchContent() {
    if (!this.scrollWatch) { this.measure(); return; }
    this.scrollWatch.disconnect();
    this.scrollWatch.observe(this.body);
    for (const child of this.body.children) this.scrollWatch.observe(child);
  }

  isOpen() { return this.state.peek() === 'open'; }

  // render() and actions() run inside a scope that is disposed when the
  // content is replaced or the sheet closes.
  open({title, view = '', render, actions, footer, back, direction = 'forward'}) {
    const opening = this.state.peek() !== 'open';
    if (opening) {
      this.stopMotion();
      this.clearGesture?.();
      this.returnFocus = this.returnFocus || document.activeElement;
      this.app.inert = true;
      this.layer.hidden = false;
    }
    this.disposeContent?.();
    let nodes = [], actionNodes = [], footerNodes = [];
    this.disposeContent = scope(() => {
      nodes = render() || [];
      actionNodes = actions?.() || [];
      footerNodes = footer?.() || [];
    });
    this.title.textContent = title;
    this.body.replaceChildren();
    append(this.body, nodes);
    this.actions.replaceChildren();
    append(this.actions, actionNodes);
    this.actions.hidden = !actionNodes.length;
    this.footer.replaceChildren();
    append(this.footer, footerNodes);
    this.footer.hidden = !footerNodes.length;
    this.back.hidden = !back;
    this.onBack = back || null;
    this.layer.dataset.view = view;
    this.view.set(view);
    this.state.set('open');
    this.body.scrollTop = 0;
    this.measure();
    if (opening) this.enter();
    else this.motion.push(animate(this.body, [
      {opacity: 0, transform: `translateX(${direction === 'back' ? -14 : 14}px)`}, {opacity: 1, transform: 'none'},
    ], {duration: 180, easing: SETTLE}));
    const selected = this.body.querySelector('[aria-selected="true"]');
    (selected || this.closeButton).focus({preventScroll: true});
  }

  close() {
    if (this.state.peek() !== 'open') return;
    this.release();
    this.exit();
  }

  release() {
    this.state.set('closing');
    this.app.inert = false;
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected && !target.disabled) target.focus({preventScroll: true});
  }

  finishClose() {
    this.stopMotion();
    this.layer.hidden = true;
    this.panel.style.removeProperty('transform');
    this.scrim.style.removeProperty('opacity');
    this.disposeContent?.();
    this.disposeContent = null;
    this.body.replaceChildren();
    this.actions.replaceChildren();
    this.footer.replaceChildren();
    this.footer.hidden = true;
    this.layer.dataset.view = '';
    this.view.set('');
    this.state.set('closed');
  }

  stopMotion() {
    for (const animation of this.motion.splice(0)) animation?.cancel();
  }

  enter() {
    const sheet = this.layer.dataset.presentation === 'sheet';
    this.motion.push(
      animate(this.scrim, [{opacity: 0}, {opacity: 1}], {duration: 240, easing: 'ease-out'}),
      animate(this.panel, sheet
        ? [{transform: 'translateY(100%)'}, {transform: 'none'}]
        : [{opacity: 0, transform: 'scale(.97)'}, {opacity: 1, transform: 'none'}],
      {duration: sheet ? 380 : 220, easing: sheet ? SHEET_IN : SETTLE}),
    );
  }

  exit(from = 0, velocity = 0) {
    const sheet = this.layer.dataset.presentation === 'sheet';
    this.stopMotion();
    const height = this.panel.offsetHeight || 600;
    const duration = sheet ? Math.round(Math.max(150, Math.min(280, (height - from) / Math.max(velocity, 1.6)))) : 160;
    const panel = animate(this.panel, sheet
      ? [{transform: `translateY(${from}px)`}, {transform: `translateY(${height + 24}px)`}]
      : [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'scale(.98)'}],
    {duration, easing: sheet ? 'cubic-bezier(.4,0,1,1)' : 'ease-in', fill: 'forwards'});
    const shade = animate(this.scrim, [{opacity: Number(this.scrim.style.opacity || 1)}, {opacity: 0}], {duration, easing: 'ease-in', fill: 'forwards'});
    this.motion.push(panel, shade);
    this.panel.style.removeProperty('transform');
    this.scrim.style.removeProperty('opacity');
    if (!panel) { this.finishClose(); return; }
    finished(panel).then(done => { if (done && this.state.peek() === 'closing') this.finishClose(); });
  }

  // A tap outside is not a dismissal. The sheet answers with a small bounce.
  nudge() {
    if (!this.isOpen()) return;
    const sheet = this.layer.dataset.presentation === 'sheet';
    this.motion.push(animate(this.panel, sheet
      ? [{transform: 'none'}, {transform: 'translateY(-8px)'}, {transform: 'none'}]
      : [{transform: 'none'}, {transform: 'scale(1.012)'}, {transform: 'none'}],
    {duration: 280, easing: SETTLE}));
  }

  keydown(event) {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...this.panel.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"],a[href]')]
      .filter(node => node.tabIndex >= 0 && !node.hidden && !node.closest('[hidden]'));
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (!this.panel.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  // Short content can be dragged from anywhere; long content only from the header.
  measure() {
    this.body.dataset.scrollable = String(this.body.scrollHeight > this.body.clientHeight + 1);
  }

  installDrag() {
    let drag = null, suppressClick = 0;
    const panel = this.panel;
    const threshold = height => Math.min(height * 0.3, 200);
    const begin = event => {
      if (!this.isOpen() || this.layer.dataset.presentation !== 'sheet' || drag) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const handle = event.target.closest?.('.sheet-grabber,.sheet-header');
      const inBody = !handle && event.target.closest?.('#sheet-content') && this.body.dataset.scrollable === 'false';
      if (!handle && !inBody) return;
      if (handle && event.target.closest('button,a,input')) return;
      drag = {id: event.pointerId, y: event.clientY, x: event.clientX, moved: false, samples: [[event.timeStamp, 0]], armed: false, height: panel.offsetHeight || 1};
    };
    const move = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dy = event.clientY - drag.y, dx = event.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx)) { if (Math.abs(dx) > 10) drag = null; return; }
        drag.moved = true;
        this.stopMotion();
        try { panel.setPointerCapture(event.pointerId); } catch { /* The pointer may already be gone. */ }
      }
      event.preventDefault();
      // Downward follows the finger; upward resists like a rubber band.
      const offset = dy >= 0 ? dy : -Math.pow(-dy, 0.62);
      drag.offset = offset;
      drag.samples.push([event.timeStamp, offset]);
      if (drag.samples.length > 5) drag.samples.shift();
      panel.style.setProperty('transform', `translateY(${offset}px)`);
      this.scrim.style.setProperty('opacity', String(Math.max(0.25, 1 - Math.max(0, offset) / drag.height)));
      const armed = offset > threshold(drag.height);
      if (armed !== drag.armed) { drag.armed = armed; this.haptics?.play('selection'); }
    };
    const end = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const current = drag;
      drag = null;
      if (!current.moved) return;
      suppressClick = event.timeStamp;
      const [first, last] = [current.samples[0], current.samples.at(-1)];
      const velocity = (last[1] - first[1]) / Math.max(1, last[0] - first[0]);
      const offset = current.offset || 0;
      if (event.type !== 'pointercancel' && (offset > threshold(current.height) || (velocity > 0.55 && offset > 24))) {
        this.release();
        this.exit(offset, velocity);
        return;
      }
      panel.style.removeProperty('transform');
      this.scrim.style.removeProperty('opacity');
      this.motion.push(animate(panel, [{transform: `translateY(${offset}px)`}, {transform: 'none'}], {duration: 320, easing: SETTLE}));
    };
    panel.addEventListener('pointerdown', begin);
    panel.addEventListener('pointermove', move, {passive: false});
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
    // A drag that ends over a button must not also press it. Only the click
    // finishing that same drag is swallowed: a new gesture or a fresh open
    // clears the guard, so a later tap or key press always lands.
    panel.addEventListener('pointerdown', () => { suppressClick = 0; }, true);
    panel.addEventListener('click', event => {
      if (suppressClick && event.timeStamp - suppressClick < 400) { event.stopPropagation(); event.preventDefault(); }
      suppressClick = 0;
    }, true);
    this.clearGesture = () => { suppressClick = 0; drag = null; };
  }
}
