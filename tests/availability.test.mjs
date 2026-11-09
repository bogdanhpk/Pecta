import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/background.js',import.meta.url),'utf8');
const event=()=>{const listeners=[];return{addListener:fn=>listeners.push(fn),emit:(...args)=>listeners.forEach(fn=>fn(...args)),listeners};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function environment(){
  const tabs=new Map([[1,{id:1,url:'https://www.figma.com/design/test',status:'complete'}]]);
  const icons=[],titles=[],injections=[];let apiValue={currentPage:{selection:[]}},executeOverride;
  const api={
    runtime:{id:'pecta-test',getURL:path=>'chrome-extension://pecta-test/'+path,onMessage:event(),onInstalled:event(),onStartup:event()},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('Closed tab');return{...tabs.get(id)};},query:async()=>[...tabs.values()],onActivated:event(),onUpdated:event(),onRemoved:event()},
    windows:{WINDOW_ID_NONE:-1,onFocusChanged:event()},permissions:{onAdded:event(),onRemoved:event()},
    action:{setIcon:async value=>{icons.push(value);},setTitle:async value=>{titles.push(value);}},
    scripting:{executeScript:async options=>{
      injections.push(options);
      if(executeOverride)return executeOverride(options);
      if(options.files)return[];
      const url=new URL(tabs.get(options.target.tabId).url);
      const result=vm.runInNewContext(`(${options.func.toString()})()`,{location:url,figma:apiValue});
      return[{frameId:0,result}];
    }}
  };
  vm.runInNewContext(source,{chrome:api,URL,console,setTimeout,clearTimeout});
  const sender={id:api.runtime.id,url:api.runtime.getURL('launcher.html')};
  async function send(message={type:'pecta:refresh-icon',tabId:1},from=sender){
    return new Promise(resolve=>{
      const accepted=api.runtime.onMessage.listeners[0](message,from,resolve);
      if(accepted!==true)resolve(undefined);
    });
  }
  return{api,tabs,icons,titles,injections,send,setModel:value=>{apiValue=value;},override:fn=>{executeOverride=fn;}};
}
test('availability is based on readable Figma selection, including an empty selection, rather than an open panel',async()=>{
  const env=environment();
  assert.equal((await env.send()).available,true);assert.match(env.icons.at(-1).path[16],/ready-16/);
  const page={};Object.defineProperty(page,'selection',{get(){throw Error('Access denied');}});env.setModel({currentPage:page});
  assert.equal((await env.send()).available,false);assert.match(env.icons.at(-1).path[16],/unavailable-16/);
  env.setModel({currentPage:{selection:[]}});assert.equal((await env.send()).available,true);
  env.setModel({pluginId:'plugin',currentPage:{selection:[]}});assert.equal((await env.send()).available,false);
});
test('other hosts, non-design Figma routes and denied script access remain gray',async()=>{
  const env=environment();
  for(const url of ['https://example.com/design/a','https://figma.com.evil.test/design/a','http://figma.com/design/a','https://www.figma.com/files/recent']){
    env.tabs.get(1).url=url;assert.equal((await env.send()).available,false);
  }
  assert.equal(env.injections.length,0);
  env.tabs.get(1).url='https://figma.com/file/a';env.override(async()=>{throw Error('Missing host permission');});
  assert.equal((await env.send()).available,false);assert.match(env.icons.at(-1).path[16],/unavailable/);
});
test('page payloads cannot assert availability or target another tab',async()=>{
  const env=environment();
  assert.equal(await env.send({type:'pecta:refresh-icon',tabId:1},{id:'other-extension',url:'https://www.figma.com/design/a'}),undefined);
  assert.equal(await env.send({type:'pecta:refresh-icon',tabId:1},{id:'pecta-test',url:'https://www.figma.com/design/a',tab:{id:1},frameId:0}),undefined);
  assert.equal(await env.send({type:'pecta:check-availability',available:true,tabId:999},{id:'pecta-test',url:'https://www.figma.com/design/a',tab:{id:1},frameId:2}),undefined);
  assert.equal(env.injections.length,0);
  env.setModel(undefined);
  const actual=await env.send({type:'pecta:check-availability',available:true,tabId:999},{id:'pecta-test',url:'https://www.figma.com/design/a',tab:{id:1},frameId:0});
  assert.equal(actual.available,false);assert.equal(env.injections[0].target.tabId,1);
});
test('a late successful probe from the previous document cannot recolor a navigated tab',async()=>{
  const env=environment();let resolve;
  env.override(()=>new Promise(done=>{resolve=done;}));
  const old=env.send();await tick();
  env.tabs.get(1).url='https://example.com/';env.tabs.get(1).status='loading';env.api.tabs.onUpdated.emit(1,{status:'loading'});
  env.tabs.get(1).status='complete';assert.equal((await env.send()).available,false);
  resolve([{frameId:0,result:{available:true,route:'https://www.figma.com/design/test'}}]);
  assert.equal((await old).available,false);assert.match(env.icons.at(-1).path[16],/unavailable/);
});
test('concurrent checks coalesce, and the availability probe never reads the selected node fields',async()=>{
  const env=environment();let reads=0;
  const node={};Object.defineProperty(node,'name',{get(){reads++;throw Error('Must not read layer data');}});
  env.setModel({currentPage:{selection:[node]}});
  const [one,two]=await Promise.all([env.send(),env.send()]);
  assert.equal(one.available,true);assert.equal(two.available,true);assert.equal(env.injections.length,1);assert.equal(reads,0);
});
