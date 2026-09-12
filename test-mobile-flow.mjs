// Runs the real page modules and DOM events. No browser rendering is simulated.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const {JSDOM} = await import(process.env.JSDOM_MODULE || 'jsdom');
const {default: html} = await import('./lib/ui.mjs');
const dom = new JSDOM(html, {url: 'https://lookup.test', runScripts: 'outside-only', pretendToBeVisual: true});
const w = dom.window, document = w.document;
const viewport = new w.EventTarget();
Object.assign(viewport,{height:812,width:375,offsetTop:0,scale:1});
Object.defineProperty(w,'visualViewport',{value:viewport});
const style=document.createElement('style');
style.textContent=await fs.readFile(new URL('./public/style.css',import.meta.url),'utf8');
document.head.append(style);
const failures = [];
w.addEventListener('error', event => failures.push(event.error?.message || event.message));
w.HTMLElement.prototype.scrollIntoView = function() {};
const observedCurves = new Set();
w.ResizeObserver = class { observe(node) {observedCurves.add(node);} unobserve(node) {observedCurves.delete(node);} disconnect() {observedCurves.clear();} };
w.CSS = {supports: () => false};
const calls = [], sessions = new Map(), paused = new Map();
const pause = (action, instance, q) => {
  let release;
  paused.set('/api/'+action+'|'+instance+'|'+q,new Promise(resolve=>release=resolve));
  return release;
};
let nextSession = 0;
const directory = ['1','2','13','14'].map((subject_id, index) => ({key:'en'+index,language:'en',subject_id,label:subject_id,autocomplete:true}));
for (const language of ['ar','cn','de','es','fa','fr','id','il','it','jp','kr','nl','pl','pt','ru','tr','vi']) {
  directory.push({key:language+'0',language,subject_id:'1',label:'Characters',autocomplete:true});
}
const moin = 'Khwaja Moinuddin Chishti (Sufi Saint, Indian, Muslim, Deliver a message of peace, Ajmair, religious figure)';
const polly = 'Polly (Phoenix Wright Attorney) (Talking parrot, DL6)';
let rejectNext = false;
w.fetch = async function(url, options) {
  assert.equal(this, w, 'Native Window.fetch receiver was lost');
  if (url === '/api/instances') return {ok:true,json:async()=>({instances:directory})};
  const input = JSON.parse(options.body);
  calls.push({url, ...input});
  const delayed=paused.get(url+'|'+input.instance+'|'+input.q);
  if(delayed)await delayed;
  await new Promise(resolve => setTimeout(resolve, 8));
  if (rejectNext) { rejectNext=false; return {ok:false,json:async()=>({error:'Temporary engine failure'})}; }
  let session = input.session;
  if (!session) {session={id:String(++nextSession),step:1,instance:input.instance};sessions.set(session.id,1);}
  assert.equal(session.step, sessions.get(session.id), 'Overlapping requests desynchronized the engine step');
  session={...session,step:session.step+1};sessions.set(session.id,session.step);
  if (url.endsWith('prepare')) return {ok:true,json:async()=>({session})};
  if (url.endsWith('suggest')) return {ok:true,json:async()=>({suggestions:input.q.startsWith('Pol')?[polly]:input.q.startsWith('Nar')?['Nara (Test character)']:[moin],session})};
  const name = input.q;
  const entries = [
    {id:'1',name,description:'Test description',category:'Characters',language:input.instance.startsWith('fr')?'fr':'en',instance_key:input.instance,avatar_status:'supplied',avatar_url:'https://photos.clarinea.fr/BL_15_en/600/partenaire/original.jpg',raw:{name}},
    {id:'2',name:'Pictureless match',description:'No custom image',category:'Characters',language:'en',instance_key:input.instance,avatar_status:'placeholder',avatar_url:null,default_avatar_url:'https://photos.clarinea.fr/BL_1_fr/none.jpg',raw:{name:'Pictureless match',picturePath:'none.jpg'}},
    {id:'3',name:'Unspecified match',description:'No image metadata',category:'Characters',language:'en',instance_key:input.instance,avatar_status:'unknown',avatar_url:null,raw:{name:'Unspecified match'}},
  ];
  return {ok:true,json:async()=>({entries,response:{result:{objects:entries}},session})};
};
const modules = new Map();
async function load(name) {
  name = name.split('?')[0];
  if (modules.has(name)) return modules.get(name);
  const source = await fs.readFile(new URL('./public'+name, import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source,{context:dom.getInternalVMContext(),identifier:name});
  modules.set(name,module);
  await module.link(specifier=>load(specifier));
  return module;
}
await (await load('/app.js')).evaluate();
const waitFor = async(condition,label) => {
  for(let attempt=0;attempt<150;attempt++){if(condition())return;await new Promise(r=>setTimeout(r,10));}
  throw Error('Timed out: '+label);
};
const type = text => {const query=document.getElementById('query');query.value=text;query.dispatchEvent(new w.Event('input',{bubbles:true}));};
const click = selector => {const node=document.querySelector(selector);assert.ok(node,'Missing '+selector);node.click();};
const option = value => [...document.querySelectorAll('.picker-option')].find(node=>node.dataset.value===value);
const row = name => [...document.querySelectorAll('.setting-row')].find(node=>node.querySelector('.setting-label').textContent===name);
const configure=(name,value)=>{
  click('#options');row(name).click();
  const item=option(value),body=document.getElementById('sheet-content');
  body.scrollTop=125;item.click();
  assert.equal(option(value),item,'Selection must keep the existing submenu nodes');
  assert.equal(item.getAttribute('aria-selected'),'true');
  assert.equal(body.scrollTop,125,'Selection must preserve submenu scroll position');
  assert.equal(document.getElementById('sheet-title').textContent,name);
  assert.equal(document.getElementById('sheet-layer').hidden,false);
  assert.equal(document.querySelectorAll('.picker-option[aria-selected=true]').length,1);
  click('#sheet-close');
};
await waitFor(()=>document.getElementById('connection').textContent==='Ready','initial connection');
const form=document.getElementById('searchform');
assert.equal(form.children[0].className,'search-field');
assert.equal(form.children[1].className,'dock-actions');
assert.equal(document.getElementById('search').parentElement,form.children[1]);
assert.equal(document.getElementById('options').parentElement,form.children[1]);
assert.deepEqual([...form.children[1].querySelectorAll('button')].map(b=>b.textContent),['Search','Settings']);
assert.equal(document.querySelectorAll('#scope,#scope-label,#language-label,#filter-toggle').length,0);
assert.equal(w.getComputedStyle(document.getElementById('app')).display,'grid');
assert.equal(w.getComputedStyle(document.getElementById('dock')).position,'relative');
assert.equal(w.getComputedStyle(document.getElementById('main')).contain,'paint');
assert.equal(w.getComputedStyle(document.getElementById('main')).overflowY,'auto');
const rootStyle=document.documentElement.style;
const beforeScroll=rootStyle.cssText;
for(let i=0;i<120;i++){
 viewport.offsetTop=i%40;viewport.dispatchEvent(new w.Event('scroll'));
 document.getElementById('main').scrollTop=i*60;
 document.getElementById('main').dispatchEvent(new w.Event('scroll'));
}
await new Promise(r=>setTimeout(r,35));
assert.equal(rootStyle.cssText,beforeScroll,'Scrolling must not move or resize the app shell');
viewport.height=465;viewport.dispatchEvent(new w.Event('resize'));
await waitFor(()=>rootStyle.getPropertyValue('--app-height')==='465px','keyboard resize');
viewport.height=300;viewport.scale=2;viewport.dispatchEvent(new w.Event('resize'));
await new Promise(r=>setTimeout(r,35));
assert.equal(rootStyle.getPropertyValue('--app-height'),'465px','Pinch zoom must not resize the app layout');
viewport.height=812;viewport.scale=1;viewport.offsetTop=0;viewport.dispatchEvent(new w.Event('resize'));
await waitFor(()=>rootStyle.getPropertyValue('--app-height')==='812px','keyboard dismissal');
console.log('Two-row actions, clipped result scrolling, scroll-independent shell, keyboard resize and zoom checks passed.');
assert.equal(document.querySelectorAll('select,option,dialog,details').length,0,'Native pickers or disclosures remain');
// Real input event, queued request, actual default transport, DOM suggestion click.
type('Moin');
await waitFor(()=>document.querySelector('#suggestions strong')?.textContent==='Khwaja Moinuddin Chishti','Moin suggestion');
click('#suggestions button');
await waitFor(()=>document.querySelector('.card h3')?.textContent==='Khwaja Moinuddin Chishti','selected result');
assert.equal(calls.at(-1).q,'Khwaja Moinuddin Chishti');
assert.equal(calls.at(-1).session.step,2);
const selectedCard=document.querySelector('.card');
const originalAvatar=selectedCard.querySelector('img');
assert.equal(w.getComputedStyle(originalAvatar).objectFit,'cover');
assert.equal(w.getComputedStyle(originalAvatar).width,'100%');
assert.equal(w.getComputedStyle(originalAvatar).height,'100%');
assert.equal(originalAvatar.src,'https://photos.clarinea.fr/BL_15_en/600/partenaire/original.jpg');
assert.equal(originalAvatar.hasAttribute('srcset'),false);
assert.equal(originalAvatar.loading,'eager');
click('.entry-footer button');
assert.equal(document.getElementById('sheet-title').textContent,'Khwaja Moinuddin Chishti');
click('.disclosure-button');assert.equal(document.querySelector('.data-disclosure pre').hidden,false);click('#sheet-close');
configure('Images','pictureless');assert.equal(document.querySelectorAll('.card').length,1);
const defaultImage=document.querySelector('.avatar img');
assert.equal(defaultImage.getAttribute('src'),'https://photos.clarinea.fr/BL_1_fr/none.jpg');
assert.equal(defaultImage.parentElement.dataset.imageState,'pictureless');
defaultImage.dispatchEvent(new w.Event('error'));
assert.equal(defaultImage.getAttribute('src'),'/api/placeholder?v=15','Official image failure must retain authentic Akinator art');
configure('Images','unknown');assert.equal(document.querySelectorAll('.card').length,1);
assert.equal(document.querySelector('.avatar').dataset.imageState,'unspecified');
assert.equal(document.querySelector('.avatar img').getAttribute('src'),'/assets/akinator-placeholder.svg');
configure('Images','all');assert.equal(document.querySelectorAll('.card').length,3);
assert.equal(document.querySelector('.card'),selectedCard,'Filtering must preserve decoded image and card nodes');
originalAvatar.dispatchEvent(new w.Event('error'));
assert.equal(originalAvatar.parentElement.dataset.imageState,'custom');
assert.equal(originalAvatar.getAttribute('src'),'https://photos.clarinea.fr/BL_15_en/600/partenaire/original.jpg');
assert.equal(originalAvatar.parentElement.querySelector('.avatar-retry').hidden,false);
originalAvatar.parentElement.querySelector('.avatar-retry').click();
assert.equal(originalAvatar.hidden,false);
assert.equal(originalAvatar.parentElement.querySelector('.avatar-retry').hidden,true);
// Custom sheet choices update state and preserve keyboard focus containment.
click('#options');row('Language').click();
for(const [code,name] of Object.entries({cn:'Chinese',il:'Hebrew',jp:'Japanese',kr:'Korean'})) {
  assert.equal(option(code).querySelector('.picker-name').textContent,name);
  assert.equal(option(code).querySelector('.picker-caption').textContent,code.toUpperCase());
}
assert.equal(document.querySelectorAll('.picker-option').length,18);
assert.ok([...document.querySelectorAll('.picker-name')].every(node=>node.textContent.length>2));
click('.sheet-shade');assert.equal(document.getElementById('sheet-layer').hidden,false);
option('en').focus();
option('en').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
assert.equal(document.activeElement.id,'sheet-back','Tab must stay within the custom picker');
option('fr').click();assert.equal(document.getElementById('sheet-title').textContent,'Language');
assert.equal(option('fr').getAttribute('aria-selected'),'true');
click('#sheet-back');assert.match(row('Language').textContent,/French/);
row('Language').click();option('jp').click();click('#sheet-back');assert.match(row('Language').textContent,/Japanese/);
row('Language').click();option('en').click();click('#sheet-back');
row('Images').click();option('supplied').click();click('#sheet-back');assert.match(row('Images').textContent,/Custom images/);
row('Images').click();option('all').click();click('#sheet-close');
configure('Category','en1');
click('#options');assert.match(row('Category').textContent,/Objects/);click('#sheet-close');
configure('Category','en0');
type('Polly');await waitFor(()=>document.querySelector('#suggestions strong')?.textContent==='Polly (Phoenix Wright Attorney)','Polly suggestion');click('#suggestions button');
await waitFor(()=>document.querySelector('.card h3')?.textContent==='Polly (Phoenix Wright Attorney)','Polly result');
assert.equal(calls.at(-1).q,'Polly (Phoenix Wright Attorney)');
// The first prefix response can supply useful matches while the final query waits.
const releasePrefix=pause('suggest','en0','Nar');
const releaseFull=pause('suggest','en0','Nara');
type('Nar');await waitFor(()=>calls.some(call=>call.q==='Nar'),'prefix request');
type('Nara');releasePrefix();
await waitFor(()=>document.querySelector('#suggestions strong')?.textContent==='Nara','local match from late prefix');
await waitFor(()=>calls.some(call=>call.q==='Nara'),'final query request');
click('#dismiss');releaseFull();
await new Promise(resolve=>setTimeout(resolve,40));
assert.equal(document.getElementById('suggestion-panel').hidden,true,'Late suggestions must not reopen a dismissed dropdown');
const releaseTyping=pause('suggest','en0','Speed');
type('Speed');await waitFor(()=>calls.some(call=>call.q==='Speed'&&call.url.endsWith('suggest')),'pending typing request');
click('#search');
await waitFor(()=>document.querySelector('.card h3')?.textContent==='Speed','search bypasses pending autocomplete');
const searchCount=calls.filter(call=>call.url.endsWith('search')).length;
click('#search');
await waitFor(()=>document.querySelector('.card h3')?.textContent==='Speed','cached repeat search');
assert.equal(calls.filter(call=>call.url.endsWith('search')).length,searchCount);
releaseTyping();
console.log('Late-prefix suggestions, dismissal, independent search, instant repeat cache, image coverage and source preservation passed.');
// Ordinary submission and all four categories through the custom picker.
configure('Category','all');
const releaseCategories=['en1','en2','en3'].map(instance=>pause('search',instance,'chair'));
type('chair');click('#search');
await waitFor(()=>document.querySelectorAll('.card').length===3,'first incremental category');
const incrementalCard=document.querySelector('.card');
releaseCategories.forEach(release=>release());
await waitFor(()=>document.querySelectorAll('.card').length===12,'all-category results');
assert.equal(document.querySelector('.card'),incrementalCard,'Later category results must not recreate earlier cards');
assert.equal(new Set(calls.filter(call=>call.url.endsWith('search')&&call.q==='chair').map(call=>call.instance)).size,4);
// A real request error is recoverable and never strands the controls.
configure('Category','en0');rejectNext=true;type('retry');document.getElementById('searchform').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
await waitFor(()=>!document.getElementById('error').hidden,'request failure');
document.getElementById('searchform').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
await waitFor(()=>document.querySelector('.card h3')?.textContent==='retry','retry after failure');
click('#options');[...document.querySelectorAll('#sheet-content button')].find(node=>node.textContent==='Reconnect').click();
await waitFor(()=>document.getElementById('connection').textContent==='Ready','reconnect');
assert.equal(document.getElementById('sheet-layer').hidden,false,'Reconnect must not dismiss the options sheet');
click('#sheet-close');
type('<img src=x onerror=alert(1)>');click('#search');
await waitFor(()=>document.querySelector('.card h3')?.textContent==='<img src=x onerror=alert(1)>','literal untrusted text');
assert.equal(document.querySelectorAll('.entrytext img,.entrytext script').length,0);
await new Promise(resolve=>setTimeout(resolve,0));
assert.ok([...observedCurves].every(node=>node.isConnected),'Detached cards and pickers must leave the resize observer');
assert.equal(failures.length,0,failures.join('\n'));
console.log('Real page modules passed: connection, default fetch receiver, autocomplete clicks, Moin and Polly searches, custom pickers, all categories, details, images, retry and reconnect.');
dom.window.close();
