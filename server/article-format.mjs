import {esc} from './studio-ui.mjs';
const origin='https://nutrition-fitness-website-2.vercel.app';
export function articleUrl(value){
 if(typeof value!=='string'||!(/^(?:https?:\/\/|\/(?!\/))/.test(value)))return '';
 try{const u=new URL(value,origin);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}
}
// Preserve the source's headings, lists and tables, without executing imported markup.
export function articleHtml(value){
 const allowed=new Set(['p','h2','h3','h4','ul','ol','li','strong','em','b','i','table','thead','tbody','tr','th','td','br','blockquote']);
 return String(value||'').split(/(<[^>]*>)/g).map(part=>{
  if(!part.startsWith('<'))return esc(part).replace(/&amp;(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi,'&$1;');
  const tag=/^<(\/)?([a-z0-9]+)\b[^>]*>$/i.exec(part);if(!tag)return '';
  const name=tag[2].toLowerCase();
  if(name==='a'){
   if(tag[1])return '</a>';
   const raw=/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(part),href=articleUrl(raw?.[1]??raw?.[2]);
   return href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">':'<a>';
  }
  if(!allowed.has(name))return '';
  return '<'+(tag[1]?'/':'')+name+'>';
 }).join('');
}
