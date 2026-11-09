import {layerBoxModel,numberText} from './format.js';
import {layerRadii,layerPropertyGroups} from './layer-properties.js';
import {lengthValue,REM_BASE_PX} from './units.js';
import {createTypographyDiagram} from './typography-ui.js';

export function createLayerProperties({el,copyButton,cssSection,getUnit,onUnitChange,onViewChange,onColorFormatChange=()=>{}}){
  let current=null,model=null,corners={},view='code',listSignature='',colorFormat='hex';
  const node=el('section','section layer-inspector');
  const details=el('details','layer-properties');details.open=true;details.append(el('summary','section-title','Свойства слоя'));node.append(details);
  const figure=el('figure','box-model layer-diagram');figure.setAttribute('role','group');
  const border=el('div','diagram-border'),padding=el('div','diagram-padding');
  border.append(el('span','diagram-label','Border'));padding.append(el('span','diagram-label','Padding'));
  const metrics=new Map(),sideNames={top:'сверху',right:'справа',bottom:'снизу',left:'слева'};
  const full=value=>numberText(lengthValue(value,getUnit()),getUnit()==='rem'?6:2);
  const short=value=>numberText(lengthValue(value,getUnit()),2);
  function metric(id,getValue,label,className){
    const button=copyButton(()=>{
      const value=getValue();return Number.isFinite(value)?`${full(value)}${getUnit()}`:'';
    },()=>`${label}: ${Number.isFinite(getValue())?`${full(getValue())} ${getUnit()}`:'недоступно'}`,true,()=>{const raw=getValue();return el('span','metric-label',!Number.isFinite(raw)?'?':raw===0?'–':short(raw));});
    button.className=className;button.dataset.boxValue=id;metrics.set(id,{button,getValue,label});return button;
  }
  for(const region of ['border','padding'])for(const side of ['top','right','bottom','left']){
    const button=metric(`${region}-${side}`,()=>model?.[region][side],`${region==='border'?'Обводка':'Padding'} ${sideNames[side]}`,`diagram-value diagram-${side}${region==='padding'&&['top','bottom'].includes(side)?' diagram-pill':''}`);
    (region==='border'?border:padding).append(button);
  }
  for(const [corner,label] of [['tl','сверху слева'],['tr','сверху справа'],['br','снизу справа'],['bl','снизу слева']]){
    const button=metric(`radius-${corner}`,()=>corners[corner],`Радиус ${label}`,`diagram-radius radius-${corner}`);border.append(button);
    const arc=el('span',`radius-arc arc-${corner}`);arc.setAttribute('aria-hidden','true');border.append(arc);
  }
  const content=copyButton(()=>model&&model.width!==null&&model.height!==null?`${full(model.width)}${getUnit()} × ${full(model.height)}${getUnit()}`:'','Копировать размер содержимого',true,()=>el('span','metric-label',`${numberText(lengthValue(model?.width,getUnit()),2)} × ${numberText(lengthValue(model?.height,getUnit()),2)}`));
  content.className='diagram-content';content.dataset.boxValue='content';padding.append(content);border.append(padding);figure.append(border);
  for(const side of ['top','right','bottom','left']){
    const button=metric(`spacing-${side}`,()=>current?.fields.measurements?.sides?.[side]?.value,`Расстояние ${sideNames[side]}`,`diagram-spacing spacing-${side}`);
    const line=el('span','spacing-line');line.setAttribute('aria-hidden','true');const wrapper=el('span',`spacing-track track-${side}`);wrapper.append(line,button);figure.append(wrapper);
  }
  const caption=el('figcaption','box-caption');figure.append(caption);
  const typography=createTypographyDiagram({el,copyButton});
  const hint=el('p','hint');hint.hidden=true;
  const toolbar=el('div','properties-toolbar'),tabs=el('div','property-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Вид свойств слоя');
  const listPanel=el('div','property-list'),codePanel=el('div','property-code');
  listPanel.id='pecta-property-list';codePanel.id='pecta-property-code';
  listPanel.setAttribute('role','tabpanel');codePanel.setAttribute('role','tabpanel');
  const tabButtons={};
  for(const [id,label,panel] of [['list','List',listPanel],['code','Code',codePanel]]){
    const button=el('button','property-tab',label);button.type='button';button.id=`pecta-tab-${id}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',button.id);
    button.addEventListener('click',()=>setView(id,true));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const next=event.key==='Home'?'list':event.key==='End'?'code':id==='list'?'code':'list';setView(next,true);tabButtons[next].focus();
    });tabs.append(button);tabButtons[id]=button;
  }
  const control=el('span','unit-control'),unitSelect=el('select','unit-select');
  unitSelect.setAttribute('aria-label','Единицы измерения');unitSelect.title=`Единицы измерения · 1 rem = ${REM_BASE_PX} px`;
  for(const unit of ['px','rem']){const option=el('option','',unit);option.value=unit;unitSelect.append(option);}
  unitSelect.addEventListener('change',()=>onUnitChange(unitSelect.value==='rem'?'rem':'px'));
  control.append(unitSelect);toolbar.append(tabs,control);codePanel.append(cssSection);details.append(figure,typography.node,hint,toolbar,listPanel,codePanel);
  function setView(value,user=false){
    view=value==='list'?'list':'code';listPanel.hidden=view!=='list';codePanel.hidden=view!=='code';
    for(const [id,button] of Object.entries(tabButtons)){button.setAttribute('aria-selected',String(id===view));button.tabIndex=id===view?0:-1;}
    if(user)onViewChange(view);
  }
  setView('code');
  function renderList(groups){
    const signature=JSON.stringify(groups);if(signature===listSignature)return;listSignature=signature;
    const fragment=document.createDocumentFragment();
    for(const group of groups){
      const section=el('section','property-group');section.dataset.group=group.id;
      const heading=el('div','property-group-heading');heading.append(el('h3','property-title',group.title));section.append(heading);
      if(group.colorFormat){
        const select=el('select','color-format');select.setAttribute('aria-label','Формат цвета');
        for(const [value,label] of [['hex','Hex'],['rgb','RGB'],['hsl','HSL']]){const option=el('option','',label);option.value=value;select.append(option);}select.value=colorFormat;
        select.onchange=()=>{colorFormat=select.value;onColorFormatChange(colorFormat);renderList(layerPropertyGroups(current,getUnit(),colorFormat));const focused=node.querySelector('.color-format');focused?.focus();};heading.append(select);
      }
      const rows=el('dl','property-rows');
      for(const row of group.rows){
        const wrapper=el('div',`property-row${row.indent?' property-indent':''}${row.heading?' property-heading':''}`);wrapper.dataset.property=row.id;
        const label=el('dt','',row.label),value=el('dd');wrapper.append(label,value);
        if(!row.heading){
          if(row.color){
            value.className='property-color-pair';
            const swatch=copyButton(()=>row.color.value,`Копировать цвет · ${row.color.value}`,true,()=>{const mark=el('span','metric-label property-swatch');mark.style.backgroundColor=row.color.swatch;return mark;});
            swatch.className='property-color-copy';swatch.dataset.colorValue=row.color.value;value.append(swatch);
            const token=row.tokens[0],label=token?.name||row.value;
            const button=copyButton(()=>token?.name||row.copy||row.color.value,`Копировать ${label}`,false,()=>el('span',token?'variable-name':'property-value-label',label));
            button.className='property-value';button.title=`${label} · ${row.color.value}`;value.append(button);
          }else if(row.tokens.length){
            for(const token of row.tokens){
              const button=copyButton(()=>token.name,`Копировать ${token.name} · ${row.value}`,false,()=>{
                const fragment=document.createDocumentFragment();fragment.append(el('span','variable-glyph',token.type==='COLOR'?'◈':token.type==='STRING'?'T':token.type==='BOOLEAN'?'◧':'#'),el('span','variable-name',token.name));return fragment;
              });
              button.className='property-value variable-chip';button.title=`${token.name} · ${row.value}`;value.append(button);
            }
          }else{
            const button=copyButton(()=>row.copy||'',`Копировать ${row.label} · ${row.value}`,false,()=>{
              const fragment=document.createDocumentFragment();if(row.swatch){const swatch=el('span','property-swatch');swatch.style.backgroundColor=row.swatch;fragment.append(swatch);}fragment.append(el('span','property-value-label',row.value));return fragment;
            });
            button.className='property-value';button.disabled=!row.copy;button.title=row.value;value.append(button);
          }
        }
        rows.append(wrapper);
      }
      section.append(rows);fragment.append(section);
    }
    listPanel.replaceChildren(fragment);
  }
  function render(next,unit,rich){
    current=next;const f=current.fields;model=layerBoxModel(f);corners=layerRadii(f);figure.dataset.unit=unit;unitSelect.value=unit;figure.hidden=f.type==='TEXT';typography.render(current,unit);
    for(const [id,record] of metrics){
      const raw=record.getValue(),label=record.button.querySelector('.metric-label');
      record.button.dataset.zero=String(raw===0);
      if(label)label.textContent=raw===null||!Number.isFinite(raw)?'?':raw===0?'–':short(raw);
      record.button.disabled=!Number.isFinite(raw);
      record.button.title=`${record.label}: ${Number.isFinite(raw)?`${full(raw)} ${unit}`:'недоступно'}`;
      if(!record.button.dataset.copied&&!record.button.dataset.error)record.button.setAttribute('aria-label',record.button.title);
      if(id.startsWith('radius-')){
        const corner=id.slice(7),active=Number.isFinite(raw)&&raw>0;record.button.dataset.active=String(active);border.querySelector(`.arc-${corner}`).hidden=!active;
      }
      if(id.startsWith('spacing-')){
        const side=id.slice(8),measurement=f.measurements?.sides?.[side],track=record.button.parentElement;
        track.hidden=!Number.isFinite(raw);track.dataset.source=measurement?.source||'';
        if(measurement){record.button.title=`${record.label}: ${full(raw)} ${unit} · ${measurement.source==='sibling'?'до соседнего слоя':'до границы родителя'} ${measurement.name||''}`;if(!record.button.dataset.copied&&!record.button.dataset.error)record.button.setAttribute('aria-label',record.button.title);}
      }
    }
    border.style.borderRadius=['tl','tr','br','bl'].map(key=>corners[key]>0?'10px':'0').join(' ');
    const contentLabel=content.querySelector('.metric-label');if(contentLabel)contentLabel.textContent=`${numberText(lengthValue(model.width,unit),2)} × ${numberText(lengthValue(model.height,unit),2)}`;
    content.disabled=model.width===null||model.height===null;content.title=`Размер содержимого: ${full(model.width)} × ${full(model.height)} ${unit}`;
    figure.setAttribute('aria-label',content.title);
    const sizing=rich&&current.css?.status==='ok'?current.css.value?.['box-sizing']:null;
    caption.textContent=['border-box','content-box'].includes(sizing)?sizing:model.borderIncluded===true?'border-box':'';caption.hidden=!caption.textContent;
    hint.textContent=model.width===null||model.height===null?'Часть размеров недоступна.':'';hint.hidden=f.type==='TEXT'||!hint.textContent;
    renderList(layerPropertyGroups(current,unit,colorFormat));
  }
  return{node,unitSelect,render,setView,getView:()=>view,setColorFormat(value){if(!['hex','rgb','hsl'].includes(value))return;colorFormat=value;if(current)renderList(layerPropertyGroups(current,getUnit(),colorFormat));}};
}
