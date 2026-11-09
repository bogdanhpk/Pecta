// Runs only on figma.com. Hidden tabs do not keep polling the background.
(() => {
  const key='__PECTA_AVAILABILITY_WATCHER__';
  globalThis[key]?.stop?.();
  const api=globalThis.browser||globalThis.chrome;
  let stopped=false,timer,busy=false,lastPath=null;
  function stop(){
    if(stopped)return;stopped=true;clearTimeout(timer);
    document.removeEventListener('visibilitychange',onVisibility);
    window.removeEventListener('pagehide',onPageHide);window.removeEventListener('pageshow',check);
    if(globalThis[key]?.stop===stop)delete globalThis[key];
  }
  async function check(){
    clearTimeout(timer);
    if(stopped||document.hidden||busy)return;
    busy=true;
    try{
      const path=location.pathname;
      if(/^\/(design|file)\//.test(path)||path!==lastPath){
        await api.runtime.sendMessage({type:'pecta:check-availability'});lastPath=path;
      }
    }catch(error){
      try{if(!api.runtime.id||String(error?.message||error).includes('Extension context invalidated'))stop();}catch{stop();}
    }
    finally{busy=false;if(!stopped&&!document.hidden)timer=setTimeout(check,2000);}
  }
  function onVisibility(){if(document.hidden)clearTimeout(timer);else void check();}
  function onPageHide(event){if(event.persisted)clearTimeout(timer);else stop();}
  globalThis[key]={stop};
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',onPageHide);window.addEventListener('pageshow',check);
  void check();
})();
