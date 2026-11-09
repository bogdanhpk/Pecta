import test from 'node:test';
import assert from 'node:assert/strict';
import {layerRadii,layerPropertyGroups} from '../src/layer-properties.js';
const fields={type:'INSTANCE',width:254,height:32,layoutMode:'HORIZONTAL',layoutSizingHorizontal:'FILL',layoutSizingVertical:'HUG',paddingTop:6,paddingRight:10,paddingBottom:6,paddingLeft:10,cornerRadius:8,itemSpacing:8,boundVariables:{cornerRadius:{type:'VARIABLE_ALIAS',id:'radius'},paddingTop:{type:'VARIABLE_ALIAS',id:'space'},paddingBottom:{type:'VARIABLE_ALIAS',id:'space'}}};
const node={fields,variables:[{id:'radius',status:'ok',value:{id:'radius',name:'border-radius',resolvedType:'FLOAT'}},{id:'space',status:'ok',value:{id:'space',name:'size/xs',resolvedType:'FLOAT'}}]};
test('List exposes sizing policy with actual dimensions and binds names to the exact properties',()=>{
  const rows=layerPropertyGroups(node,'rem')[0].rows;const get=id=>rows.find(row=>row.id===id);
  assert.equal(get('width').value,'Fill (15.875rem)');assert.equal(get('height').value,'Hug (2rem)');
  assert.equal(get('cornerRadius').tokens[0].name,'border-radius');assert.equal(get('paddingTop').tokens[0].name,'size/xs');
  assert.equal(get('paddingRight').value,'0.625rem');assert.equal(get('paddingRight').tokens.length,0);
  assert.equal(get('paddingTop').value,'0.375rem');assert.equal(get('paddingTop').copy,'0.375rem');
});
test('independent corners preserve zero and mixed radii without inventing a shared value',()=>{
  assert.deepEqual(layerRadii({cornerRadius:8,topLeftRadius:0,topRightRadius:4,bottomRightRadius:12,bottomLeftRadius:16}),{tl:0,tr:4,br:12,bl:16});
  const rows=layerPropertyGroups({fields:{...fields,cornerRadius:'[mixed-or-symbol]',topLeftRadius:0,topRightRadius:4,bottomRightRadius:12,bottomLeftRadius:16}})[0].rows;
  assert.equal(rows.find(row=>row.id==='bottomRightRadius').value,'12px');assert.equal(rows.find(row=>row.id==='topLeftRadius').value,'0px');
  assert.deepEqual(layerRadii({cornerRadius:'[mixed-or-symbol]'}),{tl:null,tr:null,br:null,bl:null});
});
test('typography percentages and weight retain their units while pixel dimensions become rem',()=>{
  const groups=layerPropertyGroups({fields:{...fields,type:'TEXT',fontName:{family:'Inter',style:'Bold'},fontWeight:700,fontSize:32,lineHeight:{unit:'PERCENT',value:120},letterSpacing:{unit:'PIXELS',value:-.5}}},'rem');
  const rows=groups.find(group=>group.id==='typography').rows;
  assert.equal(rows.find(row=>row.id==='fontWeight').value,'700');assert.equal(rows.find(row=>row.id==='fontSize').value,'2rem');assert.equal(rows.find(row=>row.id==='lineHeight').value,'120%');assert.equal(rows.find(row=>row.id==='letterSpacing').value,'-0.03125rem');
});
test('an unresolved token falls back to the real value and is never replaced by a made-up name',()=>{
  const rows=layerPropertyGroups({...node,variables:[]})[0].rows;
  assert.equal(rows.find(row=>row.id==='paddingTop').value,'6px');assert.equal(rows.find(row=>row.id==='paddingTop').tokens.length,0);
});
test('equal corner values with different bindings stay separate so their token names are preserved',()=>{
  const variant={fields:{...fields,boundVariables:{topLeftRadius:{type:'VARIABLE_ALIAS',id:'radius'},topRightRadius:{type:'VARIABLE_ALIAS',id:'other'}}},variables:[...node.variables,{id:'other',status:'ok',value:{id:'other',name:'radius/special',resolvedType:'FLOAT'}}]};
  const rows=layerPropertyGroups(variant)[0].rows;
  assert.equal(rows.find(row=>row.id==='topLeftRadius').tokens[0].name,'border-radius');
  assert.equal(rows.find(row=>row.id==='topRightRadius').tokens[0].name,'radius/special');
  assert.equal(rows.find(row=>row.id==='radius').heading,true);
});
test('legacy auto-layout fields retain Fill and Hug when the newer sizing flags are absent',()=>{
  const legacy={fields:{...fields,layoutSizingHorizontal:undefined,layoutSizingVertical:undefined,parent:{layoutMode:'HORIZONTAL'},layoutGrow:1,primaryAxisSizingMode:'FIXED',counterAxisSizingMode:'AUTO'}};
  const rows=layerPropertyGroups(legacy)[0].rows;
  assert.equal(rows.find(row=>row.id==='width').value,'Fill (254px)');assert.equal(rows.find(row=>row.id==='height').value,'Hug (32px)');
});
