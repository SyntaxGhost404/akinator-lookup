// Loopback-only development for the same built Fetch handler. The production
// Worker uses the Sites secret; this one-process key never leaves local memory.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import './build.mjs';
const worker = (await import('../dist/server/index.js')).default;
const env = {LOOKUP_SESSION_SECRET: randomBytes(32).toString('hex')};
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://127.0.0.1:5173');
    if (url.origin !== 'http://127.0.0.1:5173' || incoming.headers.host !== '127.0.0.1:5173') {
      outgoing.writeHead(403); outgoing.end(); return;
    }
    const request = new Request(url, {method: incoming.method, headers: incoming.headers,
      ...(!['GET', 'HEAD'].includes(incoming.method) ? {body: Readable.toWeb(incoming), duplex: 'half'} : {})});
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing); else outgoing.end();
  } catch { outgoing.writeHead(500); outgoing.end(); }
});
server.headersTimeout = 5000; server.requestTimeout = 10000;
server.listen(5173, '127.0.0.1', () => console.log('Lookup preview: http://127.0.0.1:5173'));
