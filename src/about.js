const api=globalThis.browser||globalThis.chrome;
document.querySelector('#installed').textContent=`Версия ${api.runtime.getManifest().version}`;
