// Compatibility exports for existing callers. Every article uses the shared website template.
import {readerMain,readerDocument} from './article-reader.mjs';
export {imageCaption} from './article-reader.mjs';
export const knowledgeArticle=readerMain;
export function knowledgeDocument(r,{preview=false,image=''}={}){
 return readerDocument(r,image,preview?'Private preview · saved draft · not published':'');
}
export function cleanArticleBody(body,title=''){
 let text=String(body||'').trim();
 if(/^:::writing\{[^\n]*\}\s*\n/.test(text))text=text.replace(/^:::writing\{[^\n]*\}\s*\n/,'').replace(/\n:::\s*$/,'');
 const lines=text.split('\n');if(lines[0]?.replace(/^#\s+/,'').trim()===title.trim())lines.shift();
 return lines.join('\n').trim();
}
