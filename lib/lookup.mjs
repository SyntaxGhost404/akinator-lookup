import {HttpError, parseJSON, readText} from './http.mjs';
import {imageURL} from '../public/image-url.mjs';

const domains = ['akinator.com', 'elokence.com'];
const discoveryURL = 'https://lb.elokence.com/ws/instances_v3.php';
// Sent on session creation exactly as the official client does (versionName plus
// versionCode, from the analyzed 9.1.22 build). The engine uses it for client
// compatibility; mirroring a current client keeps sessions accepted. Bump when
// a newer build is verified.
const CLIENT_VERSION = '9.1.22 (406)';

export class AkinatorServiceError extends Error {
  constructor(message, status, serviceType) {
    super(message);
    this.name = 'AkinatorServiceError';
    this.status = status;
    this.serviceType = serviceType;
  }
}

// Engine ports are supplied by the trusted directory, not fixed to 443.
// Callers cannot supply a URL: lookup resolves an instance key server-side.
export function serviceURL(value) {
  if (typeof value !== 'string' || value.length > 4096) throw Error('Unsupported Akinator service address.');
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.hash ||
      !domains.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) {
    throw Error('Unsupported Akinator service address: ' + u.origin);
  }
  return u;
}
function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, x) => {
      if (x[0] !== '#') return ({amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"}[x.toLowerCase()]);
      const code = x[1].toLowerCase() === 'x' ? parseInt(x.slice(2), 16) : Number(x.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
    });
}
function field(xml, tag) {
  return decode(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>').exec(xml)?.[1] || '').trim();
}
function pictureVariants(photo) {
  if (!photo) return [];
  const variants = [photo];
  try {
    const u = new URL(photo), idx = u.pathname.lastIndexOf('.');
    if (idx >= 0) for (const tail of ['@2x', '_end_game@2x']) {
      const v = new URL(photo);
      v.pathname = u.pathname.slice(0, idx) + tail + u.pathname.slice(idx);
      variants.push(v.href);
    }
  } catch { /* Missing/invalid category art must not disable discovery. */ }
  return variants;
}
export function parseInstances(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Unsupported instance XML.');
  const items = [];
  for (const match of xml.matchAll(/<INSTANCE(?:\s[^>]*)?>([\s\S]*?)<\/INSTANCE>/g)) {
    const n = match[1], language = field(n, 'LANG_ID'), subject = field(n, 'SUBJ_ID'), service = field(n, 'SERVICE_ID');
    if (![language, subject, service].every(value => /^[a-z0-9_-]{1,64}$/i.test(value))) continue;
    if (items.length >= 1000) throw Error('Instance directory exceeds the size limit.');
    const primary = field(n, 'URL_BASE_WS2');
    const candidates = [...field(n, 'CANDIDATS').matchAll(/<URL(?:\s[^>]*)?>([\s\S]*?)<\/URL>/g)].map(x => decode(x[1]).trim());
    const endpoints = [];
    for (const raw of [primary, ...candidates]) {
      if (!raw) continue;
      try {
        // slf.a appends the language for lre session engines, including candidates.
        let base = raw.replace(/\/+$/, '');
        if (field(n, 'TYPE_SESSION').startsWith('lre')) base += '/' + encodeURIComponent(language);
        const url = serviceURL(base);
        if (url.search || /%(?:2e|2f|5c)/i.test(url.pathname) || url.pathname.includes('\\')) throw Error('Invalid engine base.');
        if (!endpoints.includes(base)) endpoints.push(base);
      } catch (e) {
        console.warn('Ignoring unsupported discovery endpoint', service);
      }
    }
    if (!endpoints.length) continue;
    items.push({key: service + '|' + language + '|' + subject, service_id: service,
      subject_id: subject, language,
      label: field(n, 'TRANSLATED_SUBJECT_NAME') || field(n, 'SUBJ_LABEL') || 'Subject ' + subject,
      base_url: endpoints[0], endpoints, base_id: field(n, 'BASE_LOGIQUE_ID'),
      placeholders: pictureVariants(field(n, 'SUBJ_PICTURE_URL')),
      autocomplete: ![...field(n, 'CAPS_DISABLED').matchAll(/<CAP>(.*?)<\/CAP>/g)].some(x => x[1] === 'soundlikes_completion')});
  }
  if (!items.length) throw Error('Akinator returned no usable category instances.');
  return items;
}
const cooldowns = new Map();
async function upstream(url, fields, deadline = Infinity, reserve) {
  const address = serviceURL(url);
  for (const [key, until] of cooldowns) if (until <= Date.now()) cooldowns.delete(key);
  const waiting = cooldowns.get(address.origin);
  if (waiting) throw new HttpError(503, 'The Akinator engine is busy. Try again shortly.', Math.max(1, Math.ceil((waiting - Date.now()) / 1000)));
  const body = fields ? new FormData() : undefined;
  if (body) for (const [k, v] of Object.entries(fields)) body.set(k, String(v));
  const timeout = Math.min(15000, deadline - Date.now());
  if (timeout <= 0) throw new HttpError(504, 'The connection timed out. Try again.');
  let r;
  try {
    r = await fetch(url, {method: body ? 'POST' : 'GET', body, headers: {Accept:'application/json'},
      redirect:'manual', signal:AbortSignal.timeout(timeout)});
  } catch {
    throw Error('Could not reach the Akinator engine at ' + new URL(url).origin + '.');
  }
  const text = await readText(r, 4194304, Math.min(timeout, Math.max(1, deadline - Date.now())), 502, reserve);
  if (!r.ok) {
    const stage = new URL(url).pathname.endsWith('/game/sessions') ? 'start-session' : new URL(url).pathname.split('/').pop();
    let explanation = '', serviceType;
    try {
      const obj = parseJSON(text), detail = obj.detail ?? obj.errors ?? obj.error ?? obj.message;
      serviceType = typeof obj.type === 'string' ? obj.type : undefined;
      explanation = Array.isArray(detail) ? detail.map(x => [x.loc?.join('.'),x.msg ?? x.message].filter(Boolean).join(': ')).join('; ') : typeof detail === 'string' ? detail : JSON.stringify(detail ?? obj);
    } catch { explanation = text.replace(/<[^>]*>/g,' ').trim(); }
    // Preserve server validation feedback; never include session IDs in the stage.
    // An upstream diagnostic can echo its request. Keep useful validation
    // messages but remove this operation's session ID before returning it.
    const sessionId = /\/game\/sessions\/([^/]+)/.exec(new URL(url).pathname)?.[1];
    if (sessionId) for (const id of new Set([sessionId, decodeURIComponent(sessionId)])) explanation = explanation.split(id).join('[session]');
    const error = new AkinatorServiceError('Akinator ' + stage + ' rejected the request (HTTP ' + r.status + '): ' + explanation.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0,600), r.status, serviceType);
    if (r.status === 429 || r.status === 503) {
      const retry = r.headers.get('retry-after');
      const seconds = /^\d+$/.test(retry || '') ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
      error.retryAfter = Math.min(60, Math.max(1, Math.ceil(Number.isFinite(seconds) ? seconds : 2)));
      if (cooldowns.size >= 128) cooldowns.delete(cooldowns.keys().next().value);
      cooldowns.set(address.origin, Date.now() + error.retryAfter * 1000);
    }
    throw error;
  }
  return text;
}
let directory, directoryPending, directoryEpoch = 0;
export async function discover(send = upstream, reserve) {
  if (send === upstream && directory && Date.now() - directory.time < 300000) return directory.items;
  if (send === upstream && directoryPending) return directoryPending;
  const query = new URLSearchParams({media_id:'13', footprint:'82de69085436aba8a6f6b37c0d5c8a1e', code_pays:'GB', mode:'https'});
  const epoch = directoryEpoch;
  const pending = (async () => {
    const items = parseInstances(await send(discoveryURL + '?' + query, undefined, Infinity, reserve));
    if (send === upstream && epoch === directoryEpoch) directory = {time:Date.now(), items};
    return items;
  })();
  if (send !== upstream) return pending;
  directoryPending = pending;
  try { return await pending; }
  finally { if (directoryPending === pending) directoryPending = undefined; }
}
export function resetDirectory() { directoryEpoch++; directory = undefined; directoryPending = undefined; }
export function normalize(e, i) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw Error('Unexpected search entry schema.');
  const present = 'absolutePicturePath' in e || 'absolute_picture_path' in e;
  const p = e.absolutePicturePath ?? e.absolute_picture_path;
  const relativePresent = 'picturePath' in e || 'picture_path' in e;
  const relative = e.picturePath ?? e.picture_path;
  // The live search DTO also uses this shared image for absent uploads,
  // independently of the current category's own theme artwork.
  const officialDefault = 'https://photos.clarinea.fr/BL_1_fr/none.jpg';
  const sharedPlaceholder = p === officialDefault || relative === 'none.jpg';
  const status = sharedPlaceholder || i.placeholders.includes(p) ? 'placeholder'
    : present ? p == null || p === '' ? 'missing' : 'supplied'
    : relativePresent && (relative == null || relative === '') ? 'missing' : 'unknown';
  const avatar_url = imageURL(p);
  return {id:String(e.baseId ?? e.id_base ?? ''), name:String(e.name ?? ''), description:String(e.description ?? ''),
    avatar_status:status, avatar_url:status === 'supplied' ? avatar_url : null, picture_path:p,
    default_avatar_url:['missing','placeholder'].includes(status) ? status === 'placeholder' && avatar_url ? avatar_url : officialDefault : null,
    category:i.label, instance_key:i.key, language:i.language, raw:e};
}
// Toplist entries share the search entry shape and add ranking metadata the
// search DTO does not carry. Values absent or non-numeric become null.
export function normalizeToplist(e, i) {
  const number = value => { const n = Number(value); return value != null && value !== '' && Number.isFinite(n) ? n : null; };
  return {...normalize(e, i), ranking: number(e.ranking), times_played: number(e.nbPlayed)};
}
async function jsonRequest(url, fields, send) {
  let obj;
  try { obj = parseJSON(await send(url, fields)); }
  catch (e) { if (e instanceof SyntaxError) throw Error('Akinator returned an unsupported response format.'); throw e; }
  if (!obj?.result || typeof obj.result !== 'object' || Array.isArray(obj.result)) {
    console.error('Unsupported Akinator response schema');
    throw Error('Akinator returned an error. Reconnect to create a new session.');
  }
  return obj;
}
async function readySession(input, i, send) {
  let session = input.session;
  if (session && (typeof session.id !== 'string' || !session.id || session.id.length > 512 || ['.', '..'].includes(session.id) ||
      !Number.isSafeInteger(session.step) || session.step < 1 || session.step >= Number.MAX_SAFE_INTEGER || session.instance !== i.key ||
      !i.endpoints.includes(session.base))) throw Error('Invalid or outdated session. Please reconnect.');
  let toplist = null;
  if (!session) {
    let lastError;
    // Primary first, then the candidates advertised by slf's instance directory.
    for (const base of i.endpoints) {
      try {
        const result = (await jsonRequest(base + '/game/sessions', {queue_prio:0, partner_id:410,
          device_id:crypto.randomUUID(), session_prio:0, client_version:CLIENT_VERSION,
          sensitivity_mode:1, learning_mode:0, origin:'GB', ft_hard_constraint:"ETAT<>'AV'"}, send)).result;
        if (typeof result.sessionId !== 'string' || !result.sessionId || result.sessionId.length > 512 || ['.', '..'].includes(result.sessionId)) throw Error('Akinator did not create a usable session.');
        session = {id:result.sessionId, step:1, instance:i.key, base};
        break;
      } catch (e) { lastError = e; }
    }
    if (!session) throw lastError || Error('No Akinator engine is available for this category.');
    // APK: kjf.getObjectsWithListSize -> zl sets the alternative list before
    // the search UI opens. A new questioning session rejects search with 422.
    // The toplist it returns is the category's most-selected entries, which the
    // lookup surfaces as a browse list instead of discarding. `size` is a list
    // length the client chooses: the official app asks for 1, 15 or 50.
    const top = await jsonRequest(session.base + '/game/sessions/' + encodeURIComponent(session.id) + '/set-and-get-toplist',
      {queue_prio:0, step:session.step, size:25, add_question_mode:0, trappable_user:0}, send);
    if (Array.isArray(top.result.objects)) toplist = top.result.objects;
    session = {...session, step:session.step + 1};
  }
  return {session, toplist};
}
export async function prepare(input, send = upstream, reserve) {
  const i = (await discover(send, reserve)).find(i => i.key === input.instance);
  if (!i) throw Error('Select an available category.');
  const deadline = Date.now() + 45000;
  const transport = send === upstream ? (url, fields) => upstream(url, fields, deadline, reserve) : send;
  const {session, toplist} = await readySession(input, i, transport);
  return {session, popular: toplist ? toplist.map(e => normalizeToplist(e, i)) : []};
}
export async function lookup(input, suggest = false, send = upstream, reserve) {
  const q = typeof input.q === 'string' ? input.q.trim() : '';
  if (q.length < 2 || q.length > 200) throw Error('Enter between 2 and 200 characters.');
  const i = (await discover(send, reserve)).find(i => i.key === input.instance);
  if (!i) throw Error('Select an available category.');
  if (suggest && !i.autocomplete) return {suggestions:[], disabled:true};
  const deadline = Date.now() + 45000;
  if (send === upstream) send = (url, fields) => upstream(url, fields, deadline, reserve);
  let {session} = await readySession(input, i, send);
  const query = () => {
    const p = {queue_prio:'0', step:String(session.step), name:q};
    // Keep the successful engine for the entire session, as kjf does in the APK.
    const base = session.base + '/game/sessions/' + encodeURIComponent(session.id);
    return suggest
      ? jsonRequest(base + '/suggest-objects?' + new URLSearchParams({...p, nb_items:'5'}), undefined, send)
      : jsonRequest(base + '/set-and-get-searchlist', p, send);
  };
  let obj;
  try { obj = await query(); }
  catch (error) {
    // The engine signals an expired session with HTTP 422. The official client
    // renews on any 422; we renew on the explicit timeout type or a 422 that
    // carries no deliberate error type, but defer to an explicit non-timeout
    // signal (e.g. a parameter rejection) so a real error still surfaces.
    const expired = error instanceof AkinatorServiceError &&
      (error.serviceType === 'TIMEOUT SESSION' || (error.status === 422 && !error.serviceType));
    if (!expired) throw error;
    // Recover inside this request once, with a new independent session. This
    // avoids another browser round trip and returns the correct new engine step.
    ({session} = await readySession({instance:i.key}, i, send));
    obj = await query();
  }
  const entries = obj.result.objects;
  if (!Array.isArray(entries)) {
    console.error('Unsupported Akinator objects schema');
    throw Error('Akinator returned an unsupported search response. Reconnect and retry.');
  }
  session = {...session, step:session.step + 1};
  if (suggest) {
    if (entries.some(e => typeof e !== 'string')) throw Error('Unsupported autocomplete response.');
    return {suggestions:entries, session};
  }
  return {entries:entries.map(e => normalize(e, i)), response:obj, instance:i, complete_database:false, session};
}
