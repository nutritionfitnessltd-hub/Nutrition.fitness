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
 const flushParagraph=()=>{if(paragraph.length){const blocks=paragraph.length===1?readableParagraphs(paragraph[0]):[paragraph.join('\n')];output.push(...blocks.map(block=>'<p>'+block.split('\n').map(inline).join('<br>')+'</p>'));paragraph=[];}};
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

// Old proposals may be saved as one long paragraph. Add breaks without rewriting text.
const sentenceReader=new Intl.Segmenter('en-GB',{granularity:'sentence'});
export function readableParagraphs(value){
 const text=String(value??'').trim();if(text.length<300)return text?[text]:[];
 const sentences=[...sentenceReader.segment(text)].map(part=>part.segment.trim());
 const blocks=[];let current=[];
 for(const sentence of sentences){
  if(current.length&&(current.join(' ').length+sentence.length>280||current.length===2)){blocks.push(current.join(' '));current=[];}
  current.push(sentence);
 }
 if(current.length)blocks.push(current.join(' '));return blocks;
}

export function proposalText(value,{headingLevel=4}={}){
 const text=String(value??'');
 if(/^(?:#{1,6}\s|[-*\u2022]\s|\d+[.)]\s|```)/m.test(text))return documentText(text,{headingLevel});
 // Only compare clearly quoted, consecutive A/B options. Other saved prose uses the reader.
 const quote='(?:\u2018[\\s\\S]*?\u2019(?=\\s|$|[.;])|\u201c[\\s\\S]*?\u201d(?=\\s|$|[.;])|\x27[\\s\\S]*?\x27(?=\\s|$|[.;])|"[\\s\\S]*?"(?=\\s|$|[.;]))';
 const pattern=new RegExp('(?:^|\\s)([A-D]):\\s*('+quote+')(?:[.;])?','g');
 const options=[...text.matchAll(pattern)];
 const consecutive=options.length>=2&&options.every((option,i)=>option[1]===String.fromCharCode(65+i)&&(i===0||!text.slice(options[i-1].index+options[i-1][0].length,option.index).trim()));
 if(!consecutive)return documentText(text,{headingLevel});
 const first=options[0],last=options.at(-1),before=text.slice(0,first.index).trim(),after=text.slice(last.index+last[0].length).trim();
 const level=Math.max(3,Math.min(6,headingLevel)),sentences=[...sentenceReader.segment(after)].map(s=>s.segment.trim()).filter(Boolean);
 // Keep explicit estimates/limits in their original order, outside the method list.
 let estimate=sentences.findIndex(sentence=>/^(?:Estimated|Budget|Effort|Time required|Cost)\b/i.test(sentence));
 if(estimate>=0&&!sentences.slice(estimate+1).every(sentence=>/^(?:No (?:money|spend|recruitment|payment|approval)|Subject to|Requires? approval|Not authorised|Budget|Estimated|Effort|Time required|Cost)\b/i.test(sentence)))estimate=-1;
 const details=estimate<0?sentences:sentences.slice(0,estimate),limits=estimate<0?[]:sentences.slice(estimate);
 return documentText(before,{headingLevel})+'<div class="document-options">'+options.map(option=>'<section><h'+level+'>Option '+option[1]+'</h'+level+'><p>'+esc(option[0].trim().replace(/^[A-D]:\s*/,''))+'</p></section>').join('')+'</div>'+
 (details.length?'<section class="document-method"><h'+level+'>'+( /\btest\b/i.test(before)?'How the test works':'Details')+'</h'+level+'><ul>'+details.map(sentence=>'<li>'+esc(sentence)+'</li>').join('')+'</ul></section>':'')+
 (limits.length?'<aside class="document-constraints"><h'+level+'>Effort &amp; approval limits</h'+level+'>'+documentText(limits.join(' '),{headingLevel:level+1})+'</aside>':'');
}
