import {esc} from './studio-ui.mjs';

// Display saved text safely. Formatting never rewrites the proposal or changes its scope.
export function documentText(value,{headingLevel=2}={}){
 const lines=String(value??'').replaceAll('\r\n','\n').split('\n');
 const levels=[];let fenced=false;
 for(const line of lines){if(/^```/.test(line.trim())){fenced=!fenced;continue;}if(!fenced&&/^#{1,6}\s+/.test(line))levels.push(line.match(/^#+/)[0].length);}
 const ranks=[...new Set(levels)].sort((a,b)=>a-b);
 const base=Math.max(2,Math.min(6,Number(headingLevel)||2));
 const inline=text=>esc(text).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
 const output=[];let paragraph=[],items=[],listType='',listStart=1,code=null,lastHeading=base-1;
 const flushParagraph=()=>{if(paragraph.length){output.push('<p>'+paragraph.map(inline).join('<br>')+'</p>');paragraph=[];}};
 const flushList=()=>{if(items.length){output.push('<'+listType+(listType==='ol'&&listStart!==1?' start="'+listStart+'"':'')+'>'+items.map(item=>'<li>'+inline(item)+'</li>').join('')+'</'+listType+'>');items=[];listType='';}};
 for(const line of lines){
  if(/^```/.test(line.trim())){flushParagraph();flushList();if(code){output.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');code=null;}else code=[];continue;}
  if(code){code.push(line);continue;}
  if(!line.trim()){flushParagraph();flushList();continue;}
  const heading=line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
  if(heading){flushParagraph();flushList();const level=Math.min(6,base+Math.max(0,ranks.indexOf(heading[1].length)),lastHeading+1);lastHeading=level;output.push('<h'+level+'>'+inline(heading[2])+'</h'+level+'>');continue;}
  const bullet=line.match(/^\s*([-*\u2022]|\d+[.)])\s+(.+)$/);
  if(bullet){flushParagraph();const type=/^\d/.test(bullet[1])?'ol':'ul';if(type!==listType){flushList();listType=type;listStart=parseInt(bullet[1],10)||1;}items.push(bullet[2]);continue;}
  flushList();paragraph.push(line);
 }
 flushParagraph();flushList();if(code)output.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');return output.join('');
}
export function documentSection(title,text,{level=2}={}){
 if(!String(text??'').trim())return '';
 const heading=Math.max(2,Math.min(5,level));
 return '<section class="document-section"><h'+heading+'>'+esc(title)+'</h'+heading+'>'+documentText(text,{headingLevel:heading+1})+'</section>';
}
export function documentEditor(label,body,{open=false}={}){
 return '<details class="document-edit-form"'+(open?' open':'')+'><summary>'+esc(label)+'</summary><div class="document-form-body">'+body+'</div></details>';
}
