import test from 'node:test';
import assert from 'node:assert/strict';
import {REM_BASE_PX,lengthValue,cssInUnit} from '../src/units.js';
import {cssText,numberText} from '../src/format.js';

test('rem uses an explicit 16px base, with zero, fractional borders and negative offsets',()=>{
  assert.equal(REM_BASE_PX,16);assert.equal(lengthValue(8,'rem'),.5);
  assert.equal(lengthValue(-4,'rem'),-.25);assert.equal(lengthValue(0,'rem'),0);
  assert.equal(numberText(lengthValue(.5,'rem'),6),'0.03125');
  assert.equal(lengthValue(8,'px'),8);assert.equal(lengthValue('[mixed-or-symbol]','rem'),'[mixed-or-symbol]');
});
test('CSS lengths convert in shorthands, calc, fallbacks and custom property values',()=>{
  const source='padding: 8px 0;\nmargin: -4px +16px .5px;\nwidth: calc(100% - 16px);\ngap: var(--space-8px, 8px);\n--size-16px: 1e2px;\nopacity: 0.5;';
  assert.equal(cssInUnit(source,'rem'),'padding: 0.5rem 0;\nmargin: -0.25rem 1rem 0.03125rem;\nwidth: calc(100% - 1rem);\ngap: var(--space-8px, 0.5rem);\n--size-16px: 6.25rem;\nopacity: 0.5;');
});
test('strings, comments, identifiers and URL contents stay intact, including escaped URL names',()=>{
  const source=String.raw`content: "16px"; /* 8px */ font-family: Inter16px; background: url(/icons/16px.svg), URL(data:image/svg+xml;8px), u\72 l(/16px), url("/img/32px.png"); padding: 16px;`;
  assert.equal(cssInUnit(source,'rem'),source.replace('padding: 16px','padding: 1rem'));
  assert.equal(cssInUnit('content: "16px; padding: 8px','rem'),'content: "16px; padding: 8px');
  assert.equal(cssInUnit('/* 16px','rem'),'/* 16px');
});
test('switching back uses the original CSS and never accumulates rounded rem conversions',()=>{
  const result={status:'ok',value:Object.freeze({width:'216px',padding:'10px 16px',height:'40px'})};
  const original=cssText(result);
  for(let i=0;i<10;i++){
    assert.equal(cssText(result,'rem'),'width: 13.5rem;\npadding: 0.625rem 1rem;\nheight: 2.5rem;');
    assert.equal(cssText(result,'px'),original);
  }
  assert.equal(result.value.width,'216px');
});
test('percentages, time, scale, existing rem values and malformed dimension-like names remain intact',()=>{
  const source='line-height: 120%; animation: 500ms; rotate: 45deg; width: 2rem; --foo: 16px-name; --bar: font16px; --unit: 2pxfoo;';
  assert.equal(cssInUnit(source,'rem'),source);assert.equal(cssInUnit(source,'px'),source);
});
