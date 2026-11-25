// A small synchronous reactive core. Signals notify effects; effects and scopes
// own their nested effects and cleanups, so a disposed view releases every
// listener, timer and subscription it created.

let tracking = null;
let owner = null;
let batchDepth = 0;
let flushing = false;
const queue = new Set();

function report(error) {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else console.error(error);
}

class Owner {
  constructor(parent) {
    this.parent = parent;
    this.children = new Set();
    this.cleanups = [];
    this.disposed = false;
    parent?.children.add(this);
  }
  reset() {
    for (const child of [...this.children]) child.dispose();
    this.children.clear();
    const cleanups = this.cleanups.splice(0);
    for (let index = cleanups.length - 1; index >= 0; index--) {
      try { cleanups[index](); } catch (error) { report(error); }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.parent?.children.delete(this);
  }
}

class Computation extends Owner {
  constructor(fn, parent) {
    super(parent);
    this.fn = fn;
    this.sources = new Set();
  }
  reset() {
    for (const source of this.sources) source.delete(this);
    this.sources.clear();
    super.reset();
  }
  run() {
    if (this.disposed) return;
    this.reset();
    const previousTracking = tracking, previousOwner = owner;
    tracking = this; owner = this;
    try { this.fn(); } catch (error) { report(error); }
    finally { tracking = previousTracking; owner = previousOwner; }
  }
}

function flush() {
  if (flushing) return;
  flushing = true;
  try {
    let guard = 0;
    while (queue.size) {
      if (++guard > 10000) { queue.clear(); throw Error('Reactive updates did not settle.'); }
      const [next] = queue;
      queue.delete(next);
      next.run();
    }
  } finally { flushing = false; }
}

export function signal(initial, equals = Object.is) {
  let value = initial;
  const subscribers = new Set();
  const read = () => {
    if (tracking && !tracking.disposed) { subscribers.add(tracking); tracking.sources.add(subscribers); }
    return value;
  };
  read.peek = () => value;
  read.set = next => {
    if (equals(value, next)) return;
    value = next;
    for (const computation of subscribers) queue.add(computation);
    if (!batchDepth) flush();
  };
  read.update = fn => read.set(fn(value));
  return read;
}

export function effect(fn) {
  const computation = new Computation(fn, owner);
  computation.run();
  return () => computation.dispose();
}

export function scope(fn) {
  const node = new Owner(owner);
  const previousTracking = tracking, previousOwner = owner;
  tracking = null; owner = node;
  try { fn?.(); } finally { tracking = previousTracking; owner = previousOwner; }
  return () => node.dispose();
}

export function onCleanup(fn) {
  if (owner) owner.cleanups.push(fn);
}

export function batch(fn) {
  batchDepth++;
  try { return fn(); } finally { if (!--batchDepth) flush(); }
}
