// Update availability comes from the existing, validated background update service.
export function createUpdateNotice({api,el,menu,button,link}){
  const seenKey='pectaSeenUpdateVersion';
  const buttonDot=el('span','update-dot settings-update-dot'),itemDot=el('span','update-dot updates-item-dot');
  for(const dot of [buttonDot,itemDot]){dot.hidden=true;dot.setAttribute('aria-hidden','true');}
  const description=el('span');description.id='pecta-update-status';description.hidden=true;
  button.classList.add('settings-button');button.append(buttonDot);link.classList.add('updates-link');link.append(itemDot);menu.append(description);
  let closed=false,availableVersion=null,seenVersion=null,seenRevision=0,requestId=0,timer;
  const version=value=>typeof value==='string'&&/^\d{1,5}(?:\.\d{1,5}){2,3}$/.test(value)?value:null;
  function render(){
    const unread=!!availableVersion&&availableVersion!==seenVersion&&!menu.open;
    buttonDot.hidden=!unread;itemDot.hidden=!availableVersion;
    button.title=unread?'Settings — update available':'Settings';
    description.textContent=availableVersion?`Version ${availableVersion} is available.`:'';
    if(unread)button.setAttribute('aria-describedby',description.id);else button.removeAttribute('aria-describedby');
    if(availableVersion){link.dataset.updateVersion=availableVersion;link.title=description.textContent;link.setAttribute('aria-describedby',description.id);}
    else{delete link.dataset.updateVersion;link.removeAttribute('title');link.removeAttribute('aria-describedby');}
  }
  function acknowledge(){
    if(closed||!availableVersion)return;
    if(seenVersion!==availableVersion){
      seenVersion=availableVersion;seenRevision++;render();
      const acknowledgedVersion=seenVersion;void Promise.resolve().then(()=>api.storage.local.set({[seenKey]:acknowledgedVersion})).catch(()=>{});
    }else render();
  }
  function apply(result){
    if(result?.status==='available'&&version(result.latestVersion))availableVersion=result.latestVersion;
    else if(['current','unreleased','missing-build'].includes(result?.status))availableVersion=null;
    else return; // A failed check does not erase a previously confirmed update.
    if(menu.open&&availableVersion)acknowledge();else render();
  }
  const initialRevision=seenRevision;
  const seenReady=Promise.resolve().then(()=>api.storage.local.get(seenKey)).then(saved=>{
    if(!closed&&seenRevision===initialRevision)seenVersion=version(saved?.[seenKey]);
  }).catch(()=>{});
  async function refresh(){
    if(closed)return;const id=++requestId;clearTimeout(timer);
    try{
      const [,result]=await Promise.all([seenReady,api.runtime.sendMessage({type:'pecta:updates-check'})]);
      if(!closed&&id===requestId)apply(result);
    }catch{}
    finally{if(!closed&&id===requestId)timer=setTimeout(()=>void refresh(),21600000);}
  }
  function onButtonClick(){if(!menu.open)acknowledge();}
  function onToggle(){if(menu.open)acknowledge();}
  function onStorage(changes,area){
    if(closed||area!=='local')return;
    if(changes[seenKey]){seenRevision++;seenVersion=version(changes[seenKey].newValue);render();}
    if(changes.pectaRelease)void refresh();
  }
  button.addEventListener('click',onButtonClick);menu.addEventListener('toggle',onToggle);api.storage.onChanged?.addListener(onStorage);
  render();void refresh();
  return{close(){closed=true;requestId++;clearTimeout(timer);button.removeEventListener('click',onButtonClick);menu.removeEventListener('toggle',onToggle);api.storage.onChanged?.removeListener(onStorage);}};
}
