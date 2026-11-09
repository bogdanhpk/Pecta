// Classic background script: a service worker in Chrome, an event page in Firefox.
const api=globalThis.browser||globalThis.chrome;
const updateService=globalThis.createPectaUpdateService?.(api);
const epochs=new Map(),checks=new Map(),paintQueues=new Map(),states=new Map();
let epochCounter=0;
const titles={ready:'Pecta Mode — доступен в этом макете',unavailable:'Pecta Mode — откройте доступный макет Figma'};
function figmaPage(value){
  try{const url=new URL(value);return url.protocol==='https:'&&['www.figma.com','figma.com'].includes(url.hostname)?url:null;}catch{return null;}
}
function designPage(url){return url&&/^\/(design|file)\//.test(url.pathname);}
function iconPaths(available){return Object.fromEntries([16,32,48,128].map(size=>[size,`assets/action/${available?'ready':'unavailable'}-${size}.png`]));}
function nextEpoch(tabId){const epoch=++epochCounter;epochs.set(tabId,epoch);return epoch;}
function paint(tabId,available,epoch){
  // Serialize native writes so an old image load cannot finish over a newer state.
  const previous=paintQueues.get(tabId)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    if(epochs.get(tabId)!==epoch||states.get(tabId)===available)return;
    await api.action.setIcon({tabId,path:iconPaths(available)});
    if(epochs.get(tabId)!==epoch)return;
    await api.action.setTitle({tabId,title:available?titles.ready:titles.unavailable});
    if(epochs.get(tabId)===epoch)states.set(tabId,available);
  }).catch(()=>{}).finally(()=>{if(paintQueues.get(tabId)===task)paintQueues.delete(tabId);});
  paintQueues.set(tabId,task);return task;
}
// This function is serialized into MAIN; it never copies nodes or file contents.
function readAvailability(){
  const route=location.origin+location.pathname;
  if(location.protocol!=='https:'||!['www.figma.com','figma.com'].includes(location.hostname)||!/^\/(design|file)\//.test(location.pathname))return{available:false,route};
  try{
    if(typeof figma==='undefined'||!figma)return{available:false,route};
    if(typeof figma.pluginId==='string'&&figma.pluginId)return{available:false,route};
    return{available:Array.isArray(figma.currentPage?.selection),route};
  }catch{return{available:false,route};}
}
function checkTab(tabId){
  if(!Number.isInteger(tabId)||tabId<0)return Promise.resolve(false);
  const existing=checks.get(tabId);
  if(existing&&epochs.get(tabId)===existing.epoch)return existing.task;
  const epoch=nextEpoch(tabId);
  const task=(async()=>{
    let available=false;
    try{
      const tab=await api.tabs.get(tabId),url=figmaPage(tab.url);
      if(designPage(url)&&tab.status!=='loading'){
        let timer,results;
        try{
          results=await Promise.race([
            api.scripting.executeScript({target:{tabId},world:'MAIN',func:readAvailability}),
            new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Availability timed out')),1500);})
          ]);
        }finally{clearTimeout(timer);}
        const result=results.find(item=>item.frameId===0)?.result;
        const current=figmaPage((await api.tabs.get(tabId)).url);
        available=!!(result?.available&&designPage(current)&&result.route===current.origin+current.pathname);
      }
    }catch{}
    if(epochs.get(tabId)!==epoch)return false;
    await paint(tabId,available,epoch);return available;
  })().finally(()=>{if(checks.get(tabId)?.task===task)checks.delete(tabId);});
  checks.set(tabId,{epoch,task});return task;
}
function invalidate(tabId){
  const epoch=nextEpoch(tabId);states.delete(tabId);void paint(tabId,false,epoch);
}
async function refreshExisting(){
  let tabs;try{tabs=await api.tabs.query({url:['https://www.figma.com/*','https://figma.com/*']});}catch{return;}
  await Promise.allSettled(tabs.map(async tab=>{
    if(tab.status!=='loading'){
      try{await api.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',files:['availability.js']});}catch{}
    }
    await checkTab(tab.id);
  }));
}
api.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==api.runtime.id)return false;
  if(message?.type==='pecta:updates-check'&&updateService&&(sender.url?.startsWith(api.runtime.getURL(''))||sender.frameId===0&&figmaPage(sender.url))){
    void updateService.check({force:message.force===true&&sender.url.startsWith(api.runtime.getURL(''))}).then(respond,()=>respond({status:'error'})).catch(()=>{});return true;
  }
  let tabId;
  if(message?.type==='pecta:check-availability'&&sender.frameId===0&&figmaPage(sender.url))tabId=sender.tab?.id;
  else if(message?.type==='pecta:refresh-icon'&&sender.url?.startsWith(api.runtime.getURL('')))tabId=message.tabId;
  else return false;
  if(!Number.isInteger(tabId))return false;
  void checkTab(tabId).then(available=>respond({available}),()=>respond({available:false})).catch(()=>{});
  return true;
});
api.tabs.onActivated.addListener(({tabId})=>{void checkTab(tabId);});
api.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.status==='loading'){invalidate(tabId);return;}
  if(change.url){invalidate(tabId);void checkTab(tabId);}
  else if(change.status==='complete'){states.delete(tabId);void checkTab(tabId);}
});
api.tabs.onRemoved.addListener(tabId=>{epochs.delete(tabId);states.delete(tabId);checks.delete(tabId);});
api.windows.onFocusChanged.addListener(windowId=>{
  if(windowId===api.windows.WINDOW_ID_NONE)return;
  void api.tabs.query({active:true,windowId}).then(tabs=>Promise.allSettled(tabs.map(tab=>checkTab(tab.id)))).catch(()=>{});
});
api.runtime.onInstalled.addListener(()=>{void refreshExisting();});
api.runtime.onStartup.addListener(()=>{void refreshExisting();});
api.permissions.onAdded.addListener(()=>{void refreshExisting();});
api.permissions.onRemoved.addListener(()=>{
  for(const tabId of epochs.keys())invalidate(tabId);
  void refreshExisting();
});
