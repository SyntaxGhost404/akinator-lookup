import assert from 'node:assert/strict';
import {parseInstances,normalize,lookup,prepare,serviceURL,resetDirectory,AkinatorServiceError} from './lib/lookup.mjs';
const xml='<RESULT><INSTANCE><SERVICE_ID>test</SERVICE_ID><LANG_ID>en</LANG_ID><SUBJ_ID>1</SUBJ_ID><SUBJ_LABEL>Characters</SUBJ_LABEL><TYPE_SESSION>lre</TYPE_SESSION><URL_BASE_WS2>https://test.akinator.com</URL_BASE_WS2><SUBJ_PICTURE_URL>https://assets-mobile.akinator.com/default.png</SUBJ_PICTURE_URL></INSTANCE></RESULT>';
const [i]=parseInstances(xml);assert.equal(i.base_url,'https://test.akinator.com/en');assert.equal(normalize({absolutePicturePath:''},i).avatar_status,'missing');assert.equal(normalize({},i).avatar_status,'unknown');assert.equal(normalize({absolutePicturePath:i.placeholders[1]},i).avatar_status,'placeholder');assert.throws(()=>serviceURL('https://evil.example/'));
const calls=[];const fake=async(url,fields)=>{calls.push({url,fields});if(url.includes('instances_v3'))return xml;if(url.endsWith('/game/sessions'))return JSON.stringify({result:{sessionId:'test'}});return JSON.stringify({result:{objects:url.includes('suggest-objects')?['Test']:[{name:'Test',absolutePicturePath:'',baseId:'3'}]}});};
const a=await lookup({q:'Te',instance:i.key},true,fake);assert.equal(a.session.step,3);
const b=await lookup({q:'Test',instance:i.key,session:a.session},false,fake);assert.equal(b.session.step,4);assert.equal(calls.at(-1).fields.step,'3');assert.equal(b.entries[0].avatar_status,'missing');console.log('Hosted adapter: routing, image evidence, session handoff, and request encoding passed.');
// Regression: actual discovery engine uses HTTPS on port 9620.
assert.equal(serviceURL('https://srv14.akinator.com:9620/').port,'9620');
const portXML=xml.replace('https://test.akinator.com','https://srv14.akinator.com:9620');
assert.equal(parseInstances(portXML)[0].base_url,'https://srv14.akinator.com:9620/en');
const candidatesXML=portXML.replace('</INSTANCE>','<CANDIDATS><URL>https://srv15.akinator.com:9621</URL></CANDIDATS></INSTANCE>');
assert.equal(parseInstances(candidatesXML)[0].endpoints[1],'https://srv15.akinator.com:9621/en');
const noPrimary=candidatesXML.replace(/<URL_BASE_WS2>.*?<\/URL_BASE_WS2>/,'');
assert.equal(parseInstances(noPrimary)[0].base_url,'https://srv15.akinator.com:9621/en');
const mixedXML=candidatesXML.replace('</RESULT>',xml.replace('<RESULT>','').replace('https://test.akinator.com','https://not-an-engine.example'));
assert.equal(parseInstances(mixedXML).length,1);
const fallbackCalls=[];const fallback=async(url,fields)=>{fallbackCalls.push(url);if(url.includes('instances_v3'))return candidatesXML;if(url.includes('srv14.akinator.com'))throw Error('Engine down');if(url.endsWith('/game/sessions'))return JSON.stringify({result:{sessionId:'fallback'}});return JSON.stringify({result:{objects:['Test']}});};
const f=await lookup({instance:i.key,q:'Test'},true,fallback);assert.equal(f.session.base,'https://srv15.akinator.com:9621/en');assert.ok(fallbackCalls.at(-1).startsWith(f.session.base));
await assert.rejects(()=>lookup({instance:i.key,q:'Test',session:{...f.session,base:'https://attacker.example'}},true,fallback));
console.log('Regression checks passed: advertised ports, candidate order, missing primary, unrelated invalid instance, and pinned session engine.');

assert.ok(calls[2].url.endsWith('/set-and-get-toplist'));assert.equal(calls[2].fields.step,1);assert.ok(calls[3].url.includes('suggest-objects'));console.log('Search-stage transition precedes autocomplete.');

const pictureless={name:"Breaking Bad - GTAV Series",picturePath:"none.jpg",absolutePicturePath:"https://photos.clarinea.fr/BL_1_fr/none.jpg"};assert.equal(normalize(pictureless,i).avatar_status,"placeholder");assert.equal(normalize(pictureless,i).avatar_url,null);console.log("Live shared-placeholder regression passed.");

// Preparation enters exactly the same search stage without submitting a query.
calls.length=0;
const warmed=await prepare({instance:i.key},fake);
assert.equal(warmed.session.step,2);
assert.equal(calls.length,3);
assert.ok(calls.at(-1).url.endsWith('/set-and-get-toplist'));
// Preparation surfaces the category's toplist as browsable popular entries.
assert.ok(Array.isArray(warmed.popular)&&warmed.popular.length===1);
assert.equal(warmed.popular[0].name,'Test');assert.equal(warmed.popular[0].ranking,null);
const originalImageTop='https://photos.clarinea.fr/BL_15_en/600/partenaire/original.jpg';
const rankingFake=async(url,fields)=>{if(url.includes('instances_v3'))return xml;if(url.endsWith('/game/sessions'))return JSON.stringify({result:{sessionId:'t'}});if(url.includes('set-and-get-toplist'))return JSON.stringify({result:{objects:[{baseId:'9',name:'Popular One',description:'d',absolutePicturePath:originalImageTop,ranking:1,nbPlayed:4210,awardId:7},{baseId:'10',name:'Popular Two',description:'',absolutePicturePath:'',ranking:2,nbPlayed:0}]}});return JSON.stringify({result:{objects:[]}});};
const popularPrep=await prepare({instance:i.key},rankingFake);
assert.equal(popularPrep.popular.length,2);
assert.deepEqual(popularPrep.popular.map(e=>[e.name,e.ranking,e.times_played]),[['Popular One',1,4210],['Popular Two',2,0]]);
assert.equal(popularPrep.popular[0].raw.awardId,7,'Every returned field stays inspectable');
assert.equal(popularPrep.popular[0].avatar_status,'supplied');assert.equal(popularPrep.popular[0].avatar_url,originalImageTop);
assert.equal(popularPrep.popular[1].avatar_status,'missing');
await lookup({instance:i.key,q:'Test',session:warmed.session},false,fake);
assert.equal(calls.filter(call=>call.url.endsWith('/game/sessions')).length,1);
assert.equal(calls.filter(call=>call.url.endsWith('/set-and-get-toplist')).length,1);
assert.equal(calls.at(-1).fields.step,'2');
const originalImage='https://photos.clarinea.fr/BL_15_en/600/partenaire/original.jpg';
assert.equal(normalize({absolutePicturePath:originalImage},i).avatar_url,originalImage);
console.log('Prepared session reuse and unmodified source image URL passed.');

const officialDefault='https://photos.clarinea.fr/BL_1_fr/none.jpg';
assert.equal(normalize({picturePath:'none.jpg'},i).avatar_status,'placeholder');
assert.equal(normalize({picturePath:'none.jpg'},i).default_avatar_url,officialDefault);
assert.equal(normalize({absolutePicturePath:''},i).default_avatar_url,officialDefault);
assert.equal(normalize({},i).default_avatar_url,null);
assert.equal(normalize({absolutePicturePath:originalImage},i).default_avatar_url,null);
assert.equal(normalize({absolutePicturePath:'https://photos.clarinea.fr/uploads/none.jpg'},i).avatar_status,'supplied','A filename in an upload directory must not be mistaken for the official default');
assert.equal(normalize({absolutePicturePath:i.placeholders[0]},i).default_avatar_url,i.placeholders[0]);
console.log('Explicit defaults, empty fields, absent metadata and custom URLs remain distinct.');

// Exercise the actual HTTP error parser, bootstrap, retry, and returned step.
const originalFetch=globalThis.fetch;
const recoveryCalls=[];
let errorType='TIMEOUT SESSION',failEveryQuery=false,errorStatus=422,errorBody=null;
globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),fields=options.body?Object.fromEntries(options.body.entries()):Object.fromEntries(u.searchParams);
  recoveryCalls.push({path:u.pathname,fields});
  if(u.pathname.endsWith('instances_v3.php'))return new Response(xml);
  if(u.pathname.endsWith('/game/sessions'))return Response.json({result:{sessionId:'renewed'}});
  if(u.pathname.endsWith('/set-and-get-toplist'))return Response.json({result:{objects:[]}});
  if(u.pathname.includes('/expired/')||failEveryQuery)return Response.json(errorBody??{type:errorType},{status:errorStatus});
  return Response.json({result:{objects:u.pathname.endsWith('/suggest-objects')?['Polly (Description)']:[{name:'Polly',absolutePicturePath:officialDefault}]}});
};
const expired={id:'expired',instance:i.key,base:i.base_url,step:17};
try {
  for(const suggest of [false,true]){
    resetDirectory();recoveryCalls.length=0;
    const recovered=await lookup({instance:i.key,q:'Polly',session:expired},suggest);
    assert.equal(recovered.session.id,'renewed');assert.equal(recovered.session.step,3);
    assert.equal(recoveryCalls.filter(c=>c.path.endsWith('/game/sessions')).length,1);
    assert.equal(recoveryCalls.filter(c=>c.path.endsWith('/set-and-get-toplist')).length,1);
    // The official client sends its versionName and versionCode on session creation.
    assert.equal(recoveryCalls.find(c=>c.path.endsWith('/game/sessions')).fields.client_version,'9.1.22 (406)');
    assert.equal(recoveryCalls.at(-1).fields.step,'2');assert.equal(recoveryCalls.at(-1).fields.name,'Polly');
    const next=await lookup({instance:i.key,q:'Polly',session:recovered.session},suggest);
    assert.equal(next.session.step,4);
    assert.equal(recoveryCalls.at(-1).fields.step,'3');
  }
  // A 422 whose body carries no deliberate error type is treated as an expired
  // session and recovered once, matching the official client's broad 422 handling.
  for(const body of [{detail:'session expired'},{type:''},{}]){
    resetDirectory();recoveryCalls.length=0;errorBody=body;
    const recovered=await lookup({instance:i.key,q:'Polly',session:expired},false);
    assert.equal(recovered.session.id,'renewed','Untyped 422 must renew the session');
    assert.equal(recoveryCalls.filter(c=>c.path.endsWith('/game/sessions')).length,1);
  }
  errorBody=null;
  recoveryCalls.length=0;failEveryQuery=true;
  await assert.rejects(()=>lookup({instance:i.key,q:'Polly',session:expired}),error=>error instanceof AkinatorServiceError&&error.serviceType==='TIMEOUT SESSION');
  assert.equal(recoveryCalls.filter(c=>c.path.endsWith('/game/sessions')).length,1,'Recovery must stop after one renewal');
  recoveryCalls.length=0;errorType='INCORRECT PARAMETER';
  await assert.rejects(()=>lookup({instance:i.key,q:'Polly',session:expired}),/INCORRECT PARAMETER/);
  assert.equal(recoveryCalls.filter(c=>c.path.endsWith('/game/sessions')).length,0,'Explicit non-timeout 422 must not trigger renewal');
  // A non-422 service error is surfaced immediately without a session renewal.
  recoveryCalls.length=0;errorStatus=400;errorType='TECHNICAL ERROR';
  await assert.rejects(()=>lookup({instance:i.key,q:'Polly',session:expired}),/TECHNICAL ERROR/);
  assert.equal(recoveryCalls.filter(c=>c.path.endsWith('/game/sessions')).length,0,'Non-422 errors must not trigger renewal');
  errorStatus=422;errorType='TIMEOUT SESSION';
} finally {globalThis.fetch=originalFetch;resetDirectory();}
console.log('HTTP 422 session expiry (typed and untyped) recovers once, preserves steps, sends client_version, and leaves explicit and non-422 errors intact.');
