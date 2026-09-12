export class HttpError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// Bound bytes while streaming, including chunked bodies without Content-Length.
// Cancellation must not wait for an uncooperative producer to acknowledge it.
export async function readText(message, limit, timeout = 5000, status = 413, reserve = () => {}) {
  const length = message.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    message.body?.cancel().catch(() => {});
    throw new HttpError(status, 'Request or service response exceeds the size limit.');
  }
  if (!message.body) return '';
  const reader = message.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let bytes = 0, text = '', timer;
  const deadline = Date.now() + timeout;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new HttpError(status === 413 ? 408 : 504, 'The connection timed out. Try again.')), timeout);
  });
  try {
    return await Promise.race([(async () => {
      for (;;) {
        if (Date.now() >= deadline) throw new HttpError(status === 413 ? 408 : 504, 'The connection timed out. Try again.');
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) throw new HttpError(status, 'Request or service response exceeds the size limit.');
        reserve(value.byteLength);
        text += decoder.decode(value, {stream: true});
      }
      return text + decoder.decode();
    })(), expired]);
  } catch (error) {
    reader.cancel().catch(() => {});
    if (error instanceof TypeError) throw new HttpError(status === 413 ? 400 : 502, 'Unsupported text encoding.');
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

// Account across the whole handler, through parsing and response serialization.
// The allowance leaves space for UTF-16 strings, parsed records and output bytes
// in the shared 128 MiB Worker heap, rather than multiplying a per-body cap by
// every concurrent request. No upstream data is silently truncated.
let reservedBytes = 0;
export function responseBudget() {
  let held = 0;
  return {
    reserve(bytes) {
      if (reservedBytes + bytes > 8 * 1024 * 1024) throw new HttpError(503, 'The lookup is busy. Try again shortly.', 1);
      reservedBytes += bytes; held += bytes;
    },
    release() { reservedBytes -= held; held = 0; },
  };
}

// Native JSON.parse is safe from prototype setters; cap nesting before parsing
// so later serialization and inspection cannot encounter stack exhaustion.
export function parseJSON(text) {
  let depth = 0, quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') {
      if (++depth > 64) throw new SyntaxError('JSON is too deeply nested.');
    } else if (char === ']' || char === '}') depth--;
  }
  return JSON.parse(text);
}

export const assetHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
};

export function pageHeaders(nonce) {
  return {
    ...assetHeaders,
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), browsing-topics=()',
    // A response nonce also lets the hosting provider nonce its injected bot
    // detection script. No unsafe-inline or eval permission is needed.
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src 'self' 'nonce-${nonce}'`,
      "script-src-attr 'none'",
      "style-src 'self'",
      "style-src-attr 'none'",
      "img-src 'self' https://akinator.com:* https://*.akinator.com:* https://elokence.com:* https://*.elokence.com:* https://clarinea.fr:* https://*.clarinea.fr:*",
      "connect-src 'self' https://photos.clarinea.fr",
      "frame-src 'self'",
      "frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com",
      "base-uri 'none'", "form-action 'self'", "object-src 'none'",
    ].join('; '),
  };
}

export function json(value, start, status = 200, extra = {}) {
  return Response.json(value, {status, headers: {
    ...assetHeaders, 'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Server-Timing': `app;dur=${(performance.now() - start).toFixed(1)}`,
    ...extra,
  }});
}
