// Turn transport and service failures into plain guidance. The original
// message is always kept as `detail` so diagnostics stay inspectable.
const rules = [
  [error => error?.name === 'AbortError', 'The request timed out. Try again.'],
  [error => error?.name === 'TypeError' && /fetch|network|load failed/i.test(error.message), 'No connection. Check your network and try again.'],
  [error => error?.name === 'SyntaxError', 'The service sent an unexpected response. Reload the page and try again.'],
  [error => /too many requests/i.test(error?.message), 'Too many requests. Wait a moment, then try again.'],
  [error => /busy/i.test(error?.message), 'The service is busy. Try again in a moment.'],
  [error => /timed out/i.test(error?.message), 'The request timed out. Try again.'],
  [error => /invalid session|outdated session/i.test(error?.message), 'The session expired. Try again.'],
  // The hosting edge blocks automated traffic with 403; back off and retry.
  [error => /\b403\b|forbidden|cloudflare/i.test(error?.message), 'Akinator is temporarily blocking requests. Wait a moment, then try again.'],
  // Named engine conditions, surfaced from the service response.
  [error => /server down/i.test(error?.message), 'Akinator’s engine is temporarily down. Try again shortly.'],
  [error => /engine refusal/i.test(error?.message), 'Akinator’s engine declined this lookup. Try another name or reconnect.'],
  [error => /technical error/i.test(error?.message), 'Akinator had a technical problem. Try again.'],
  [error => /bad media id or footprint/i.test(error?.message), 'This lookup can’t reach the database. Reconnect to refresh.'],
  [error => /rejected the request/i.test(error?.message), 'Akinator rejected the request. Try again or reconnect.'],
  [error => /same-origin/i.test(error?.message), 'This page can’t reach the service. Reload the page.'],
  [error => /select an available category/i.test(error?.message), 'This category is no longer available. Reconnect to refresh the list.'],
  [error => /size limit/i.test(error?.message), 'The response was too large to show. Try a more specific name.'],
  [error => /unavailable/i.test(error?.message), 'The lookup service is unavailable. Try again later.'],
];

export function describeError(error) {
  const detail = String(error?.message || error || 'Unknown error');
  for (const [test, message] of rules) {
    try { if (test(error)) return {message, detail}; } catch { /* Keep looking. */ }
  }
  return {message: 'The lookup couldn’t finish. Try again or reconnect.', detail};
}
