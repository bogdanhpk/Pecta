// Serialized into MAIN. Reads and exports only the selected component or its own variants.
export async function readComponentPreview(options = {}) {
  const errorText=error=>String(error?.message||error).slice(0,240);
  let api;try{if(typeof figma!=='undefined')api=figma;}catch{}
  const selected=()=>{try{const selection=api?.currentPage?.selection;return Array.isArray(selection)&&selection.length===1?selection[0]:null;}catch{return null;}};
  const current=selected();
  const timeoutMs=Number.isFinite(options.timeoutMs)?Math.max(50,Math.min(8000,options.timeoutMs)):4000;
  let timer;
  try{
    if(!current||current.id!==options.nodeId||!['INSTANCE','COMPONENT','COMPONENT_SET'].includes(current.type))return{status:'stale'};
    return await Promise.race([
      (async()=>{
        let target=current;
        if(options.variantId||current.type==='COMPONENT_SET'){
          const main=current.type==='INSTANCE'?await current.getMainComponentAsync():current;
          const set=main?.type==='COMPONENT_SET'?main:main?.parent?.type==='COMPONENT_SET'?main.parent:null;
          const children=set?.children;
          const variantId=options.variantId||set?.defaultVariant?.id;
          if(!Array.isArray(children))return{status:'unavailable'};
          // No page traversal and no arbitrary getNodeById. Only this component's direct variants.
          const candidates=children.slice(0,128);
          if(main?.type==='COMPONENT'&&!candidates.some(item=>item.id===main.id))candidates.push(main);
          target=variantId?candidates.find(item=>item.type==='COMPONENT'&&item.id===variantId):candidates.find(item=>item.type==='COMPONENT');
          if(!target)return{status:'unavailable'};
        }
        if(typeof target?.exportAsync!=='function')return{status:'unavailable'};
        const width=target.width,height=target.height;
        if(![width,height].every(value=>Number.isFinite(value)&&value>0))return{status:'unavailable'};
        const state=options.exportState;
        if(state?.pending)return{status:'busy'};
        const exporting=Promise.resolve().then(()=>target.exportAsync({format:'PNG',constraint:{type:'SCALE',value:Math.min(2,512/Math.max(width,height))}}));
        if(state){state.pending=exporting;const clear=()=>{if(state.pending===exporting)state.pending=null;};exporting.then(clear,clear);}
        const bytes=await exporting;
        if(selected()?.id!==current.id)return{status:'stale'};
        if(!ArrayBuffer.isView(bytes)||Object.prototype.toString.call(bytes)!=='[object Uint8Array]'||bytes.length>524288)return{status:'too-large'};
        if(bytes.length<8||![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return{status:'invalid'};
        return{status:'ok',bytes,width,height};
      })(),
      new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'timeout'}),timeoutMs);})
    ]);
  }catch(error){return{status:'error',error:errorText(error)};}
  finally{clearTimeout(timer);}
}
