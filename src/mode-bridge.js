import { probeFigmaPage } from './probe.js';
import { readComponentPreview } from './component-reader.js';

// The build embeds the reader here so this function survives executeScript serialization.
export function startModeBridge(options = {}) {
  // @pecta:embed-reader
  // @pecta:embed-component-reader
  const key = '__PECTA_MODE_BRIDGE__';
  globalThis[key]?.stop?.();
  const channel = options.channel;
  if (typeof channel !== 'string' || channel.length > 100) throw new Error('Invalid Pecta channel');
  let stopped = false, timer, running = false, queued = false, pending = null;
  let seq = 0, fingerprint = '', route = location.pathname, lastRichAt = 0;
  const cache = new Map(),previewCache=new Map();
  let previewRunning=false,previewPending=null;const exportState={pending:null};
  const readOptions = { stateless:true, requireSingle:true, includeText:true, includeMeasurements:true, extensionVersion:options.extensionVersion, variableLimit:32, variableCache:cache };
  const send = (type, report, version = seq) => {
    if (!stopped) window.postMessage({source:'pecta-mode',channel,direction:'from-page',type,seq:version,report}, location.origin);
  };
  const signature = report => JSON.stringify([location.pathname,report.verdict,report.apiAccess?.selectionCount,report.nodes?.map(n=>n.fields)]);
  const bridge = { channel, stop() {
    if (stopped) return;
    send('stopped'); stopped = true; clearTimeout(timer); pending = null; previewPending=null;cache.clear();previewCache.clear();
    window.removeEventListener('message', onCommand);
    document.removeEventListener('visibilitychange', onVisibility);
    if (globalThis[key] === bridge) delete globalThis[key];
  }};
  globalThis[key] = bridge;
  async function drain() {
    if (running || stopped) return;
    running = true;
    try {
      while (pending && !stopped) {
        const request = pending; pending = null;
        const report = await probeFigmaPage({...readOptions,action:'snapshot'});
        if (stopped) break;
        // The selection can change between two polling ticks, including during an API await.
        const current = await probeFigmaPage({...readOptions,action:'fast'});
        if (request.seq === seq && request.fingerprint === fingerprint && signature(current) === request.fingerprint && signature(report) === request.fingerprint) {
          lastRichAt = Date.now(); send('rich',report,request.seq);
        }
      }
    } catch (error) { send('error',{message:String(error?.message || error).slice(0,240)}); }
    finally { running = false; }
  }
  async function tick(force = false) {
    if (stopped) return;
    if (queued) return;
    queued = true;
    clearTimeout(timer);
    try {
      if (!document.getElementById('pecta-mode-root') || !/^\/(design|file)\//.test(location.pathname)) { bridge.stop(); return; }
      if (route !== location.pathname) { route = location.pathname; cache.clear();previewCache.clear(); }
      const report = await probeFigmaPage({...readOptions,action:'fast'});
      if (stopped) return;
      const next = signature(report), changed = next !== fingerprint;
      if (changed) { fingerprint = next; seq++; pending = null; send('fast',report); }
      if (report.verdict === 'selection-readable' && (changed || force || (!running && Date.now()-lastRichAt >= 5000))) {
        pending = {seq,fingerprint}; void drain();
      }
    } catch (error) { send('error',{message:String(error?.message || error).slice(0,240)}); }
    finally {
      queued = false;
      if (!stopped) timer = setTimeout(tick, document.hidden ? 1200 : 250);
    }
  }
  async function drainPreviews(){
    if(previewRunning||stopped)return;
    previewRunning=true;
    try{
      while(previewPending&&!stopped){
        const request=previewPending;previewPending=null;
        const key=JSON.stringify([request.seq,request.nodeId,request.variantId]);
        const cached=previewCache.get(key);
        const result=cached&&cached.expiresAt>Date.now()?cached.result:await readComponentPreview({...request,exportState});
        if(stopped)break;
        if(result.status==='ok'){
          if(previewCache.size>=8)previewCache.delete(previewCache.keys().next().value);
          previewCache.set(key,{result,expiresAt:Date.now()+5000});
        }
        if(request.seq===seq&&!previewPending)send('component-preview',{...result,nodeId:request.nodeId,requestId:request.requestId},request.seq);
      }
    }finally{previewRunning=false;}
  }
  function onCommand(event) {
    const data = event.data;
    if (event.origin !== location.origin || (event.source && event.source !== window) || data?.source !== 'pecta-mode' || data.channel !== channel || data.direction !== 'to-page') return;
    if (data.type === 'stop') bridge.stop();
    if (data.type === 'refresh') { cache.clear();previewCache.clear();void tick(true); }
    if(data.type==='component-preview'&&Number.isSafeInteger(data.requestId)&&data.seq===seq&&typeof data.nodeId==='string'&&data.nodeId.length<=128&&(!data.variantId||typeof data.variantId==='string'&&data.variantId.length<=128)){
      previewPending={requestId:data.requestId,seq,nodeId:data.nodeId,variantId:data.variantId||null};void drainPreviews();
    }
  }
  function onVisibility() { if (!document.hidden) void tick(); }
  window.addEventListener('message',onCommand);
  document.addEventListener('visibilitychange',onVisibility);
  void tick();
  return {started:true};
}
