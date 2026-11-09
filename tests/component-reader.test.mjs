import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {setTimeout as delay} from 'node:timers/promises';
import {readComponentPreview} from '../src/component-reader.js';
const png=()=>new Uint8Array([137,80,78,71,13,10,26,10,0]);
function environment(node){
  const api={currentPage:{selection:[node]}};
  const run=vm.runInContext(`(${readComponentPreview.toString()})`,vm.createContext({figma:api,setTimeout,clearTimeout,Uint8Array}));
  return{api,run:options=>run({nodeId:node.id,...options})};
}
test('preview exports only a selected component with bounded resolution and no document writes',async()=>{
  let settings;const node={id:'selected',type:'INSTANCE',width:2048,height:1024,exportAsync:async value=>{settings=value;return png();}};
  const {run}=environment(Object.freeze(node));const result=await run();
  assert.equal(result.status,'ok');assert.equal(result.width,2048);assert.equal(settings.format,'PNG');assert.equal(settings.constraint.value,.25);
});
test('variant preview is scoped to this component set, never an arbitrary node id',async()=>{
  let exports=0;const main={id:'main',type:'COMPONENT'},other={id:'hover',type:'COMPONENT',width:100,height:40,exportAsync:async()=>{exports++;return png();}};
  main.parent={type:'COMPONENT_SET',children:[main,other]};const node={id:'selected',type:'INSTANCE',getMainComponentAsync:async()=>main};const {run}=environment(node);
  assert.equal((await run({variantId:'foreign'})).status,'unavailable');assert.equal(exports,0);
  assert.equal((await run({variantId:'hover'})).status,'ok');assert.equal(exports,1);
});
test('late export from an old selection is discarded and invalid or oversized PNGs are rejected',async()=>{
  let complete;const node={id:'selected',type:'COMPONENT',width:100,height:40,exportAsync:()=>new Promise(resolve=>{complete=resolve;})};const {api,run}=environment(node);
  const pending=run();await delay(5);api.currentPage.selection=[{id:'other'}];complete(png());assert.equal((await pending).status,'stale');
  api.currentPage.selection=[node];node.exportAsync=async()=>new Uint8Array(524289);assert.equal((await run()).status,'too-large');
  node.exportAsync=async()=>new Uint8Array([1,2,3]);assert.equal((await run()).status,'invalid');
});
test('a timed out export does not allow another uncancellable export to run concurrently',async()=>{
  let calls=0,complete;const node={id:'selected',type:'COMPONENT',width:100,height:40,exportAsync:()=>{calls++;return new Promise(resolve=>{complete=resolve;});}};
  const {run}=environment(node),exportState={pending:null};
  assert.equal((await run({timeoutMs:50,exportState})).status,'timeout');
  assert.equal((await run({timeoutMs:50,exportState})).status,'busy');assert.equal(calls,1);
  complete(png());await delay(5);assert.equal(exportState.pending,null);
});

test('PNG bytes from a different realm are accepted, as delivered by Firefox',async()=>{
  const bytes=vm.runInNewContext('new Uint8Array([137,80,78,71,13,10,26,10,0])');
  const node={id:'selected',type:'COMPONENT',width:100,height:40,exportAsync:async()=>bytes};
  assert.equal((await environment(node).run()).status,'ok');
});
