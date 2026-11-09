import {numberText,colorText} from './format.js';
import {lengthValue} from './units.js';
import {textStyleBindings,textColor,textTypography} from './typography.js';

export function layerRadii(fields){
  return Object.fromEntries([['tl','topLeftRadius'],['tr','topRightRadius'],['br','bottomRightRadius'],['bl','bottomLeftRadius']].map(([corner,key])=>{
    const value=Number.isFinite(fields[key])?fields[key]:fields.cornerRadius;
    return[corner,Number.isFinite(value)&&value>=0?value:null];
  }));
}

export function layerPropertyGroups(node,unit='px',colorFormat='hex'){
  const f=node.fields,groups=[];
  const fmt=value=>numberText(lengthValue(value,unit),unit==='rem'?6:2);
  const dimension=value=>Number.isFinite(value)?`${fmt(value)}${unit}`:numberText(value);
  const resolved=new Map((node.variables||[]).filter(record=>record.status==='ok'&&record.value?.name).map(record=>[record.id,record.value]));
  const styleBindings=f.type==='TEXT'?textStyleBindings(node):{};
  function aliases(value,ids=new Set(),depth=0){
    if(!value||typeof value!=='object'||depth>7)return ids;
    if(value.type==='VARIABLE_ALIAS'&&typeof value.id==='string')ids.add(value.id);
    else for(const item of Object.values(value))aliases(item,ids,depth+1);
    return ids;
  }
  function group(id,title){const result={id,title,rows:[]};groups.push(result);return result;}
  function add(target,id,label,value,{bindings=[id],extra,indent=false,heading=false,swatch,copy=value}={}){
    const ids=new Set();for(const key of bindings)aliases(f.boundVariables?.[key]??styleBindings[key],ids);aliases(extra,ids);
    const tokens=[...ids].map(key=>resolved.get(key)).filter(Boolean).map(variable=>({id:variable.id,name:variable.name,type:variable.resolvedType}));
    target.rows.push({id,label,value,tokens,indent,heading,swatch,copy});
  }
  function length(target,id,label,options={}){add(target,id,label,dimension(f[id]),{...options,copy:Number.isFinite(f[id])?dimension(f[id]):null});}
  const layout=group('layout','Layout');
  const auto=f.type!=='TEXT'&&['HORIZONTAL','VERTICAL','GRID'].includes(f.layoutMode);
  function sizingMode(axis,key){
    const explicit={FILL:'Fill',HUG:'Hug',FIXED:'Fixed'}[f[key]];if(explicit)return explicit;
    const parentFlow=f.parent?.layoutMode;
    const alongFlow=parentFlow===(axis==='width'?'HORIZONTAL':'VERTICAL');
    const acrossFlow=parentFlow===(axis==='width'?'VERTICAL':'HORIZONTAL');
    if(f.layoutPositioning!=='ABSOLUTE'&&(alongFlow&&f.layoutGrow===1||acrossFlow&&f.layoutAlign==='STRETCH'))return'Fill';
    const ownMode=f.layoutMode==='HORIZONTAL'?(axis==='width'?f.primaryAxisSizingMode:f.counterAxisSizingMode):f.layoutMode==='VERTICAL'?(axis==='height'?f.primaryAxisSizingMode:f.counterAxisSizingMode):null;
    return ownMode==='AUTO'?'Hug':ownMode==='FIXED'?'Fixed':null;
  }
  if(auto)add(layout,'layoutMode','Flow',{HORIZONTAL:'Horizontal',VERTICAL:'Vertical',GRID:'Grid'}[f.layoutMode]);
  for(const [axis,label,sizing] of [['width','Width','layoutSizingHorizontal'],['height','Height','layoutSizingVertical']]){
    const mode=sizingMode(axis,sizing);
    add(layout,axis,label,mode?`${mode} (${dimension(f[axis])})`:dimension(f[axis]),{copy:Number.isFinite(f[axis])?dimension(f[axis]):null});
  }
  for(const [id,label] of [['minWidth','Min width'],['maxWidth','Max width'],['minHeight','Min height'],['maxHeight','Max height']])if(Number.isFinite(f[id]))length(layout,id,label);
  const corners=layerRadii(f),values=Object.values(corners);
  const cornerBindings=['topLeftRadius','topRightRadius','bottomRightRadius','bottomLeftRadius'].map(key=>JSON.stringify([...aliases(f.boundVariables?.[key])].sort()));
  if(values.every(value=>value!==null)&&values.every(value=>value===values[0])&&cornerBindings.every(value=>value===cornerBindings[0])){
    add(layout,'cornerRadius','Radius',dimension(values[0]),{bindings:['cornerRadius','topLeftRadius','topRightRadius','bottomRightRadius','bottomLeftRadius'],copy:dimension(values[0])});
  }else if(values.some(value=>value!==null)){
    add(layout,'radius','Radius','',{heading:true,copy:null});
    for(const [corner,id,label] of [['tl','topLeftRadius','Top left'],['tr','topRightRadius','Top right'],['br','bottomRightRadius','Bottom right'],['bl','bottomLeftRadius','Bottom left']])add(layout,id,label,dimension(corners[corner]),{indent:true,copy:corners[corner]===null?null:dimension(corners[corner])});
  }else if(f.cornerRadius!==undefined)add(layout,'cornerRadius','Radius',numberText(f.cornerRadius),{copy:null});
  if(Number.isFinite(f.cornerSmoothing)&&f.cornerSmoothing>0)add(layout,'cornerSmoothing','Smoothing',`${numberText(f.cornerSmoothing*100)}%`);
  if(auto){
    add(layout,'padding','Padding','',{heading:true,copy:null});
    for(const [id,label] of [['paddingTop','Top'],['paddingRight','Right'],['paddingBottom','Bottom'],['paddingLeft','Left']])length(layout,id,label,{indent:true});
    if(Number.isFinite(f.itemSpacing))length(layout,'itemSpacing','Gap');
    if(f.layoutWrap==='WRAP'){
      add(layout,'layoutWrap','Wrap','Wrap');
      if(Number.isFinite(f.counterAxisSpacing))length(layout,'counterAxisSpacing','Row gap');
    }
    const alignments={MIN:'Start',MAX:'End',CENTER:'Center',BASELINE:'Baseline',SPACE_BETWEEN:'Space between',STRETCH:'Stretch'};
    if(f.primaryAxisAlignItems)add(layout,'primaryAxisAlignItems','Justify',alignments[f.primaryAxisAlignItems]||f.primaryAxisAlignItems);
    if(f.counterAxisAlignItems)add(layout,'counterAxisAlignItems','Align',alignments[f.counterAxisAlignItems]||f.counterAxisAlignItems);
  }
  if(f.layoutPositioning==='ABSOLUTE')add(layout,'layoutPositioning','Position','Absolute');
  if(Number.isFinite(f.rotation)&&f.rotation!==0)add(layout,'rotation','Rotation',`${numberText(f.rotation)}°`);
  if(typeof f.clipsContent==='boolean')add(layout,'clipsContent','Clip content',f.clipsContent?'Yes':'No');
  if(f.overflowDirection&&f.overflowDirection!=='NONE')add(layout,'overflowDirection','Overflow',f.overflowDirection.toLowerCase().replaceAll('_',' '));
  for(const [key,title] of [['fills','Fill'],['strokes','Stroke']]){
    if(f.type==='TEXT'&&key==='fills')continue;
    const paints=Array.isArray(f[key])?f[key].filter(paint=>paint.visible!==false):[];
    if(!paints.length)continue;
    const target=group(key,title);
    paints.forEach((paint,index)=>{
      const value=colorText(paint),color=value.split(' · ')[0];
      add(target,`${key}.${index}`,paints.length>1?`Color ${index+1}`:'Color',value,{bindings:[key],extra:paint.boundVariables,swatch:/^#[\da-f]{6}$/i.test(color)?color:null});
    });
    if(key==='strokes'){
      if(Number.isFinite(f.strokeWeight))length(target,'strokeWeight','Width');
      else for(const [id,label] of [['strokeTopWeight','Top'],['strokeRightWeight','Right'],['strokeBottomWeight','Bottom'],['strokeLeftWeight','Left']])if(Number.isFinite(f[id]))length(target,id,label);
      if(f.strokeAlign)add(target,'strokeAlign','Align',{INSIDE:'Inside',OUTSIDE:'Outside',CENTER:'Center'}[f.strokeAlign]||f.strokeAlign);
    }
  }
  if(Number.isFinite(f.opacity)&&f.opacity<1){const target=group('appearance','Appearance');add(target,'opacity','Opacity',`${numberText(f.opacity*100)}%`);}
  const effects=Array.isArray(f.effects)?f.effects.filter(effect=>effect.visible!==false):[];
  if(effects.length){
    const target=group('effects','Effects');
    effects.forEach((effect,index)=>{
      const title={DROP_SHADOW:'Drop shadow',INNER_SHADOW:'Inner shadow',LAYER_BLUR:'Layer blur',BACKGROUND_BLUR:'Background blur'}[effect.type]||effect.type;
      const value=effect.type?.includes('SHADOW')?[dimension(effect.offset?.x),dimension(effect.offset?.y),dimension(effect.radius),dimension(effect.spread),colorText({type:'SOLID',color:effect.color})].join(' '):dimension(effect.radius);
      add(target,`effects.${index}`,title,value,{bindings:['effects'],extra:effect.boundVariables});
    });
  }
  if(f.type==='TEXT'){
    const target=group('typography','Typography'),model=textTypography(node,unit);
    add(target,'textStyleName','Name',model.styleName||(node.textStyle?.status==='mixed'?'Mixed':'—'),{bindings:[],copy:model.styleName});
    const family=f.fontName&&typeof f.fontName==='object'?f.fontName.family:f.fontName==='[mixed-or-symbol]'?'Mixed':'—';
    add(target,'fontFamily','Font',family,{copy:typeof f.fontName?.family==='string'?family:null});
    if(f.fontWeight!==undefined)add(target,'fontWeight','Weight',Number.isFinite(f.fontWeight)?String(f.fontWeight):numberText(f.fontWeight),{copy:Number.isFinite(f.fontWeight)?String(f.fontWeight):null});
    if(f.fontName?.style)add(target,'fontStyle','Style',f.fontName.style);
    add(target,'fontSize','Size',model.fontLabel,{copy:model.fontCopy||null});
    add(target,'lineHeight','Line height',model.lineLabel,{copy:model.lineCopy||null});
    const spacing=f.letterSpacing,spacingValue=spacing?.unit==='PERCENT'?`${numberText(spacing.value)}%`:dimension(spacing?.value??spacing);
    add(target,'letterSpacing','Letter spacing',spacingValue,{copy:Number.isFinite(spacing?.value??spacing)?spacingValue:null});
    if(f.openTypeFeatures==='[mixed-or-symbol]')add(target,'numericZero','Numeric zero','Mixed',{bindings:[],copy:null});
    else if(typeof f.openTypeFeatures?.ZERO==='boolean')add(target,'numericZero','Numeric zero',f.openTypeFeatures.ZERO?'Slashed':'Normal',{bindings:[]});
    if(f.textAlignHorizontal)add(target,'textAlignHorizontal','Align',f.textAlignHorizontal.toLowerCase());
    if(f.textDecoration&&f.textDecoration!=='NONE')add(target,'textDecoration','Decoration',f.textDecoration.toLowerCase());
    if(f.textCase&&f.textCase!=='ORIGINAL')add(target,'textCase','Case',f.textCase.toLowerCase().replaceAll('_',' '));
    const entries=node.variableModes?.entries||[];
    if(entries.length){
      const modes=group('modes','Modes');
      for(const entry of entries)add(modes,`mode.${entry.id}`,entry.collectionName||'Collection unavailable',entry.modeName?(entry.explicit?entry.modeName:`Auto (${entry.modeName})`):'Mode unavailable',{bindings:[],copy:entry.modeName||null});
      if(node.variableModes.omitted)add(modes,'modes.omitted','More collections',String(node.variableModes.omitted),{bindings:[],copy:null});
    }
    const paints=Array.isArray(f.fills)?f.fills.filter(paint=>paint.visible!==false):[];
    if(paints.length){
      const colors=group('colors','Colors');colors.colorFormat=true;
      paints.forEach((paint,index)=>{
        const color=textColor(paint,colorFormat),styleName=paints.length===1&&node.paintStyle?.status==='ok'?node.paintStyle.value?.name:null;
        add(colors,`textColor.${index}`,paints.length===1?'Text colors':`Text color ${index+1}`,styleName||color?.value||colorText(paint),{bindings:['fills'],extra:paint.boundVariables,copy:styleName||color?.value||null});
        colors.rows.at(-1).color=color;
      });
    }
    const order={layout:0,typography:1,modes:2,colors:3};groups.sort((a,b)=>(order[a.id]??4)-(order[b.id]??4));
  }
  return groups;
}
