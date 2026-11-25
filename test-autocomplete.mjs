import assert from 'node:assert/strict';
import {splitSuggestion,LookupClient} from './public/lookup-ui.mjs';
assert.equal(splitSuggestion('Khwaja Moinuddin Chishti (Sufi Saint, Indian, Muslim, Deliver a message of peace, Ajmair, religious figure)').name,'Khwaja Moinuddin Chishti');
assert.deepEqual(splitSuggestion('Polly (Phoenix Wright Attorney) (Talking parrot, DL6)'),{name:'Polly (Phoenix Wright Attorney)',description:'Talking parrot, DL6',label:'Polly (Phoenix Wright Attorney) (Talking parrot, DL6)'});
assert.equal(splitSuggestion('A name (with (nested) text) (Description)').name,'A name (with (nested) text)');
let release;const calls=[];const client=new LookupClient(async(url,opts)=>{const body=JSON.parse(opts.body);calls.push({url,...body});if(calls.length===1)await new Promise(r=>release=r);return {ok:true,json:async()=>({suggestions:['Moin (Description)'],session:{id:'x',step:(body.session?.step||0)+1}})};});
let current=1;const first=client.request('suggest','characters','Mo',()=>true);await new Promise(r=>setTimeout(r,0));
const stale=client.request('suggest','characters','Moi',()=>current===1);current=2;const latest=client.request('suggest','characters','Moin',()=>current===2);
// An unrelated category must not wait behind the first category.
await client.request('suggest','animals','cat');assert.equal(calls.length,2);release();await Promise.all([first,stale,latest]);
assert.equal(calls.filter(c=>c.instance==='characters').length,2);assert.equal(calls.at(-1).q,'Moin');assert.equal(calls.at(-1).session.step,1);assert.ok(client.cached('characters','Moin'));
console.log('Selection parsing, stale request skipping, session continuity, independent categories and cache passed.');
// The browser's Window.fetch enforces its receiver. Arrow test doubles did not.
const originalFetch=globalThis.fetch;
let dispatched=0;
globalThis.fetch=function(){
 assert.equal(this,globalThis,'fetch must be invoked on its original global object');
 dispatched++;
 return Promise.resolve({ok:true,json:async()=>({suggestions:[],session:{id:'browser',step:2}})});
};
try {await new LookupClient().request('suggest','characters','Moin');assert.equal(dispatched,1);}
finally {globalThis.fetch=originalFetch;}
console.log('Default browser transport receiver regression passed.');

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const response=data=>({ok:true,json:async()=>data});
let finishSlow;
const fastCalls=[];
let serial=0;
const responsive=new LookupClient(async(url,options)=>{
 const body=JSON.parse(options.body);fastCalls.push({url,...body});
 if(url==='/api/prepare')return response({session:{id:String(++serial),step:2}});
 if(body.q==='slow')await new Promise(resolve=>finishSlow=resolve);
 return response({[url.endsWith('search')?'entries':'suggestions']:[body.q],session:{...body.session,step:body.session.step+1}});
});
await Promise.all([responsive.warm('en'),responsive.warm('en')]);
assert.equal(fastCalls.length,2,'Repeated focus must not duplicate preparation');
const slow=responsive.request('suggest','en','slow');await tick();
const fast=await responsive.request('search','en','fast');
assert.deepEqual(fast.entries,['fast'],'Search must finish before slow autocomplete');
assert.notEqual(fastCalls[2].session.id,fastCalls[3].session.id);
assert.equal(fastCalls[2].session.step,2);assert.equal(fastCalls[3].session.step,2);
finishSlow();await slow;
const networkCount=fastCalls.length;
assert.deepEqual(await responsive.request('search','en','fast'),fast);
assert.equal(fastCalls.length,networkCount,'Repeated search must avoid transport');
const clock=Date.now;
try {
 Date.now=()=>clock()+61000;
 await responsive.request('search','en','fast');
 assert.equal(fastCalls.length,networkCount+1,'Expired search must be refreshed');
 assert.equal(fastCalls.at(-1).session.step,3,'Cache hits must not advance engine steps');
} finally {Date.now=clock;}
console.log('Prepared independent sessions, no autocomplete head-of-line blocking, and search cache expiry passed.');

let finishOld;
const resetCalls=[];
const resetClient=new LookupClient(async(url,options)=>{
 const body=JSON.parse(options.body);resetCalls.push(body);
 if(body.q==='old')await new Promise(resolve=>finishOld=resolve);
 return response({suggestions:[body.q],session:{id:body.session?.id||body.q,step:(body.session?.step||1)+1}});
});
const old=resetClient.request('suggest','en','old');await tick();
resetClient.reset();
await resetClient.request('suggest','en','new');
finishOld();await old;
await resetClient.request('suggest','en','next');
assert.equal(resetCalls.at(-1).session.id,'new','Old completion must not overwrite the reconnected session');
assert.equal(resetClient.cached('en','old'),undefined,'Old completion must not repopulate cleared caches');
console.log('Reconnect bypasses old queues and rejects late state updates.');

const recoveryCalls=[];
const recovering=new LookupClient(async(url,options)=>{
 recoveryCalls.push(JSON.parse(options.body));
 if(url==='/api/prepare')throw Error('Temporary connection failure');
 return response({entries:[],session:{id:'recovered',step:3}});
});
await recovering.prepare('en','search');
await recovering.request('search','en','recover');
assert.equal(recoveryCalls.at(-1).session,undefined,'Failed preparation must leave normal bootstrap available');
console.log('Preparation failure falls back to normal session creation.');

let finishPreparation;
const earlyCalls=[];
const early=new LookupClient(async(url,options)=>{
 const body=JSON.parse(options.body);earlyCalls.push({url,...body});
 if(url==='/api/prepare'){
  await new Promise(resolve=>finishPreparation=resolve);
  return response({session:{id:'background',step:2}});
 }
 return response({entries:[],session:{id:'interactive',step:(body.session?.step||2)+1}});
});
const preparing=early.prepare('en','search');await tick();
await early.request('search','en','early');
assert.equal(earlyCalls.at(-1).session,undefined,'Early input must use ordinary bootstrap without waiting for preparation');
finishPreparation();await preparing;
await early.request('search','en','later');
assert.equal(earlyCalls.at(-1).session.id,'interactive','Late preparation must not replace the active query session');
assert.equal(earlyCalls.at(-1).session.step,3);
console.log('Slow background preparation never delays early input or replaces its session.');

// Popular entries arrive with preparation, are bounded, and clear on reconnect.
const popularClient=new LookupClient(async(url,options)=>{
 const body=JSON.parse(options.body);
 return response({session:{id:'p-'+body.instance,step:2},popular:body.instance==='none'?[]:[{name:'Top '+body.instance}]});
});
await popularClient.prepare('en','search');
assert.deepEqual(popularClient.popularFor('en'),[{name:'Top en'}]);
await popularClient.prepare('none','search');
assert.equal(popularClient.popularFor('none'),undefined,'An empty list is not cached');
for(let index=0;index<30;index++)await popularClient.prepare('c'+index,'search');
assert.equal(popularClient.popular.size,24,'At most 24 categories stay in memory');
assert.equal(popularClient.popularFor('c0'),undefined,'The oldest category is dropped first');
assert.deepEqual(popularClient.popularFor('c29'),[{name:'Top c29'}]);
let finishPopular;
const latePopular=new LookupClient(async(url,options)=>{
 await new Promise(resolve=>finishPopular=resolve);
 return response({session:{id:'late',step:2},popular:[{name:'Stale'}]});
});
const pendingPopular=latePopular.prepare('en','search');await tick();
latePopular.reset();finishPopular();await pendingPopular;
assert.equal(latePopular.popularFor('en'),undefined,'A reconnect drops popular lists that arrive late');
popularClient.reset();
assert.equal(popularClient.popular.size,0);
console.log('Popular entries: cached from preparation, bounded to 24 categories, and cleared or rejected across reconnects.');
