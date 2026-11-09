export const REM_BASE_PX=16;

export function lengthValue(value,unit='px') {
  return unit==='rem'&&Number.isFinite(value)?value/REM_BASE_PX:value;
}

// Convert CSS lengths, leaving names, quoted text, comments and URL contents intact.
export function cssInUnit(source,unit='px') {
  if(unit!=='rem'||typeof source!=='string'||!source)return source;
  const identifier=/(?:[-_a-z\u0080-\uffff]|\\(?:[a-f\d]{1,6}(?:\r\n|[ \t\r\n\f])?|[^\r\n\f]))(?:[-\w\u0080-\uffff]|\\(?:[a-f\d]{1,6}(?:\r\n|[ \t\r\n\f])?|[^\r\n\f]))*/iy;
  const pixels=/[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?px(?![-\w\u0080-\uffff])/iy;
  const parts=[];
  let index=0;
  function quotedEnd(start) {
    const quote=source[start];let end=start+1;
    while(end<source.length){if(source[end]==='\\'){end=Math.min(source.length,end+2);continue;}if(source[end++]===quote)break;}
    return end;
  }
  function commentEnd(start){const end=source.indexOf('*/',start+2);return end===-1?source.length:end+2;}
  function functionName(value){
    return value.replace(/\\([a-f\d]{1,6})(?:\r\n|[ \t\r\n\f])?|\\([^\r\n\f])/gi,(_,hex,escaped)=>hex?String.fromCodePoint(Math.min(parseInt(hex,16),0x10ffff)):escaped).toLowerCase();
  }
  function urlEnd(start) {
    let end=start+1,depth=1;
    while(end<source.length&&depth){
      if(source[end]==='"'||source[end]==="'"){end=quotedEnd(end);continue;}
      if(source.startsWith('/*',end)){end=commentEnd(end);continue;}
      if(source[end]==='\\'){end=Math.min(source.length,end+2);continue;}
      if(source[end]==='(')depth++;
      if(source[end]===')')depth--;
      end++;
    }
    return end;
  }
  while(index<source.length){
    const start=index,character=source[index];
    if(character==='"'||character==="'"){index=quotedEnd(index);parts.push(source.slice(start,index));continue;}
    if(source.startsWith('/*',index)){index=commentEnd(index);parts.push(source.slice(start,index));continue;}
    pixels.lastIndex=index;
    const pixel=!/[-\w.\\\u0080-\uffff]/.test(source[index-1]||'')?pixels.exec(source):null;
    if(pixel){
      const value=Number(pixel[0].slice(0,-2));
      parts.push(Number.isFinite(value)?`${Number((value/REM_BASE_PX).toFixed(6))}rem`:pixel[0]);
      index=pixels.lastIndex;continue;
    }
    identifier.lastIndex=index;
    const word=identifier.exec(source);
    if(word){
      index=identifier.lastIndex;
      if(functionName(word[0])==='url'&&source[index]==='(')index=urlEnd(index);
      parts.push(source.slice(start,index));continue;
    }
    parts.push(character);index++;
  }
  return parts.join('');
}
