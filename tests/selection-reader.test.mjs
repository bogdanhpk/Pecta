import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {setTimeout as delay} from 'node:timers/promises';
import {readSelectionResources,readSelectionAsset} from '../src/selection-reader.js';
const paint=(r=1,g=0,b=0,opacity=1)=>({type:'SOLID',color:{r,g,b},opacity});
const png=()=>new Uint8Array([137,80,78,71,13,10,26,10,0]);
function environment(root,extra={}){
 const api={currentPage:{selection:[root]},...extra},context=vm.createContext({figma:api,setTimeout,clearTimeout,Uint8Array});
 const resources=vm.runInContext(`(${readSelectionResources.toString()})`,context),asset=vm.runInContext(`(${readSelectionAsset.toString()})`,context),assetNodes=new Map();
 return{api,assetNodes,scan:options=>resources({nodeId:root.id,assetNodes,...options}),read:options=>asset({nodeId:root.id,assetNodes,preview:true,...options})};
}
test('native selection colors retain style names, transparent paints and variable names without page traversal',async()=>{
 const root={id:'root',children:[]},red=paint(),transparent=paint(1,0,1,0);
 const env=environment(root,{root:{get children(){throw Error('Must not scan the file');}},getSelectionColors:()=>({paints:[red,{...paint(.3,.4,.5),boundVariables:{color:{type:'VARIABLE_ALIAS',id:'token'}}}],styles:[{id:'style',name:'Foreground/Contrast',paints:[red]},{id:'transparent',name:'Background/Transparent',paints:[transparent]}]}),variables:{getVariableByIdAsync:async()=>({name:'Icon/Contrast-fade'})}});
 const result=await env.scan();assert.equal(result.status,'ok');assert.equal(result.colorSource,'figma');assert.equal(result.colors.length,3);assert.equal(result.colors[0].name,'Foreground/Contrast');assert.equal(result.colors[1].name,'Background/Transparent');assert.equal(result.colors[1].paint.opacity,0);assert.equal(result.colors[2].name,'Icon/Contrast-fade');
});
test('fallback includes nested fill and stroke colors, excludes invisible branches and deduplicates exact bindings',async()=>{
 const root={id:'root',fills:[paint()],children:[{id:'child',fills:[paint()],strokes:[paint(0,1,0)],strokeStyleId:'line'},{id:'hidden',visible:false,fills:[paint(0,0,1)],get children(){throw Error('Hidden children must not be inspected');}},{id:'bound',fills:[{...paint(),boundVariables:{color:{type:'VARIABLE_ALIAS',id:'brand'}}}]}]};
 const env=environment(root,{getStyleByIdAsync:async()=>({name:'Line/Contrast-fade'}),variables:{getVariableByIdAsync:async()=>({name:'Background/Brand'})}});
 const result=await env.scan();assert.equal(result.colors.length,3);assert.equal(result.colors[1].name,'Line/Contrast-fade');assert.equal(result.colors[2].name,'Background/Brand');assert.equal(result.coverage.visited,4);
});
test('assets use Figma classification and explicit exports, keep actual names and never export during scanning',async()=>{
 const root={id:'root',children:[]},icon={id:'icon',name:'circle-info_16',isAsset:true,width:16,height:16,parent:root,children:[],exportAsync:()=>{throw Error('Metadata must not export');}},inner={id:'path',isAsset:true,width:8,height:8,parent:icon};icon.children=[inner];
 root.children=[icon,{id:'image',name:'photo',isAsset:true,width:200,height:100,fills:[{type:'IMAGE'}],parent:root},{id:'export',name:'Card',isAsset:false,width:200,height:50,exportSettings:[{format:'PNG'}],parent:root},{id:'not-asset',name:'Icon-ish button',isAsset:false,width:16,height:16}];
 const result=await environment(root).scan();assert.deepEqual(JSON.parse(JSON.stringify(result.assets)).map(({name,kind})=>({name,kind})),[{name:'circle-info_16',kind:'icons'},{name:'photo',kind:'images'},{name:'Card',kind:'exports'}]);assert.equal(result.assets[0].width,16);
});
test('large selections have explicit scan, color and asset limits',async()=>{
 const root={id:'root',children:Array.from({length:2300},(_,i)=>({id:`child${i}`,name:`Asset ${i}`,isAsset:true,width:16,height:16,fills:[paint(i/2300,0,0)]}))};
 const result=await environment(root).scan();assert.equal(result.coverage.visited,2000);assert.equal(result.coverage.truncated,true);assert.equal(result.assets.length,32);assert.equal(result.colors.length,64);assert.ok(result.coverage.omittedAssets>0);assert.ok(result.coverage.omittedColors>0);
});
test('native selection colors avoid traversing internal paths of detected assets',async()=>{
 const root={id:'root',children:[{id:'icon',isAsset:true,width:16,height:16,get children(){throw Error('Internal paths must not be read');}}]};
 const result=await environment(root,{getSelectionColors:()=>({paints:[],styles:[]})}).scan();
 assert.equal(result.assets.length,1);assert.equal(result.coverage.visited,2);assert.equal(result.coverage.unreadable,0);
});
test('asset exports require a scanned asset still inside the selected subtree and discard late selection results',async()=>{
 let calls=0,settings,complete;const root={id:'root',children:[]},icon={id:'icon',name:'circle-info_16',isAsset:true,width:16,height:16,parent:root,exportAsync:async value=>{calls++;settings=value;return png();}};root.children=[icon];const env=environment(root);await env.scan();
 assert.equal((await env.read({assetId:'foreign'})).status,'stale');assert.equal(calls,0);
 assert.equal((await env.read({assetId:'icon'})).status,'ok');assert.equal(settings.format,'PNG');assert.equal(settings.constraint.value,2);
 icon.parent={id:'outside'};assert.equal((await env.read({assetId:'icon'})).status,'stale');assert.equal(calls,1);icon.parent=root;
 icon.exportAsync=()=>new Promise(resolve=>{complete=resolve;});const waiting=env.read({assetId:'icon'});await delay(5);env.api.currentPage.selection=[{id:'new'}];complete(png());assert.equal((await waiting).status,'stale');
});
test('downloads retain PNG and SVG formats; timed out exports keep the shared slot occupied',async()=>{
 let settings,complete;const root={id:'root',children:[]},icon={id:'icon',isAsset:true,width:16,height:16,parent:root,exportAsync:async value=>{settings=value;return value.format==='SVG'?new TextEncoder().encode('<svg/>'):png();}};root.children=[icon];const env=environment(root);await env.scan();
 const svg=await env.read({assetId:'icon',preview:false,format:'SVG'});assert.equal(svg.status,'ok');assert.equal(svg.format,'SVG');assert.equal(settings.constraint,undefined);
 const exportState={pending:null};icon.exportAsync=()=>new Promise(resolve=>{complete=resolve;});assert.equal((await env.read({assetId:'icon',exportState,timeoutMs:50})).status,'timeout');assert.equal((await env.read({assetId:'icon',exportState})).status,'busy');complete(png());await delay(1);assert.equal(exportState.pending,null);
});
test('invalid and oversized exports fail without emitting usable file bytes',async()=>{
 const root={id:'root',children:[]},icon={id:'icon',isAsset:true,width:16,height:16,parent:root,exportAsync:async()=>new Uint8Array([1,2,3])};root.children=[icon];const env=environment(root);await env.scan();assert.equal((await env.read({assetId:'icon'})).status,'invalid');icon.width=9000;assert.equal((await env.read({assetId:'icon',preview:false})).status,'too-large');
});
