import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/updates.js',import.meta.url),'utf8');
function release(version='0.3.16'){
 const tag=`v${version}`;return{tag_name:tag,draft:false,prerelease:false,assets:['chrome','firefox'].map(browser=>({name:`pecta-mode-${version}-${browser}.zip`,state:'uploaded',size:100,browser_download_url:`https://github.com/bogdanhpk/Pecta/releases/download/${tag}/pecta-mode-${version}-${browser}.zip`}))};
}
function environment({browser='chrome',version='0.3.15',stored,fetchImpl}={}){
 const data=stored||{},requests=[];let timestamp=1700000000000;
 const api={runtime:{getManifest:()=>({version,...(browser==='firefox'?{browser_specific_settings:{gecko:{id:'access-probe@pecta.local'}}}:{})})},storage:{local:{get:async()=>data,set:async value=>Object.assign(data,value)}}};
 const context=vm.createContext({setTimeout,clearTimeout,AbortController,TextDecoder});vm.runInContext(source,context);
 const service=context.createPectaUpdateService(api,{now:()=>timestamp,fetchImpl:async(...args)=>{requests.push(args);return fetchImpl?fetchImpl(...args):new Response(JSON.stringify(release()),{headers:{etag:'"test"'}});}});
 return{service,data,requests,advance:milliseconds=>{timestamp+=milliseconds;}};
}
test('new release selects the exact browser asset and sends no credentials or file data',async()=>{
 for(const browser of ['chrome','firefox']){
  const {service,requests}=environment({browser});const result=await service.check();
  assert.equal(result.status,'available');assert.equal(result.latestVersion,'0.3.16');assert.match(result.downloadUrl,new RegExp(`-${browser}\\.zip$`));
  assert.equal(requests[0][0],'https://api.github.com/repos/bogdanhpk/Pecta/releases/latest');assert.equal(requests[0][1].credentials,'omit');assert.equal(requests[0][1].body,undefined);
 }
});
test('numeric version comparison never offers an equal or older release',async()=>{
 for(const remote of ['0.3.15','0.3.9','0.2.100']){
  const {service}=environment({fetchImpl:async()=>new Response(JSON.stringify(release(remote)))});
  assert.equal((await service.check()).status,'current');
 }
});
test('simultaneous checks coalesce, and cached checks avoid network requests for six hours',async()=>{
 const {service,requests,advance}=environment();const first=service.check(),second=service.check();assert.equal(first,second);await first;
 await service.check();assert.equal(requests.length,1);
 advance(60001);await service.check({force:true});assert.equal(requests.length,2);
 advance(21600001);await service.check();assert.equal(requests.length,3);
});
test('a warm cache survives a background restart, validates URLs and supports ETag 304 responses',async()=>{
 const initial=environment();await initial.service.check();
 const next=environment({stored:initial.data,fetchImpl:async()=>new Response(null,{status:304})});await next.service.check();assert.equal(next.requests.length,0);
 next.advance(21600001);const result=await next.service.check();assert.equal(result.status,'available');assert.equal(next.requests[0][1].headers['If-None-Match'],'"test"');
});
test('drafts and prereleases are rejected, and foreign or incomplete assets cannot become downloads',async()=>{
 for(const change of [{draft:true},{prerelease:true},{tag_name:'v0.3.17-beta'}]){
  const {service}=environment({fetchImpl:async()=>new Response(JSON.stringify({...release(),...change}))});assert.equal((await service.check()).status,'error');
 }
 const data=release();data.assets[0].browser_download_url='https://example.test/extension.zip';
 const {service}=environment({fetchImpl:async()=>new Response(JSON.stringify(data))});const result=await service.check();assert.equal(result.status,'missing-build');assert.equal(result.downloadUrl,null);
});
test('missing releases, rate limits, invalid JSON and offline errors remain truthful and retryable',async()=>{
 const cases=[{fetch:()=>new Response('{}',{status:404}),status:'unreleased'},{fetch:()=>new Response('{}',{status:429}),status:'error',reason:'rate-limit'},{fetch:()=>new Response('bad json'),status:'error'},{fetch:()=>{throw Error('Offline');},status:'error'}];
 for(const item of cases){const {service}=environment({fetchImpl:item.fetch});const result=await service.check();assert.equal(result.status,item.status);if(item.reason)assert.equal(result.reason,item.reason);assert.equal(result.downloadUrl,undefined);}
});
