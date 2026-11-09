import test from 'node:test';
import assert from 'node:assert/strict';
import {textTypography,textColor,textStyleBindings} from '../src/typography.js';
import {layerPropertyGroups} from '../src/layer-properties.js';
const node={fields:{type:'TEXT',width:312,height:20,layoutSizingHorizontal:'FILL',layoutSizingVertical:'HUG',fontName:{family:'Inter',style:'Regular'},fontWeight:400,fontSize:14,lineHeight:{unit:'PIXELS',value:20},letterSpacing:{unit:'PIXELS',value:0},textStyleId:'text:normal',fills:[{type:'SOLID',color:{r:30/255,g:32/255,b:44/255}}],openTypeFeatures:{ZERO:true}},textStyle:{status:'ok',value:{id:'text:normal',name:'Text/Normal',fontName:{family:'Inter',style:'Regular'},fontSize:14,lineHeight:{unit:'PIXELS',value:20},letterSpacing:{unit:'PIXELS',value:0},boundVariables:{fontFamily:{type:'VARIABLE_ALIAS',id:'family'},fontWeight:{type:'VARIABLE_ALIAS',id:'weight'},fontSize:{type:'VARIABLE_ALIAS',id:'size'},lineHeight:{type:'VARIABLE_ALIAS',id:'line'},letterSpacing:{type:'VARIABLE_ALIAS',id:'spacing'}}}},variables:['family','weight','size','line','spacing'].map(id=>({id,status:'ok',value:{id,name:`typography/text/normal/${id}`,resolvedType:id==='family'?'STRING':'FLOAT',variableCollectionId:'typography',valuesByMode:{base:id==='weight'?400:0}}})),variableModes:{entries:[{id:'typography',collectionName:'Typography',modeName:'Mode 1',modeId:'base',explicit:false},{id:'colors',collectionName:'Color Styles',modeName:'Light Mode',modeId:'light',explicit:true}]},paintStyle:{status:'ok',value:{name:'Foreground/Contrast'}}};
test('text diagram converts the actual size and line height, preserves percentages and never guesses Auto',()=>{
 const model=textTypography(node,'rem');assert.equal(model.fontLabel,'0.875rem');assert.equal(model.lineLabel,'1.25rem');assert.equal(model.caption,'Text/Normal');assert.ok(model.lineGuide>model.fontGuide);
 const percent=textTypography({...node,fields:{...node.fields,lineHeight:{unit:'PERCENT',value:120}}},'rem');assert.equal(percent.lineLabel,'120%');assert.equal(percent.linePixels,16.8);
 const auto=textTypography({...node,fields:{...node.fields,lineHeight:{unit:'AUTO'}}});assert.equal(auto.lineLabel,'Auto');assert.equal(auto.linePixels,null);
 const mixed=textTypography({fields:{...node.fields,fontSize:'[mixed-or-symbol]',lineHeight:'[mixed-or-symbol]'},textStyle:{status:'mixed'}});assert.equal(mixed.fontLabel,'Смешано');assert.equal(mixed.fontCopy,'');assert.equal(mixed.lineCopy,'');assert.match(mixed.caption,/Смешанные/);
});
test('text List has real style and token names, Fill/Hug, OpenType zero, modes and text color',()=>{
 const groups=layerPropertyGroups(node,'rem');assert.deepEqual(groups.map(group=>group.id),['layout','typography','modes','colors']);
 const layout=groups[0].rows;assert.equal(layout.find(row=>row.id==='width').value,'Fill (19.5rem)');assert.equal(layout.find(row=>row.id==='height').value,'Hug (1.25rem)');
 const rows=groups[1].rows,get=id=>rows.find(row=>row.id===id);assert.equal(get('textStyleName').value,'Text/Normal');
 for(const [property,id] of [['fontFamily','family'],['fontWeight','weight'],['fontSize','size'],['lineHeight','line'],['letterSpacing','spacing']])assert.equal(get(property).tokens[0].name,`typography/text/normal/${id}`);
 assert.equal(get('numericZero').value,'Slashed');assert.equal(groups[2].rows[0].value,'Auto (Mode 1)');assert.equal(groups[2].rows[1].value,'Light Mode');
 assert.equal(groups[3].rows[0].value,'Foreground/Contrast');assert.equal(groups[3].rows[0].color.value,'#1E202C');
});
test('an overridden property does not inherit a token from the linked text style',()=>{
 const overridden={...node,fields:{...node.fields,fontSize:18,fontWeight:700}};const bindings=textStyleBindings(overridden);assert.equal(bindings.fontSize,undefined);assert.equal(bindings.fontWeight,undefined);
 const row=layerPropertyGroups(overridden).find(group=>group.id==='typography').rows.find(row=>row.id==='fontSize');assert.equal(row.tokens.length,0);assert.equal(row.value,'18px');
});
test('color formats preserve opacity and do not fabricate colors for gradients or mixed paint',()=>{
 const paint={type:'SOLID',color:{r:1,g:0,b:0},opacity:.5};assert.equal(textColor(paint).value,'#FF000080');assert.equal(textColor(paint,'rgb').value,'rgb(255 0 0 / 50%)');assert.equal(textColor(paint,'hsl').value,'hsl(0 100% 50% / 50%)');assert.equal(textColor({type:'GRADIENT_LINEAR'}),null);assert.equal(textColor(null),null);
});
