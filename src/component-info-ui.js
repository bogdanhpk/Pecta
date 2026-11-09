import {componentItems,previewBackground} from './format.js';

export function createComponentInformation({el,icon,copyButton,requestPreview}){
  const node=el('section','section component-information');
  const details=el('details','component-information-details');details.open=true;
  details.append(el('summary','section-title','Информация о компоненте'));node.append(details);
  const name=el('div','component-name'),source=el('p','component-source'),description=el('p','component-description');
  const stage=el('div','component-preview');stage.setAttribute('aria-label','Превью компонента');
  const canvas=el('canvas','component-preview-canvas');canvas.hidden=true;canvas.setAttribute('role','img');
  const previewLabel=el('span','component-preview-label','Просмотр варианта');previewLabel.hidden=true;stage.append(previewLabel);
  const previewStatus=el('span','component-preview-status','Загружаем превью…');previewStatus.setAttribute('role','status');stage.append(canvas,previewStatus);
  const propertyRows=el('dl','component-property-rows'),more=el('button','component-more');more.type='button';more.hidden=true;more.setAttribute('aria-expanded','false');
  const documentation=el('div','component-documentation');
  const explore=el('button','component-explore','Посмотреть варианты');explore.type='button';explore.hidden=true;explore.setAttribute('aria-expanded','false');explore.setAttribute('aria-controls','pecta-component-variants');
  const playground=el('div','component-playground');playground.id='pecta-component-variants';playground.hidden=true;
  const variantLabel=el('label','component-variant-label','Вариант'),variantSelect=el('select','component-variant-select');variantSelect.id='pecta-component-variant';variantLabel.htmlFor=variantSelect.id;
  const variantStatus=el('p','hint'),variantRows=el('dl','component-property-rows');playground.append(variantLabel,variantSelect,variantStatus,variantRows);
  const metadataStatus=el('p','hint');details.append(name,source,description,stage,propertyRows,more,documentation,explore,playground,metadataStatus);
  let current=null,rich=false,seq=-1,metadata=null,selectedId='',requestId=0,rowsKey='',variantKey='',linksKey='',expanded=false,lastPreviewAt=0,previewKey='',wantedKey='',paintGeneration=0;
  const text=(target,value)=>{if(target.textContent!==String(value))target.textContent=String(value);};
  function showPreviewStatus(message){paintGeneration++;canvas.hidden=true;previewStatus.hidden=false;text(previewStatus,message);stage.removeAttribute('aria-busy');delete stage.dataset.background;}
  function updateMore(){
    [...propertyRows.children].forEach((row,index)=>{row.hidden=index>=3&&!expanded;});
    more.hidden=propertyRows.childElementCount<=3;more.setAttribute('aria-expanded',String(expanded));const count=propertyRows.childElementCount-3,form=count%10===1&&count%100!==11?'свойство':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'свойства':'свойств';text(more,expanded?'Скрыть свойства':`Ещё ${count} ${form}`);
  }
  more.onclick=()=>{expanded=!expanded;updateMore();};
  function fillRows(target,fields){
    const rows=componentItems(fields),fragment=document.createDocumentFragment();
    for(const item of rows){
      const {name:label,value,type,rawValue}=item;
      const row=el('div','component-property-row'),title=el('dt','',label),cell=el('dd');row.dataset.propertyType=type;
      const copy=copyButton(()=>item.copy,`Копировать ${label}`,false,()=>{
        const content=document.createDocumentFragment();
        const iconName=type==='VARIANT'?'diamond-fill':type==='BOOLEAN'&&typeof rawValue==='boolean'?(rawValue?'toggle-right':'toggle-left'):null;
        if(iconName){
          const kind=el('span','component-property-kind');kind.dataset.type=type;if(type==='BOOLEAN')kind.dataset.state=String(rawValue);
          kind.append(icon(iconName));content.append(kind);
        }
        content.append(el('span','component-property-text',value));return content;
      });
      copy.className='property-value component-property-value';copy.title=value;cell.append(copy);row.append(title,cell);fragment.append(row);
    }
    target.replaceChildren(fragment);
  }
  function variantFields(){const variant=metadata?.variants?.find(item=>item.id===variantSelect.value);return{variantProperties:variant?.properties||{}};}
  function beginPreview(force=false){
    if(!current||!rich||!details.open)return;
    const variantId=playground.hidden?null:variantSelect.value||null;previewLabel.hidden=!variantId;
    const {id,name,width,height,fills,strokes,opacity,componentProperties,variantProperties}=current.fields;
    const key=JSON.stringify([id,variantId,variantId?null:{name,width,height,fills,strokes,opacity,componentProperties,variantProperties}]);
    if(!force&&previewKey===key&&Date.now()-lastPreviewAt<5000)return;
    if(!metadata?.previewAvailable){showPreviewStatus('Превью недоступно');return;}
    previewKey=key;lastPreviewAt=Date.now();wantedKey=key;
    if(force||canvas.hidden){showPreviewStatus('Загружаем превью…');stage.setAttribute('aria-busy','true');}
    requestId++;requestPreview({nodeId:current.fields.id,variantId,requestId,seq});
    canvas.setAttribute('aria-label',variantId?variantSelect.selectedOptions[0]?.textContent||'Вариант компонента':current.fields.name||'Компонент');
  }
  explore.onclick=()=>{
    playground.hidden=!playground.hidden;explore.setAttribute('aria-expanded',String(!playground.hidden));text(explore,playground.hidden?'Посмотреть варианты':'Закрыть варианты');
    if(!playground.hidden){fillRows(variantRows,variantFields());variantSelect.focus();}
    beginPreview(true);
  };
  variantSelect.onchange=()=>{fillRows(variantRows,variantFields());beginPreview(true);};
  details.addEventListener('toggle',()=>{if(details.open)beginPreview();});
  function render(next,isRich,version){
    const fields=next.fields;node.hidden=!['INSTANCE','COMPONENT','COMPONENT_SET'].includes(fields.type);
    if(node.hidden){reset();return;}
    current=next;rich=isRich;seq=version;
    if(selectedId!==fields.id){
      selectedId=fields.id;metadata=null;requestId++;paintGeneration++;rowsKey='';variantKey='';linksKey='';expanded=false;previewKey='';wantedKey='';lastPreviewAt=0;
      playground.hidden=true;previewLabel.hidden=true;explore.setAttribute('aria-expanded','false');text(explore,'Посмотреть варианты');showPreviewStatus('Загружаем превью…');
    }
    if(isRich)metadata=next.component?.status==='ok'?next.component.value:null;
    const family=metadata?.componentSet?.name||metadata?.name||(fields.type!=='INSTANCE'?fields.name:null);
    if(name.dataset.name!==(family||'')){name.dataset.name=family||'';name.replaceChildren(icon('diamond'),el('span','',family||'Компонент'));}
    const sourceName=metadata?.sourceName||(metadata?.remote===true?'Библиотечный компонент':'');source.hidden=!sourceName;text(source,sourceName);
    description.hidden=!metadata?.description;text(description,metadata?.description||'');
    metadataStatus.hidden=!!family;text(metadataStatus,!isRich?'Загружаем информацию…':next.component?.status==='timeout'?'Информация не получена вовремя.':'Информация о главном компоненте недоступна.');
    const propsFields={...fields};
    if(fields.type!=='INSTANCE'&&metadata?.propertyDefinitions){
      propsFields.componentProperties=Object.fromEntries(Object.entries(metadata.propertyDefinitions).map(([key,value])=>[key,{type:value.type,value:propsFields.variantProperties?.[key.replace(/#[^#]+$/,'')]??value.defaultValue}]));
    }
    const signature=JSON.stringify([propsFields.componentProperties,propsFields.variantProperties]);
    if(signature!==rowsKey){rowsKey=signature;fillRows(propertyRows,propsFields);updateMore();}
    const variants=metadata?.variants||[],vkey=JSON.stringify(variants);
    if(vkey!==variantKey){
      variantKey=vkey;const old=variantSelect.value;variantSelect.replaceChildren(...variants.map(variant=>{const option=el('option','',variant.name||variant.id);option.value=variant.id;return option;}));
      const active=variants.find(variant=>variant.id===old)||variants.find(variant=>variant.id===metadata?.id)||variants[0];if(active)variantSelect.value=active.id;
      fillRows(variantRows,variantFields());
    }
    explore.hidden=variants.length<2;
    if(explore.hidden&&!playground.hidden){playground.hidden=true;explore.setAttribute('aria-expanded','false');text(explore,'Посмотреть варианты');previewKey='';}
    const omitted=Math.max(0,(metadata?.variantCount||0)-variants.length);variantStatus.hidden=!omitted;text(variantStatus,omitted?`Показаны ${variants.length} из ${metadata.variantCount} вариантов.`:'');
    const links=(metadata?.documentationLinks||[]).filter(item=>{try{return typeof item.uri==='string'&&item.uri.length<=2048&&['https:','http:'].includes(new URL(item.uri).protocol);}catch{return false;}}).slice(0,5),lkey=JSON.stringify(links);
    if(lkey!==linksKey){linksKey=lkey;documentation.replaceChildren(...links.map((item,index)=>{const link=el('a','component-doc-link',links.length===1?'Документация':`Документация ${index+1}`);link.href=item.uri;link.target='_blank';link.rel='noopener noreferrer';return link;}));}documentation.hidden=!links.length;
    if(isRich){if(!metadata)showPreviewStatus('Превью недоступно');else beginPreview();}
  }
  async function acceptPreview(result){
    if(result?.requestId!==requestId||result.nodeId!==selectedId||!node.isConnected)return;
    if(result.status!=='ok'){showPreviewStatus(result.status==='timeout'?'Не удалось загрузить превью вовремя.':result.status==='busy'?'Превью ещё загружается…':'Превью недоступно');return;}
    const key=wantedKey,generation=++paintGeneration;
    try{
      const bytes=result.bytes;
      // Firefox delivers typed arrays from the page in a different realm.
      if(!ArrayBuffer.isView(bytes)||Object.prototype.toString.call(bytes)!=='[object Uint8Array]'||bytes.length>524288)throw Error('Invalid image');
      const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
      try{
        if(generation!==paintGeneration||result.requestId!==requestId||key!==wantedKey||!node.isConnected)return;
        if(bitmap.width>1024||bitmap.height>1024)throw Error('Invalid image size');
        canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0);
        const sample=el('canvas');sample.width=Math.min(48,bitmap.width);sample.height=Math.min(48,bitmap.height);
        const sampleContext=sample.getContext('2d',{willReadFrequently:true});sampleContext.drawImage(bitmap,0,0,sample.width,sample.height);
        const background=previewBackground(sampleContext.getImageData(0,0,sample.width,sample.height).data);
        if(background)stage.dataset.background=background;else delete stage.dataset.background;
        const scale=Math.min(1,192/result.width,96/result.height);canvas.style.width=`${Math.max(1,result.width*scale)}px`;canvas.style.height=`${Math.max(1,result.height*scale)}px`;
        canvas.hidden=false;previewStatus.hidden=true;stage.removeAttribute('aria-busy');
      }finally{bitmap.close();}
    }catch{if(generation===paintGeneration)showPreviewStatus('Превью недоступно');}
  }
  function reset(){current=null;rich=false;selectedId='';metadata=null;requestId++;paintGeneration++;canvas.hidden=true;canvas.width=1;canvas.height=1;delete stage.dataset.background;}
  return{node,render,acceptPreview,reset};
}
