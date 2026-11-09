// Bundled into the background context. No layer data is sent to GitHub.
globalThis.createPectaUpdateService=function(api,{fetchImpl=(...args)=>globalThis.fetch(...args),now=()=>Date.now()}={}){
  const repository='bogdanhpk/Pecta',endpoint=`https://api.github.com/repos/${repository}/releases/latest`;
  const releaseRoot=`https://github.com/${repository}/releases`,cacheKey='pectaRelease';
  const manifest=api.runtime.getManifest(),currentVersion=manifest.version,browser=manifest.browser_specific_settings?.gecko?'firefox':'chrome';
  let running=null,recent=null,lastAttempt=0,lastResult=null;
  function versionParts(value){return typeof value==='string'&&/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value)&&value.split('.').every(part=>part.length<=5&&Number(part)<=65535)?value.split('.').map(Number):null;}
  function newer(a,b){const first=versionParts(a),second=versionParts(b);if(!first||!second)return false;for(let i=0;i<4;i++){const difference=(first[i]||0)-(second[i]||0);if(difference)return difference>0;}return false;}
  function normalizeRelease(data){
    if(!data||data.draft||data.prerelease||typeof data.tag_name!=='string'||!data.tag_name.startsWith('v'))throw Error('invalid-release');
    const version=data.tag_name.slice(1);if(!versionParts(version))throw Error('invalid-release');
    const assets={};
    for(const target of ['chrome','firefox']){
      const name=`pecta-mode-${version}-${target}.zip`,url=`${releaseRoot}/download/${data.tag_name}/${name}`;
      if(Array.isArray(data.assets)&&data.assets.some(asset=>asset.name===name&&asset.state==='uploaded'&&asset.size>0&&asset.browser_download_url===url))assets[target]=url;
    }
    return{version,assets};
  }
  function cached(value){
    if(!value||!versionParts(value.version)||!Number.isFinite(value.checkedAt)||value.checkedAt>now()+60000)return null;
    const assets={};for(const target of ['chrome','firefox']){const expected=`${releaseRoot}/download/v${value.version}/pecta-mode-${value.version}-${target}.zip`;if(value.assets?.[target]===expected)assets[target]=expected;}
    return{version:value.version,assets,checkedAt:value.checkedAt,etag:typeof value.etag==='string'&&value.etag.length<200?value.etag:null};
  }
  function view(release){
    const available=newer(release.version,currentVersion);
    return{status:available?(release.assets[browser]?'available':'missing-build'):'current',currentVersion,latestVersion:release.version,browser,downloadUrl:release.assets[browser]||null,releaseUrl:`${releaseRoot}/tag/v${release.version}`,checkedAt:release.checkedAt};
  }
  async function readJson(response){
    if(Number(response.headers.get('content-length'))>262144)throw Error('invalid-release');
    if(!response.body?.getReader){const text=await response.text();if(text.length>262144)throw Error('invalid-release');return JSON.parse(text);}
    const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
    try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>262144){await reader.cancel();throw Error('invalid-release');}text+=decoder.decode(chunk.value,{stream:true});}return JSON.parse(text+decoder.decode());}
    finally{reader.releaseLock();}
  }
  async function perform(force){
    if(!recent){try{recent=cached((await api.storage.local.get(cacheKey))[cacheKey]);}catch{}}
    if(!force&&recent&&now()-recent.checkedAt<21600000)return view(recent);
    if(lastResult&&now()-lastAttempt<60000)return lastResult;
    lastAttempt=now();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const headers={Accept:'application/vnd.github+json'};if(recent?.etag)headers['If-None-Match']=recent.etag;
      const response=await fetchImpl(endpoint,{headers,signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'});
      if(response.status===404)return lastResult={status:'unreleased',currentVersion,browser,releaseUrl:releaseRoot};
      if(response.status===403||response.status===429)throw Error('rate-limit');
      if(response.status===304&&recent)recent={...recent,checkedAt:now()};
      else{
        if(!response.ok)throw Error('network');
        recent={...normalizeRelease(await readJson(response)),checkedAt:now(),etag:response.headers.get('etag')};
      }
      try{await api.storage.local.set({[cacheKey]:recent});}catch{}
      return lastResult=view(recent);
    }catch(error){return lastResult={status:'error',reason:error.message==='rate-limit'?'rate-limit':error.message==='invalid-release'?'invalid-release':'network',currentVersion,browser,releaseUrl:releaseRoot,...(recent?{previous:view(recent)}:{})};}
    finally{clearTimeout(timeout);}
  }
  return{check({force=false}={}){if(running)return running;running=perform(force).finally(()=>{running=null;});return running;}};
};
