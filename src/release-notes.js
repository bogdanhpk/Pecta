// Render the small Markdown subset used in release notes with text nodes only.
export function renderReleaseNotes(container,source){
  const limit=16000,lineLimit=240;
  const lines=String(source).replace(/\r\n?/g,'\n').slice(0,limit).split('\n');
  const truncated=source.length>limit||lines.length>lineLimit;
  const fragment=document.createDocumentFragment();let paragraph=[],list=null,listType='',code=null,quoted=false;
  function inline(parent,text){
    const tokens=/`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;
    let start=0;
    for(const match of text.matchAll(tokens)){
      if(match.index>start)parent.append(document.createTextNode(text.slice(start,match.index)));
      if(match[1]||match[2]){const node=document.createElement(match[1]?'code':'strong');node.textContent=match[1]||match[2];parent.append(node);}
      else{
        let url;try{const parsed=new URL(match[4]||match[5],'https://github.com/bogdanhpk/Pecta/');if(['https:','http:'].includes(parsed.protocol))url=parsed.href;}catch{}
        if(url){const link=document.createElement('a');link.textContent=match[3]||match[5];link.href=url;link.target='_blank';link.rel='noopener noreferrer';parent.append(link);}
        else parent.append(document.createTextNode(match[0]));
      }
      start=match.index+match[0].length;
    }
    if(start<text.length)parent.append(document.createTextNode(text.slice(start)));
  }
  function flush(){
    if(paragraph.length){const node=document.createElement(quoted?'blockquote':'p');inline(node,paragraph.join(' '));fragment.append(node);paragraph=[];}
    quoted=false;list=null;listType='';
  }
  function flushCode(){const pre=document.createElement('pre'),node=document.createElement('code');node.textContent=code.join('\n');pre.append(node);fragment.append(pre);code=null;}
  for(const line of lines.slice(0,lineLimit)){
    if(/^\s*```/.test(line)){if(code)flushCode();else{flush();code=[];}continue;}
    if(code){code.push(line);continue;}
    if(!line.trim()){flush();continue;}
    const heading=/^(#{1,6})\s+(.+)$/.exec(line),item=/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/.exec(line),quote=/^>\s?(.*)$/.exec(line);
    if(heading){flush();const node=document.createElement(heading[1].length===1?'h3':'h4');inline(node,heading[2]);fragment.append(node);continue;}
    if(item){
      if(paragraph.length)flush();const type=item[1]?'ul':'ol';
      if(!list||listType!==type){list=document.createElement(type);listType=type;fragment.append(list);}
      const node=document.createElement('li');inline(node,item[2]);list.append(node);continue;
    }
    if(quote){if(!quoted)flush();quoted=true;paragraph.push(quote[1]);continue;}
    if(quoted)flush();list=null;listType='';paragraph.push(line.trim());
  }
  if(code)flushCode();flush();container.replaceChildren(fragment);return truncated;
}
