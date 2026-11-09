import {numberText} from './format.js';
import {lengthValue} from './units.js';

export function textTypography(node,unit='px'){
  const f=node.fields,style=node.textStyle;
  const length=value=>`${numberText(lengthValue(value,unit),unit==='rem'?6:2)}${unit}`;
  const valid=value=>Number.isFinite(value)&&value>=0;
  const fontPixels=valid(f.fontSize)?f.fontSize:null;
  const fontLabel=fontPixels===null?numberText(f.fontSize):length(fontPixels);
  const line=f.lineHeight;let linePixels=null,lineLabel='—',lineCopy='';
  if(line?.unit==='AUTO'){lineLabel='Auto';lineCopy='Auto';}
  else if(line?.unit==='PERCENT'&&valid(line.value)){lineLabel=`${numberText(line.value)}%`;lineCopy=lineLabel;linePixels=fontPixels===null?null:fontPixels*line.value/100;}
  else if(valid(line?.value??line)){linePixels=line?.value??line;lineLabel=length(linePixels);lineCopy=lineLabel;}
  else lineLabel=numberText(line);
  const styleName=style?.status==='ok'&&style.value?.name?style.value.name:null;
  const caption=styleName||(['mixed','[mixed-or-symbol]'].includes(style?.status)||f.textStyleId==='[mixed-or-symbol]'?'Смешанные текстовые стили':style?.status==='pending'&&f.textStyleId?'Загружаем стиль…':f.textStyleId?'Имя стиля недоступно':'Без текстового стиля');
  const scale=76/Math.max(fontPixels||56,linePixels||76);
  return{fontPixels,linePixels,fontLabel,lineLabel,fontCopy:fontPixels===null?'':fontLabel,lineCopy,styleName,caption,fontGuide:fontPixels===null?56:Math.max(1,fontPixels*scale),lineGuide:linePixels===null?76:Math.max(1,linePixels*scale)};
}

// A style token is inherited only while that property still matches the linked style.
export function textStyleBindings(node){
  const f=node.fields,style=node.textStyle?.status==='ok'?node.textStyle.value:null,result={};
  if(!style||!f.textStyleId||style.id!==f.textStyleId)return result;
  const property=(value,key)=>key==='fontFamily'?value.fontName?.family:key==='fontStyle'?value.fontName?.style:value[key];
  for(const [key,binding] of Object.entries(style.boundVariables||{})){
    if(Object.hasOwn(f.boundVariables||{},key))continue;
    const actual=property(f,key);let original=property(style,key);
    if(key==='fontWeight'&&original===undefined){
      const variable=node.variables?.find(record=>record.id===binding?.id&&record.status==='ok')?.value;
      const mode=node.variableModes?.entries?.find(entry=>entry.id===variable?.variableCollectionId)?.modeId;
      original=variable?.valuesByMode?.[mode];
      if(JSON.stringify(f.fontName)!==JSON.stringify(style.fontName))continue;
    }
    if(actual!==undefined&&original!==undefined&&JSON.stringify(actual)===JSON.stringify(original))result[key]=binding;
  }
  return result;
}

export function textColor(paint,format='hex'){
  if(paint?.type!=='SOLID'||!paint.color||![paint.color.r,paint.color.g,paint.color.b].every(Number.isFinite))return null;
  const channels=[paint.color.r,paint.color.g,paint.color.b].map(value=>Math.round(Math.min(1,Math.max(0,value))*255));
  const alpha=Math.min(1,Math.max(0,(Number.isFinite(paint.opacity)?paint.opacity:1)*(Number.isFinite(paint.color.a)?paint.color.a:1)));
  const hex='#'+channels.map(value=>value.toString(16).padStart(2,'0')).join('').toUpperCase();
  const suffix=alpha<1?` / ${numberText(alpha*100)}%`:'';
  let value=hex+(alpha<1?Math.round(alpha*255).toString(16).padStart(2,'0').toUpperCase():'');
  if(format==='rgb')value=`rgb(${channels.join(' ')}${suffix})`;
  if(format==='hsl'){
    const [r,g,b]=channels.map(channel=>channel/255),maximum=Math.max(r,g,b),minimum=Math.min(r,g,b),delta=maximum-minimum,lightness=(maximum+minimum)/2;
    const saturation=delta===0?0:delta/(1-Math.abs(2*lightness-1));
    let hue=delta===0?0:maximum===r?((g-b)/delta)%6:maximum===g?(b-r)/delta+2:(r-g)/delta+4;hue=(hue*60+360)%360;
    value=`hsl(${numberText(hue,1)} ${numberText(saturation*100,1)}% ${numberText(lightness*100,1)}%${suffix})`;
  }
  return{value,swatch:`rgb(${channels.join(' ')}${suffix})`};
}
