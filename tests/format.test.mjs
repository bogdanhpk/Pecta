import test from 'node:test';
import assert from 'node:assert/strict';
import {numberText,cssText,colorText,componentRows,componentItems,previewBackground,tokenBindings,layerBoxModel} from '../src/format.js';
test('CSS preserves actual names and values and does not copy unavailable results',()=>{
  assert.equal(cssText({status:'ok',value:{display:'flex','--radius':'8px',gap:'var(--space-2, 8px)'}}),'display: flex;\n--radius: 8px;\ngap: var(--space-2, 8px);');
  assert.equal(cssText({status:'timeout'}),'');assert.equal(cssText({status:'ok',value:{'bad;property':'x'}}),'');
});
test('geometry and colors retain useful precision without inventing missing values',()=>{
  assert.equal(numberText(52.77432),'52.77');assert.equal(numberText(undefined),'—');assert.equal(numberText(Symbol('mixed')),'—');
  assert.equal(colorText({type:'SOLID',color:{r:1,g:.5,b:0},opacity:.5}),'#FF8000 · 50%');
});
test('component variant and exposed property names stay readable and token binding names are kept',()=>{
  assert.deepEqual(componentRows({variantProperties:{State:'Default'},componentProperties:{'Label#2:3':{value:'Subscribe'},'Icon#2:4':{value:true}}}),[['State','Default'],['Label','Subscribe'],['Icon','Да']]);
  assert.equal(tokenBindings({boundVariables:{paddingLeft:{type:'VARIABLE_ALIAS',id:'a'},paddingRight:{type:'VARIABLE_ALIAS',id:'a'}}},'a'),'paddingLeft, paddingRight');
});

const boxFields={type:'FRAME',width:400,height:120,layoutMode:'HORIZONTAL',paddingTop:8,paddingRight:20,paddingBottom:12,paddingLeft:10,strokes:[{type:'SOLID'}],strokeWeight:4,strokeTopWeight:1,strokeRightWeight:2,strokeBottomWeight:3,strokeLeftWeight:4,strokeAlign:'INSIDE',strokesIncludedInLayout:true};
test('box model subtracts asymmetric padding and included inside strokes from layer bounds',()=>{
  const model=layerBoxModel(boxFields);
  assert.deepEqual(model.padding,{top:8,right:20,bottom:12,left:10});
  assert.deepEqual(model.border,{top:1,right:2,bottom:3,left:4});
  assert.equal(model.width,364);assert.equal(model.height,96);assert.equal(model.borderIncluded,true);
});
test('outside, center and excluded strokes stay visible in the diagram without shrinking content',()=>{
  for(const overrides of [{strokeAlign:'OUTSIDE'},{strokeAlign:'CENTER'},{strokesIncludedInLayout:false}]){
    const model=layerBoxModel({...boxFields,...overrides});
    assert.equal(model.width,370);assert.equal(model.height,100);assert.equal(model.borderIncluded,false);assert.equal(model.border.left,4);
  }
});
test('hidden strokes do not reserve space and stale auto layout padding is ignored on ordinary layers',()=>{
  const hidden=layerBoxModel({...boxFields,strokes:[{visible:false}]});assert.equal(hidden.width,370);assert.equal(hidden.border.top,0);
  const ordinary=layerBoxModel({...boxFields,layoutMode:'NONE'});assert.equal(ordinary.width,400);assert.equal(ordinary.height,120);assert.equal(ordinary.padding.top,0);
  const transparent=layerBoxModel({...boxFields,strokes:[{opacity:0}]});assert.equal(transparent.border.top,1);assert.equal(transparent.width,364);
});
test('box model preserves fractional and zero sizes, and does not manufacture missing measurements',()=>{
  const fractional=layerBoxModel({...boxFields,width:30.5,paddingLeft:10.25,paddingRight:20.25,strokes:[]});assert.equal(fractional.width,0);assert.equal(fractional.border.top,0);
  const missing=layerBoxModel({...boxFields,paddingLeft:undefined});assert.equal(missing.width,null);assert.equal(missing.height,96);
  const ambiguous=layerBoxModel({...boxFields,strokesIncludedInLayout:undefined});assert.equal(ambiguous.width,null);
  const uniform=layerBoxModel({...boxFields,strokeTopWeight:undefined});assert.equal(uniform.border.top,4);
  const mixed=layerBoxModel({...boxFields,strokeTopWeight:undefined,strokeWeight:'[mixed-or-symbol]'});assert.equal(mixed.border.top,null);assert.equal(mixed.height,null);
});

test('component property types keep boolean values separate from variant strings and names',()=>{
  const rows=componentItems({componentProperties:{
    'State#1:1':{type:'VARIANT',value:'Header'},'Counter#1:2':{type:'BOOLEAN',value:false},'Right Button#1:3':{type:'BOOLEAN',value:true},'Named False#1:4':{type:'VARIANT',value:'False'}
  }});
  assert.deepEqual(rows.map(({name,type,value,copy})=>[name,type,value,copy]),[
    ['State','VARIANT','Header','Header'],['Counter','BOOLEAN','False','false'],['Right Button','BOOLEAN','True','true'],['Named False','VARIANT','False','False']
  ]);
});
test('preview background contrasts with light, dark and transparent artwork',()=>{
  assert.equal(previewBackground([255,255,255,255]),'dark');
  assert.equal(previewBackground([0,0,0,255]),'light');
  assert.equal(previewBackground([255,255,255,90]),'dark');
  assert.equal(previewBackground([0,0,0,90]),'light');
  assert.equal(previewBackground([87,67,189,255]),'light');
  assert.equal(previewBackground([255,255,255,0,0,0,0,0]),null);
  assert.equal(previewBackground([255,255,255,0,0,0,0,255]),'light');
});
