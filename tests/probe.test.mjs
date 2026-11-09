import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { probeFigmaPage } from '../src/probe.js';

function environment(api, extras = {}) {
  const context = vm.createContext({
    location: { hostname:'www.figma.com', pathname:'/design/test-file' },
    setTimeout, clearTimeout, setInterval, clearInterval, ...extras
  });
  if (api !== undefined) context.figma = api;
  const run = vm.runInContext(`(${probeFigmaPage.toString()})`, context);
  return { context, run:async options => JSON.parse(JSON.stringify(await run(options))) };
}
function layer(overrides = {}) {
  return { id:'1:2', name:'Кнопка', type:'RECTANGLE', x:8, y:12, width:120, height:40, fills:[{type:'SOLID',color:{r:1,g:0,b:0}}], ...overrides };
}

test('diagram distances distinguish parent edges and the nearest overlapping sibling, and update live',async()=>{
  const parent={id:'p',name:'Controls',type:'FRAME',width:282,height:80};
  const selected=layer({id:'selected',x:12,y:16,width:254,height:32,rotation:0,parent});
  const next=layer({id:'next',name:'Next button',x:12,y:54,width:254,height:12,rotation:0,parent});
  parent.children=[selected,next];
  const {run}=environment({currentPage:{selection:[selected]}});const options={action:'fast',stateless:true,includeMeasurements:true};
  const initial=(await run(options)).nodes[0].fields.measurements;
  assert.equal(initial.sides.left.value,12);assert.equal(initial.sides.left.source,'parent');assert.equal(initial.sides.right.value,16);
  assert.equal(initial.sides.top.value,16);assert.equal(initial.sides.bottom.value,6);assert.equal(initial.sides.bottom.source,'sibling');
  next.y=60;assert.equal((await run(options)).nodes[0].fields.measurements.sides.bottom.value,12);
});
test('large parents keep measured parent edges without traversing hundreds of sibling nodes',async()=>{
  const parent={id:'p',name:'Large frame',type:'FRAME',width:500,height:300};
  parent.children=new Proxy(Array(300),{get(target,key){if(/^\d+$/.test(String(key)))throw Error('Sibling traversal must stay bounded');return target[key];}});
  const selected=layer({x:10,y:20,width:100,height:40,rotation:0,parent});
  const result=await environment({currentPage:{selection:[selected]}}).run({action:'fast',stateless:true,includeMeasurements:true});
  assert.equal(result.nodes[0].fields.measurements.status,'parent-only');assert.equal(result.nodes[0].fields.measurements.sides.right.value,390);
});
test('rotated selections omit rectangular spacing measurements instead of returning misleading gaps',async()=>{
  const parent={type:'FRAME',width:500,height:300};
  const result=await environment({currentPage:{selection:[layer({parent,rotation:45,relativeTransform:[[.707,-.707,20],[.707,.707,30]]})]}}).run({action:'fast',stateless:true,includeMeasurements:true});
  assert.equal(result.nodes[0].fields.measurements.status,'rotated');assert.equal(result.nodes[0].fields.measurements.sides.left,null);
});

test('per-side strokes and stroke inclusion are retained for live box measurements',async()=>{
  const result=await environment({currentPage:{selection:[layer({strokeTopWeight:1,strokeRightWeight:2,strokeBottomWeight:3,strokeLeftWeight:4,strokeAlign:'INSIDE',strokesIncludedInLayout:true})]}}).run({action:'fast',stateless:true});
  assert.equal(result.nodes[0].fields.strokeTopWeight,1);assert.equal(result.nodes[0].fields.strokeRightWeight,2);
  assert.equal(result.nodes[0].fields.strokeBottomWeight,3);assert.equal(result.nodes[0].fields.strokeLeftWeight,4);
  assert.equal(result.nodes[0].fields.strokesIncludedInLayout,true);
});

test('fast mode reads geometry and ancestor names without running library APIs or touching the diagnostic session', async () => {
  let calls=0;
  const page={id:'page',name:'Analytics',type:'PAGE'};
  const node=layer({type:'TEXT',characters:'Hello <world>',parent:{id:'section',name:'Reports',type:'SECTION',parent:page},getCSSAsync:()=>{calls++;}});
  Object.defineProperty(node,'children',{get(){throw Error('A large child list must not be read');}});
  const {context,run}=environment({currentPage:{selection:[node]}});
  context.__PECTA_ACCESS_PROBE_V1__={version:1,marker:'keep'};
  const result=await run({action:'fast',stateless:true,requireSingle:true,includeContext:true,includeText:true});
  assert.equal(result.nodes[0].css.status,'pending');assert.equal(calls,0);
  assert.equal(result.nodes[0].errors.length,0);
  assert.deepEqual(result.nodes[0].fields.context.map(p=>p.name),['Analytics','Reports']);
  assert.equal(result.nodes[0].fields.characters,'Hello <world>');
  assert.equal(context.__PECTA_ACCESS_PROBE_V1__.marker,'keep');
});

test('single-layer inspector never presents the first selected layer as multi-selection properties', async () => {
  let calls=0;
  const result=await environment({currentPage:{selection:[layer({getCSSAsync:()=>{calls++;}}),layer({id:'2'})]}}).run({stateless:true,requireSingle:true});
  assert.equal(result.verdict,'multiple-selection');assert.equal(result.apiAccess.selectionCount,2);assert.equal(result.nodes.length,0);assert.equal(calls,0);
});

test('mode caches successful variable names for a short period and retries failed lookups', async () => {
  let calls=0;
  const cache=new Map();
  const {run}=environment({currentPage:{selection:[layer({boundVariables:{width:{type:'VARIABLE_ALIAS',id:'v:1'}}})]},variables:{getVariableByIdAsync:async()=>{calls++;if(calls===1)throw Error('cold');return{name:'space/4'};}}});
  const opts={stateless:true,variableCache:cache};
  assert.equal((await run(opts)).nodes[0].variables[0].status,'error');
  await run(opts);await run(opts);assert.equal(calls,2);assert.equal(cache.size,1);
});

test('missing global is a scoped negative, not proof that all integration is impossible', async () => {
  const { run } = environment();
  const result = await run();
  assert.equal(result.verdict, 'no-figma-object');
  assert.equal(result.scope, 'MAIN_TOP_FRAME');
  assert.equal(result.apiAccess.selection, 'unavailable');
  assert.ok(result.limitations.some(item => item.includes('does not rule out')));
});

test('reads a global lexical API binding even if it is not a window property', async () => {
  const { context, run } = environment();
  vm.runInContext('const figma = {currentPage:{selection:[]}}', context);
  assert.equal((await run()).verdict, 'select-a-layer');
  assert.equal(context.figma, undefined);
});

test('reads geometry, CSS, bound token and component names without writing node properties', async () => {
  let writes = 0;
  const node = layer({type:'INSTANCE',boundVariables:{width:{type:'VARIABLE_ALIAS',id:'VariableID:1'}},getCSSAsync:async()=>({width:'120px'}),getMainComponentAsync:async()=>({id:'1:1',name:'Actions / Button'})});
  Object.defineProperty(node,'width',{enumerable:true,get:()=>120,set:()=>{writes++;}});
  const { run } = environment({currentPage:{selection:[node]},variables:{getVariableByIdAsync:async id=>({id,name:'size/button/medium',resolvedType:'FLOAT',valuesByMode:{light:120}})}});
  const result = await run();
  assert.equal(result.verdict,'selection-readable');
  assert.equal(result.nodes[0].fields.width,120);
  assert.equal(result.nodes[0].css.value.width,'120px');
  assert.equal(result.nodes[0].variables[0].value.name,'size/button/medium');
  assert.equal(result.nodes[0].component.value.name,'Actions / Button');
  assert.equal(writes,0);
});

test('detects a plugin context so it is not counted as plugin-free access', async () => {
  const result = await environment({pluginId:'plugin-test',currentPage:{selection:[layer()]}}).run();
  assert.equal(result.verdict,'plugin-context-detected');
  assert.equal(result.apiAccess.pluginContextDetected,true);
});

test('reports failing fields and async methods instead of losing the diagnostic', async () => {
  const node = layer({fontName:Symbol('mixed'),getCSSAsync:async()=>{throw Error('Unavailable in this context');}});
  Object.defineProperty(node,'opacity',{get(){throw Error('Unreadable');}});
  const result = await environment({currentPage:{selection:[node]}}).run();
  assert.equal(result.nodes[0].fields.fontName,'[mixed-or-symbol]');
  assert.equal(result.nodes[0].css.status,'error');
  assert.ok(result.nodes[0].errors.some(item=>item.property==='opacity'));
});

test('selection getter errors and empty selection are distinct outcomes', async () => {
  const page = {};Object.defineProperty(page,'selection',{get(){throw Error('Not available');}});
  const failed = await environment({currentPage:page}).run();
  assert.equal(failed.apiAccess.selection,'error');
  assert.equal(failed.verdict,'object-without-readable-selection');
  assert.equal((await environment({currentPage:{selection:[]}}).run()).verdict,'select-a-layer');
});

test('observation detects selection and geometry changes and removes listeners after its deadline', async () => {
  const handlers = new Set();
  const api = {currentPage:{selection:[layer()]},on:(type,handler)=>handlers.add(handler),off:(type,handler)=>handlers.delete(handler)};
  const { run } = environment(api);
  await run({action:'observe',durationMs:600});
  api.currentPage.selection = [layer({id:'1:3',name:'Карточка'})];
  for (const handler of handlers) handler();
  await delay(40);api.currentPage.selection[0].width=180;api.currentPage.selection[0].fills=[{type:'SOLID',color:{r:0,g:0,b:1}}];
  await delay(650);
  const result = await run({action:'latest'});
  assert.equal(result.observation.status,'completed');
  assert.equal(result.observation.selectionEventCount,1);
  assert.ok(result.observation.samples.some(item=>item.nodes[0].id==='1:3'));
  assert.equal(result.observation.samples.at(-1).nodes[0].width,180);
  assert.equal(result.observation.samples.at(-1).nodes[0].fills[0].color.b,1);
  assert.equal(result.savedReport.nodes[0].fields.fills[0].color.r,0);
  assert.equal(result.savedReport.nodes[0].fields.fills[0].color.b,1);
  assert.equal(handlers.size,0);
});

test('a new observation replaces the old one and manual stop cleans up', async () => {
  const handlers = new Set();
  const api = {currentPage:{selection:[layer()]},on:(type,handler)=>handlers.add(handler),off:(type,handler)=>handlers.delete(handler)};
  const { run } = environment(api);
  await run({action:'observe',durationMs:1000});
  await run({action:'observe',durationMs:1000});
  assert.equal(handlers.size,1);
  const stopped=await run({action:'stop'});
  assert.equal(stopped.observation.status,'stopped');
  assert.equal(handlers.size,0);
});

test('large selections are bounded and unrelated hosts are not inspected', async () => {
  const api = {currentPage:{selection:Array.from({length:100},(_,i)=>layer({id:String(i)}))}};
  const result=await environment(api).run();
  assert.equal(result.nodes.length,3);
  assert.equal(result.apiAccess.selectionCount,100);
  assert.equal((await environment(api,{location:{hostname:'example.com',pathname:'/design/test'}}).run()).verdict,'wrong-page');
});

test('polling saves full snapshots when observation starts and ends with no selection and events never fire', async () => {
  const api = {
    currentPage:{selection:[]},on(){},off(){},
    variables:{getVariableByIdAsync:async id=>({id,name:'color/surface/default'})}
  };
  const instance = (id,name,height) => layer({
    id,name,height,type:'INSTANCE',boundVariables:{fills:[{type:'VARIABLE_ALIAS',id:'VariableID:surface'}]},
    getCSSAsync:async()=>({height:height+'px'}),getMainComponentAsync:async()=>({id:'Component:1',name:'Dialogs / Container'})
  });
  const { run } = environment(api);
  await run({action:'observe',durationMs:1000});
  await delay(30);api.currentPage.selection=[instance('1:20','Dialog',220)];
  await delay(300);api.currentPage.selection=[instance('1:21','Dialog Header',80)];
  await delay(300);api.currentPage.selection=[];
  await delay(450);
  const result=await run({action:'latest'});
  assert.equal(result.observation.status,'completed');
  assert.equal(result.observation.selectionEventCount,0);
  assert.equal(result.observation.updateMechanism,'polling-observed');
  assert.equal(result.observation.currentSelection.count,0);
  assert.equal(result.savedReport.verdict,'selection-readable');
  assert.equal(result.savedReport.nodes[0].fields.name,'Dialog Header');
  assert.equal(result.savedReport.nodes[0].css.value.height,'80px');
  assert.equal(result.savedReport.nodes[0].component.value.name,'Dialogs / Container');
  assert.equal(result.savedReport.nodes[0].variables[0].value.name,'color/surface/default');
  assert.deepEqual(result.observation.snapshots.map(snapshot=>snapshot.nodes[0].fields.name),['Dialog','Dialog Header']);
});

test('stop waits for queued full captures and a cleared selection does not erase the last selected node', async () => {
  const handlers=new Set();
  const api={currentPage:{selection:[]},on:(type,handler)=>handlers.add(handler),off:(type,handler)=>handlers.delete(handler)};
  const { run }=environment(api);
  const select=nodes=>{api.currentPage.selection=nodes;for(const handler of handlers)handler();};
  await run({action:'observe',durationMs:1000});
  select([layer({id:'1:30',name:'First',getCSSAsync:async()=>{await delay(180);return {width:'120px'};}})]);
  await delay(20);
  select([layer({id:'1:31',name:'Second',width:200,getCSSAsync:async()=>({width:'200px'})})]);
  select([]);
  const result=await run({action:'stop'});
  assert.equal(result.observation.status,'stopped');
  assert.equal(result.observation.capturePending,false);
  assert.equal(result.observation.currentSelection.count,0);
  assert.equal(result.savedReport.nodes[0].fields.name,'Second');
  assert.equal(result.savedReport.nodes[0].css.value.width,'200px');
  assert.equal(handlers.size,0);
});

test('an old in-flight capture cannot overwrite a newer observation', async () => {
  const handlers=new Set();
  const api={currentPage:{selection:[]},on:(type,handler)=>handlers.add(handler),off:(type,handler)=>handlers.delete(handler)};
  const { run }=environment(api);
  await run({action:'observe',durationMs:1000});
  api.currentPage.selection=[layer({id:'1:40',name:'Old capture',getCSSAsync:async()=>{await delay(180);return {width:'120px'};}})];
  for(const handler of handlers)handler();
  api.currentPage.selection=[layer({id:'1:41',name:'New observation'})];
  await run({action:'observe',durationMs:1000});
  await delay(230);
  const result=await run({action:'stop'});
  assert.equal(result.savedReport.nodes[0].fields.name,'New observation');
  assert.equal(handlers.size,0);
});

test('paint tokens are checked before a large effects binding list and skipped aliases are explicit', async () => {
  const reads=[];
  const node=layer({
    fills:[{type:'SOLID',boundVariables:{color:{type:'VARIABLE_ALIAS',id:'VariableID:paint'}}}],
    boundVariables:{effects:Array.from({length:12},(_,index)=>({type:'VARIABLE_ALIAS',id:'VariableID:effect-'+index}))}
  });
  const result=await environment({currentPage:{selection:[node]},variables:{getVariableByIdAsync:async id=>{reads.push(id);return {id,name:id};}}}).run();
  assert.equal(reads[0],'VariableID:paint');
  assert.equal(reads.length,8);
  assert.deepEqual(result.nodes[0].variableCoverage,{aliasesInSnapshot:13,checked:8,omitted:5});
});

test('cached legacy reports are marked stale without reading another node snapshot', async () => {
  let cssReads=0;
  const { context,run }=environment({currentPage:{selection:[layer({getCSSAsync:async()=>{cssReads++;return {width:'120px'};}})]}});
  context.__PECTA_ACCESS_PROBE_V1__={version:1,status:'completed',report:{schemaVersion:1,verdict:'select-a-layer',nodes:[]},samples:[],errors:[]};
  const result=await run({action:'latest',extensionVersion:'0.2.1'});
  assert.equal(result.staleState,true);
  assert.deepEqual(result.collector,{extensionVersion:'0.2.1',formatVersion:2});
  assert.equal(cssReads,0);
  const fresh=await run({action:'snapshot',extensionVersion:'0.2.1'});
  assert.deepEqual(fresh.probe,{extensionVersion:'0.2.1',formatVersion:2});
  assert.equal((await run({action:'latest',extensionVersion:'0.2.1'})).staleState,false);
});

test('the version of the originating snapshot is preserved and a newer collector detects the mismatch', async () => {
  const { context,run }=environment({currentPage:{selection:[layer()]}});
  await run({action:'snapshot',extensionVersion:'0.2.1'});
  const oldCache=context.__PECTA_ACCESS_PROBE_V1__;
  const mismatch=await run({action:'latest',extensionVersion:'0.2.2'});
  assert.equal(mismatch.staleState,true);
  assert.equal(mismatch.savedReport.probe.extensionVersion,'0.2.1');
  assert.equal(mismatch.collector.extensionVersion,'0.2.2');
  const fresh=await run({action:'snapshot',extensionVersion:'0.2.2'});
  assert.equal(fresh.probe.extensionVersion,'0.2.2');
  assert.notEqual(context.__PECTA_ACCESS_PROBE_V1__,oldCache);
  assert.equal((await run({action:'latest',extensionVersion:'0.2.2'})).staleState,false);
});

test('long CSS declarations are retained without the generic metadata string limit', async () => {
  const shadow=Array.from({length:18},(_,index)=>`var(--shadow-${index}-x, 0) 4px 32px rgba(0, 0, 0, 0.12)`).join(', ');
  assert.ok(shadow.length>512);
  const result=await environment({currentPage:{selection:[layer({getCSSAsync:async()=>({'box-shadow':shadow})})]}}).run();
  assert.equal(result.nodes[0].css.status,'ok');
  assert.equal(result.nodes[0].css.value['box-shadow'],shadow);
  assert.deepEqual(result.nodes[0].css.truncatedProperties,[]);
});

test('CSS limits are explicit rather than silently exporting an incomplete declaration', async () => {
  const long=layer({getCSSAsync:async()=>({'box-shadow':'x'.repeat(20000)})});
  const many=layer({getCSSAsync:async()=>Object.fromEntries(Array.from({length:70},(_,i)=>['--property-'+i,'1px']))});
  const result=await environment({currentPage:{selection:[long,many]}}).run();
  assert.equal(result.nodes[0].css.status,'truncated');
  assert.equal(result.nodes[0].css.value['box-shadow'].length,16384);
  assert.deepEqual(result.nodes[0].css.truncatedProperties,['box-shadow']);
  assert.equal(result.nodes[1].css.status,'truncated');
  assert.equal(result.nodes[1].css.omittedProperties,10);
});

test('independent library reads can proceed together and identify a component family', async () => {
  const started=new Set();let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const read=(kind,value)=>{started.add(kind);if(started.size===3)release();return gate.then(()=>value);};
  const variant={id:'1:100',name:'State=Normal',parent:{id:'1:99',type:'COMPONENT_SET',name:'Actions / Button'}};
  const instance=layer({type:'INSTANCE',boundVariables:{width:{type:'VARIABLE_ALIAS',id:'VariableID:width'}},getCSSAsync:()=>read('css',{width:'120px'}),getMainComponentAsync:()=>read('component',variant)});
  const result=await environment({currentPage:{selection:[instance]},variables:{getVariableByIdAsync:id=>read('variable',{id,name:'size/button'})}}).run({readTimeoutMs:1000});
  assert.equal(result.nodes[0].css.status,'ok');
  assert.equal(result.nodes[0].component.status,'ok');
  assert.equal(result.nodes[0].variables[0].status,'ok');
  assert.equal(result.nodes[0].component.value.componentSet.name,'Actions / Button');
  assert.equal(result.nodes[0].component.value.name,'State=Normal');
});

test('cold library reads are not rejected just because they exceed one second', async () => {
  const node=layer({type:'INSTANCE',boundVariables:{width:{type:'VARIABLE_ALIAS',id:'VariableID:width'}},getMainComponentAsync:async()=>{await delay(1100);return {id:'1:1',name:'Library component'};}});
  const result=await environment({currentPage:{selection:[node]},variables:{getVariableByIdAsync:async id=>{await delay(1100);return {id,name:'size/button'};}}}).run();
  assert.equal(result.nodes[0].component.status,'ok');
  assert.equal(result.nodes[0].variables[0].status,'ok');
});

test('read deadlines are reported separately from API errors', async () => {
  const node=layer({type:'INSTANCE',boundVariables:{width:{type:'VARIABLE_ALIAS',id:'VariableID:width'}},getCSSAsync:()=>new Promise(()=>{}),getMainComponentAsync:()=>new Promise(()=>{})});
  const result=await environment({currentPage:{selection:[node]},variables:{getVariableByIdAsync:async()=>{throw Error('Unavailable variable');}}}).run({readTimeoutMs:50});
  assert.equal(result.nodes[0].css.status,'timeout');
  assert.equal(result.nodes[0].css.timeoutMs,50);
  assert.equal(result.nodes[0].component.status,'timeout');
  assert.equal(result.nodes[0].variables[0].status,'error');
  assert.equal(result.nodes[0].variables[0].error,'Unavailable variable');
});

test('component information keeps source, metadata and real variants without traversing the page',async()=>{
  const document={type:'DOCUMENT',name:'koobiq · 2023'},set={id:'set',type:'COMPONENT_SET',name:'Button',parent:document,description:'Action button',documentationLinks:[{uri:'https://example.test/button'}],componentPropertyDefinitions:{Fill:{type:'VARIANT',defaultValue:'Outline'}},children:[]};
  const main={id:'main',type:'COMPONENT',name:'Fill=Outline',parent:set,remote:false,variantProperties:{Fill:'Outline'}},variant={id:'filled',type:'COMPONENT',name:'Fill=Filled',variantProperties:{Fill:'Filled'}};set.children=[main,variant];
  const selected=layer({type:'INSTANCE',getMainComponentAsync:async()=>main,exportAsync:()=>{throw Error('A metadata read must not export images');}});
  const result=(await environment({currentPage:{selection:[selected]}}).run({action:'snapshot',stateless:true})).nodes[0].component.value;
  assert.equal(result.sourceName,'koobiq · 2023');assert.equal(result.description,'Action button');assert.equal(result.previewAvailable,true);assert.equal(result.variants[1].properties.Fill,'Filled');assert.equal(result.variantCount,2);
  assert.equal(result.propertyDefinitions.Fill.defaultValue,'Outline');
});
test('remote components without ancestry do not borrow the current file name as a library name',async()=>{
  const main={id:'remote',type:'COMPONENT',name:'Button',remote:true};
  const selected=layer({type:'INSTANCE',getMainComponentAsync:async()=>main});
  const result=(await environment({root:{name:'Current project'},currentPage:{selection:[selected]}}).run({action:'snapshot',stateless:true})).nodes[0].component.value;
  assert.equal(result.sourceName,null);assert.equal(result.remote,true);
});

test('text inspection reads linked styles, inherited variable modes and style tokens with a bounded cache',async()=>{
 const aliases={fontFamily:'family',fontWeight:'weight',fontSize:'size',lineHeight:'line',letterSpacing:'spacing'};
 let styleCalls=0,collectionCalls=0,variableCalls=0;
 const selected=layer({type:'TEXT',fontName:{family:'Inter',style:'Regular'},fontWeight:400,fontSize:14,lineHeight:{unit:'PIXELS',value:20},letterSpacing:{unit:'PIXELS',value:0},textStyleId:'style:text',fillStyleId:'style:color',openTypeFeatures:{ZERO:true},resolvedVariableModes:{typography:'base',colors:'light'},explicitVariableModes:{colors:'light'}});
 const api={currentPage:{selection:[selected]},getStyleByIdAsync:async id=>{styleCalls++;return id==='style:color'?{id,type:'PAINT',name:'Foreground/Contrast'}:{id,type:'TEXT',name:'Text/Normal',fontName:selected.fontName,fontSize:14,lineHeight:selected.lineHeight,letterSpacing:selected.letterSpacing,boundVariables:Object.fromEntries(Object.entries(aliases).map(([key,value])=>[key,{type:'VARIABLE_ALIAS',id:value}]))};},variables:{getVariableByIdAsync:async id=>{variableCalls++;return{id,name:`typography/text/normal/${id}`,resolvedType:id==='family'?'STRING':'FLOAT',variableCollectionId:'typography',valuesByMode:{base:400}};},getVariableCollectionByIdAsync:async id=>{collectionCalls++;return{id,name:id==='typography'?'Typography':'Color Styles',defaultModeId:id==='typography'?'base':'light',modes:[{modeId:id==='typography'?'base':'light',name:id==='typography'?'Mode 1':'Light Mode'}]};}}};
 const {run}=environment(api),options={stateless:true,variableLimit:32,variableCache:new Map()};
 const result=(await run(options)).nodes[0];assert.equal(result.textStyle.value.name,'Text/Normal');assert.equal(result.paintStyle.value.name,'Foreground/Contrast');assert.equal(result.variables.length,5);assert.equal(result.variableModes.entries[0].modeName,'Mode 1');assert.equal(result.variableModes.entries[0].explicit,false);assert.equal(result.variableModes.entries[1].explicit,true);assert.equal(result.fields.openTypeFeatures.ZERO,true);
 await run(options);assert.equal(styleCalls,2);assert.equal(collectionCalls,2);assert.equal(variableCalls,5);
});
test('text metadata limits collection reads and returns usable partial data within the read deadline',async()=>{
 let collections=0;
 const selected=layer({type:'TEXT',fontSize:14,textStyleId:'slow',resolvedVariableModes:Object.fromEntries(Array.from({length:20},(_,index)=>[`collection${index}`,'base']))});
 const api={currentPage:{selection:[selected]},getStyleByIdAsync:async()=>{await delay(180);return{id:'slow',type:'TEXT',name:'Late style'};},variables:{getVariableCollectionByIdAsync:async id=>{collections++;return{name:id,defaultModeId:'base',modes:[{modeId:'base',name:'Mode 1'}]};}}};
 const {run}=environment(api);const started=Date.now(),result=(await run({stateless:true,readTimeoutMs:50})).nodes[0];
 assert.equal(collections,16);assert.equal(result.variableModes.omitted,4);assert.equal(result.textStyle.status,'timeout');assert.equal(result.fields.fontSize,14);assert.ok(Date.now()-started<170);
});
test('text metadata preserves the variable budget and already bounded alias values',async()=>{
 const selected=layer({type:'TEXT',boundVariables:Object.fromEntries(Array.from({length:24},(_,index)=>[`property${index}`,{type:'VARIABLE_ALIAS',id:`variable${index}`}]))});
 const api={currentPage:{selection:[selected]},variables:{getVariableByIdAsync:async id=>({id,name:id,valuesByMode:{base:{type:'VARIABLE_ALIAS',id:'underlying'}}})}};
 const result=(await environment(api).run({stateless:true,variableLimit:32})).nodes[0];
 assert.equal(result.variables.length,24);assert.equal(result.variableCoverage.checked,24);assert.equal(result.variableCoverage.omitted,0);
 assert.deepEqual(result.variables[23].value.valuesByMode.base,{type:'VARIABLE_ALIAS',id:'underlying'});
});
