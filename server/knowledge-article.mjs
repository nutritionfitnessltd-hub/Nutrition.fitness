// Compatibility exports for existing callers. Every article uses the shared website template.
import {readerMain,readerDocument} from './article-reader.mjs';
export {imageCaption} from './article-reader.mjs';
export const knowledgeArticle=readerMain;
export function knowledgeDocument(r,{preview=false,image=''}={}){
 return readerDocument(r,image,preview?'Private preview · saved draft · not published':'');
}
export function cleanArticleBody(body,title=''){
 let text=String(body||'').trim();
 const block=/^:::writing\{[^\n]*\}[^\n]*\n([\s\S]*?)^:::[ \t]*$/m.exec(text);
 if(block){const after=text.slice(block.index+block[0].length);const sources=/^#{2,3} Sources(?: checked)?[^\n]*\n[\s\S]*/m.exec(after)?.[0]||'';text=block[1]+'\n\n'+sources.split(/\n#{2,3} Proposed /)[0];}
 text=text.replace(/\uE200genui\uE202[\s\S]*?\uE201/g,'');
 const lines=text.split('\n');if(lines[0]?.replace(/^#\s+/,'').trim()===title.trim())lines.shift();
 return lines.join('\n').trim();
}
