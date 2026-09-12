import html from './ui.mjs';
import {discover, lookup, prepare, resetDirectory, AkinatorServiceError} from './lookup.mjs';
import {assetHeaders, HttpError, json, pageHeaders, readText, responseBudget} from './http.mjs';
import {checkOrigin, readInput, restoreSession, signSession, TrafficGuard} from './security.mjs';

export function createApp(assets) {
  const guard = new TrafficGuard();
  let lastReset = -Infinity;
  return {
    async fetch(request, env = {}) {
      const start = performance.now();
      let release, budget;
      try {
        const url = new URL(request.url), path = url.pathname;
        const assetPath = path === '/api/placeholder' ? '/assets/akinator-pictureless.webp' : path;
        const asset = assets.get(assetPath);
        if (path === '/' || asset) {
          if (!['GET', 'HEAD'].includes(request.method)) return json({error: 'Method not allowed.'}, start, 405, {Allow: 'GET, HEAD'});
          if (asset) return new Response(request.method === 'HEAD' ? null : asset.body, {headers: {
            ...assetHeaders, 'Content-Type': asset.type, 'Cache-Control': 'private, max-age=86400',
          }});
          const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
          return new Response(request.method === 'HEAD' ? null : html, {headers: pageHeaders(nonce)});
        }
        const action = path.slice('/api/'.length);
        const methods = {'/api/instances': 'GET', '/api/search': 'POST', '/api/suggest': 'POST', '/api/prepare': 'POST', '/api/reset': 'POST'};
        if (!Object.hasOwn(methods, path)) return json({error: 'Not found'}, start, 404);
        if (request.method !== methods[path]) return json({error: 'Method not allowed.'}, start, 405, {Allow: methods[path]});
        checkOrigin(request);
        // CF supplies this header at the edge. Missing addresses share a bounded
        // fallback bucket; caller-provided X-Forwarded-For never selects a bucket.
        const ip = request.headers.get('cf-connecting-ip');
        const address = /^[a-f0-9:.]{3,64}$/i.test(ip || '') ? ip : 'unattributed';
        release = guard.take(address, action === 'reset' ? 20 : 1);
        budget = responseBudget();
        if (action === 'instances') return json({instances: await discover(undefined, budget.reserve)}, start);
        if (action === 'reset') {
          await readText(request, 8192);
          // Coalesce directory invalidations instead of letting repeated reset
          // requests defeat its single-flight cache. Existing sessions survive.
          if (Date.now() - lastReset > 5000) { resetDirectory(); lastReset = Date.now(); }
          return json({ok: true}, start);
        }
        const input = await readInput(request, action);
        input.session = await restoreSession(input, action, url.origin, env.LOOKUP_SESSION_SECRET);
        if (!input.session) {
          // Session creation makes multiple upstream calls, including preparation.
          const charge = guard.take(address, 4); charge();
        }
        const data = action === 'prepare' ? await prepare(input, undefined, budget.reserve) : await lookup(input, action === 'suggest', undefined, budget.reserve);
        if (data.session) data.session = await signSession(data.session, action, url.origin, env.LOOKUP_SESSION_SECRET);
        return json(data, start);
      } catch (error) {
        const serviceError = error instanceof AkinatorServiceError;
        const status = error instanceof HttpError ? error.status : 502;
        // Expected service diagnostics remain inspectable. Internal exceptions
        // never disclose stack traces, secrets, URLs containing sessions or input.
        const message = error instanceof HttpError || serviceError ? error.message : 'The lookup could not finish. Try again or reconnect.';
        if (!(error instanceof HttpError) && !serviceError) console.error('Lookup failure', {kind: 'unexpected', requestId: crypto.randomUUID()});
        return json({error: message}, start, status, error.retryAfter ? {'Retry-After': String(error.retryAfter)} : {});
      } finally { budget?.release(); release?.(); }
    },
  };
}
