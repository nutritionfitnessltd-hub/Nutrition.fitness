import {knowledgeArticle} from '../lib/knowledge-article-layout.mjs';
import {articleHtml,articleUrl} from './article-format.mjs';
import {esc} from './studio-ui.mjs';

const labels={cost:'Cost & prices',problems:'Problems & solutions',confidence:'Confidence & concerns',comparisons:'Comparisons',reviews:'Reviews',food:'Food & meal planning',workouts:'Workouts',supplements:'Supplements',habits:'Motivation & habits',nufi:'NUFI'};
const clean=text=>String(text||'').replace(/\uE200[\s\S]*?\uE201/g,'').trim();
export function imageCaption(r){
 const f=r.fields||{};
 if(typeof f.marginNote==='string')return f.marginNote.trim().slice(0,160);
 if(typeof f.imageCaption==='string')return f.imageCaption.trim().slice(0,160);
 const notes=[[/magnesium/i,'Magnesium and vitamin D.'],[/red wine/i,'Wine and heart health.'],[/light on/i,'Light, sleep and your heart.'],[/breast cancer/i,'HRT and breast cancer.'],[/dementia/i,'HRT and memory.']];
 return notes.find(([pattern])=>pattern.test(r.title))?.[1]||'Let’s look a little closer.';
}
function inline(text){
 return clean(text).split(/(\[[^\]\n]+\]\([^\s)]+\)|https:\/\/[^\s<>]+)/g).map(part=>{
  const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
  const href=articleUrl(link?link[2]:/^https:\/\//.test(part)?part:'');
  if(href)return '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(link?link[1]:part)+'</a>';
  return esc(part).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,'<em>$1</em>');
 }).join('');
}
export function markdownArticle(text){
 const lines=clean(text).split(/\r?\n/),out=[];let paragraph=[],list=[],listType='';
 const flushParagraph=()=>{if(paragraph.length)out.push('<p>'+inline(paragraph.join('\n')).replaceAll('\n','<br>')+'</p>');paragraph=[];};
 const flushList=()=>{if(list.length)out.push('<'+listType+'>'+list.map(v=>'<li>'+inline(v)+'</li>').join('')+'</'+listType+'>');list=[];};
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim(),heading=/^(#{1,6})\s+(.+)$/.exec(line),li=/^(?:([-*])|\d+[.)])\s+(.+)$/.exec(line);
  if(!line){flushParagraph();flushList();continue;}
  if(heading){flushParagraph();flushList();const n=Math.max(2,Math.min(4,heading[1].length));out.push('<h'+n+'>'+inline(heading[2])+'</h'+n+'>');continue;}
  if(line.includes('|')&&/^\|?\s*:?-{3,}/.test(lines[i+1]?.trim()||'')){
   flushParagraph();flushList();const cells=l=>l.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
   const headers=cells(line);i++;const rows=[];while(lines[i+1]?.includes('|'))rows.push(cells(lines[++i].trim()));
   out.push('<table><thead><tr>'+headers.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>');continue;
  }
  if(li){flushParagraph();const type=li[1]?'ul':'ol';if(type!==listType)flushList();listType=type;list.push(li[2]);continue;}
  flushList();paragraph.push(line);
 }
 flushParagraph();flushList();return out.join('');
}
// This is a read-only projection. Original submissions and editorial notes remain saved.
export function articlePresentation(record){
 const f=record.fields||{},raw=String(f.body||''),metadata={};let body=raw,sourcesMarkdown='';
 if(f.bodyFormat!=='html'){
  const first=/^#\s+(.+)$/m.exec(raw);
  if(first&&clean(first[1]).toLowerCase()===clean(record.title).toLowerCase()){
   const preface=raw.slice(0,first.index);
   for(const line of preface.split(/\r?\n/)){
    const match=/^(?:\*\*)?([A-Za-z ]+):(?:\*\*)?\s*(.*)$/.exec(line.trim());
    if(match)metadata[match[1].toLowerCase()]=match[2].replace(/`/g,'').trim();
   }
   body=raw.slice(first.index+first[0].length);
  }
  body=body.replace(/^:::writing[^\n]*\n?/gm,'').replace(/^:::\s*$/gm,'');
  // Older worker submissions append a production handoff to the article text.
  // Keep that original in the editor, but never render email provenance or raw JSON.
  const handoff=/^(?:\*\*)?(?:Source email|Source received|Source sender|Source Outlook message ID|Hero image source page|Checked sources JSON):/mi.exec(body);
  if(handoff){
   let start=handoff.index;
   const before=body.slice(0,start),margin=/^(?:\*\*)?Margin note:(?:\*\*)?\s*(.+)\s*$/mi.exec(before);
   if(margin&&before.slice(margin.index+margin[0].length).trim()===''){metadata['margin note']=clean(margin[1]);start=margin.index;}
   body=body.slice(0,start).replace(/^(?:\*\*)?Status:(?:\*\*)?\s*awaiting approval\s*$/gmi,'');
  }
  body=body.split(/^#{1,6}\s+(?:salesUse|Sales [&a-z ]*notes|Proposed real hero photograph)\s*$/mi)[0];
  const sources=/^#{1,6}\s+Sources\b[^\n]*\n/m.exec(body);
  if(sources){sourcesMarkdown=body.slice(sources.index+sources[0].length);body=body.slice(0,sources.index);}
 }
 return {title:record.title,category:f.category||metadata.category||'problems',topics:Array.isArray(f.topics)?f.topics:(metadata.topics||'').split(',').map(v=>v.trim()).filter(Boolean),
  summary:f.introduction||f.summary||metadata.summary||'',shortAnswer:f.shortAnswer||metadata['short answer']||'',marginNote:typeof f.marginNote==='string'||typeof f.imageCaption==='string'?imageCaption(record):metadata['margin note']||metadata['proposed margin note']||imageCaption(record),
  publishedAt:/^\d{4}-\d{2}-\d{2}$/.test(f.publishedAt||'')&&!Number.isNaN(Date.parse(f.publishedAt))?f.publishedAt:'',status:record.status,bodyHtml:f.bodyFormat==='html'?articleHtml(body):markdownArticle(body),
  sources:Array.isArray(f.sources)?f.sources.filter(s=>s&&articleUrl(s.url)).map(s=>({...s,url:articleUrl(s.url)})):[],sourcesMarkdown,
  imageAlt:f.imageAlt||metadata.imagealt||'',imageCredit:f.imageCredit||metadata.imagecredit||metadata['image credit']||'',imageCreditUrl:articleUrl(f.imageCreditUrl||metadata.imagecrediturl||'')};
}
export function readerMain(record,image=''){
 const a=articlePresentation(record);a.image=image;
 if(record.fields?.takeaway)a.bodyHtml+='<aside class="kc-quick-answer"><strong>The takeaway</strong><p>'+esc(record.fields.takeaway)+'</p></aside>';
 if(a.sourcesMarkdown&&!a.sources.length)a.bodyHtml+='<section class="kc-sources"><h2>Sources and checks</h2>'+markdownArticle(a.sourcesMarkdown)+'</section>';
 return knowledgeArticle(a,{label:(_,id)=>labels[id]||id,photograph:()=>'<img src="'+esc(image)+'" alt="'+esc(a.imageAlt)+'" width="1200" height="750" fetchpriority="high" decoding="async">',photoCredit:()=>a.imageCreditUrl?'<a href="'+esc(a.imageCreditUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(a.imageCredit)+'</a>':esc(a.imageCredit)});
}
export function readerDocument(record,image='',notice='',noindex=true){
 return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+(noindex?'<meta name="robots" content="noindex,nofollow">':'')+'<title>'+esc(record.title)+' | Nutrition.Fitness</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/knowledge-centre/knowledge-centre.css"><link rel="stylesheet" href="/article-reader.css"></head><body class="kc-page">'+(notice?'<div class="preview-bar">'+esc(notice)+'</div>':'')+readerMain(record,image)+'</body></html>';
}
