const fieldsInput = document.querySelector('#studio-fields');
const editor = document.querySelector('#studio-editor');
const fieldLabels = {
  repMin:'Minimum reps',repMax:'Maximum reps',referenceId:'Exercise or activity',restSeconds:'Rest in seconds',
  effortValue:'Effort target',effortType:'Effort scale',perSide:'Per side',sessionIds:'Workouts',stageIds:'Stages',
  easierId:'Easier exercise',harderId:'Harder exercise',videoUrl:'Demonstration video URL',thumbnailUrl:'Image URL',
  sourceText:'Original source text',busyWeek:'Busy week option',warmup:'Warm-up',cooldown:'Cool-down'
};
const labelFor = key => fieldLabels[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase());
const element = (tag, text, className) => {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(className)el.className=className;
  return el;
};
if(fieldsInput&&editor){
  const values=JSON.parse(fieldsInput.value);
  const refs=JSON.parse(document.querySelector('#studio-reference-data')?.value||'[]');
  const names=new Map(refs.map(r=>[r.id,r.title]));
  const templates={
    blocks:{type:'exercise',referenceId:'',sets:3,repMin:8,repMax:12,restSeconds:90,effortType:'RIR',effortValue:3,notes:''},
    weeks:{number:1,title:'',message:'',progression:'',sessionIds:[]},
    days:{day:1,title:'',recipeIds:[]},steps:{timing:'',channel:'WhatsApp',messageId:'',reply:'',nextStep:''},
    replyPaths:{reply:'',response:'',nextStep:''},chapters:{title:'',body:''}
  };
  function referenceControl(key,value,set){
    const wrap=element('div'),list=document.createElement('datalist'),input=document.createElement('input');
    list.id='refs-'+crypto.randomUUID();input.setAttribute('list',list.id);input.value=value;
    const kind=key==='referenceId'?'exercise':key.includes('session')?'session':key.includes('recipe')?'recipe':key.includes('stage')?'stage':key.includes('rule')?'rule':key.includes('asset')?'asset':'';
    for(const r of refs.filter(r=>!kind||r.kind===kind||(key==='referenceId'&&r.kind==='activity'))){
      const option=element('option',r.title);option.value=r.id;list.append(option);
    }
    const selected=element('small',names.get(value)||names.get('training:'+value)||'Choose a library item.');
    input.addEventListener('input',()=>{set(input.value);selected.textContent=names.get(input.value)||names.get('training:'+input.value)||'Choose a matching library item.';});
    wrap.append(input,selected,list);return wrap;
  }
  function draw(key,value,set,depth=0){
    if(Array.isArray(value)){
      const box=element('fieldset',undefined,'field-array');box.append(element('legend',labelFor(key)));
      function redraw(){
        box.replaceChildren(element('legend',labelFor(key)));
        value.forEach((v,i)=>{
          const row=element('div',undefined,'array-row');
          row.append(draw(key.endsWith('Ids')?key.slice(0,-1):key,v,next=>value[i]=next,depth+1));
          const controls=element('div',undefined,'array-controls');
          for(const [name,delta] of [['Move earlier',-1],['Move later',1]]){
            const b=element('button',delta<0?'↑':'↓');b.type='button';b.title=name;b.setAttribute('aria-label',name+' '+labelFor(key)+' '+(i+1));
            b.disabled=i+delta<0||i+delta>=value.length;b.addEventListener('click',()=>{[value[i],value[i+delta]]=[value[i+delta],value[i]];redraw();});controls.append(b);
          }
          const remove=element('button','Remove');remove.type='button';remove.addEventListener('click',()=>{value.splice(i,1);redraw();});controls.append(remove);row.append(controls);box.append(row);
        });
        const add=element('button','Add '+labelFor(key).toLowerCase());add.type='button';
        add.addEventListener('click',()=>{
          const next=templates[key]?structuredClone(templates[key]):typeof value[0]==='number'?0:'';
          if(next&&typeof next==='object'&&'number' in next)next.number=value.length+1;
          value.push(next);redraw();
        });box.append(add);
      }
      redraw();return box;
    }
    if(value&&typeof value==='object'){
      const details=element('details',undefined,'field-object');details.open=depth<1;
      details.append(element('summary',labelFor(key)));
      const inner=element('div',undefined,'field-object-body');
      for(const [child,v] of Object.entries(value))inner.append(draw(child,v,next=>value[child]=next,depth+1));
      details.append(inner);return details;
    }
    const label=element('label',labelFor(key));
    if(/Id$/.test(key)&&!['programmeId','sourceRecordId'].includes(key)){label.append(referenceControl(key,value||'',set));return label;}
    const bool=typeof value==='boolean',number=typeof value==='number';
    const control=document.createElement(bool||number?'input':/Url$|^type$|^channel$|^movement$|^unit$|^effortType$|^subject$/.test(key)?'input':'textarea');
    if(bool){control.type='checkbox';control.checked=value;label.className='check';}
    else if(number){control.type='number';control.step='any';control.value=value;}
    else {control.value=value??'';if(control.tagName==='TEXTAREA')control.rows=value&&String(value).length>200?5:2;}
    control.addEventListener('input',()=>set(bool?control.checked:number?(control.value===''?0:Number(control.value)):control.value));
    label.append(control);return label;
  }
  for(const [key,value] of Object.entries(values))editor.append(draw(key,value,next=>values[key]=next));
  document.querySelector('#studio-editor-form').addEventListener('submit',()=>fieldsInput.value=JSON.stringify(values));
}

const fileInput=document.querySelector('#studio-file');
if(fileInput){
  const status=document.querySelector('#studio-file-status'),canvas=document.querySelector('#studio-pdf-canvas');
  let pdf,currentPage=1;
  async function renderPage(){
    const page=await pdf.getPage(currentPage),viewport=page.getViewport({scale:1.3});
    canvas.width=viewport.width;canvas.height=viewport.height;
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    document.querySelector('#studio-pdf-page').textContent='Page '+currentPage+' of '+pdf.numPages;
    document.querySelector('#studio-pdf-prev').disabled=currentPage===1;
    document.querySelector('#studio-pdf-next').disabled=currentPage===pdf.numPages;
  }
  document.querySelector('#studio-pdf-prev').addEventListener('click',async()=>{currentPage--;await renderPage();});
  document.querySelector('#studio-pdf-next').addEventListener('click',async()=>{currentPage++;await renderPage();});
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files[0];if(!file)return;
    status.textContent='Reading '+file.name+'…';
    try{
      if(file.size>30*1024*1024)throw Error('Choose a file smaller than 30 MB.');
      let text;
      if(file.name.toLowerCase().endsWith('.pdf')){
        const lib=await import('/studio-pdf/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/studio-pdf/pdf.worker.mjs';
        if(pdf)await pdf.destroy();
        pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,wasmUrl:'/studio-pdf/wasm/',standardFontDataUrl:'/studio-pdf/standard_fonts/',cMapUrl:'/studio-pdf/cmaps/',cMapPacked:true}).promise;
        if(pdf.numPages>200)throw Error('Select a PDF containing up to 200 pages.');
        const parts=[];
        for(let n=1;n<=pdf.numPages;n++){
          const page=await pdf.getPage(n),content=await page.getTextContent();
          parts.push(content.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join(''));
        }
        text=parts.map((part,i)=>(i?'\n--- PAGE '+(i+1)+' ---\n':'')+part).join('');
        currentPage=1;canvas.hidden=false;document.querySelector('#studio-pdf-controls').hidden=false;document.querySelector('#studio-pdf-help').hidden=true;
      }else text=await file.text();
      if(text.length>180000)throw Error('Select a smaller section of the document, up to 180,000 characters.');
      document.querySelector('[name=sourceText]').value=text;
      if(!document.querySelector('[name=sourceName]').value)document.querySelector('[name=sourceName]').value=file.name;
      status.textContent=text.trim()?'Text extracted. Compare it with the source before continuing.':'This PDF has no readable text. Paste a transcription or use a text-based export.';
      if(file.name.toLowerCase().endsWith('.pdf'))renderPage().catch(()=>{
        document.querySelector('#studio-pdf-help').hidden=false;
        document.querySelector('#studio-pdf-help').textContent='The page preview could not be displayed. Your extracted text is ready to check against the original PDF.';
      });
    }catch(error){status.textContent=error.message||'This file could not be read.';}
  });
}

document.querySelectorAll('form[method=post]').forEach(form=>{
  form.addEventListener('submit',()=>{
    const submit=form.querySelector('button.primary');
    if(submit){submit.disabled=true;submit.textContent='Working…';}
  });
});
