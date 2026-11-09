import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightCssDeclarations} from '../src/css-highlight.js';

test('declarations distinguish properties, values, functions and variables without changing CSS',()=>{
  const source='display: flex;\npadding: 8px 0;\ngap: var(--spacing-2, calc(100% - 2px));';
  const tokens=highlightCssDeclarations(source);
  assert.equal(tokens.map(t=>t.text).join(''),source);
  assert.deepEqual(tokens.filter(t=>t.type==='property').map(t=>t.text),['display','padding','gap']);
  assert.ok(tokens.some(t=>t.type==='value'&&t.text==='flex'));
  assert.ok(tokens.some(t=>t.type==='function'&&t.text==='var'));
  assert.ok(tokens.some(t=>t.type==='function'&&t.text==='calc'));
  assert.ok(tokens.some(t=>t.type==='variable'&&t.text==='--spacing-2'));
});
test('quoted delimiters, escaped quotes, comments and data URLs do not become new declarations',()=>{
  const source='content: "<img src=x onerror=alert(1)>; \\"text\\" : value";\n/* comment: not a property;\nsecond line */\nbackground: url(data:image/svg+xml;base64,abc/def==);\n--label: \'a;b\';\nwidth: 10px;';
  const tokens=highlightCssDeclarations(source);
  assert.equal(tokens.map(t=>t.text).join(''),source);
  assert.deepEqual(tokens.filter(t=>t.type==='property').map(t=>t.text),['content','background','--label','width']);
  assert.ok(tokens.some(t=>t.type==='string'&&t.text.includes('<img')));
  assert.ok(tokens.some(t=>t.type==='comment'&&t.text.includes('second line')));
});
test('incomplete values and arbitrary text remain plain text, including CRLF and trailing newlines',()=>{
  for(const source of ['', 'x: "unfinished\\', 'x: /* unfinished', 'padding:\r\n  8px\r\n  0;\r\n','--custom: {one: 1; two: 2};\nheight: 40px;']){
    assert.equal(highlightCssDeclarations(source).map(t=>t.text).join(''),source);
  }
});
test('long generated values have a bounded token count and still round-trip exactly',()=>{
  const source='background: '+Array.from({length:10000},(_,i)=>`var(--color-${i})`).join(', ')+';';
  const tokens=highlightCssDeclarations(source);
  assert.ok(tokens.length<=4097);assert.equal(tokens.map(t=>t.text).join(''),source);
});
