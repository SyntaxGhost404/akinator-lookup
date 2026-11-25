import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {HttpError, parseJSON, readText, responseBudget} from './lib/http.mjs';
import {readInput, signSession, restoreSession, TrafficGuard} from './lib/security.mjs';
import {createApp} from './lib/server.mjs';
import {resetDirectory, serviceURL, parseInstances} from './lib/lookup.mjs';
import {imageURL} from './public/image-url.mjs';
import html from './lib/ui.mjs';

const origin = 'https://lookup.test';
const secret = 'a4'.repeat(32);
const env = {LOOKUP_SESSION_SECRET: secret};
const post = (path, value, headers = {}) => new Request(origin + '/api/' + path, {
  method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', ...headers},
  body: typeof value === 'string' ? value : JSON.stringify(value),
});
const input = {instance: 'test|en|1', q: 'Polly'};
for (const value of [null, [], {}, {instance: 2, q: 'OK'}, {...input, q: []}, {...input, q: 'x'}, {...input, q: 'a'.repeat(201)}, {...input, q: 'A\u0000B'}, {...input, url: 'https://evil.test'}, JSON.parse('{"instance":"test|en|1","q":"OK","__proto__":{"polluted":true}}')]) {
  await assert.rejects(() => readInput(post('search', value), 'search'), error => error.status === 400);
}
assert.equal({}.polluted, undefined);
await assert.rejects(() => readInput(post('search', input, {Origin: 'https://evil.test'}), 'search'), error => error.status === 403);
await assert.rejects(() => readInput(post('search', input, {'Sec-Fetch-Site': 'same-site'}), 'search'), error => error.status === 403);
await assert.rejects(() => readInput(post('search', input, {'Content-Type': 'text/plain'}), 'search'), error => error.status === 415);
await assert.rejects(() => readInput(post('search', input, {'Content-Encoding': 'gzip'}), 'search'), error => error.status === 415);
await assert.rejects(() => readInput(post('search', ' ' .repeat(9000)), 'search'), error => error.status === 413);
await assert.rejects(() => readInput(post('search', '{'), 'search'), error => error.status === 400);
assert.throws(() => parseJSON('['.repeat(65) + '0' + ']'.repeat(65)), SyntaxError);
assert.deepEqual(parseJSON('{"description":"[\\\"\\\"{}]"}'), {description:'[""{}]'});
let cancelled = false;
const chunked = new Response(new ReadableStream({pull(controller) { controller.enqueue(new Uint8Array(1024)); }, cancel() {cancelled = true;}}));
await assert.rejects(() => readText(chunked, 4096), error => error.status === 413);
assert.equal(cancelled, true);
const stalled = new Response(new ReadableStream({pull() {return new Promise(() => {});}}));
await assert.rejects(() => readText(stalled, 8192, 10), error => error.status === 408);
await assert.rejects(() => readText(new Response(Uint8Array.of(0xff)), 8192), error => error.status === 400);
const memoryA = responseBudget(), memoryB = responseBudget();
memoryA.reserve(6 * 1024 * 1024);
assert.throws(() => memoryB.reserve(3 * 1024 * 1024), error => error.status === 503);
memoryA.release(); memoryB.reserve(3 * 1024 * 1024); memoryB.release(); memoryB.release();

const session = {id:'issued-by-engine', step:2, instance:input.instance, base:'https://srv14.akinator.com:9620/en'};
const signed = await signSession(session, 'prepare', origin, secret);
assert.deepEqual(await restoreSession({...input, session:signed}, 'search', origin, secret), session);
for (const patch of [{id:'someone-else'}, {step:900}, {instance:'test|fr|1'}, {base:'https://127.0.0.1'}, {expires:signed.expires+1}, {lane:'search'}, {proof:'00'.repeat(32)}]) {
  await assert.rejects(() => restoreSession({...input, session:{...signed, ...patch}}, 'search', origin, secret), error => error.status === 400);
}
await assert.rejects(() => restoreSession({...input, session:signed}, 'search', 'https://another.test', secret), error => error.status === 400);
await assert.rejects(() => restoreSession({...input, session:signed}, 'search', origin, 'b4'.repeat(32)), error => error.status === 400);
const searchOnly = await signSession(session, 'search', origin, secret);
await assert.rejects(() => restoreSession({...input, session:searchOnly}, 'suggest', origin, secret), error => error.status === 400);
assert.equal(await restoreSession({...input, session}, 'search', origin, secret), undefined, 'Legacy sessions must never be trusted');
const realNow = Date.now;
Date.now = () => realNow() - 172800000;
const expired = await signSession(session, 'search', origin, secret);
Date.now = realNow;
assert.equal(await restoreSession({...input, session:expired}, 'search', origin, secret), undefined, 'Idle tokens renew without a user gate');
await assert.rejects(() => restoreSession(input, 'search', origin, undefined), error => error.status === 503);

let now = 1000;
const guard = new TrafficGuard({now:()=>now, capacity:3, refill:1, concurrent:2, maxClients:2});
const a = guard.take('a'), b = guard.take('b');
assert.throws(() => guard.take('a'), error => error.status === 503);
a(); a(); b(); assert.equal(guard.active, 0);
guard.take('a', 2)();
assert.throws(() => guard.take('a'), error => error.status === 429 && error.retryAfter === 1);
now += 1000; guard.take('a')();
assert.throws(() => guard.take('c'), error => error.status === 503);
now += 61000; guard.take('c')(); assert.equal(guard.clients.size, 1);
for (const url of ['http://srv14.akinator.com', 'https://akinator.com.evil.test', 'https://akinator.com@127.0.0.1', 'https://[::1]', 'https://srv14.akinator.com/#fragment']) assert.throws(() => serviceURL(url));
for (const url of ['javascript:alert(1)', 'data:image/svg+xml,evil', 'https://photos.clarinea.fr.evil.test/a', 'https://me:pass@photos.clarinea.fr/a', '//photos.clarinea.fr/a']) assert.equal(imageURL(url), null);
assert.equal(serviceURL(session.base).port, '9620');
assert.equal(imageURL('https://photos.clarinea.fr/BL_1_fr/full.jpg'), 'https://photos.clarinea.fr/BL_1_fr/full.jpg');
assert.throws(() => parseInstances('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>'), /Unsupported/);
console.log('Input, streaming limits, memory accounting, signed session tampering, expiry, quotas, and URL boundaries passed.');

// Exercise the complete server routing -> adapter -> upstream protocol ->
// signed session -> JSON response flow, using a controlled engine transport.
const bytes = await fs.readFile('public/assets/akinator-pictureless.webp');
const app = createApp(new Map([['/assets/akinator-pictureless.webp', {body:bytes, type:'image/webp'}]]));
const realFetch = globalThis.fetch;
const calls = [];
let queryFailures = 0, mode = '', counter = 0;
const xml = '<INSTANCES>' + ['1','2','13','14'].map(subject => `<INSTANCE><LANG_ID>en</LANG_ID><SUBJ_ID>${subject}</SUBJ_ID><SERVICE_ID>test</SERVICE_ID><TYPE_SESSION>lre</TYPE_SESSION><URL_BASE_WS2>https://srv14.akinator.com:9620</URL_BASE_WS2></INSTANCE>`).join('') + '</INSTANCES>';
globalThis.fetch = async (value, options) => {
  const url = new URL(value); calls.push(url);
  assert.equal(url.protocol, 'https:'); assert.equal(options.redirect, 'manual');
  assert.ok(['lb.elokence.com', 'srv14.akinator.com'].includes(url.hostname));
  if (url.pathname.endsWith('instances_v3.php')) return new Response(xml);
  if (url.pathname.endsWith('/game/sessions')) return Response.json({result:{sessionId:'engine-' + ++counter}});
  if (url.pathname.endsWith('/set-and-get-toplist')) return Response.json({result:{objects:[
    {baseId:7, name:'Top <b>entry</b>', description:'Most played', absolutePicturePath:'https://photos.clarinea.fr/top.jpg', ranking:3, nbPlayed:120},
    {baseId:8, name:'Hostile image', absolutePicturePath:'https://evil.test/track.png', ranking:9},
  ]}});
  if (mode === 'expired' && queryFailures++ === 0) return Response.json({type:'TIMEOUT SESSION'}, {status:422});
  if (mode === 'busy') return Response.json({message:'Busy'}, {status:429,headers:{'Retry-After':'2'}});
  if (mode === 'secret-error') return Response.json({type:'INCORRECT PARAMETER', message:url.pathname}, {status:400});
  if (mode === 'oversized') return new Response('x'.repeat(4194305));
  if (mode === 'invalid') return Response.json({unexpected:'DO-NOT-LEAK-THIS'});
  return Response.json({result:{objects:url.pathname.endsWith('/suggest-objects') ? ['Polly (Phoenix Wright Attorney) (Talking parrot, DL6)'] : [
    {baseId:1, name:'Polly', description:'Talking parrot', absolutePicturePath:'https://photos.clarinea.fr/full.jpg'},
    {baseId:2, name:'Default', picturePath:'none.jpg'}, {baseId:3, name:'Unspecified'},
  ]}});
};
try {
  resetDirectory();
  const root = await app.fetch(new Request(origin), env);
  assert.equal(await root.text(), html.replaceAll('__ASSET_VERSION__', 'dev'));
  const versioned = new Map(); versioned.version = '0a1b2c3d4e5f';
  assert.match(await (await createApp(versioned).fetch(new Request(origin), env)).text(), /\/app\.js\?v=0a1b2c3d4e5f"/);
  const hostile = new Map(); hostile.version = '"><script>alert(1)</script>';
  const hostilePage = await (await createApp(hostile).fetch(new Request(origin), env)).text();
  assert.ok(!hostilePage.includes('<script>alert') && hostilePage.includes('/app.js?v=dev"'), 'Only a hex build version reaches the page');
  const csp = root.headers.get('Content-Security-Policy');
  assert.match(csp, /script-src 'self' 'nonce-[^']+'/);
  assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
  assert.match(csp, /frame-ancestors 'self' https:\/\/chatgpt.com/);
  const rootAgain = await app.fetch(new Request(origin), env);
  assert.notEqual(rootAgain.headers.get('Content-Security-Policy'), csp);
  const placeholder = await app.fetch(new Request(origin+'/api/placeholder?v=15'), env);
  assert.equal(placeholder.headers.get('Content-Type'), 'image/webp');
  assert.deepEqual(Buffer.from(await placeholder.arrayBuffer()), bytes);
  for (const path of ['/api/nope','/.env','/.git/config','/_next/image?url=https://evil.test','/lib/lookup.mjs','/worker.mjs','/ui/store.mjs','/views/results.mjs','/lookup-ui.mjs','/public/app.js']) {
    assert.equal((await app.fetch(new Request(origin+path),env)).status, 404);
  }
  assert.equal((await app.fetch(post('instances', {}), env)).status, 405);
  assert.equal((await app.fetch(new Request(origin+'/api/search'), env)).status, 405);
  assert.equal((await app.fetch(new Request(origin, {method:'POST', body:'rsc'}), env)).status, 405);
  const beforeBad = calls.length;
  const bad = await app.fetch(post('search', {...input, q:['bad']}), env);
  assert.equal(bad.status, 400); assert.equal(calls.length, beforeBad);
  const directory = await app.fetch(new Request(origin+'/api/instances'), env);
  assert.equal((await directory.json()).instances.length, 4);
  const prepared = await app.fetch(post('prepare', {instance:input.instance}), env);
  const preparedData = await prepared.json();
  const ready = preparedData.session;
  // Preparation returns the toplist as normalized popular entries. Text stays
  // literal and only allowlisted image hosts become avatar URLs.
  assert.deepEqual(preparedData.popular.map(entry => [entry.name, entry.ranking, entry.times_played]), [['Top <b>entry</b>', 3, 120], ['Hostile image', 9, null]]);
  assert.equal(preparedData.popular[0].avatar_url, 'https://photos.clarinea.fr/top.jpg');
  assert.equal(preparedData.popular[1].avatar_url, null, 'A non-allowlisted image host never reaches the page');
  assert.ok(ready.proof); assert.equal(ready.step, 2);
  const result = await app.fetch(post('search', {...input, session:ready}), env);
  const data = await result.json();
  assert.equal(result.status, 200); assert.equal(data.session.step, 3);
  assert.deepEqual(data.entries.map(entry=>entry.avatar_status), ['supplied','placeholder','unknown']);
  assert.ok(data.response.result.objects[0].description);
  assert.match(result.headers.get('Cache-Control'), /no-store/);
  const tamperCount = calls.length;
  assert.equal((await app.fetch(post('search', {...input, session:{...data.session, step:800}}),env)).status,400);
  assert.equal(calls.length,tamperCount,'Forged sessions must not reach an engine');
  mode='expired';
  const recovered = await app.fetch(post('search', {...input,session:data.session}),env);
  const recovery = await recovered.json();
  assert.equal(recovered.status,200); assert.equal(recovery.session.step,3);
  assert.notEqual(recovery.session.id,data.session.id); assert.equal(queryFailures,2);
  mode='';
  const suggests = await app.fetch(post('suggest',input),env);
  assert.equal((await suggests.json()).suggestions[0],'Polly (Phoenix Wright Attorney) (Talking parrot, DL6)');
  mode='secret-error';
  const rejected = await app.fetch(post('search',{...input, session:recovery.session}),env);
  assert.equal(rejected.status,502);
  const rejectedText=await rejected.text(); assert.ok(!rejectedText.includes(recovery.session.id) && !rejectedText.includes(secret));
  mode='oversized';
  assert.equal((await app.fetch(post('search',input),env)).status,502);
  mode='invalid';
  const unexpected=await app.fetch(post('search',input),env);
  assert.equal(unexpected.status,502); assert.ok(!(await unexpected.text()).includes('DO-NOT-LEAK-THIS'));
  mode='';
  assert.equal((await app.fetch(post('search',input),env)).status,200,'Failed requests must release their resources');
  const epochQueries=calls.filter(url=>url.pathname.endsWith('instances_v3.php')).length;
  assert.equal((await app.fetch(post('reset',{}),env)).status,200);
  await app.fetch(new Request(origin+'/api/instances'),env);
  assert.equal(calls.filter(url=>url.pathname.endsWith('instances_v3.php')).length,epochQueries+1);
  mode='busy';
  const overloaded=await app.fetch(post('search',input),env);
  assert.equal(overloaded.headers.get('Retry-After'),'2');
  const beforeCooldown=calls.length;
  const throttled=await app.fetch(post('search',input),env);
  assert.equal(throttled.status,503);assert.equal(calls.length,beforeCooldown,'Respect an upstream Retry-After without another request');
  assert.ok(calls.every(url=>!/(?:choose|finish|award|check-object|answer)/.test(url.pathname)));
} finally {globalThis.fetch=realFetch; resetDirectory();}

// Golden digests pin the reviewed page shell and stylesheet, so any change to
// either is deliberate and re-reviewed. Update them together with the design.
const presentationHash = text => createHash('sha256').update(text.replace(/\?v=\d+/g, '?v=baseline')).digest('hex');
assert.equal(presentationHash(html), '379066583f9d75a6355fcad52e438bac3cfc9fa3046074ca01dabe54c8ad49ca');
assert.equal(presentationHash(await fs.readFile('public/style.css','utf8')), 'c785e8d6a3a7d371cbce2f78d2f9447e7f5f7591a465f13ae954e3fc49240f67');
console.log('Full HTTP flow, exact assets, hidden source paths, method guards, expiry recovery, safe diagnostics, and pinned page/style digests passed.');
