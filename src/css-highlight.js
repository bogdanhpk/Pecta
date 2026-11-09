// A lexer for the declaration lists returned by getCSSAsync(), not a CSS evaluator.
// Every character is retained; rendering uses text nodes, including for strings and URLs.
export function highlightCssDeclarations(source) {
  if (typeof source !== 'string' || !source) return [];
  const tokens=[], brackets=[];
  const whitespace=/\s+/y;
  const chunk=/[^\s:;(),\[\]{}"'/*]+/y;
  let index=0, inValue=false;
  function push(type,text) {
    if(!text)return;
    const previous=tokens.at(-1);
    if(previous?.type===type)previous.text+=text;
    else tokens.push({type,text});
  }
  while(index<source.length) {
    // Large data URLs or generated values must not create an unbounded span tree.
    if(tokens.length>=4096){push(inValue?'value':'property',source.slice(index));break;}
    const start=index, character=source[index];
    whitespace.lastIndex=index;
    const space=whitespace.exec(source);
    if(space){push('plain',space[0]);index=whitespace.lastIndex;continue;}
    if(source.startsWith('/*',index)) {
      const end=source.indexOf('*/',index+2);index=end===-1?source.length:end+2;
      push('comment',source.slice(start,index));continue;
    }
    if(character==='"'||character==="'") {
      index++;
      while(index<source.length){if(source[index]==='\\'){index=Math.min(source.length,index+2);continue;}if(source[index++]===character)break;}
      push('string',source.slice(start,index));continue;
    }
    if(':;(),[]{}'.includes(character)) {
      if(character===':'&&!inValue)inValue=true;
      if(character===';'&&!brackets.length)inValue=false;
      if('([{'.includes(character))brackets.push(character);
      if(')]}'.includes(character)&&brackets.at(-1)==={')':'(',']':'[','}':'{'}[character])brackets.pop();
      push('punctuation',character);index++;continue;
    }
    chunk.lastIndex=index;
    const word=chunk.exec(source);
    if(word){
      index=chunk.lastIndex;
      const type=!inValue?'property':source[index]==='('?'function':word[0].startsWith('--')?'variable':'value';
      push(type,word[0]);continue;
    }
    push(inValue?'value':'property',character);index++;
  }
  return tokens;
}
