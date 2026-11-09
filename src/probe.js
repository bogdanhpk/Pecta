// This function is serialized by scripting.executeScript. All helpers must stay inside it.
export async function probeFigmaPage(options = {}) {
  const key = '__PECTA_ACCESS_PROBE_V1__';
  const action = options.stateless && !['fast','snapshot'].includes(options.action) ? 'snapshot' : options.action || 'snapshot';
  const collector = { extensionVersion:typeof options.extensionVersion === 'string' ? options.extensionVersion.slice(0, 40) : 'development', formatVersion:2 };
  const hostname = location.hostname;
  if (!['www.figma.com', 'figma.com'].includes(hostname) || !/^\/(design|file)\//.test(location.pathname)) {
    return { schemaVersion: 1, verdict: 'wrong-page', scope: 'MAIN_TOP_FRAME' };
  }

  const errorText = error => String(error?.message || error).slice(0, 240);
  const safeRead = (object, property, errors) => {
    try { return object?.[property]; }
    catch (error) { if (errors && errors.length < 16) errors.push({ property, error: errorText(error) }); return undefined; }
  };
  function plain(value, depth = 0, seen = new Set(), stringLimit = 512) {
    if (value === undefined || typeof value === 'function') return undefined;
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return value.slice(0, stringLimit);
    if (typeof value === 'symbol') return '[mixed-or-symbol]';
    if (typeof value === 'bigint') return String(value);
    if (depth > 5 || seen.has(value)) return '[truncated]';
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 20).map(item => plain(item, depth + 1, seen, stringLimit));
    const result = {};
    for (const property of Object.keys(value).slice(0, 60)) {
      const item = plain(safeRead(value, property), depth + 1, seen, stringLimit);
      if (item !== undefined) Object.defineProperty(result, property, { value: item, enumerable: true });
    }
    return result;
  }
  async function readAsync(object, method, args = []) {
    if (typeof safeRead(object, method) !== 'function') return { status: 'unavailable' };
    const timeoutMs = Number.isFinite(options.readTimeoutMs) ? Math.max(50, Math.min(8000, options.readTimeoutMs)) : 4000;
    const startedAt = Date.now();
    let timer, timedOut = false;
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => object[method](...args)),
        new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('Read timed out')); }, timeoutMs); })
      ]);
      return { status: 'ok', value, elapsedMs:Date.now() - startedAt };
    } catch (error) { return { status:timedOut ? 'timeout' : 'error', error:errorText(error), elapsedMs:Date.now() - startedAt, ...(timedOut ? {timeoutMs} : {}) }; }
    finally { clearTimeout(timer); }
  }
  function resolveApi() {
    try {
      // Also checks a global lexical binding, not just window.figma.
      if (typeof figma !== 'undefined') return { value: figma, status: 'found' };
      return { value: undefined, status: 'absent' };
    } catch (error) { return { value: undefined, status: 'error', error: errorText(error) }; }
  }
  function selectionOf(api) {
    try {
      const page = api?.currentPage;
      const selection = page?.selection;
      if (!Array.isArray(selection)) return { status: 'unavailable', nodes: [], count: null };
      return { status:'ok', nodes:options.requireSingle && selection.length !== 1 ? [] : selection.slice(0, options.requireSingle ? 1 : 3), count:selection.length };
    } catch (error) { return { status: 'error', nodes: [], count: null, error: errorText(error) }; }
  }
  const previous = options.stateless ? undefined : globalThis[key];
  const staleState = previous?.version === 1 && (previous.probe?.formatVersion !== collector.formatVersion || previous.probe?.extensionVersion !== collector.extensionVersion);
  function watchSummary(session) {
    if (!session || session.version !== 1) return null;
    // Samples already contain bounded plain data. Reapplying the field depth limit here
    // would truncate nested paint/binding values just because they sit inside a report.
    const updateMechanism = session.selectionEventCount > 0
      ? session.pollChangeCount > 0 ? 'events-and-polling-observed' : 'selection-events-observed'
      : session.pollChangeCount > 0 ? 'polling-observed' : 'no-change-observed';
    return { probe:session.probe || null, status: session.status, startedAt: session.startedAt, finishedAt: session.finishedAt, durationMs: session.durationMs, selectionEventCount: session.selectionEventCount, selectionEventSubscription: session.selectionEventSubscription, pollChangeCount: session.pollChangeCount || 0, updateMechanism, currentSelection: session.currentSelection, capturePending: !!session.capturePending, fullCaptureCount: session.fullCaptureCount || 0, snapshots: session.snapshots || [], samples: session.samples, errors: session.errors };
  }
  const savedResult = () => ({ schemaVersion:1, collector, staleState:!!staleState, savedReport:previous?.version === 1 ? previous.report : null, observation:watchSummary(previous) });
  if (action === 'latest') return savedResult();
  if (action === 'stop') {
    if (previous?.version === 1) await previous.stop?.('stopped');
    return savedResult();
  }
  if (staleState) previous.stop?.('replaced');

  function variableIds(value, ids = new Set(), depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4 || ids.size >= 64) return ids;
    if (value.type === 'VARIABLE_ALIAS' && typeof value.id === 'string') ids.add(value.id);
    else for (const item of Object.values(value).slice(0, 30)) variableIds(item, ids, depth + 1);
    return ids;
  }
  function measurements(node,parent,fields) {
    const sides={top:null,right:null,bottom:null,left:null};
    if(!parent||!['FRAME','INSTANCE','COMPONENT','COMPONENT_SET','GROUP'].includes(safeRead(parent,'type')))return{status:'unavailable',sides};
    const parentWidth=safeRead(parent,'width'),parentHeight=safeRead(parent,'height');
    if(![parentWidth,parentHeight].every(Number.isFinite))return{status:'unavailable',sides};
    function bounds(item) {
      const width=safeRead(item,'width'),height=safeRead(item,'height');
      if(![width,height].every(Number.isFinite))return null;
      let matrix=safeRead(item,'relativeTransform');
      if(!Array.isArray(matrix)){
        const x=safeRead(item,'x'),y=safeRead(item,'y'),rotation=safeRead(item,'rotation');
        if(![x,y,rotation].every(Number.isFinite)||Math.abs(rotation%360)>.001)return null;
        matrix=[[1,0,x],[0,1,y]];
      }
      if(matrix.length!==2||!matrix.every(row=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite)))return null;
      const points=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>({x:matrix[0][0]*x+matrix[0][1]*y+matrix[0][2],y:matrix[1][0]*x+matrix[1][1]*y+matrix[1][2]}));
      return{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y)),rotated:Math.abs(matrix[0][1])>.001||Math.abs(matrix[1][0])>.001};
    }
    const selected=bounds(node);
    if(!selected)return{status:'unavailable',sides};
    // A rotated selection has no single rectangular padding box in parent coordinates.
    if(selected.rotated||Number.isFinite(fields.rotation)&&Math.abs(fields.rotation%360)>.001)return{status:'rotated',sides};
    const parentName=plain(safeRead(parent,'name'));
    for(const [side,value] of Object.entries({top:selected.top,right:parentWidth-selected.right,bottom:parentHeight-selected.bottom,left:selected.left}))sides[side]={value,source:'parent',name:parentName};
    const children=safeRead(parent,'children');
    // Only direct siblings, never a page traversal. Large parents keep verified parent distances.
    if(!Array.isArray(children)||children.length>256)return{status:'parent-only',sides};
    let checked=0;
    for(const sibling of children){
      if(sibling===node||safeRead(sibling,'id')===fields.id||safeRead(sibling,'visible')===false)continue;
      const other=bounds(sibling);if(!other)continue;checked++;
      const vertical=Math.min(selected.bottom,other.bottom)-Math.max(selected.top,other.top)>.001;
      const horizontal=Math.min(selected.right,other.right)-Math.max(selected.left,other.left)>.001;
      const candidates={
        left:vertical&&other.right<=selected.left+.001?Math.max(0,selected.left-other.right):null,
        right:vertical&&other.left>=selected.right-.001?Math.max(0,other.left-selected.right):null,
        top:horizontal&&other.bottom<=selected.top+.001?Math.max(0,selected.top-other.bottom):null,
        bottom:horizontal&&other.top>=selected.bottom-.001?Math.max(0,other.top-selected.bottom):null
      };
      for(const [side,value] of Object.entries(candidates))if(value!==null&&value<sides[side].value-.001)sides[side]={value,source:'sibling',name:plain(safeRead(sibling,'name'))};
    }
    return{status:'ok',sides,checked};
  }
  function nodeFields(node) {
    const errors = [], fields = {};
    const properties = ['id', 'name', 'type', 'x', 'y', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'visible', 'rotation', 'relativeTransform', 'absoluteBoundingBox', 'absoluteTransform', 'layoutMode', 'layoutSizingHorizontal', 'layoutSizingVertical', 'primaryAxisSizingMode', 'counterAxisSizingMode', 'primaryAxisAlignItems', 'counterAxisAlignItems', 'layoutWrap', 'layoutPositioning', 'layoutGrow', 'layoutAlign', 'itemSpacing', 'counterAxisSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'fills', 'strokes', 'strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeAlign', 'strokesIncludedInLayout', 'cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius', 'cornerSmoothing', 'clipsContent', 'overflowDirection', 'effects', 'opacity', 'fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlignHorizontal', 'textAlignVertical', 'textCase', 'textDecoration', 'fillStyleId', 'strokeStyleId', 'textStyleId', 'effectStyleId', 'boundVariables', 'componentProperties', 'variantProperties', 'componentPropertyDefinitions'];
    for (const property of properties) {
      const value = safeRead(node, property, errors);
      if (value !== undefined) fields[property] = plain(value);
    }
    if(fields.type==='TEXT')for(const property of ['openTypeFeatures','explicitVariableModes','resolvedVariableModes']){const value=safeRead(node,property,errors);if(value!==undefined)fields[property]=plain(value);}
    // The live panel does not need children; avoid materializing a large frame's child list.
    if (!options.stateless) {
      const children = safeRead(node, 'children', errors);
      if (Array.isArray(children)) fields.childCount = children.length;
    }
    const parent = safeRead(node, 'parent', errors);
    if (parent) fields.parent = { id: plain(safeRead(parent, 'id')), name: plain(safeRead(parent, 'name')), type: plain(safeRead(parent, 'type')), layoutMode:plain(safeRead(parent,'layoutMode')) };
    if(options.includeMeasurements)fields.measurements=measurements(node,parent,fields);
    if (options.includeContext) {
      fields.context = [];
      let ancestor = parent;
      const seen = new Set();
      while (ancestor && fields.context.length < 16 && !seen.has(ancestor)) {
        seen.add(ancestor);
        const type = safeRead(ancestor,'type');
        if (type === 'DOCUMENT') break;
        fields.context.unshift({id:plain(safeRead(ancestor,'id')), name:plain(safeRead(ancestor,'name')), type:plain(type)});
        if (type === 'PAGE') break;
        ancestor = safeRead(ancestor,'parent',errors);
      }
    }
    if (options.includeText && fields.type === 'TEXT') {
      const text = safeRead(node,'characters',errors);
      if (typeof text === 'string') {fields.characters=text.slice(0,32768);fields.textTruncated=text.length>32768;}
    }
    return {fields,errors};
  }
  async function typographySnapshot(api,fields,baseVariables,readVariable){
    const partial={textStyle:{status:'pending'},paintStyle:{status:'pending'},variableModes:{status:'pending',entries:[],omitted:0}};
    const cache=options.variableCache,limit=Number.isFinite(options.variableLimit)?Math.max(1,Math.min(64,Math.trunc(options.variableLimit))):8;
    const timeoutMs=Number.isFinite(options.readTimeoutMs)?Math.max(50,Math.min(8000,options.readTimeoutMs)):4000;
    async function library(key,read){
      const cached=cache?.get?.(key);if(cached&&cached.expiresAt>Date.now())return cached.result;
      const result=await read();
      if(result.status==='ok'&&cache?.set){if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(key,{result,expiresAt:Date.now()+5000});}
      return result;
    }
    async function style(id,type){
      if(id==='[mixed-or-symbol]')return{status:'mixed'};
      if(typeof id!=='string'||!id)return{status:'none'};
      return library(`style:${id}`,async()=>{
        const result=await readAsync(api,'getStyleByIdAsync',[id]);
        if(result.status==='ok'){
          const value=result.value;
          if(!value||safeRead(value,'type')!==type)return{status:'unavailable'};
          result.value={};
          for(const key of ['id','name','type','fontName','fontSize','fontWeight','lineHeight','letterSpacing','boundVariables']){
            const item=safeRead(value,key);if(item!==undefined)result.value[key]=plain(item);
          }
        }
        return result;
      });
    }
    const collectionIds=new Set(),pendingModes=[];
    function collection(id){
      if(typeof id!=='string'||!id||collectionIds.has(id))return;
      collectionIds.add(id);if(collectionIds.size>16){partial.variableModes.omitted++;return;}
      const entry={id,status:'pending',explicit:typeof fields.explicitVariableModes?.[id]==='string'};partial.variableModes.entries.push(entry);
      pendingModes.push((async()=>{
        const result=await library(`collection:${id}`,async()=>{
          const record=await readAsync(safeRead(api,'variables'),'getVariableCollectionByIdAsync',[id]);
          if(record.status==='ok'){
            const value=record.value,modes=safeRead(value,'modes');
            record.value=value?{name:plain(safeRead(value,'name')),defaultModeId:plain(safeRead(value,'defaultModeId')),modes:Array.isArray(modes)?modes.slice(0,64).map(mode=>({modeId:plain(safeRead(mode,'modeId')),name:plain(safeRead(mode,'name'))})):[]}:null;
          }
          return record;
        });
        entry.status=result.status;
        if(result.status==='ok'&&result.value){
          entry.collectionName=result.value.name;
          entry.modeId=fields.resolvedVariableModes?.[id]||fields.explicitVariableModes?.[id]||result.value.defaultModeId;
          entry.modeName=result.value.modes.find(mode=>mode.modeId===entry.modeId)?.name;
          if(!entry.modeName)entry.status='unavailable';
        }else if(result.status==='ok')entry.status='unavailable';
      })());
    }
    for(const id of [...Object.keys(fields.resolvedVariableModes||{}),...Object.keys(fields.explicitVariableModes||{})])collection(id);
    const work=(async()=>{
      const textStyleTask=style(fields.textStyleId,'TEXT').then(value=>partial.textStyle=value);
      const paintStyleTask=style(fields.fillStyleId,'PAINT').then(value=>partial.paintStyle=value);
      const variablesTask=baseVariables.then(value=>partial.variables=value);
      await Promise.all([textStyleTask,paintStyleTask,variablesTask]);
      const fonts=Object.fromEntries(['fontFamily','fontStyle','fontWeight','fontSize','lineHeight','letterSpacing'].map(key=>[key,fields.boundVariables?.[key]]));
      const ids=[...variableIds({fills:fields.fills,strokes:fields.strokes,fonts,style:partial.textStyle.value?.boundVariables,node:fields.boundVariables,effects:fields.effects})];
      partial.variables=await Promise.all(ids.slice(0,limit).map(readVariable));
      partial.variableCoverage={aliasesInSnapshot:ids.length,checked:partial.variables.length,omitted:Math.max(0,ids.length-partial.variables.length)};
      for(const record of partial.variables)collection(record.value?.variableCollectionId);
      await Promise.all(pendingModes);
      partial.variableModes.status=partial.variableModes.entries.some(entry=>entry.status!=='ok')?'partial':'ok';
    })();
    let timer,status='ok';
    try{await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>{status='timeout';resolve();},timeoutMs);})]);}
    catch{status='error';}
    finally{clearTimeout(timer);}
    // Each library value is already bounded. Only mode entries can still mutate
    // after the deadline; copying the full result through plain() would cut the
    // 32-variable budget to its generic 20-item array limit.
    const result={...partial,textStyle:{...partial.textStyle},paintStyle:{...partial.paintStyle},variableModes:{...partial.variableModes,entries:partial.variableModes.entries.map(entry=>({...entry}))}};
    for(const key of ['textStyle','paintStyle'])if(result[key].status==='pending')result[key].status=status==='ok'?'unavailable':status;
    if(result.variableModes.status==='pending')result.variableModes.status=status;
    for(const entry of result.variableModes.entries)if(entry.status==='pending')entry.status=status==='ok'?'unavailable':status;
    return result;
  }
  async function nodeSnapshot(node, api) {
    const {fields,errors} = nodeFields(node);
    const cssTask = readAsync(node, 'getCSSAsync');
    const componentTask = fields.type === 'INSTANCE' ? readAsync(node, 'getMainComponentAsync') : ['COMPONENT','COMPONENT_SET'].includes(fields.type) ? Promise.resolve({status:'ok',value:node}) : Promise.resolve({status:'not-instance'});
    // Prioritize visible paint bindings before effects, which can contain many aliases.
    const fontBindings=fields.type==='TEXT'?Object.fromEntries(['fontFamily','fontStyle','fontWeight','fontSize','lineHeight','letterSpacing'].map(key=>[key,fields.boundVariables?.[key]])):null;
    const bindings = { fills: fields.fills, strokes: fields.strokes, fonts:fontBindings, node: fields.boundVariables, effects:fields.effects };
    const aliases = [...variableIds(bindings)];
    const variablesApi = safeRead(api, 'variables');
    const variableLimit = Number.isFinite(options.variableLimit) ? Math.max(1,Math.min(64,Math.trunc(options.variableLimit))) : 8;
    const cache = options.variableCache;
    async function readVariable(id){
      const cached = cache?.get?.(id);
      if (cached && cached.expiresAt > Date.now()) return cached.result;
      const result = await readAsync(variablesApi, 'getVariableByIdAsync', [id]);
      if (result.status === 'ok') {
        const variable = result.value;
        result.value = variable ? { id, name: plain(safeRead(variable, 'name')), resolvedType: plain(safeRead(variable, 'resolvedType')), variableCollectionId: plain(safeRead(variable, 'variableCollectionId')), codeSyntax: plain(safeRead(variable, 'codeSyntax')), valuesByMode: plain(safeRead(variable, 'valuesByMode')) } : null;
      }
      const record = {id,...result};
      if (result.status === 'ok' && cache?.set) {
        if (cache.size >= 256) cache.delete(cache.keys().next().value);
        cache.set(id,{expiresAt:Date.now()+5000,result:record});
      }
      return record;
    }
    const variablesTask=Promise.all(aliases.slice(0,variableLimit).map(readVariable));
    const typographyTask=fields.type==='TEXT'?typographySnapshot(api,fields,variablesTask,readVariable):Promise.resolve(null);
    const [css, component, baseVariables, typography] = await Promise.all([cssTask, componentTask, variablesTask,typographyTask]);
    const variables=typography?.variables||baseVariables;
    if (css.status === 'ok') {
      const cssStringLimit = 16384;
      const properties = Object.keys(css.value || {});
      css.truncatedProperties = properties.slice(0, 60).filter(property => typeof css.value[property] === 'string' && css.value[property].length > cssStringLimit);
      css.omittedProperties = Math.max(0, properties.length - 60);
      css.value = plain(css.value, 0, new Set(), cssStringLimit);
      if (css.truncatedProperties.length || css.omittedProperties) css.status = 'truncated';
    }
    if (component.status === 'ok') {
      const main = component.value;
      const parent = safeRead(main, 'parent', errors);
      const set=safeRead(main,'type')==='COMPONENT_SET'?main:safeRead(parent,'type')==='COMPONENT_SET'?parent:null;
      let source=main,sourceName=null;const visited=new Set();
      while(source&&visited.size<16&&!visited.has(source)){
        visited.add(source);
        if(safeRead(source,'type')==='DOCUMENT'){sourceName=plain(safeRead(source,'name'));break;}
        source=safeRead(source,'parent');
      }
      if(!sourceName&&safeRead(main,'remote')===false)sourceName=plain(safeRead(safeRead(api,'root'),'name'));
      const children=set?safeRead(set,'children'):null;
      const candidates=Array.isArray(children)?children.slice(0,128):[];
      if(safeRead(main,'type')==='COMPONENT'&&!candidates.some(item=>safeRead(item,'id')===safeRead(main,'id')))candidates.push(main);
      const variants=candidates.filter(item=>safeRead(item,'type')==='COMPONENT').map(item=>({
        id:plain(safeRead(item,'id')),name:plain(safeRead(item,'name')),properties:plain(safeRead(item,'variantProperties'))||{}
      }));
      component.value = main ? {
        id:plain(safeRead(main, 'id')), name:plain(safeRead(main, 'name')),
        key:plain(safeRead(main,'key')),remote:plain(safeRead(main,'remote')),sourceName,
        description:plain(safeRead(set,'description')||safeRead(main,'description'),0,new Set(),4096),
        documentationLinks:plain(safeRead(set,'documentationLinks')||safeRead(main,'documentationLinks')),
        componentSet:set ? {id:plain(safeRead(set, 'id')), name:plain(safeRead(set, 'name'))} : null,
        variants,variantCount:Array.isArray(children)?children.length:variants.length,
        previewAvailable:typeof safeRead(node,'exportAsync')==='function',
        propertyDefinitions:plain(safeRead(set||main,'componentPropertyDefinitions'))
      } : null;
    }
    return { fields, css, component, variables, ...(typography?{textStyle:typography.textStyle,paintStyle:typography.paintStyle,variableModes:typography.variableModes}:{}), variableCoverage:typography?.variableCoverage||{ aliasesInSnapshot:aliases.length, checked:variables.length, omitted:Math.max(0, aliases.length - variables.length) }, errors };
  }
  const resolved = resolveApi();
  const api = resolved.value;
  const selection = selectionOf(api);
  const nodes = action === 'fast' ? selection.nodes.map(node => ({...nodeFields(node),css:{status:'pending'},component:{status:'pending'},textStyle:{status:'pending'},variables:[]})) : await Promise.all(selection.nodes.map(node => nodeSnapshot(node, api)));
  function makeReport(current, capturedNodes, reason) {
    const pluginId = safeRead(api, 'pluginId');
    const readable = capturedNodes.some(node => typeof node.fields.id === 'string' && typeof node.fields.name === 'string' && Number.isFinite(node.fields.width) && Number.isFinite(node.fields.height));
    return {
    schemaVersion: 1,
    probe: collector,
    capturedAt: new Date().toISOString(),
    captureReason: reason,
    scope: 'MAIN_TOP_FRAME',
    verdict: typeof pluginId === 'string' && pluginId ? 'plugin-context-detected' : readable ? 'selection-readable' : options.requireSingle && current.count > 1 ? 'multiple-selection' : current.status === 'ok' && current.count === 0 ? 'select-a-layer' : resolved.status === 'found' ? 'object-without-readable-selection' : 'no-figma-object',
    apiAccess: { global: resolved.status, error: resolved.error, pluginContextDetected: typeof pluginId === 'string' && !!pluginId, selection: current.status, selectionError: current.error, selectionCount: current.count, onAvailable: typeof safeRead(api, 'on') === 'function', offAvailable: typeof safeRead(api, 'off') === 'function' },
    nodes: capturedNodes,
    limitations: ['Only the top frame MAIN context was checked.', 'Absence of window.figma does not rule out other interfaces or contexts.', 'Reading some properties does not prove complete Dev Mode coverage.', 'No Figma document properties were changed.']
    };
  }
  const report = makeReport(selection, nodes, 'snapshot');
  if (options.stateless || action === 'fast') return report;
  if (action !== 'observe' || selection.status !== 'ok') {
    if (previous?.version === 1 && !staleState) { previous.report = report; return { ...report, observation: watchSummary(previous) }; }
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: { version: 1, probe:collector, status: 'snapshot', report, samples: [] } });
    return report;
  }

  previous?.version === 1 && previous.stop?.('replaced');
  const durationMs = Math.max(500, Math.min(30000, Number(options.durationMs) || 20000));
  const session = { version: 1, probe:collector, status: 'running', startedAt: Date.now(), durationMs, report, snapshots: [], fullCaptureCount: 0, capturePending: false, samples: [], errors: [], selectionEventCount: 0, pollChangeCount: 0, selectionEventSubscription: 'unavailable', fingerprint: null };
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: session });
  const monitoredProperties = ['id', 'name', 'type', 'width', 'height', 'x', 'y', 'fills', 'strokes', 'boundVariables', 'layoutMode', 'itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'cornerRadius', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'componentProperties'];
  function sampleFields(node) {
    const item = {};
    for (const property of monitoredProperties) {
      const value = safeRead(node, property);
      if (value !== undefined) item[property] = plain(value);
    }
    return item;
  }
  const initialFingerprint = JSON.stringify([selection.status, selection.count, nodes.map(node => sampleFields(node.fields))]);
  let pendingCapture = null, captureTask = null;
  function retainFullSnapshot(snapshot) {
    session.report = snapshot;
    session.snapshots.push(snapshot);
    session.fullCaptureCount++;
    if (session.snapshots.length > 8) session.snapshots.shift();
  }
  function queueFullSnapshot(current, reason) {
    pendingCapture = { nodes:[...current.nodes], count:current.count, status:current.status, reason };
    if (captureTask) return;
    session.capturePending = true;
    captureTask = (async () => {
      while (pendingCapture && session.status !== 'replaced') {
        const request = pendingCapture;
        pendingCapture = null;
        try {
          const captured = await Promise.all(request.nodes.map(node => nodeSnapshot(node, api)));
          if (globalThis[key] === session && session.status !== 'replaced') retainFullSnapshot(makeReport(request, captured, request.reason));
        } catch (error) { if (session.errors.length < 16) session.errors.push('Full snapshot: ' + errorText(error)); }
      }
    })().finally(() => {
      captureTask = null;
      session.capturePending = false;
      if (session.status === 'finishing') session.status = session.finishStatus;
    });
  }
  function sample(reason) {
    if (session.status !== 'running') return;
    const current = selectionOf(api);
    const items = current.nodes.map(sampleFields);
    session.currentSelection = { status:current.status, count:current.count, nodes:items.map(item => ({id:item.id, name:item.name})), sampledAt:Date.now() };
    const fingerprint = JSON.stringify([current.status, current.count, items]);
    if (fingerprint === session.fingerprint) return;
    session.fingerprint = fingerprint;
    if (reason === 'poll') session.pollChangeCount++;
    session.samples.push({ elapsedMs: Date.now() - session.startedAt, reason, count: current.count, nodes: items });
    if (session.samples.length > 16) session.samples.splice(1, 1);
    if (current.nodes.length) {
      if (reason === 'initial' && fingerprint === initialFingerprint) retainFullSnapshot(report);
      else queueFullSnapshot(current, reason);
    }
  }
  function onSelection() { if (session.status === 'running') { session.selectionEventCount++; sample('selectionchange'); } }
  let interval, timeout, subscribed = false;
  session.stop = status => {
    if (session.status !== 'running') return captureTask;
    clearInterval(interval); clearTimeout(timeout);
    if (subscribed) {
      try { api.off('selectionchange', onSelection); }
      catch (error) { session.errors.push(errorText(error)); }
    }
    session.finishedAt = Date.now();
    if (status === 'replaced') { pendingCapture = null; session.status = status; }
    else {
      session.finishStatus = status;
      session.status = captureTask ? 'finishing' : status;
    }
    return captureTask;
  };
  if (typeof safeRead(api, 'on') === 'function' && typeof safeRead(api, 'off') === 'function') {
    try { api.on('selectionchange', onSelection); subscribed = true; session.selectionEventSubscription = 'subscribed'; }
    catch (error) { session.selectionEventSubscription = 'error'; session.errors.push(errorText(error)); }
  }
  sample('initial');
  interval = setInterval(() => sample('poll'), 250);
  timeout = setTimeout(() => { sample('final'); session.stop('completed'); }, durationMs);
  return { ...session.report, observation: watchSummary(session) };
}
