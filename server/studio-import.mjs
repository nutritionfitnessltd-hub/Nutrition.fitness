import { contents } from './library-view.mjs';
import { activeShelf, link } from './library-shelves.mjs';
import { randomUUID } from 'node:crypto';
import { HttpError } from './platform.mjs';
import { blankFields, cleanText } from './studio-model.mjs';
import { esc, url, heading, button, hidden, input, textarea, select, form, pages } from './studio-ui.mjs';

export function archivePage(params,data,meta={}){
  const index={...data.index,records:data.index.records.filter(r=>!r.id.startsWith('training:'))};
  const state=new URLSearchParams(params);
  if(!state.has('shelf')&&state.has('category'))state.set('shelf',state.get('category')==='Unsorted'?'Needs sorting':state.get('category'));
  const shelf=activeShelf(state,index),record=index.records.find(r=>r.id===state.get('item'));
  const sections=['Recipes','Courses','Programs','Challenges','Articles','E-Books','Business','Socials','Needs sorting','Source collections','All content'];
  const navigation='<nav class="tabs archive-sections" aria-label="Archive shelves">'+sections.map(name=>'<a href="'+url('archive',{shelf:name})+'"'+(name===shelf?' aria-current="page"':'')+'>'+esc(name)+'</a>').join('')+'</nav>';
  // Reuse the original shelf ordering, collection folders, recipe tabs and course detail view.
  // Keep source-asset access and file downloads on their existing authorised routes.
  let body=contents(index,state,meta);
  body=body.replace(/(href|src)="(\/content-library\/(?:\?[^"<>]*)?)"/g,(match,attribute,destination)=>{
    const query=new URL(destination.replaceAll('&amp;','&'),'https://studio.invalid').searchParams;
    if(query.has('work')||query.has('file'))return match;
    const target=query.has('preview')?url('media',{preview:query.get('preview')}):url('archive',Object.fromEntries(query));
    return attribute+'="'+target+'"';
  });
  body=body.replace('<form class="filters" action="/content-library/">','<form class="filters" action="/content-library/">'+hidden('work','1')+hidden('studio','archive'));
  return heading('Archive','Your original library, organised by its existing shelves and collections.',button('Import a PDF or text',url('import')))+navigation+
    (record?'<div class="studio-workbar">'+button('Use as a starting point',url('import',{source:record.id}),true)+button('Original assets',link({work:'1',assets:record.id}))+'</div>':'')+body;
}
export function importPage(params,data,error='',values={}){
  const source=data.index.records.find(r=>r.id===(params.get('source')||values.source));
  const choices=Object.fromEntries(data.projects.map(p=>[p.id,p.name]));
  if(data.actor.role==='admin')choices['']='Working library';
  const recorded=source?.fields.recipeText||source?.fields.body||'';
  return heading('Import and extract','Choose a source, inspect the text and create an editable draft.')+
    (error?'<p role="alert">'+esc(error)+'</p>':'')+
    (source?'<section class="panel"><h2>'+esc(source.title)+'</h2>'+button('Open original source','/content-library/?work=1&assets='+encodeURIComponent(source.id))+
      '<p>Export the source as a PDF in Canva or Drive, then select the file below. Extracted text can also be pasted.</p></section>':'')+
    '<div class="studio-columns import-columns"><section class="panel">'+
      '<label>PDF or text file<input id="studio-file" type="file" accept=".pdf,.txt,.md"></label><p id="studio-file-status" role="status"></p>'+
      form('import-preview',hidden('source',source?.id||'')+input('sourceName','Source name',values.sourceName||source?.title||'')+
      select('kind','Create',{'recipe':'Recipes','programme':'Programme starting point','exercise':'Exercise','lesson':'Lesson','article':'Article','communication':'Coaching message'},values.kind||'recipe')+
      select('project','Add to project',choices,values.project||'')+
      textarea('sourceText','Source text',values.sourceText||recorded,18),{section:'import',source:source?.id||''},'Preview extracted drafts','id="studio-import-form"')+
      '</section><section class="panel"><h2>Original PDF</h2><p id="studio-pdf-help">Select a PDF to compare its pages with the extracted text.</p><div id="studio-pdf-controls" hidden><button type="button" id="studio-pdf-prev">Previous page</button><span id="studio-pdf-page"></span><button type="button" id="studio-pdf-next">Next page</button></div><canvas id="studio-pdf-canvas" hidden></canvas></section></div>';
}
export function extractDrafts(text,kind,name,sourceId=''){
  text=cleanText(text,180000);
  if(!text)throw new HttpError(400,'Select a PDF with readable text or paste the source text.');
  const chunks=kind==='recipe'?text.split(/\f|\n--- PAGE \d+ ---\n/).filter(x=>x.trim()):[text];
  const candidates=[];
  for(const [i,raw] of chunks.entries()){
    const lines=raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const ingredients=lines.findIndex(l=>/^ingredients?\s*[:]?$/i.test(l));
    const method=lines.findIndex(l=>/^(method|instructions?|directions?|preparation)\s*[:]?$/i.test(l));
    if(kind==='recipe'&&chunks.length>1&&(ingredients<0||method<0))continue;
    const fields=blankFields(kind);
    if(kind==='recipe'){
      fields.ingredients=ingredients>=0?lines.slice(ingredients+1,method>ingredients?method:undefined):[];
      fields.instructions=method>=0?lines.slice(method+1):[];
      fields.sourceText=raw;
      const servings=raw.match(/(?:serves|servings)\s*:?\s*(\d+)/i);fields.servings=servings?Number(servings[1]):0;
    }else if(kind==='programme'){fields.description=raw;fields.weeks=0;}
    else if(kind==='exercise'){fields.instructions=lines;}
    else fields.body=raw;
    candidates.push({id:'studio:'+randomUUID(),title:(kind==='recipe'?lines[0]:name||lines[0]).slice(0,200),kind,status:'Draft',fields,parent:null,
      sourceId,source:{name,page:i+1,text:raw,needsChecking:true},comments:[]});
  }
  if(!candidates.length)throw new HttpError(400,'No recipe pages were recognised. Select one recipe’s text, keeping its Ingredients and Method headings, then preview again.');
  return candidates.slice(0,50);
}
export function importPreview(candidates,values,data){
  const titles=new Set(data.items.map(r=>r.title.trim().toLowerCase()));
  return heading('Check the extracted drafts','Select the items to add. Each draft keeps its source text for comparison.')+
    form('import-save',hidden('importId',randomUUID())+hidden('source',values.source||'')+hidden('sourceName',values.sourceName||'')+hidden('sourceText',values.sourceText)+hidden('kind',values.kind)+hidden('project',values.project||'')+
      candidates.map((r,i)=>'<section class="panel"><label class="check"><input type="checkbox" name="pick'+i+'" value="yes" checked> '+esc(r.title)+'</label>'+
        (titles.has(r.title.toLowerCase())?'<p role="status">A library item has this title. Check whether you need another version.</p>':'')+
        '<p class="meta">Source page '+r.source.page+'</p><details><summary>Compare extracted content</summary><pre class="source-text">'+esc(r.source.text)+'</pre></details></section>').join(''),
      {section:'import'},'Add selected drafts');
}
