import {cssInUnit} from './units.js';

export function numberText(value,precision=2) {
  const scale=10**precision;
  return Number.isFinite(value) ? String(Math.round((value + Number.EPSILON) * scale) / scale) : value === '[mixed-or-symbol]' ? 'Смешано' : '—';
}
export function cssText(result,unit='px') {
  if (!result || !['ok','truncated'].includes(result.status) || !result.value || typeof result.value !== 'object') return '';
  const source=Object.entries(result.value).filter(([key,value])=>/^(--[\w-]+|[a-z][a-z\d-]*)$/i.test(key) && typeof value === 'string').map(([key,value])=>`${key}: ${value};`).join('\n');
  return cssInUnit(source,unit);
}
export function colorText(paint) {
  const c = paint?.color;
  if (paint?.type !== 'SOLID' || !c || ![c.r,c.g,c.b].every(Number.isFinite)) return paint?.type === 'IMAGE' ? 'Изображение' : paint?.type?.startsWith('GRADIENT') ? 'Градиент' : 'Смешано';
  const hex = [c.r,c.g,c.b].map(v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  const alpha = (Number.isFinite(paint.opacity) ? paint.opacity : 1) * (Number.isFinite(c.a) ? c.a : 1);
  return `#${hex}` + (alpha < 1 ? ` · ${numberText(alpha*100)}%` : '');
}
export function componentItems(fields) {
  const rows=new Map(Object.entries(fields.variantProperties||{}).map(([name,rawValue])=>[name,{name,type:'VARIANT',rawValue}]));
  for(const [key,property] of Object.entries(fields.componentProperties||{})){
    if(!property||typeof property!=='object')continue;
    const name=key.replace(/#[^#]+$/,'');
    rows.set(name,{name,type:property.type||rows.get(name)?.type||(typeof property.value==='boolean'?'BOOLEAN':'TEXT'),rawValue:property.value});
  }
  return [...rows.values()].map(row=>({...row,
    value:typeof row.rawValue==='boolean'?(row.rawValue?'True':'False'):String(row.rawValue??'—'),
    copy:row.rawValue===null||row.rawValue===undefined?'':String(row.rawValue)
  }));
}
export function componentRows(fields) {
  return componentItems(fields).map(({name,rawValue,value})=>[name,typeof rawValue==='boolean'?(rawValue?'Да':'Нет'):value]);
}
// Compare the rendered pixels against both surfaces, including their real alpha.
export function previewBackground(pixels) {
  const candidates=[{name:'light',rgb:[245,245,245],score:0},{name:'dark',rgb:[36,36,36],score:0}];
  const luminance=rgb=>rgb.reduce((sum,channel,index)=>{
    const value=channel/255,linear=value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
    return sum+linear*[.2126,.7152,.0722][index];
  },0);
  for(const candidate of candidates)candidate.luminance=luminance(candidate.rgb);
  let visible=0;
  for(let i=0;i+3<pixels.length;i+=4){
    const alpha=pixels[i+3]/255;if(alpha<.02)continue;visible+=alpha;
    for(const candidate of candidates){
      const blended=candidate.rgb.map((channel,index)=>pixels[i+index]*alpha+channel*(1-alpha));
      const value=luminance(blended),base=candidate.luminance;
      candidate.score+=alpha*Math.log2((Math.max(value,base)+.05)/(Math.min(value,base)+.05));
    }
  }
  return visible?candidates.reduce((best,candidate)=>candidate.score>best.score?candidate:best).name:null;
}
export function tokenBindings(fields, id) {
  const labels = new Set();
  function visit(value,path,depth=0) {
    if (!value || typeof value !== 'object' || depth>7) return;
    if (value.type==='VARIABLE_ALIAS' && value.id===id) { labels.add(path); return; }
    for (const [key,item] of Object.entries(value)) visit(item, /^\d+$/.test(key) ? path : path ? `${path}.${key}` : key,depth+1);
  }
  visit(fields.boundVariables,'');visit(fields.fills,'fills');visit(fields.strokes,'strokes');
  return [...labels].join(', ');
}

export function layerBoxModel(fields) {
  const sides=['top','right','bottom','left'];
  const measurable=value=>Number.isFinite(value)&&value>=0;
  const autoLayout=['HORIZONTAL','VERTICAL','GRID'].includes(fields.layoutMode);
  const padding=Object.fromEntries(sides.map(side=>{
    const value=fields[`padding${side[0].toUpperCase()}${side.slice(1)}`];
    return [side,autoLayout?(measurable(value)?value:null):0];
  }));
  const hasStroke=Array.isArray(fields.strokes)
    ? fields.strokes.some(paint=>paint.visible!==false)
    : ['GROUP','SECTION'].includes(fields.type)?false:null;
  const border=Object.fromEntries(sides.map(side=>{
    const value=fields[`stroke${side[0].toUpperCase()}${side.slice(1)}Weight`];
    return [side,hasStroke===false?0:hasStroke===null?null:measurable(value)?value:measurable(fields.strokeWeight)?fields.strokeWeight:null];
  }));
  const hasBorder=sides.some(side=>border[side]===null||border[side]>0);
  // Only inside strokes included in auto layout reserve content space in Figma.
  const borderIncluded=!autoLayout||!hasBorder||fields.strokesIncludedInLayout===false||['CENTER','OUTSIDE'].includes(fields.strokeAlign)
    ? false : fields.strokesIncludedInLayout===true&&fields.strokeAlign==='INSIDE'?true:null;
  function contentSize(axis,start,end) {
    const values=[fields[axis],padding[start],padding[end],borderIncluded===false?0:border[start],borderIncluded===false?0:border[end]];
    if(borderIncluded===null||!values.every(measurable))return null;
    return Math.max(0,values[0]-values.slice(1).reduce((sum,value)=>sum+value,0));
  }
  return {padding,border,width:contentSize('width','left','right'),height:contentSize('height','top','bottom'),borderIncluded,hasBorder,autoLayout};
}
