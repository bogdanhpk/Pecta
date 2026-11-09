// Firefox's native WebDriver BiDi, with a disposable profile and controlled Figma-origin fixture.
import {spawn} from 'node:child_process';
import{mkdir,writeFile,cp,readFile,rm}from'node:fs/promises';
import net from 'node:net';
import assert from 'node:assert/strict';
const dir=process.cwd()+'/output/playwright/firefox';
await rm(dir,{recursive:true,force:true});await mkdir(dir+'/profile',{recursive:true});
await cp(process.cwd()+'/dist/firefox',dir+'/extension',{recursive:true});
const manifest=JSON.parse(await readFile(dir+'/extension/manifest.json','utf8'));
const uuid='a73fb504-50a0-445b-a1b5-ff23c991a732';
await writeFile(dir+'/profile/user.js',`user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({'access-probe@pecta.local':uuid}))});\nuser_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("browser.aboutwelcome.enabled", false);\nuser_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);\n`);
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const binary=process.env.FIREFOX_PATH||(process.platform==='darwin'?'/Applications/Firefox.app/Contents/MacOS/firefox':'firefox');
const child=spawn(binary,['-headless','-remote-allow-system-access','-no-remote','-profile',dir+'/profile','--remote-debugging-port',String(port)],{stdio:['ignore','pipe','pipe'],env:{...process.env,MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'}});
let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
let ws,id=0;const pending=new Map(),errors=[];
async function connect(){for(let i=0;i<120;i++){try{const socket=new WebSocket(`ws://127.0.0.1:${port}/session`);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});return socket;}catch{await new Promise(r=>setTimeout(r,250));}}throw Error('Firefox remote agent did not start: '+logs);}
const html=await readFile(new URL('./figma.html',import.meta.url),'utf8');
function cmd(method,params={}){return new Promise((resolve,reject)=>{const number=++id;const timer=setTimeout(()=>{pending.delete(number);reject(Error('BiDi timeout: '+method));},15000);pending.set(number,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:number,method,params}));});}
async function evaluate(context,expression){const r=await cmd('script.evaluate',{expression,target:{context},awaitPromise:true});if(r.type==='exception')throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const root="document.getElementById('pecta-mode-root')?.shadowRoot";
async function wait(context,expression){for(let i=0;i<60;i++){if(await evaluate(context,expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI did not reach: '+expression);}
try {
 ws=await connect();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.type==='error'?p.reject(Error(JSON.stringify(m))):p.resolve(m.result);}else if(m.method==='network.beforeRequestSent'&&m.params.isBlocked){void cmd('network.provideResponse',{request:m.params.request.request,statusCode:200,headers:[{name:'content-type',value:{type:'string',value:'text/html; charset=utf-8'}}],body:{type:'string',value:html}}).catch(e=>errors.push(e.message));}else if(m.method==='log.entryAdded'&&m.params.level==='error')errors.push(m.params.text);};
 const session=await cmd('session.new',{capabilities:{}});
 await cmd('webExtension.install',{extensionData:{type:'path',path:dir+'/extension'},'moz:temporary':true});
 await cmd('session.subscribe',{events:['network.beforeRequestSent','log.entryAdded']});
 await cmd('network.addIntercept',{phases:['beforeRequestSent'],urlPatterns:[{type:'pattern',protocol:'https',hostname:'www.figma.com'}]});
 const fixture=(await cmd('browsingContext.create',{type:'tab'})).context;
 await cmd('browsingContext.navigate',{context:fixture,url:'https://www.figma.com/design/fixture',wait:'complete'});
 const control=(await cmd('browsingContext.create',{type:'tab'})).context;
 await cmd('browsingContext.navigate',{context:control,url:`moz-extension://${uuid}/popup.html`,wait:'complete'});
 const tabId=await evaluate(control,"(async()=>(await browser.tabs.query({url:'https://www.figma.com/*'}))[0].id)()");
 await evaluate(control,`(async()=>{const bg=await browser.runtime.getBackgroundPage();bg.__iconWrites=[];const native=bg.browser.action.setIcon.bind(bg.browser.action);bg.browser.action.setIcon=async details=>{await native(details);bg.__iconWrites.push(details);};})()`);
 await cmd('browsingContext.activate',{context:fixture});
 await wait(control,`(async()=>(await browser.action.getTitle({tabId:${tabId}}))==='Pecta Mode — available in this file')()`);
 assert.equal(await evaluate(fixture,"!!document.getElementById('pecta-mode-root')"),false);
 await evaluate(fixture,'window.iconTestModel=window.figma;delete window.figma;');
 await wait(control,`(async()=>(await browser.action.getTitle({tabId:${tabId}}))==='Pecta Mode — open an accessible Figma file')()`);
 assert.match(await evaluate(control,`(async()=>(await browser.runtime.getBackgroundPage()).__iconWrites.filter(item=>item.tabId===${tabId}).at(-1).path[16])()`),/unavailable-16/);
 await evaluate(fixture,'window.figma=window.iconTestModel;');
 await wait(control,`(async()=>(await browser.action.getTitle({tabId:${tabId}}))==='Pecta Mode — available in this file')()`);
 assert.match(await evaluate(control,`(async()=>(await browser.runtime.getBackgroundPage()).__iconWrites.filter(item=>item.tabId===${tabId}).at(-1).path[16])()`),/ready-16/);
 const futureVersion=manifest.version.split('.').map((value,index)=>Number(value)+(index===2?1:0)).join('.');
 const fixtureNotes='## Добавлено\n- Блок **«Что нового»** в обновлениях.\n- Просмотр описания перед скачиванием.';
 await evaluate(control,`(async()=>{const bg=await browser.runtime.getBackgroundPage();const version=${JSON.stringify(futureVersion)};const nativeFetch=bg.fetch.bind(bg);bg.fetch=async(url,options)=>url!=='https://api.github.com/repos/bogdanhpk/Pecta/releases/latest'?nativeFetch(url,options):new bg.Response(JSON.stringify({tag_name:'v'+version,draft:false,prerelease:false,body:${JSON.stringify(fixtureNotes)},assets:['chrome','firefox'].map(target=>({name:'pecta-mode-'+version+'-'+target+'.zip',state:'uploaded',size:100,browser_download_url:'https://github.com/bogdanhpk/Pecta/releases/download/v'+version+'/pecta-mode-'+version+'-'+target+'.zip'}))}));})()`);
 const inject=async(world,source)=>JSON.parse(await evaluate(control,`(async()=>JSON.stringify((await browser.scripting.executeScript({target:{tabId:${tabId}},world:${JSON.stringify(world)},func:${source}}))[0].result))()`));
 const launch=async()=>{
   const page=(await cmd('browsingContext.create',{type:'tab'})).context;
   
   await cmd('browsingContext.navigate',{context:page,url:`moz-extension://${uuid}/launcher.html`,wait:'complete'});
   await wait(page,"document.querySelector('#retry')?.hidden===false");
   await evaluate(page,`browser.tabs.query=async()=>[{id:${tabId},url:'https://www.figma.com/design/fixture'}];window.close=()=>{window.__pectaLaunched=true;};document.querySelector('#retry').click();`);
   try{await wait(page,'window.__pectaLaunched===true');}catch(e){throw Error(e.message+'; '+await evaluate(page,"document.querySelector('#status').textContent"));}
   await cmd('browsingContext.close',{context:page});
 };
 await inject('ISOLATED',`()=>{window.addEventListener('message',event=>{if(event.data?.type==='component-preview'&&event.data.direction==='from-page'){const value=event.data.report;globalThis.__previewDebug={status:value.status,isArray:value.bytes instanceof Uint8Array,view:ArrayBuffer.isView(value.bytes),type:Object.prototype.toString.call(value.bytes),length:value.bytes?.length};}});return true;}`);
 await launch();await cmd('browsingContext.activate',{context:fixture});
 await wait(fixture,`${root}?.querySelector('.css')?.textContent.includes('width: 216px')`);
 await wait(fixture,`${root}.querySelector('.settings-update-dot').hidden===false`);
 assert.equal(await evaluate(fixture,`${root}.querySelector('.updates-link').textContent`),'Check for Updates');
 await evaluate(fixture,`${root}.querySelector('.header details>summary').click()`);await wait(fixture,`${root}.querySelector('.settings-update-dot').hidden===true`);
 assert.equal(await evaluate(fixture,`${root}.querySelectorAll('.menu button,.menu .version').length`),0);assert.equal(await evaluate(fixture,`${root}.querySelector('.menu-about-link .menu-version').textContent`),manifest.version);
 assert.equal(await evaluate(fixture,`${root}.querySelector('.updates-item-dot').hidden`),false);
 await wait(control,`(async()=>(await browser.storage.local.get('pectaSeenUpdateVersion')).pectaSeenUpdateVersion===${JSON.stringify(futureVersion)})()`);
 await evaluate(fixture,`${root}.querySelector('.header details>summary').click()`);assert.equal(await evaluate(fixture,`${root}.querySelector('.settings-update-dot').hidden`),true);
 const updatesPage=(await cmd('browsingContext.create',{type:'tab'})).context;
 await cmd('browsingContext.navigate',{context:updatesPage,url:`moz-extension://${uuid}/updates.html`,wait:'complete'});
 await wait(updatesPage,`document.querySelector('#status').textContent.includes(${JSON.stringify('Version ')}+${JSON.stringify(futureVersion)})`);
 assert.equal(await evaluate(updatesPage,"document.querySelector('#download').getAttribute('href')"),`https://github.com/bogdanhpk/Pecta/releases/download/v${futureVersion}/pecta-mode-${futureVersion}-firefox.zip`);
 assert.match(await evaluate(updatesPage,"document.querySelector('#instructions').textContent"),/about:debugging/);
 assert.equal(await evaluate(updatesPage,"document.querySelector('#release-notes').hidden"),false);
 assert.equal(await evaluate(updatesPage,"document.querySelectorAll('#release-notes-body li').length"),2);
 assert.equal(await evaluate(updatesPage,"document.querySelector('#release-notes-title').textContent"),`What’s new in ${futureVersion}`);

 await cmd('browsingContext.close',{context:updatesPage});await cmd('browsingContext.activate',{context:fixture});
 assert.equal(await evaluate(fixture,`${root}.querySelector('.menu').textContent.includes('Access diagnostics')`),false);
 assert.equal(await evaluate(fixture,`${root}.querySelector('.menu a[href$="about.html"]').getAttribute('aria-label')`),'About Pecta');
 const aboutPage=(await cmd('browsingContext.create',{type:'tab'})).context;
 await cmd('browsingContext.navigate',{context:aboutPage,url:`moz-extension://${uuid}/about.html`,wait:'complete'});
 assert.equal(await evaluate(aboutPage,"document.querySelector('#creator-name').textContent"),'Bogdan Khtominsky');
 assert.equal(await evaluate(aboutPage,"document.querySelector('#installed').textContent"),`Version ${manifest.version}`);
 await cmd('browsingContext.close',{context:aboutPage});await cmd('browsingContext.activate',{context:fixture});


 assert.equal(await evaluate(fixture,`${root}.querySelectorAll('.css-line').length`),8);
 assert.ok(await evaluate(fixture,`${root}.querySelectorAll('.css-value').length>0`));
 assert.ok(await evaluate(fixture,`${root}.querySelectorAll('.css-variable').length>0`));
 await wait(fixture,`[...document.fonts].some(face=>face.family==='Pecta Inter'&&face.status==='loaded')`);
 const layout=JSON.parse(await evaluate(fixture,`(()=>{const panel=${root}.querySelector('.panel');return JSON.stringify({top:panel.getBoundingClientRect().top,bottom:panel.getBoundingClientRect().bottom,height:innerHeight,font:getComputedStyle(panel).fontFamily,size:getComputedStyle(panel).fontSize,weight:getComputedStyle(panel).fontWeight});})()`));
 assert.equal(layout.top,0);assert.equal(layout.bottom,layout.height);assert.match(layout.font,/Pecta Inter/);assert.equal(layout.size,'12px');assert.equal(layout.weight,'400');
 assert.equal(await evaluate(fixture,`${root}.querySelector('.component-name').textContent`),'Actions / Button');
 assert.equal(await evaluate(fixture,`${root}.querySelector('[data-property="fills.0"] .variable-name').textContent`),'Background/Brand');
 assert.equal(await evaluate(fixture,`[...${root}.querySelectorAll('h2')].some(heading=>heading.textContent==='Tokens')`),false);
 try{await wait(fixture,`${root}.querySelector('.component-preview-canvas').hidden===false`);}catch(error){console.log({preview:await inject('ISOLATED',`()=>globalThis.__previewDebug`),status:await evaluate(fixture,`${root}.querySelector('.component-preview-status').textContent`),exports:await evaluate(fixture,'window.previewExports')});throw error;}
 assert.equal(await evaluate(fixture,`${root}.querySelector('.component-source').textContent`),'Meridian UI · 2026');
 assert.equal(await evaluate(fixture,`${root}.querySelector('.component-preview').dataset.background`),'light');
 assert.equal(await evaluate(fixture,`${root}.querySelectorAll('.component-information-details>.component-property-rows .component-property-kind[data-state="true"]').length`),1);

 await evaluate(fixture,`${root}.querySelector('.component-explore').click()`);
 await evaluate(fixture,`(()=>{const select=${root}.querySelector('.component-variant-select');select.value='source:2';select.dispatchEvent(new Event('change'));})()`);
 await wait(fixture,`${root}.querySelector('.component-preview-canvas').hidden===false`);
 assert.equal(await evaluate(fixture,`figma.currentPage.selection[0].variantProperties.State`),'Default');
 assert.equal(await evaluate(fixture,`${root}.querySelector('.component-playground').hidden`),false);
 await evaluate(fixture,`${root}.querySelector('.component-explore').click()`);

 assert.equal(await evaluate(fixture,`${root}.querySelector('[data-box-value="content"]').textContent`),'184 × 20');
 await evaluate(fixture,`${root}.querySelector('.layer-properties>summary').click()`);assert.equal(await evaluate(fixture,`${root}.querySelector('.layer-properties').open`),false);
 await evaluate(fixture,`${root}.querySelector('.layer-properties>summary').click()`);
 await inject('ISOLATED',`()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{globalThis.__copied=text;}}});return true;}`);
 await evaluate(fixture,`(()=>{const select=${root}.querySelector('.unit-select');select.value='rem';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(await evaluate(fixture,`${root}.querySelector('.layer-properties').open`),true);
 assert.equal(await evaluate(fixture,`${root}.querySelector('[data-box-value="content"]').textContent`),'11.5 × 1.25');
 assert.match(await evaluate(fixture,`${root}.querySelector('.css code').textContent`),/width: 13.5rem/);
 await evaluate(fixture,`${root}.querySelector('#pecta-tab-list').click()`);assert.equal(await evaluate(fixture,`${root}.querySelector('[data-property="paddingLeft"] .property-value-label').textContent`),'1rem');
 assert.equal(await evaluate(fixture,`${root}.querySelector('[data-box-value="radius-tl"]').textContent`),'0.5');
 const corner=`${root}.querySelector('[data-box-value="radius-tl"]')`;
 const cornerSize=await evaluate(fixture,`JSON.stringify({width:${corner}.getBoundingClientRect().width,height:${corner}.getBoundingClientRect().height})`);
 await evaluate(fixture,`${corner}.click()`);await wait(fixture,`${corner}.dataset.copied==='true'`);
 assert.equal(await evaluate(fixture,`JSON.stringify({width:${corner}.getBoundingClientRect().width,height:${corner}.getBoundingClientRect().height})`),cornerSize);
 assert.equal(await evaluate(fixture,`getComputedStyle(${corner}.querySelector('.metric-label')).visibility`),'hidden');
 await wait(fixture,`!${corner}.dataset.copied`);

 await evaluate(fixture,`${root}.querySelector('#pecta-tab-code').click()`);
 await evaluate(fixture,`${root}.querySelector('[data-action="copy-css"]').click()`);await wait(fixture,`${root}.querySelector('[data-action="copy-css"]').textContent.includes('Copied')`);assert.match(await inject('ISOLATED',`()=>globalThis.__copied`),/width: 13.5rem/);
 await evaluate(fixture,`(()=>{const select=${root}.querySelector('.unit-select');select.value='px';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await evaluate(fixture,`${root}.querySelector('[data-action="copy-css"]').click()`);
 await wait(fixture,`${root}.querySelector('[data-action="copy-css"]').textContent.includes('Copied')`);
 assert.match(await inject('ISOLATED',`()=>globalThis.__copied`),/width: 216px/);

 await evaluate(fixture,`figma.currentPage.selection=[makeNode({id:'white-artwork',name:'White artwork',previewTone:'transparent-white',variantProperties:null,componentProperties:{State:{type:'VARIANT',value:'Header'},Counter:{type:'BOOLEAN',value:false},'Right Button':{type:'BOOLEAN',value:true}}})]`);
 await wait(fixture,`${root}.querySelector('.name').textContent==='White artwork'&&${root}.querySelector('.component-preview').dataset.background==='dark'`);
 assert.equal(await evaluate(fixture,`${root}.querySelectorAll('.component-information-details>.component-property-rows .component-property-kind[data-type="VARIANT"]').length`),1);
 assert.equal(await evaluate(fixture,`${root}.querySelectorAll('.component-information-details>.component-property-rows .component-property-kind[data-state="false"]').length`),1);
 assert.equal(await evaluate(fixture,`${root}.querySelectorAll('.component-information-details>.component-property-rows .component-property-kind[data-state="true"]').length`),1);
 await evaluate(fixture,`figma.currentPage.selection=[makeNode({name:'Updated',width:444})]`);
 await wait(fixture,`${root}.querySelector('.css').textContent.includes('width: 444px')`);
 await evaluate(fixture,`figma.currentPage.selection=[makeTextNode()]`);
 await wait(fixture,`${root}.querySelector('.typography-caption').textContent==='Text/Normal'`);
 await evaluate(fixture,`${root}.querySelector('#pecta-tab-list').click()`);
 await evaluate(fixture,`(()=>{const select=${root}.querySelector('.unit-select');select.value='rem';select.dispatchEvent(new Event('change'));})()`);
 assert.equal(await evaluate(fixture,`${root}.querySelector('[data-text-metric="font"] .metric-label').textContent`),'0.875rem');
 assert.equal(await evaluate(fixture,`${root}.querySelector('[data-text-metric="line"] .metric-label').textContent`),'1.25rem');
 assert.equal(await evaluate(fixture,`${root}.querySelector('[data-property="numericZero"] .property-value-label').textContent`),'Slashed');
 assert.equal(await evaluate(fixture,`${root}.querySelectorAll('[data-group="modes"] .property-row').length`),4);
 await evaluate(fixture,`(()=>{const select=${root}.querySelector('.color-format');select.value='rgb';select.dispatchEvent(new Event('change'));})()`);
 assert.equal(await evaluate(fixture,`${root}.querySelector('[data-group="colors"] .property-color-copy').dataset.colorValue`),'rgb(30 32 44)');
 const shot=await cmd('browsingContext.captureScreenshot',{context:fixture});await writeFile(dir+'/panel.png',Buffer.from(shot.data,'base64'));
 await evaluate(fixture,`figma.currentPage.selection=[makeResourcesNode()]`);
 await wait(fixture,`${root}.querySelectorAll('.selection-color-row').length===5&&${root}.querySelectorAll('.asset-row').length===1`);
 assert.equal(await evaluate(fixture,`${root}.querySelector('.asset-name').textContent`),'circle-info_16');
 await evaluate(fixture,`(()=>{const select=${root}.querySelector('.selection-colors .color-format');select.value='hex';select.dispatchEvent(new Event('change'));${root}.querySelector('.selection-assets').scrollIntoView();})()`);
 await wait(fixture,`${root}.querySelector('.asset-preview-canvas').hidden===false`);
 assert.equal(await evaluate(fixture,`${root}.querySelector('.selection-color-swatch').dataset.colorValue`),'#1E202C');
 await evaluate(fixture,`${root}.querySelector('.selection-color-swatch').click()`);await wait(fixture,`${root}.querySelector('.selection-color-swatch').dataset.copied==='true'`);
 assert.equal(await inject('ISOLATED',`()=>globalThis.__copied`),'#1E202C');
 await evaluate(fixture,`figma.currentPage.selection=[]`);await wait(fixture,`${root}.querySelector('.empty').hidden===false`);assert.equal(await evaluate(fixture,`${root}.querySelector('.section').closest('[hidden]')!==null`),true);
 await evaluate(fixture,`${root}.querySelector('button[aria-label="Close Pecta Mode"]').click()`);await wait(fixture,"!document.getElementById('pecta-mode-root')&&!window.__PECTA_MODE_BRIDGE__");
 await launch();await wait(fixture,`!!${root}`);await wait(fixture,`${root}.querySelector('.updates-item-dot').hidden===false`);assert.equal(await evaluate(fixture,`${root}.querySelector('.settings-update-dot').hidden`),true);await launch();await wait(fixture,"!document.getElementById('pecta-mode-root')&&!window.__PECTA_MODE_BRIDGE__");
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,browser:session.capabilities.browserVersion,checks:['automatic toolbar availability before opening the panel','native blue/gray icon writes','loss and recovery of Figma access','full viewport height','bundled Inter and host serif styles','temporary extension installed','real scripting MAIN and ISOLATED','launcher toggle','CSS/components/tokens','inline copy','live updates','empty selection','close and re-enable cleanup']}));
}finally{if(ws?.readyState===1){await cmd('session.end').catch(()=>{});ws.close();}child.kill();await writeFile(dir+'/browser.log',logs);}
