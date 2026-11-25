// Keep Akinator's service codes intact. Several are country-style aliases,
// so browser Intl data alone cannot label the supported directory reliably.
const languageNames = {
  ar:'Arabic', cn:'Chinese', de:'German', en:'English', es:'Spanish', fa:'Persian',
  fr:'French', id:'Indonesian', il:'Hebrew', it:'Italian', jp:'Japanese', kr:'Korean',
  nl:'Dutch', pl:'Polish', pt:'Portuguese', ru:'Russian', tr:'Turkish', vi:'Vietnamese',
};
export function languageName(code) {
  const key=String(code).toLowerCase();
  if(languageNames[key])return languageNames[key];
  try {
    const label=new Intl.DisplayNames(['en'],{type:'language',fallback:'none'}).of(key);
    if(label&&label.toLowerCase()!==key)return label;
  } catch {}
  return 'Language unavailable';
}

// Suggestions are display labels: preserve the name's own parenthetical groups.
export function splitSuggestion(label) {
 const text=String(label).trim();let depth=0;
 if(text.endsWith(')'))for(let i=text.length-1;i>=0;i--){
  if(text[i]===')')depth++;else if(text[i]==='('&&!--depth){
   if(i>0&&/\s/.test(text[i-1]))return {name:text.slice(0,i).trim(),description:text.slice(i+1,-1),label:text};
   break;
  }
 }
 return {name:text,description:'',label:text};
}
export class LookupClient {
  // Keep the native fetch receiver intact. Each operation owns a separate
  // engine session, so a submitted search never waits for typing suggestions.
  constructor(send=(...args)=>globalThis.fetch(...args)) {
    this.send=send; this.sessions=new Map(); this.queues=new Map();
    this.warming=new Map(); this.cache=new Map(); this.cacheBytes=0; this.epoch=0;
    this.popular=new Map();
  }
  async transport(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
      const response = await this.send(url, {...options, signal: controller.signal});
      const data = await response.json();
      if (!response.ok) throw Error(data?.error || 'The lookup could not finish. Try again.');
      return data;
    } finally { clearTimeout(timer); }
  }
  directory() { return this.transport('/api/instances', {cache: 'no-store'}); }
  reset() {
    this.epoch++; this.sessions.clear(); this.queues.clear(); this.warming.clear();
    this.cache.clear(); this.cacheBytes=0; this.popular.clear();
  }
  cacheKey(action,instance,q) { return action+'\0'+instance+'\0'+q.trim().toLowerCase(); }
  forget(key) {
    const item=this.cache.get(key);
    if(item){this.cacheBytes-=item.bytes;this.cache.delete(key);}
  }
  readCache(action,instance,q) {
    const key=this.cacheKey(action,instance,q), item=this.cache.get(key);
    if(!item)return;
    if(item.expires<=Date.now()){this.forget(key);return;}
    this.cache.delete(key);this.cache.set(key,item);
    return item.data;
  }
  remember(action,instance,q,data) {
    const key=this.cacheKey(action,instance,q), bytes=JSON.stringify(data).length*2;
    this.forget(key);
    // Bounded tab memory only. Repeated searches stay fresh for one minute.
    if(bytes>3*1024*1024)return;
    this.cache.set(key,{action,instance,data,bytes,expires:Date.now()+(action==='search'?60000:300000)});
    this.cacheBytes+=bytes;
    while(this.cache.size>150||this.cacheBytes>3*1024*1024)this.forget(this.cache.keys().next().value);
  }
  prepare(instance, lane) {
    const key=instance+'\0'+lane, epoch=this.epoch;
    if(this.sessions.has(key))return Promise.resolve();
    if(this.warming.has(key))return this.warming.get(key);
    // Preparation never holds up real input. If it is still in flight, a real
    // query uses the usual bootstrap path rather than waiting an extra round trip.
    const pending=Promise.resolve().then(async()=>{
      if(epoch!==this.epoch||this.sessions.has(key)||this.queues.has(key))return;
      const {session,popular}=await this.transport('/api/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instance})});
      if(epoch===this.epoch&&Array.isArray(popular)&&popular.length)this.rememberPopular(instance,popular);
      if(session&&epoch===this.epoch&&!this.sessions.has(key)&&!this.queues.has(key))this.sessions.set(key,session);
    }).catch(()=>null).finally(()=>{
      if(this.warming.get(key)===pending)this.warming.delete(key);
    });
    this.warming.set(key,pending);
    return pending;
  }
  warm(instance, autocomplete=true) {
    return Promise.all([this.prepare(instance,'search'),...(autocomplete?[this.prepare(instance,'suggest')]:[])]);
  }
  // Each category's popular entries arrive with preparation. Tab memory only,
  // at most 24 categories, cleared on reconnect.
  rememberPopular(instance,list) {
    this.popular.delete(instance);this.popular.set(instance,list);
    while(this.popular.size>24)this.popular.delete(this.popular.keys().next().value);
  }
  popularFor(instance) { return this.popular.get(instance); }
  request(action,instance,q,isCurrent=()=>true) {
    if(!isCurrent())return Promise.resolve(null);
    const cached=this.readCache(action,instance,q);
    if(cached!==undefined)return Promise.resolve(cached);
    return this.enqueue(action,instance,q,isCurrent);
  }
  enqueue(action,instance,q,isCurrent) {
    const epoch=this.epoch, key=instance+'\0'+action;
    const run=async()=>{
      if(epoch!==this.epoch||!isCurrent())return null;
      const cached=this.readCache(action,instance,q);
      if(cached!==undefined)return cached;
      try {
        const {session,...data}=await this.transport('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instance,q,session:this.sessions.get(key)})});
        // In-flight requests finish even when their query becomes stale.
        if(epoch===this.epoch){
          if(session)this.sessions.set(key,session);
          this.remember(action,instance,q,data);
        }
        return data;
      } catch(error) {
        // A failed transport can leave the engine step uncertain.
        if(epoch===this.epoch)this.sessions.delete(key);
        throw error;
      }
    };
    const pending=(this.queues.get(key)||Promise.resolve()).then(run,run);
    const settled=pending.catch(()=>{}).finally(()=>{
      if(this.queues.get(key)===settled)this.queues.delete(key);
    });
    this.queues.set(key,settled);
    return pending;
  }
  cached(instance,q) { return this.readCache('suggest',instance,q)?.suggestions; }
  local(instance,q) {
    const needle=q.toLowerCase(), names=new Set();
    for(const [key,item] of this.cache){
      if(item.expires<=Date.now()){this.forget(key);continue;}
      if(item.action==='suggest'&&item.instance===instance)for(const label of item.data.suggestions||[])if(label.toLowerCase().includes(needle))names.add(label);
    }
    return [...names].slice(0,10);
  }
}
