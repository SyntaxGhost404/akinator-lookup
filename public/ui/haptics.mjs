// Subtle, consistent haptics. Android browsers use the Vibration API. iOS 18
// Safari has no vibration API but plays a system tick when a switch control
// toggles, so a hidden switch is toggled from inside the user's own gesture.
// Everything is progressive: unsupported devices stay silent.
const patterns = {
  selection: 6,
  impact: 10,
  success: [8, 60, 12],
  warning: [14, 80, 14],
  error: [16, 60, 16, 60, 16],
};

export function detectHaptics(env = globalThis) {
  const coarse = Boolean(env.matchMedia?.('(any-pointer: coarse)')?.matches);
  if (!coarse) return 'none';
  if (typeof env.navigator?.vibrate === 'function') return 'vibrate';
  if (env.HTMLInputElement && 'switch' in env.HTMLInputElement.prototype) return 'switch';
  return 'none';
}

export function createHaptics(enabled, env = globalThis) {
  const method = detectHaptics(env);
  let proxy, last = -Infinity;
  const proxyLabel = () => {
    if (proxy?.isConnected) return proxy;
    const document = env.document;
    proxy = document.createElement('label');
    proxy.setAttribute('aria-hidden', 'true');
    proxy.className = 'haptic-proxy';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.tabIndex = -1;
    input.setAttribute('switch', '');
    proxy.append(input);
    // Hidden with display: none so the proxy can never take focus or close the keyboard.
    proxy.style.setProperty('display', 'none');
    document.head.append(proxy);
    return proxy;
  };
  return {
    method,
    supported: method !== 'none',
    play(kind = 'selection') {
      if (method === 'none' || !(typeof enabled.peek === 'function' ? enabled.peek() : enabled())) return false;
      const now = env.performance?.now?.() ?? Date.now();
      if (now - last < 40) return false;
      last = now;
      try {
        if (method === 'vibrate') return env.navigator.vibrate(patterns[kind] ?? patterns.selection) !== false;
        proxyLabel().click();
        return true;
      } catch { return false; }
    },
  };
}
