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
  const host = document.createElement('div'); host.id = 'pecta-mode-root';host.lang='en';
  const shadow = host.attachShadow({mode:'open'});
  const sheet = new CSSStyleSheet(); sheet.replaceSync(styles); shadow.adoptedStyleSheets = [sheet];
  const timers = new Set(); const copyStates = new Map();
  let closed = false, currentSeq = -1, currentNode = null, copyEpoch = 0, width = 320, richReceived = false;
  let lengthUnit='px',colorFormat='hex',unitWasChanged=false,propertyViewWasChanged=false,colorFormatWasChanged=false;
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
  function selectControl(select,className){
    const control=el('span',`select-control ${className}`),sizer=el('span','select-sizer'),chevron=icon('caret-right');
    sizer.setAttribute('aria-hidden','true');chevron.classList.add('select-chevron');control.append(sizer,select,chevron);
    select.addEventListener('change',()=>selectControl.sync(select));selectControl.sync(select);return control;
  }
  selectControl.sync=select=>{
    const control=select.parentElement,sizer=control?.querySelector('.select-sizer');if(!sizer)return;
    const label=select.selectedOptions[0]?.textContent||'—';if(sizer.textContent!==label)sizer.textContent=label;control.title=label;
  };
  const send = type => window.postMessage({source:'pecta-mode',channel:config.channel,direction:'to-page',type},location.origin);
  function clearCopies() {
    copyEpoch++;
    for (const [button,record] of copyStates) { clearTimeout(record.timer);timers.delete(record.timer);record.reset(); }
    copyStates.clear();
  }
  function copyButton(value, label='Copy', overlay=false, idleRenderer=null) {
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
        feedback('check','Copied');
        button.dataset.copied='true';button.title='Copied';button.setAttribute('aria-label','Copied');delete button.dataset.error;
      } catch {
        if(closed||epoch!==copyEpoch)return;
        delete button.dataset.copied;
        feedback('x','Not copied');
        button.dataset.error='true';button.title='Could not copy';button.setAttribute('aria-label','Could not copy');
      }
      const old=copyStates.get(button);if(old){clearTimeout(old.timer);timers.delete(old.timer);}
      const timer=setTimeout(()=>{reset();copyStates.delete(button);timers.delete(timer);},2000);
      timers.add(timer);copyStates.set(button,{timer,reset});
    });
    return button;
  }
  function section(title) { const node=el('section','section');const heading=el('h2','section-title',title);node.append(heading);return {node,heading}; }
  const panel=el('aside','panel');panel.setAttribute('aria-label','Pecta Mode — layer properties');
  const resize=el('div','resize');resize.tabIndex=0;resize.setAttribute('role','separator');resize.setAttribute('aria-orientation','vertical');resize.setAttribute('aria-label','Pecta panel width');resize.setAttribute('aria-valuemin','240');resize.setAttribute('aria-valuemax','450');
  const header=el('header','header');const mark=el('span','brand-mark');mark.append(icon('stack-simple'));
  const menu=el('details');const menuSummary=el('summary','icon-button');menuSummary.title='Settings';menuSummary.setAttribute('aria-label','Settings');menuSummary.append(icon('dots-three'));
  const menuItems=el('div','menu');
  const about=el('a','menu-about-link');about.href=api.runtime.getURL('about.html');about.target='_blank';about.rel='noopener noreferrer';about.setAttribute('aria-label','About Pecta');
  const aboutVersion=el('span','menu-version',config.extensionVersion);aboutVersion.id='pecta-menu-version';about.append(el('span','','About Pecta'),aboutVersion);about.setAttribute('aria-describedby',aboutVersion.id);
  const updatesLink=el('a','','Check for Updates');updatesLink.href=api.runtime.getURL('updates.html');updatesLink.target='_blank';updatesLink.rel='noopener noreferrer';
  menuItems.append(updatesLink,about);menu.append(menuSummary,menuItems);
  const updateNotice=createUpdateNotice({api,el,menu,button:menuSummary,link:updatesLink});
  const closeButton=iconButton('x','Close Pecta Mode');header.append(mark,el('strong','brand','Pecta Mode'),menu,closeButton);
  const scroll=el('div','scroll');const empty=el('div','empty');const emptyIcon=el('div','empty-icon');
  const selectionIcon=el('span','selection-icon');selectionIcon.append(icon('stack-simple'));
  const connectionIcon=el('span','connection-state');connectionIcon.hidden=true;connectionIcon.setAttribute('role','img');connectionIcon.setAttribute('aria-label','Figma and Pecta are disconnected');
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
  for(const [key,value] of Object.entries({x:'16',y:'26',width:'16',height:'24'}))figmaMark.setAttribute(key,value);
  const pectaMark=icon('stack-simple');pectaMark.classList.add('connection-logo-pecta');pectaMark.dataset.brand='pecta';
  for(const [key,value] of Object.entries({x:'126',y:'28',width:'20',height:'20'}))pectaMark.setAttribute(key,value);
  connectionDrawing.append(figmaMark,pectaMark);connectionIcon.append(connectionDrawing);emptyIcon.append(selectionIcon,connectionIcon);
  const emptyTitle=el('p','empty-title','Select a layer');const emptyHint=el('p','hint','Layer properties, CSS, and tokens will appear here.');const reconnect=el('button','retry','Retry');reconnect.hidden=true;reconnect.onclick=()=>send('refresh');empty.append(emptyIcon,emptyTitle,emptyHint,reconnect);
  const content=el('div');content.hidden=true;
  const identity=section('');identity.heading.remove();const type=el('span','layer-type');const name=el('h1','name');identity.node.append(type,name);
  const geometry=section('Size and position');const dimensions=el('div','dimensions');const dimensionValues={};
  for(const key of ['x','y','width','height']) {
    const label={x:'X',y:'Y',width:'W',height:'H'}[key];const item=el('div','dimension');const value=el('span','dimension-value');value.dataset.field=key;
    const button=copyButton(()=>Number.isFinite(currentNode?.fields[key])?lengthUnit==='rem'?`${lengthText(currentNode.fields[key])}rem`:String(currentNode.fields[key]):'',`Copy ${label}`,true);dimensionValues[key]={value,button};item.append(el('span','dimension-label',label),value,button);dimensions.append(item);
  } geometry.node.append(dimensions);
  const css=section('CSS');const cssHeading=el('div','section-heading');cssHeading.append(css.heading);const cssCopy=copyButton(()=>cssText(currentNode?.css,lengthUnit));cssCopy.dataset.action='copy-css';cssHeading.append(cssCopy);const cssPre=el('pre','css');cssPre.tabIndex=0;const cssCode=el('code');cssPre.append(cssCode);const cssHint=el('p','hint');const cssRetry=el('button','retry','Retry');cssRetry.onclick=()=>send('refresh');css.node.append(cssHeading,cssPre,cssHint,cssRetry);
  const properties=createLayerProperties({el,icon,copyButton,selectControl,cssSection:css.node,getUnit:()=>lengthUnit,
    onUnitChange:value=>{lengthUnit=value;unitWasChanged=true;clearCopies();if(currentNode)render(currentNode,richReceived);void api.storage.local.set({lengthUnit}).catch(()=>{});},
    onViewChange:value=>{propertyViewWasChanged=true;void api.storage.local.set({propertyView:value}).catch(()=>{});},
    onColorFormatChange:value=>changeColorFormat(value)
  });
  const component=createComponentInformation({el,icon,copyButton,selectControl,requestPreview:request=>window.postMessage({source:'pecta-mode',channel:config.channel,direction:'to-page',type:'component-preview',...request},location.origin)});
  const resources=createSelectionResources({el,icon,copyButton,selectControl,getUnit:()=>lengthUnit,onColorFormatChange:changeColorFormat,requestAsset:request=>window.postMessage({source:'pecta-mode',channel:config.channel,direction:'to-page',type:'selection-asset',...request},location.origin)});
  function changeColorFormat(value){colorFormat=value;colorFormatWasChanged=true;clearCopies();properties.setColorFormat(value);resources.setColorFormat(value);void api.storage.local.set({colorFormat:value}).catch(()=>{});}
  const textSection=section('Text');const textHeading=el('div','section-heading');textHeading.append(textSection.heading);const textCopy=copyButton(()=>currentNode?.fields.characters);textHeading.append(textCopy);const textContent=el('p','text-content');const textHint=el('p','hint');textSection.node.append(textHeading,textContent,textHint);
  content.append(identity.node,geometry.node,component.node,properties.node,resources.node,textSection.node);scroll.append(empty,content);panel.append(resize,header,scroll);shadow.append(panel);
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
      'select-a-layer':['Select a layer','Layer properties, CSS, and tokens will appear here.'],
      'multiple-selection':[`${count} layers selected`,'Select one layer to inspect its properties.'],
      'no-figma-object':['Could not connect','Wait for Figma to load, then try again.'],
      'object-without-readable-selection':['Layer properties unavailable','Try selecting the layer again.'],
      'plugin-context-detected':['Figma plugin detected','Close the Figma plugin and reconnect.'],
      'wrong-page':['Open a Figma file','Pecta Mode works in an open Figma design file.']
    };
    const [title,hint]=messages[verdict]||['Could not read the layer','Try connecting again.'];
    setText(emptyTitle,title);setText(emptyHint,hint);reconnect.hidden=['select-a-layer','multiple-selection','wrong-page'].includes(verdict);
  }
  function render(node,rich) {
    const f=node.fields;
    setText(name,f.name||'Untitled');const types={FRAME:'Frame',SECTION:'Section',INSTANCE:'Instance',COMPONENT:'Component',COMPONENT_SET:'Component set',TEXT:'Text',RECTANGLE:'Rectangle',GROUP:'Group',VECTOR:'Vector'};setText(type,types[f.type]||f.type||'Layer');
    for(const [key,item] of Object.entries(dimensionValues)){setText(item.value,lengthText(f[key]));item.value.title=`${lengthText(f[key])} ${lengthUnit}`;item.button.disabled=!Number.isFinite(f[key]);}
    properties.render(node,lengthUnit,rich);
    const cssValue=cssText(node.css,lengthUnit);cssCopy.disabled=!rich||node.css?.status!=='ok'||!cssValue;
    cssPre.hidden=!cssValue;renderCss(cssValue);
    const cssStatus=node.css?.status;
    const cssMessage=!rich?'Loading CSS…':cssStatus==='ok'&&!cssValue?'No CSS returned for this layer.':cssStatus==='timeout'?'Figma did not return CSS in time.':cssStatus==='truncated'?'CSS exceeds the preview limit. Copying is disabled.':cssStatus==='error'?'Could not load CSS.':cssStatus==='unavailable'?'CSS is unavailable for this layer.':'';
    setText(cssHint,cssMessage);cssHint.hidden=!cssMessage;cssHint.classList.toggle('loading',!rich);cssRetry.hidden=!rich||!['timeout','error'].includes(cssStatus);
    component.render(node,rich,currentSeq);
    resources.render(node,currentSeq);
    textSection.node.hidden=typeof f.characters!=='string';setText(textContent,f.characters||'');textCopy.disabled=!f.characters||f.textTruncated;setText(textHint,f.textTruncated?'Showing the first 32,768 characters. Copying is disabled.':'');textHint.hidden=!f.textTruncated;
  }
  function onMessage(event) {
    const data=event.data;
    if(event.origin!==location.origin||(event.source&&event.source!==window)||data?.source!=='pecta-mode'||data.channel!==config.channel||data.direction!=='from-page')return;
    if(data.type==='stopped'){close(false);return;}
    if(data.type==='error'){if(!currentNode){empty.hidden=false;content.hidden=true;status('error');}return;}
    if(data.type==='component-preview'){if(data.seq===currentSeq)void component.acceptPreview(data.report);return;}
    if(data.type==='selection-resources'){if(data.seq===currentSeq)resources.acceptResources(data.report);return;}
    if(data.type==='selection-asset'){if(data.seq===currentSeq)void resources.acceptAsset(data.report);return;}
    if(!['fast','rich'].includes(data.type)||!Number.isInteger(data.seq)||data.seq<currentSeq||!data.report||typeof data.report!=='object')return;
    const report=data.report;
    if(data.seq!==currentSeq){clearCopies();richReceived=false;}
    if(data.type==='fast'&&data.seq===currentSeq&&richReceived)return;
    currentSeq=data.seq;if(data.type==='rich')richReceived=true;
    const node=report.nodes?.[0];
    if(report.verdict!=='selection-readable'||!node?.fields){currentNode=null;component.reset();resources.reset();content.hidden=true;empty.hidden=false;status(report.verdict,report.apiAccess?.selectionCount);return;}
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
  function close(notify=true){if(closed)return;if(notify)send('stop');closed=true;updateNotice.close();component.reset();resources.close();clearCopies();for(const timer of timers)clearTimeout(timer);observer.disconnect();media.removeEventListener('change',theme);window.removeEventListener('message',onMessage);window.removeEventListener('resize',onWindowResize);host.remove();if(globalThis.__PECTA_MODE_UI__===controller)delete globalThis.__PECTA_MODE_UI__;}
  const controller={isOpen:true,close};globalThis.__PECTA_MODE_UI__=controller;closeButton.onclick=()=>close();
  window.addEventListener('message',onMessage);window.addEventListener('resize',onWindowResize);media.addEventListener('change',theme);theme();document.body.append(host);setWidth(width);
  try{
    const saved=await api.storage.local.get(['panelWidth','lengthUnit','propertyView','colorFormat']);
    if(!closed){
      if(Number.isFinite(saved.panelWidth))setWidth(saved.panelWidth);
      if(!propertyViewWasChanged&&['list','code'].includes(saved.propertyView))properties.setView(saved.propertyView);
      if(!colorFormatWasChanged&&['hex','rgb','hsl'].includes(saved.colorFormat)){colorFormat=saved.colorFormat;properties.setColorFormat(colorFormat);resources.setColorFormat(colorFormat);}
      if(!unitWasChanged&&['px','rem'].includes(saved.lengthUnit)){
        lengthUnit=saved.lengthUnit;properties.unitSelect.value=lengthUnit;selectControl.sync(properties.unitSelect);
        if(currentNode)render(currentNode,richReceived);
      }
    }
  }catch{}
  return {mounted:true};
}
