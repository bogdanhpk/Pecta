import { startModeBridge } from './mode-entry.js';
const api=globalThis.browser||globalThis.chrome;
const version=api.runtime.getManifest().version;
document.querySelector('#version').textContent=`v${version}`;
let busy=false,targetTabId;
async function refreshIcon(){try{await api.runtime.sendMessage({type:'pecta:refresh-icon',tabId:targetTabId});}catch{}}
async function cleanup(tabId) {
  if(!Number.isInteger(tabId))return;
  await Promise.allSettled([
    api.scripting.executeScript({target:{tabId},world:'ISOLATED',func:()=>globalThis.__PECTA_MODE_UI__?.close?.()}),
    api.scripting.executeScript({target:{tabId},world:'MAIN',func:()=>globalThis.__PECTA_MODE_BRIDGE__?.stop?.()})
  ]);
}
async function launch() {
  if(busy)return;busy=true;
  const status=document.querySelector('#status');status.textContent='Подключаемся к Figma…';
  document.querySelector('#retry').hidden=true;document.querySelector('#diagnostics').hidden=true;
  let mounting=false;
  try {
    const [tab]=await api.tabs.query({active:true,currentWindow:true});
    const url=new URL(tab?.url||'about:blank');
    if(url.protocol!=='https:'||!['www.figma.com','figma.com'].includes(url.hostname)||!/^\/(design|file)\//.test(url.pathname))throw new Error('Откройте макет на figma.com и нажмите значок Pecta в этой вкладке.');
    targetTabId=tab.id;
    const [state]=await api.scripting.executeScript({target:{tabId:targetTabId},world:'ISOLATED',func:()=>!!globalThis.__PECTA_MODE_UI__?.isOpen});
    if(state?.result){await cleanup(targetTabId);await refreshIcon();window.close();return;}
    mounting=true;
    const config={channel:crypto.randomUUID(),extensionVersion:version,targetTabId};
    await api.scripting.executeScript({target:{tabId:targetTabId},world:'ISOLATED',func:value=>{globalThis.__PECTA_MODE_LAUNCH__=value;},args:[config]});
    await api.scripting.executeScript({target:{tabId:targetTabId},world:'ISOLATED',files:['inspector-ui.bundle.js']});
    const [mounted]=await api.scripting.executeScript({target:{tabId:targetTabId},world:'ISOLATED',func:()=>!!globalThis.__PECTA_MODE_UI__?.isOpen});
    if(!mounted?.result)throw new Error('Не удалось открыть панель Pecta. Перезагрузите вкладку и повторите.');
    const [started]=await api.scripting.executeScript({target:{tabId:targetTabId},world:'MAIN',func:startModeBridge,args:[config]});
    if(!started?.result?.started)throw new Error(started?.error?.message||'Не удалось подключиться к макету.');
    await api.storage.local.set({lastFigmaTabId:targetTabId});
    await refreshIcon();
    window.close();
  } catch(error) {
    if(mounting)await cleanup(targetTabId);
    if(Number.isInteger(targetTabId))await refreshIcon();
    status.textContent=error.message||String(error);
    document.querySelector('#retry').hidden=false;document.querySelector('#diagnostics').hidden=!Number.isInteger(targetTabId);
  } finally {busy=false;}
}
document.querySelector('#retry').onclick=()=>void launch();
document.querySelector('#diagnostics').onclick=()=>api.tabs.create({url:api.runtime.getURL(`popup.html?tabId=${targetTabId}`)});
void launch();
