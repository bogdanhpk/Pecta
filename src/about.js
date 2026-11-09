const api=globalThis.browser||globalThis.chrome;
document.querySelector('#installed').textContent=`Version ${api.runtime.getManifest().version}`;
