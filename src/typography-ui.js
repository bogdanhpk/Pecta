import {textTypography} from './typography.js';
export function createTypographyDiagram({el,copyButton}){
  let model=null;
  const node=el('figure','box-model typography-diagram');node.setAttribute('role','group');node.hidden=true;
  const stage=el('div','typography-stage');
  const fontGuide=el('span','typography-font-guide'),lineGuide=el('span','typography-line-guide'),sample=el('span','typography-specimen','Ag');
  for(const item of [fontGuide,lineGuide,sample])item.setAttribute('aria-hidden','true');
  stage.append(fontGuide,lineGuide,sample);
  function metric(key,label){
    const button=copyButton(()=>model?.[`${key}Copy`]||'',()=>`${label}: ${model?.[`${key}Label`]||'—'}`,true,()=>el('span','metric-label',model?.[`${key}Label`]||'—'));
    button.className=`typography-metric typography-${key}`;button.dataset.textMetric=key;stage.append(button);return button;
  }
  const font=metric('font','Font size'),line=metric('line','Line height'),caption=el('figcaption','typography-caption');node.append(stage,caption);
  function render(current,unit){
    node.hidden=current.fields.type!=='TEXT';if(node.hidden)return;
    model=textTypography(current,unit);caption.textContent=model.caption;caption.title=model.caption;
    node.style.setProperty('--type-em',`${model.fontGuide}px`);node.style.setProperty('--type-line',`${model.lineGuide}px`);
    fontGuide.dataset.known=String(model.fontPixels!==null);lineGuide.dataset.known=String(model.linePixels!==null);
    for(const [key,button] of [['font',font],['line',line]]){
      const label=button.querySelector('.metric-label');if(label)label.textContent=model[`${key}Label`];button.disabled=!model[`${key}Copy`];
      if(!button.dataset.copied&&!button.dataset.error){button.title=`${key==='font'?'Font size':'Line height'}: ${model[`${key}Label`]}`;button.setAttribute('aria-label',button.title);}
    }
    node.setAttribute('aria-label',`Typography: ${model.fontLabel}, line height ${model.lineLabel}. ${model.caption}`);
  }
  return{node,render};
}
