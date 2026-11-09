// Bundled into an isolated-world script. All layout and icons are trusted build assets.
export async function mountInspector(config, styles, icons, interFont) {
  const api = globalThis.browser || globalThis.chrome;
  globalThis.__PECTA_MODE_UI__?.close?.();
  document.getElementById('pecta-mode-root')?.remove();
  // A binary font source works under the page's CSP and needs no external requests.
  // Keep our family name separate from any Inter version already registered by Figma.
  if (!globalThis.__PECTA_INTER_V4_1__) {
    const face = new FontFace('Pecta Inter',Uint8Array.from(atob(interFont),character=>character.charCodeAt(0)),{weight:'100 900',style:'normal',display:'swap'});
    document.fonts.add(face);
    globalThis.__PECTA_INTER_V4_1__ = face;
    void face.load().catch(error=>console.warn('Pecta font:',error));
  }
  const host = document.createElement('div'); host.id = 'pecta-mode-root';
  const shadow = host.attachShadow({mode:'open'});
  const sheet = new CSSStyleSheet(); sheet.replaceSync(styles); shadow.adoptedStyleSheets = [sheet];
  const timers = new Set(); const copyStates = new Map();
  let closed = false, currentSeq = -1, currentNode = null, copyEpoch = 0, width = 320, richReceived = false;
  let lengthUnit='px',unitWasChanged=false,propertyViewWasChanged=false;
  const lengthText=value=>numberText(lengthValue(value,lengthUnit),lengthUnit==='rem'?6:2);
  const el = (tag, className, text) => { const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node; };
  function icon(name) {
    function build(data) {
      const node = document.createElementNS('http://www.w3.org/2000/svg',data.tag);
      for (const [key,value] of Object.entries(data.attrs)) if (key!=='xmlns') node.setAttribute(key,value);
      for (const child of data.children) node.append(build(child));
      return node;
    }
    const node = build(icons[name]); node.setAttribute('fill','currentColor');node.setAttribute('aria-hidden','true');return node;
  }
  function iconButton(name,label) { const button=el('button','icon-button');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.append(icon(name));return button; }
  const send = type => window.postMessage({source:'pecta-mode',channel:config.channel,direction:'to-page',type},location.origin);
  function clearCopies() {
    copyEpoch++;
    for (const [button,record] of copyStates) { clearTimeout(record.timer);timers.delete(record.timer);record.reset(); }
    copyStates.clear();
  }
  function copyButton(value, label='Копировать', overlay=false, idleRenderer=null) {
    const button = el('button',overlay ? 'copy-overlay' : 'copy-button');button.type='button';
    const fixedFeedback=overlay&&typeof idleRenderer==='function';
    if(fixedFeedback)button.dataset.copyLayout='overlay';
    function feedback(name,message){
      if(fixedFeedback){
        // Keep the metric label in layout so the feedback icon cannot resize its button.
        button.querySelector('.copy-feedback')?.remove();
        const mark=el('span','copy-feedback');mark.setAttribute('aria-hidden','true');mark.append(icon(name));button.append(mark);
      }else{
        button.replaceChildren(icon(name));if(!overlay)button.append(document.createTextNode(message));
      }
    }
    const reset=()=>{const title=typeof label==='function'?label():label;if(idleRenderer)button.replaceChildren(idleRenderer());else{button.replaceChildren(icon('copy'));if(!overlay)button.append(document.createTextNode(title));}button.title=title;button.setAttribute('aria-label',title);delete button.dataset.copied;delete button.dataset.error;};reset();
    button.addEventListener('click', async()=>{
      const text=typeof value==='function'?value():value;
      if(typeof text!=='string'||!text)return;
      const epoch=copyEpoch;
      try {
        await navigator.clipboard.writeText(text);
        if(closed||epoch!==copyEpoch||!button.isConnected)return;
        feedback('check','Скопировано');
        button.dataset.copied='true';button.title='Скопировано';button.setAttribute('aria-label','Скопировано');delete button.dataset.error;
      } catch {
        if(closed||epoch!==copyEpoch)return;
        delete button.dataset.copied;
        feedback('x','Не скопировано');
        button.dataset.error='true';button.title='Не удалось скопировать';button.setAttribute('aria-label','Не удалось скопировать');
      }
      const old=copyStates.get(button);if(old){clearTimeout(old.timer);timers.delete(old.timer);}
      const timer=setTimeout(()=>{reset();copyStates.delete(button);timers.delete(timer);},2000);
      timers.add(timer);copyStates.set(button,{timer,reset});
    });
    return button;
  }
  function section(title) { const node=el('section','section');const heading=el('h2','section-title',title);node.append(heading);return {node,heading}; }
  const panel=el('aside','panel');panel.setAttribute('aria-label','Pecta Mode — свойства слоя');
  const resize=el('div','resize');resize.tabIndex=0;resize.setAttribute('role','separator');resize.setAttribute('aria-orientation','vertical');resize.setAttribute('aria-label','Ширина панели Pecta');resize.setAttribute('aria-valuemin','240');resize.setAttribute('aria-valuemax','450');
  const header=el('header','header');const mark=el('span','brand-mark');mark.append(icon('stack-simple'));
  const menu=el('details');const menuSummary=el('summary','icon-button');menuSummary.title='Настройки';menuSummary.setAttribute('aria-label','Настройки');menuSummary.append(icon('dots-three'));
  const menuItems=el('div','menu');const retry=el('button','','Обновить свойства');retry.type='button';retry.onclick=()=>{send('refresh');menu.open=false;};
  const about=el('a','','О Pecta');about.href=api.runtime.getURL('about.html');about.target='_blank';about.rel='noopener noreferrer';
  const updatesLink=el('a','','Проверить обновления');updatesLink.href=api.runtime.getURL('updates.html');updatesLink.target='_blank';updatesLink.rel='noopener noreferrer';
  void api.runtime.sendMessage({type:'pecta:updates-check'}).then(result=>{if(!closed&&result?.status==='available')updatesLink.textContent=`Обновить до ${result.latestVersion}`;}).catch(()=>{});
  menuItems.append(retry,updatesLink,about,el('span','version',`Pecta ${config.extensionVersion}`));menu.append(menuSummary,menuItems);
  const closeButton=iconButton('x','Закрыть Pecta Mode');header.append(mark,el('strong','brand','Pecta Mode'),menu,closeButton);
  const scroll=el('div','scroll');const empty=el('div','empty');const emptyIcon=el('div','empty-icon');
  const selectionIcon=el('span','selection-icon');selectionIcon.append(icon('stack-simple'));
  const connectionIcon=el('span','connection-state');connectionIcon.hidden=true;connectionIcon.setAttribute('role','img');connectionIcon.setAttribute('aria-label','Нет соединения между Figma и Pecta');
  const svgPart=(tag,attributes)=>{const part=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))part.setAttribute(key,value);return part;};
  const connectionDrawing=svgPart('svg',{viewBox:'0 0 160 80',class:'connection-illustration','aria-hidden':'true',fill:'none'});
  connectionDrawing.append(
    svgPart('path',{class:'connection-wire',d:'M46 38C54 38 56 44 64 44 M100 51C107 51 107 38 114 38'}),
    svgPart('rect',{class:'connection-plug',x:'64',y:'36',width:'12',height:'16',rx:'3'}),
    svgPart('path',{class:'connection-wire',d:'M76 40H80 M76 48H80'}),
    svgPart('rect',{class:'connection-plug',x:'88',y:'43',width:'12',height:'16',rx:'3'}),
    svgPart('path',{class:'connection-wire',d:'M84 47H88 M84 55H88'}),
    svgPart('path',{class:'connection-failure',d:'M79 24L85 30 M85 24L79 30 M79 62L76 66 M88 65L89 69'}),
    svgPart('circle',{class:'connection-product',cx:'24',cy:'38',r:'22','data-product':'figma'}),
    svgPart('circle',{class:'connection-product',cx:'136',cy:'38',r:'22','data-product':'pecta'})
  );
  const figmaMark=icon('figma-logo');figmaMark.classList.add('connection-logo-figma');figmaMark.dataset.brand='figma';
  for(const [key,value] of Object.entries({x:'7.5',y:'21.5',width:'32',height:'32'}))figmaMark.setAttribute(key,value);
  const pectaMark=icon('stack-simple');pectaMark.classList.add('connection-logo-pecta');pectaMark.dataset.brand='pecta';
  for(const [key,value] of Object.entries({x:'123',y:'25.4',width:'26',height:'26'}))pectaMark.setAttribute(key,value);
  connectionDrawing.append(figmaMark,pectaMark);connectionIcon.append(connectionDrawing);emptyIcon.append(selectionIcon,connectionIcon);
  const emptyTitle=el('p','empty-title','Выберите слой');const emptyHint=el('p','hint','Свойства, CSS и токены появятся здесь.');const reconnect=el('button','retry','Повторить');reconnect.hidden=true;reconnect.onclick=()=>send('refresh');empty.append(emptyIcon,emptyTitle,emptyHint,reconnect);
  const content=el('div');content.hidden=true;
  const identity=section('');identity.heading.remove();const type=el('span','layer-type');const name=el('h1','name');identity.node.append(type,name);
  const geometry=section('Размер и положение');const dimensions=el('div','dimensions');const dimensionValues={};
  for(const key of ['x','y','width','height']) {
    const label={x:'X',y:'Y',width:'W',height:'H'}[key];const item=el('div','dimension');const value=el('span','dimension-value');value.dataset.field=key;
    const button=copyButton(()=>Number.isFinite(currentNode?.fields[key])?lengthUnit==='rem'?`${lengthText(currentNode.fields[key])}rem`:String(currentNode.fields[key]):'',`Копировать ${label}`,true);dimensionValues[key]={value,button};item.append(el('span','dimension-label',label),value,button);dimensions.append(item);
  } geometry.node.append(dimensions);
  const css=section('CSS');const cssHeading=el('div','section-heading');cssHeading.append(css.heading);const cssCopy=copyButton(()=>cssText(currentNode?.css,lengthUnit));cssCopy.dataset.action='copy-css';cssHeading.append(cssCopy);const cssPre=el('pre','css');cssPre.tabIndex=0;const cssCode=el('code');cssPre.append(cssCode);const cssHint=el('p','hint');const cssRetry=el('button','retry','Повторить');cssRetry.onclick=()=>send('refresh');css.node.append(cssHeading,cssPre,cssHint,cssRetry);
  const properties=createLayerProperties({el,copyButton,cssSection:css.node,getUnit:()=>lengthUnit,
    onUnitChange:value=>{lengthUnit=value;unitWasChanged=true;clearCopies();if(currentNode)render(currentNode,richReceived);void api.storage.local.set({lengthUnit}).catch(()=>{});},
    onViewChange:value=>{propertyViewWasChanged=true;void api.storage.local.set({propertyView:value}).catch(()=>{});}
  });
  const component=createComponentInformation({el,icon,copyButton,requestPreview:request=>window.postMessage({source:'pecta-mode',channel:config.channel,direction:'to-page',type:'component-preview',...request},location.origin)});
  const textSection=section('Текст');const textHeading=el('div','section-heading');textHeading.append(textSection.heading);const textCopy=copyButton(()=>currentNode?.fields.characters);textHeading.append(textCopy);const textContent=el('p','text-content');const textHint=el('p','hint');textSection.node.append(textHeading,textContent,textHint);
  const tokens=section('Токены');const tokenList=el('div');const tokenHint=el('p','hint');tokens.node.append(tokenList,tokenHint);
  content.append(identity.node,geometry.node,component.node,properties.node,textSection.node,tokens.node);scroll.append(empty,content);panel.append(resize,header,scroll);shadow.append(panel);
  const setText=(node,value)=>{if(node.textContent!==String(value))node.textContent=String(value);};
  function rows(container,items) {
    const signature=JSON.stringify(items);if(container.dataset.signature===signature)return;
    container.dataset.signature=signature;container.replaceChildren(...items.flatMap(([label,value])=>[el('dt','',label),el('dd','',value)]));
  }
  let lastCssSource=null;
  function renderCss(source) {
    if(source===lastCssSource)return;
    lastCssSource=source;
    const fragment=document.createDocumentFragment();
    let line;
    function nextLine(){
      if(line)fragment.append(document.createTextNode('\n'));
      line=el('span','css-line');const number=el('span','css-line-number');number.setAttribute('aria-hidden','true');line.append(number);fragment.append(line);
    }
    if(source)nextLine();
    for(const token of highlightCssDeclarations(source)){
      for(const [index,part] of token.text.split('\n').entries()){
        if(index)nextLine();
        if(part)line.append(token.type==='plain'?document.createTextNode(part):el('span',`css-${token.type}`,part));
      }
    }
    cssCode.replaceChildren(fragment);
  }
  function status(verdict,count) {
    const connectionFailed=!['select-a-layer','multiple-selection'].includes(verdict);
    connectionIcon.hidden=!connectionFailed;selectionIcon.hidden=connectionFailed;
    const messages={
      'select-a-layer':['Выберите слой','Свойства, CSS и токены появятся здесь.'],
      'multiple-selection':[`Выбрано слоёв: ${count}`,'Для просмотра свойств выберите один слой.'],
      'no-figma-object':['Не удалось подключиться','Дождитесь загрузки Figma и повторите подключение.'],
      'object-without-readable-selection':['Свойства пока недоступны','Попробуйте выбрать слой ещё раз.'],
      'plugin-context-detected':['Обнаружен запущенный плагин','Закройте плагин Figma и повторите подключение.'],
      'wrong-page':['Откройте макет Figma','Pecta Mode работает во вкладке с макетом.']
    };
    const [title,hint]=messages[verdict]||['Не удалось прочитать слой','Повторите подключение.'];
    setText(emptyTitle,title);setText(emptyHint,hint);reconnect.hidden=['select-a-layer','multiple-selection','wrong-page'].includes(verdict);
  }
  function render(node,rich) {
    const f=node.fields;
    setText(name,f.name||'Без имени');const types={FRAME:'Фрейм',SECTION:'Секция',INSTANCE:'Экземпляр',COMPONENT:'Компонент',COMPONENT_SET:'Набор компонентов',TEXT:'Текст',RECTANGLE:'Прямоугольник',GROUP:'Группа',VECTOR:'Вектор'};setText(type,types[f.type]||f.type||'Слой');
    for(const [key,item] of Object.entries(dimensionValues)){setText(item.value,lengthText(f[key]));item.value.title=`${lengthText(f[key])} ${lengthUnit}`;item.button.disabled=!Number.isFinite(f[key]);}
    properties.render(node,lengthUnit,rich);
    const cssValue=cssText(node.css,lengthUnit);cssCopy.disabled=!rich||node.css?.status!=='ok'||!cssValue;
    cssPre.hidden=!cssValue;renderCss(cssValue);
    const cssStatus=node.css?.status;
    const cssMessage=!rich?'Загружаем CSS…':cssStatus==='ok'&&!cssValue?'Для этого слоя CSS не получен.':cssStatus==='timeout'?'Figma не вернула CSS вовремя.':cssStatus==='truncated'?'CSS превышает лимит просмотра. Копирование недоступно.':cssStatus==='error'?'Не удалось получить CSS.':cssStatus==='unavailable'?'CSS недоступен для этого слоя.':'';
    setText(cssHint,cssMessage);cssHint.hidden=!cssMessage;cssHint.classList.toggle('loading',!rich);cssRetry.hidden=!rich||!['timeout','error'].includes(cssStatus);
    component.render(node,rich,currentSeq);
    textSection.node.hidden=typeof f.characters!=='string';setText(textContent,f.characters||'');textCopy.disabled=!f.characters||f.textTruncated;setText(textHint,f.textTruncated?'Показаны первые 32 768 символов. Копирование недоступно.':'');textHint.hidden=!f.textTruncated;
    const records=node.variables||[];const tokenSignature=JSON.stringify([records.map(({id,status,value})=>({id,status,value})),f.boundVariables,f.fills,f.strokes]);
    if(tokenList.dataset.signature!==tokenSignature){tokenList.dataset.signature=tokenSignature;tokenList.replaceChildren(...records.map(record=>{
      const item=el('div','token');const body=el('div','token-content');const variable=record.value;
      body.append(el('div','token-name',variable?.name||'Имя недоступно'),el('p','hint',tokenBindings(f,record.id)||variable?.resolvedType||record.id));
      if(!variable?.name)body.append(el('p','hint',record.status==='timeout'?'Превышено время ожидания':'Не удалось прочитать переменную'));
      item.append(body);if(variable?.name){const copy=copyButton(variable.name,`Копировать ${variable.name}`,true);copy.className='icon-button';item.append(copy);}return item;
    }));}
    const tokenMessage=!rich?'Загружаем привязки…':node.variableCoverage?.omitted?`Ещё привязок: ${node.variableCoverage.omitted}.` : !records.length?'У слоя нет доступных привязок к переменным.':'';setText(tokenHint,tokenMessage);tokenHint.hidden=!tokenMessage;
  }
  function onMessage(event) {
    const data=event.data;
    if(event.origin!==location.origin||(event.source&&event.source!==window)||data?.source!=='pecta-mode'||data.channel!==config.channel||data.direction!=='from-page')return;
    if(data.type==='stopped'){close(false);return;}
    if(data.type==='error'){if(!currentNode){empty.hidden=false;content.hidden=true;status('error');}return;}
    if(data.type==='component-preview'){if(data.seq===currentSeq)void component.acceptPreview(data.report);return;}
    if(!['fast','rich'].includes(data.type)||!Number.isInteger(data.seq)||data.seq<currentSeq||!data.report||typeof data.report!=='object')return;
    const report=data.report;
    if(data.seq!==currentSeq){clearCopies();richReceived=false;}
    if(data.type==='fast'&&data.seq===currentSeq&&richReceived)return;
    currentSeq=data.seq;if(data.type==='rich')richReceived=true;
    const node=report.nodes?.[0];
    if(report.verdict!=='selection-readable'||!node?.fields){currentNode=null;component.reset();content.hidden=true;empty.hidden=false;status(report.verdict,report.apiAccess?.selectionCount);return;}
    currentNode=node;empty.hidden=true;content.hidden=false;render(node,richReceived);
  }
  const maxWidth=()=>Math.max(180,Math.min(450,window.innerWidth));
  function setWidth(value){width=Math.max(Math.min(240,maxWidth()),Math.min(maxWidth(),value));panel.style.width=`${width}px`;resize.setAttribute('aria-valuenow',String(Math.round(width)));resize.setAttribute('aria-valuemin',String(Math.min(240,maxWidth())));resize.setAttribute('aria-valuemax',String(maxWidth()));}
  const persistWidth=()=>api.storage.local.set({panelWidth:Math.round(width)}).catch(()=>{});
  let drag=null;
  resize.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();drag={x:event.clientX,width};resize.setPointerCapture(event.pointerId);panel.dataset.resizing='true';resize.dataset.dragging='true';});
  resize.addEventListener('pointermove',event=>{if(drag)setWidth(drag.width+drag.x-event.clientX);});
  const endResize=()=>{if(!drag)return;drag=null;delete panel.dataset.resizing;delete resize.dataset.dragging;void persistWidth();};
  resize.addEventListener('pointerup',endResize);resize.addEventListener('pointercancel',endResize);resize.addEventListener('lostpointercapture',endResize);
  resize.addEventListener('keydown',event=>{const delta=event.shiftKey?20:10;if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setWidth(event.key==='Home'?240:event.key==='End'?450:width+(event.key==='ArrowLeft'?delta:-delta));void persistWidth();});
  const onWindowResize=()=>setWidth(width);
  const media=matchMedia('(prefers-color-scheme: dark)');
  function theme(){const root=document.documentElement;const hints=[root.dataset.theme,document.body?.dataset.theme,root.className,document.body?.className].join(' ').toLowerCase();const explicit=/\blight\b/.test(hints)?'light':/\bdark\b/.test(hints)?'dark':null;const scheme=getComputedStyle(root).colorScheme;host.dataset.theme=explicit||(scheme==='light'||scheme==='dark'?scheme:media.matches?'dark':'light');}
  const observer=new MutationObserver(theme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});if(document.body)observer.observe(document.body,{attributes:true,attributeFilter:['class','style','data-theme']});
  // Keep native Figma commands outside the panel. Text and code stay selectable inside it.
  for(const event of ['keydown','keyup','keypress','copy','cut','paste','pointerdown','mousedown','click','dblclick','wheel'])panel.addEventListener(event,e=>e.stopPropagation());
  function close(notify=true){if(closed)return;if(notify)send('stop');closed=true;component.reset();clearCopies();for(const timer of timers)clearTimeout(timer);observer.disconnect();media.removeEventListener('change',theme);window.removeEventListener('message',onMessage);window.removeEventListener('resize',onWindowResize);host.remove();if(globalThis.__PECTA_MODE_UI__===controller)delete globalThis.__PECTA_MODE_UI__;}
  const controller={isOpen:true,close};globalThis.__PECTA_MODE_UI__=controller;closeButton.onclick=()=>close();
  window.addEventListener('message',onMessage);window.addEventListener('resize',onWindowResize);media.addEventListener('change',theme);theme();document.body.append(host);setWidth(width);
  try{
    const saved=await api.storage.local.get(['panelWidth','lengthUnit','propertyView']);
    if(!closed){
      if(Number.isFinite(saved.panelWidth))setWidth(saved.panelWidth);
      if(!propertyViewWasChanged&&['list','code'].includes(saved.propertyView))properties.setView(saved.propertyView);
      if(!unitWasChanged&&['px','rem'].includes(saved.lengthUnit)){
        lengthUnit=saved.lengthUnit;properties.unitSelect.value=lengthUnit;
        if(currentNode)render(currentNode,richReceived);
      }
    }
  }catch{}
  return {mounted:true};
}
