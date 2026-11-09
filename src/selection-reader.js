// Serialized into MAIN. Only reads the current selection and a bounded subtree.
export async function readSelectionResources(options={}){
  let unreadable=0;
  const get=(object,key)=>{try{return object?.[key];}catch{unreadable++;return undefined;}};
  let api;try{if(typeof figma!=='undefined')api=figma;}catch{}
  const selected=()=>{const selection=get(get(api,'currentPage'),'selection');return Array.isArray(selection)&&selection.length===1?selection[0]:null;};
  const root=selected();if(!root||get(root,'id')!==options.nodeId)return{status:'stale'};
  const limit=2000,colorLimit=64,assetLimit=32,deadline=Date.now()+1500;
  const colors=new Map(),assets=[],assetNodes=new Map(),seen=new Set(),stack=[{node:root,insideAsset:false}];
  let visited=0,truncated=false,nativeColors=false,colorError=false,omittedAssets=0,omittedColors=0;
  const string=value=>typeof value==='string'?value.slice(0,512):'';
  function paintValue(paint){
    if(!paint||get(paint,'visible')===false)return null;
    const type=get(paint,'type'),opacity=get(paint,'opacity'),color=get(paint,'color');
    if(type==='SOLID'&&color&&['r','g','b'].every(key=>Number.isFinite(get(color,key))))return{type,color:{r:color.r,g:color.g,b:color.b},opacity:Number.isFinite(opacity)?opacity:1};
    if(type?.startsWith('GRADIENT_')){
      const stops=get(paint,'gradientStops');return{type,opacity:Number.isFinite(opacity)?opacity:1,gradientStops:Array.isArray(stops)?stops.slice(0,16).map(stop=>({position:get(stop,'position'),color:{r:get(get(stop,'color'),'r'),g:get(get(stop,'color'),'g'),b:get(get(stop,'color'),'b'),a:get(get(stop,'color'),'a')}})):[]};
    }
    return null;
  }
  function addPaint(paint,{name='',styleId='',variableId=''}={}){
    const value=paintValue(paint);if(!value)return;
    variableId=variableId||string(get(get(get(paint,'boundVariables'),'color'),'id'));
    const key=JSON.stringify([styleId,variableId,value]);if(colors.has(key))return;
    if(colors.size>=colorLimit){omittedColors++;return;}
    colors.set(key,{key,paint:value,name,styleId,variableId});
  }
  // Native selection colors already include nested layers and linked paint styles.
  try{
    if(typeof get(api,'getSelectionColors')==='function'){
      const result=api.getSelectionColors();
      if(result&&Array.isArray(result.paints)&&Array.isArray(result.styles)){
        nativeColors=true;
        const styled=new Set();
        for(const style of result.styles.slice(0,colorLimit)){
          const paints=get(style,'paints');if(!Array.isArray(paints))continue;
          for(const paint of paints.slice(0,20)){const value=paintValue(paint);if(value)styled.add(JSON.stringify(value));addPaint(paint,{name:string(get(style,'name')),styleId:string(get(style,'id'))});}
        }
        for(const paint of result.paints.slice(0,colorLimit))if(!styled.has(JSON.stringify(paintValue(paint)))||get(paint,'boundVariables')?.color)addPaint(paint);
        omittedColors+=Math.max(0,result.paints.length-colorLimit)+Math.max(0,result.styles.length-colorLimit);
      }else colorError=true;
    }
  }catch{colorError=true;}
  while(stack.length&&visited<limit&&Date.now()<deadline){
    if(selected()!==root)return{status:'stale'};
    const {node,insideAsset}=stack.pop();if(!node||seen.has(node))continue;seen.add(node);visited++;
    if(get(node,'visible')===false)continue;
    const fills=get(node,'fills'),strokes=get(node,'strokes');
    if(!nativeColors){
      for(const [paints,key] of [[fills,'fillStyleId'],[strokes,'strokeStyleId']])if(Array.isArray(paints))for(const paint of paints.slice(0,20))addPaint(paint,{styleId:string(get(node,key))});
    }
    const image=Array.isArray(fills)&&fills.some(paint=>get(paint,'visible')!==false&&get(paint,'type')==='IMAGE');
    const isAsset=get(node,'isAsset')===true,settings=get(node,'exportSettings');
    const candidate=!insideAsset&&(isAsset||Array.isArray(settings)&&settings.length>0);
    if(candidate){
      const id=string(get(node,'id')),width=get(node,'width'),height=get(node,'height');
      if(id&&Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0){
        if(assets.length<assetLimit){const asset={id,name:string(get(node,'name'))||'Untitled',width,height,kind:image?'images':isAsset?'icons':'exports'};assets.push(asset);assetNodes.set(id,{node,root});}
        else omittedAssets++;
      }
    }
    // Native colors already cover an asset's contents; its vector paths are not
    // additional assets and need not consume the selected-subtree scan budget.
    const children=nativeColors&&candidate?null:get(node,'children');
    if(Array.isArray(children)){
      const room=Math.max(0,limit-visited-stack.length),count=Math.min(children.length,room);
      if(count<children.length)truncated=true;
      for(let index=count-1;index>=0;index--)stack.push({node:children[index],insideAsset:insideAsset||candidate});
    }
    if(visited%100===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  truncated=truncated||stack.length>0;
  const entries=[...colors.values()],cache=options.cache;
  let timer;
  async function named(key,load){
    const cached=cache?.get(key);if(cached&&cached.expiresAt>Date.now())return cached.value;
    try{const value=await load();const name=string(get(value,'name'));if(name&&cache){if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(key,{value:name,expiresAt:Date.now()+5000});}return name;}catch{return'';}
  }
  const names=entries.map(async entry=>{
    if(entry.variableId&&typeof get(get(api,'variables'),'getVariableByIdAsync')==='function'){
      const name=await named(`resource-variable:${entry.variableId}`,()=>api.variables.getVariableByIdAsync(entry.variableId));if(name)entry.name=name;
    }
    if(!entry.name&&entry.styleId&&typeof get(api,'getStyleByIdAsync')==='function')entry.name=await named(`resource-style:${entry.styleId}`,()=>api.getStyleByIdAsync(entry.styleId));
  });
  await Promise.race([Promise.all(names),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);clearTimeout(timer);
  if(selected()!==root)return{status:'stale'};
  if(options.assetNodes){options.assetNodes.clear();for(const [key,value] of assetNodes)options.assetNodes.set(key,value);}
  return{status:'ok',nodeId:options.nodeId,colors:entries.map(entry=>({...entry})),assets,coverage:{visited,truncated,omittedAssets,omittedColors,unreadable},colorSource:nativeColors?'figma':'layers',colorStatus:!nativeColors&&colorError?'fallback':'ok'};
}

// Assets are authorized by the preceding scan, never by a page-supplied node lookup.
export async function readSelectionAsset(options={}){
  const get=(object,key)=>{try{return object?.[key];}catch{return undefined;}};
  let api;try{if(typeof figma!=='undefined')api=figma;}catch{}
  const selected=()=>{const selection=get(get(api,'currentPage'),'selection');return Array.isArray(selection)&&selection.length===1?selection[0]:null;};
  const entry=options.assetNodes?.get(options.assetId),root=selected();
  if(!entry||!root||root!==entry.root||get(root,'id')!==options.nodeId)return{status:'stale'};
  const target=entry.node;
  function belongs(){let parent=target;for(let depth=0;parent&&depth<2000;depth++){if(get(parent,'visible')===false)return false;if(parent===root)return true;parent=get(parent,'parent');}return false;}
  if(!belongs())return{status:'stale'};
  const width=get(target,'width'),height=get(target,'height'),format=options.format==='SVG'?'SVG':'PNG',preview=options.preview===true;
  if(![width,height].every(value=>Number.isFinite(value)&&value>0)||typeof get(target,'exportAsync')!=='function')return{status:'unavailable'};
  if(!preview&&Math.max(width,height)>8192)return{status:'too-large'};
  const state=options.exportState;if(state?.pending)return{status:'busy'};
  let timer;
  try{
    const exporting=Promise.resolve().then(()=>target.exportAsync({format:preview?'PNG':format,...(preview?{constraint:{type:'SCALE',value:Math.min(2,256/Math.max(width,height))}}:{})}));
    if(state){state.pending=exporting;const clear=()=>{if(state.pending===exporting)state.pending=null;};exporting.then(clear,clear);}
    const result=await Promise.race([exporting,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),Number.isFinite(options.timeoutMs)?Math.max(50,options.timeoutMs):4000);})]);
    if(result===null)return{status:'timeout'};
    if(selected()!==root||!belongs())return{status:'stale'};
    if(!ArrayBuffer.isView(result)||Object.prototype.toString.call(result)!=='[object Uint8Array]')return{status:'invalid'};
    if(result.length>(preview?524288:format==='SVG'?2097152:8388608))return{status:'too-large'};
    if((preview||format==='PNG')&&(result.length<8||![137,80,78,71,13,10,26,10].every((value,index)=>result[index]===value)))return{status:'invalid'};
    return{status:'ok',assetId:options.assetId,bytes:result,width,height,format:preview?'PNG':format,name:typeof get(target,'name')==='string'?target.name.slice(0,512):'asset'};
  }catch{return{status:'error'};}
  finally{clearTimeout(timer);}
}
