import {textColor} from './typography.js';
import {colorText,numberText,previewBackground} from './format.js';
import {lengthValue} from './units.js';

export function createSelectionResources({el,icon,copyButton,requestAsset,onColorFormatChange,getUnit}){
  const node=el('div','selection-resources');
  const colors=el('section','section selection-colors'),heading=el('div','section-heading');heading.append(el('h2','section-title','Colors'));
  const formatSelect=el('select','color-format');formatSelect.setAttribute('aria-label','Формат цветов выделения');
  for(const [value,label] of [['hex','Hex'],['rgb','RGB'],['hsl','HSL']]){const option=el('option','',label);option.value=value;formatSelect.append(option);}heading.append(formatSelect);
  const colorList=el('div','selection-color-list'),colorHint=el('p','hint'),coverage=el('p','hint resources-coverage');
  colors.append(heading,el('p','hint selection-colors-label','Selection colors'),colorList,colorHint);
  const assetsSection=el('section','section selection-assets'),details=el('details','assets-details');details.open=true;details.append(el('summary','section-title','Assets'));
  const assetList=el('div','asset-groups'),assetHint=el('p','hint');details.append(assetList,assetHint);assetsSection.append(details);node.append(colors,assetsSection,coverage);
  let current=null,seq=-1,report=null,format='hex',requestId=0,colorKey='',assetKey='',generation=0;
  const cards=new Map(),requests=new Map(),urls=new Set(),timers=new Set();
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const card=cards.get(entry.target.dataset.assetId);if(card){card.visible=entry.isIntersecting;if(card.visible)beginPreview(card);}}},{rootMargin:'80px'});
  const text=(target,value)=>{if(target.textContent!==value)target.textContent=value;};
  function showStatus(card,message){card.canvas.hidden=true;card.stage.dataset.background='light';text(card.status,message);card.status.hidden=false;}
  function sendAsset(card,preview,exportFormat='PNG'){
    const id=++requestId;requests.set(id,{card,preview,seq,generation});
    requestAsset({nodeId:current.fields.id,assetId:card.asset.id,requestId:id,seq,preview,format:exportFormat});return id;
  }
  function beginPreview(card){
    if(!current||!details.open||!card.visible||card.pending||Date.now()-card.lastPreviewAt<5000)return;
    card.pending=true;card.lastPreviewAt=Date.now();sendAsset(card,true);
  }
  details.addEventListener('toggle',()=>{if(details.open)for(const card of cards.values())beginPreview(card);});
  formatSelect.onchange=()=>onColorFormatChange(formatSelect.value);
  function renderColors(){
    const key=JSON.stringify([report?.colors,format]);if(key===colorKey)return;colorKey=key;formatSelect.value=format;
    const fragment=document.createDocumentFragment();
    for(const item of report?.colors||[]){
      const color=textColor(item.paint,format),name=item.name||color?.value||colorText(item.paint),row=el('div','selection-color-row');row.dataset.colorName=item.name||'';
      const swatch=copyButton(()=>color?.value||'',`Копировать цвет · ${color?.value||name}`,true,()=>{const mark=el('span','metric-label property-swatch');if(color)mark.style.setProperty('--swatch-color',color.swatch);else mark.textContent='◈';return mark;});
      swatch.className='property-color-copy selection-color-swatch';swatch.disabled=!color;swatch.dataset.colorValue=color?.value||'';
      const label=copyButton(()=>item.name||color?.value||'',`Копировать ${name}`,false,()=>el('span','selection-color-name',name));label.className='property-value';label.title=color?`${name} · ${color.value}`:name;label.disabled=!item.name&&!color;
      row.append(swatch,label);fragment.append(row);
    }
    colorList.replaceChildren(fragment);
  }
  function download(card,exportFormat){
    if(card.downloading)return;card.downloading=true;card.menu.open=false;card.message.hidden=false;text(card.message,'Готовим файл…');sendAsset(card,false,exportFormat);
  }
  function renderAssets(){
    const unit=getUnit(),key=JSON.stringify([report?.assets,unit]);
    if(key!==assetKey){
      assetKey=key;generation++;observer.disconnect();cards.clear();requests.clear();const fragment=document.createDocumentFragment();
      for(const [kind,title] of [['icons','Icons'],['images','Images'],['exports','Exports']]){
        const assets=(report?.assets||[]).filter(asset=>asset.kind===kind);if(!assets.length)continue;
        const group=el('section','asset-group');group.append(el('h3','asset-group-title',title));
        for(const asset of assets){
          const row=el('div','asset-row');row.dataset.assetId=asset.id;
          const stage=el('div','asset-preview'),canvas=el('canvas','asset-preview-canvas'),status=el('span','asset-preview-status','…');canvas.hidden=true;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',asset.name);stage.append(canvas,status);
          const body=el('div','asset-body');const name=copyButton(()=>asset.name,`Копировать ${asset.name}`,false,()=>el('span','asset-name',asset.name));name.className='property-value asset-name-button';name.title=asset.name;
          const size=el('p','hint asset-size',`${numberText(lengthValue(asset.width,unit),6)} × ${numberText(lengthValue(asset.height,unit),6)} (${unit})`),message=el('p','hint asset-message');message.hidden=true;message.setAttribute('role','status');body.append(name,size,message);
          const menu=el('details','asset-menu'),summary=el('summary','icon-button');summary.title=`Скачать ${asset.name}`;summary.setAttribute('aria-label',summary.title);summary.append(icon('dots-three'));menu.append(summary);
          const actions=el('div','menu asset-actions');menu.append(actions);
          const card={asset,row,stage,canvas,status,message,menu,visible:false,pending:false,downloading:false,lastPreviewAt:0};cards.set(asset.id,card);
          for(const exportFormat of (kind==='icons'?['PNG','SVG']:['PNG'])){const action=el('button','',`Скачать ${exportFormat}`);action.type='button';action.onclick=()=>download(card,exportFormat);actions.append(action);}
          row.append(stage,body,menu);group.append(row);observer.observe(row);
        }
        fragment.append(group);
      }
      assetList.replaceChildren(fragment);
    }
    for(const card of cards.values())beginPreview(card);
  }
  function renderState(){
    if(!current)return;
    colors.hidden=current.fields.type==='TEXT';
    const ready=report?.status==='ok',failed=report&&report.status!=='ok';
    colorHint.hidden=ready&&report.colors.length>0;text(colorHint,!report?'Загружаем цвета…':failed?'Не удалось прочитать цвета.':'Нет доступных цветов.');
    if(ready){renderColors();renderAssets();}
    assetsSection.hidden=ready&&!report.assets.length;
    assetHint.hidden=ready;text(assetHint,!report?'Ищем ресурсы…':'Не удалось прочитать ресурсы.');
    const c=report?.coverage,notes=[];
    if(c?.truncated)notes.push(`Проверены первые ${c.visited} слоёв выбранного блока.`);
    if(c?.omittedColors)notes.push(`Список цветов ограничен: ${report.colors.length}.`);
    if(c?.omittedAssets)notes.push(`Ресурсов за пределами списка: ${c.omittedAssets}.`);
    if(c?.unreadable)notes.push('Часть свойств недоступна.');
    text(coverage,notes.join(' '));coverage.hidden=!notes.length;
  }
  function render(next,nextSeq){
    if(seq!==nextSeq){reset();seq=nextSeq;}
    current=next;renderState();
  }
  function acceptResources(next){
    if(!current||next.nodeId&&next.nodeId!==current.fields.id||next.status==='stale')return;
    report=next;renderState();
  }
  async function acceptAsset(result){
    const request=requests.get(result?.requestId);if(!request)return;requests.delete(result.requestId);
    const {card,preview}=request;
    if(!current||request.seq!==seq||request.generation!==generation||result.nodeId!==current.fields.id||!card.row.isConnected)return;
    if(preview)card.pending=false;else card.downloading=false;
    if(result.status!=='ok'){
      const message=result.status==='too-large'?'Файл превышает лимит.':result.status==='timeout'?'Figma не ответила вовремя.':result.status==='busy'?'Экспорт занят. Повторите скачивание.':'Не удалось получить файл.';
      if(preview){if(card.canvas.hidden)showStatus(card,result.status==='busy'?'…':'Нет превью');}else{card.message.hidden=false;text(card.message,message);}return;
    }
    try{
      if(!ArrayBuffer.isView(result.bytes)||Object.prototype.toString.call(result.bytes)!=='[object Uint8Array]'||result.bytes.length>(preview?524288:8388608))throw Error('Invalid image');
      const blob=new Blob([new Uint8Array(result.bytes)],{type:result.format==='SVG'?'image/svg+xml':'image/png'});
      if(!preview){
        const url=URL.createObjectURL(blob);urls.add(url);const link=el('a');link.href=url;link.download=(result.name||card.asset.name).replace(/[\\/:*?"<>|\u0000-\u001F]/g,'_').slice(0,120)+'.'+(result.format==='SVG'?'svg':'png');link.hidden=true;node.append(link);link.click();link.remove();card.message.hidden=true;
        const timer=setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);timers.delete(timer);},30000);timers.add(timer);return;
      }
      const bitmap=await createImageBitmap(blob);
      try{
        if(request.seq!==seq||request.generation!==generation||!card.row.isConnected)return;
        if(bitmap.width>512||bitmap.height>512)throw Error('Invalid dimensions');
        card.canvas.width=bitmap.width;card.canvas.height=bitmap.height;const context=card.canvas.getContext('2d');context.drawImage(bitmap,0,0);
        const sample=el('canvas');sample.width=Math.min(bitmap.width,32);sample.height=Math.min(bitmap.height,32);const sampleContext=sample.getContext('2d',{willReadFrequently:true});sampleContext.drawImage(bitmap,0,0,sample.width,sample.height);
        card.stage.dataset.background=previewBackground(sampleContext.getImageData(0,0,sample.width,sample.height).data)||'light';card.canvas.hidden=false;card.status.hidden=true;
      }finally{bitmap.close();}
    }catch{if(preview)showStatus(card,'Нет превью');else{card.message.hidden=false;text(card.message,'Не удалось получить файл.');}}
  }
  function reset(){generation++;current=null;report=null;colorKey='';assetKey='';observer.disconnect();cards.clear();requests.clear();colorList.replaceChildren();assetList.replaceChildren();}
  function close(){reset();for(const url of urls)URL.revokeObjectURL(url);urls.clear();for(const timer of timers)clearTimeout(timer);timers.clear();}
  function setColorFormat(value){format=['hex','rgb','hsl'].includes(value)?value:'hex';formatSelect.value=format;renderColors();}
  return{node,render,acceptResources,acceptAsset,reset,close,setColorFormat};
}
