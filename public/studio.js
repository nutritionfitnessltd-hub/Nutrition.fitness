import {startWorkerUpdates} from './studio-worker-updates.mjs';
import './studio-review.js';
startWorkerUpdates();
import { primaryFields, fieldLabel } from './studio-fields.mjs';
const fieldsInput = document.querySelector('#studio-fields');
const editor = document.querySelector('#studio-editor');
const labelFor = key => editor?.dataset.kind==='communication' ? ({subject:'Subject (optional)',body:'Message',callToAction:'Link text',channel:'Channel',trigger:'Trigger',timing:'Timing'})[key]||fieldLabel(key) : fieldLabel(key);
const element = (tag, text, className) => {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(className)el.className=className;
  return el;
};
if(fieldsInput&&editor){
  let values=JSON.parse(fieldsInput.value),savedValues=structuredClone(values);
  const refs=JSON.parse(document.querySelector('#studio-reference-data')?.value||'[]');
  const form=document.querySelector('#studio-editor-form');
  let dirty=form.querySelector('[data-unsaved]')!==null,submitting=false;
  const markChanged=()=>{dirty=true;form.querySelector('[data-editor-status]').textContent='Unsaved changes';};
  form.addEventListener('input',markChanged);form.addEventListener('change',markChanged);
  window.addEventListener('beforeunload',event=>{if(dirty&&!submitting){event.preventDefault();event.returnValue='';}});
  document.addEventListener('submit',event=>{if(event.target!==form&&dirty&&!confirm('You have unsaved edits. Leave this draft without saving?')){event.preventDefault();event.stopImmediatePropagation();}},true);
  const templates={
    blocks:{type:'exercise',referenceId:'',sets:3,repMin:8,repMax:12,restSeconds:90,effortType:'RIR',effortValue:3,notes:''},
    weeks:{number:1,title:'',message:'',progression:'',sessionIds:[]},
    days:{day:1,title:'',recipeIds:[]},steps:{timing:'',channel:'WhatsApp',messageId:'',reply:'',nextStep:''},
    replyPaths:{reply:'',response:'',nextStep:''},chapters:{title:'',body:''}
  };
  function referenceControl(key,value,set){
    const wrap=element('div',undefined,'reference-picker'),choose=element('button'),clear=element('button','Clear');
    choose.type=clear.type='button';
    const kind=key==='referenceId'?'exercise':({sessionId:'session',recipeId:'recipe',stageId:'stage',ruleId:'rule',assetId:'asset',lessonId:'lesson',scheduleId:'structure',programmeId:'programme',messageId:'communication',easierId:'exercise',harderId:'exercise'})[key]||'';
    const selected=()=>refs.find(r=>r.id===value||r.id==='training:'+value);
    const update=()=>{choose.textContent=selected()?.title||(value?'Linked item unavailable':'Choose '+labelFor(key).toLowerCase());clear.hidden=!value;};
    const pick=id=>{value=id;set(id);markChanged();update();};
    clear.addEventListener('click',()=>pick(''));
    choose.addEventListener('click',()=>{
      const dialog=element('dialog',undefined,'studio-picker'),head=element('div',undefined,'studio-heading'),title=element('h2','Choose '+labelFor(key).toLowerCase()),close=element('button','Close');
      close.type='button';title.id='picker-title';dialog.setAttribute('aria-labelledby',title.id);head.append(title,close);
      const searchLabel=element('label','Search by name'),search=element('input'),results=element('div',undefined,'studio-picker-results'),count=element('p',undefined,'meta');
      search.type='search';searchLabel.append(search);count.setAttribute('role','status');dialog.append(head,searchLabel,count,results);document.body.append(dialog);
      const available=refs.filter(r=>!kind||r.kind===kind||(key==='referenceId'&&r.kind==='activity'));
      function render(){
        results.replaceChildren();const matches=available.filter(r=>r.title.toLowerCase().includes(search.value.toLowerCase()));
        count.textContent=matches.length?matches.length+' items'+(matches.length>60?' · Type a name to narrow the list':''):'No matching items.';
        for(const r of matches.slice(0,60)){
          const b=element('button',undefined,'studio-picker-card');b.type='button';
          if(r.image&&/^(https?:\/\/|\/(?!\/))/.test(r.image)){const img=element('img');img.src=r.image;img.alt='';img.loading='lazy';b.append(img);}
          b.append(element('strong',r.title));b.addEventListener('click',()=>{pick(r.id);dialog.close();});results.append(b);
        }
      }
      search.addEventListener('input',render);close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{dialog.remove();choose.focus();});
      dialog.showModal();render();search.focus();
    });
    update();wrap.append(choose,clear);return wrap;
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
            b.disabled=i+delta<0||i+delta>=value.length;b.addEventListener('click',()=>{[value[i],value[i+delta]]=[value[i+delta],value[i]];markChanged();redraw();});controls.append(b);
          }
          const remove=element('button','Remove');remove.type='button';remove.addEventListener('click',()=>{value.splice(i,1);markChanged();redraw();});controls.append(remove);row.append(controls);box.append(row);
        });
        const add=element('button','Add '+labelFor(key).toLowerCase());add.type='button';
        add.addEventListener('click',()=>{
          const next=templates[key]?structuredClone(templates[key]):typeof value[0]==='number'?0:'';
          if(next&&typeof next==='object'&&'number' in next)next.number=value.length+1;
          value.push(next);markChanged();redraw();
        });box.append(add);
      }
      redraw();return box;
    }
    if(value&&typeof value==='object'){
      const details=element('details',undefined,'field-object');details.open=depth<1;
      const workoutTitle=form.hasAttribute('data-workout-inline')&&key==='blocks'?(refs.find(r=>r.id===value.referenceId||r.id==='training:'+value.referenceId)?.title||'Exercise or activity'):labelFor(key);
      details.append(element('summary',workoutTitle));
      const inner=element('div',undefined,'field-object-body');
      for(const [child,v] of Object.entries(value))inner.append(draw(child,v,next=>value[child]=next,depth+1));
      details.append(inner);return details;
    }
    if(/Id$/.test(key)&&key!=='sourceRecordId'){
      const group=element('div',undefined,'reference-field');group.setAttribute('role','group');group.setAttribute('aria-label',labelFor(key));
      group.append(element('span',labelFor(key)),referenceControl(key,value||'',set));return group;
    }
    const label=element('label',labelFor(key));
    const bool=typeof value==='boolean',number=typeof value==='number';
    const control=document.createElement(bool||number?'input':/Url$|^url$|^type$|^channel$|^audience$|^headline$|^callToAction$|^movement$|^unit$|^effortType$|^subject$/.test(key)?'input':'textarea');
    if(bool){control.type='checkbox';control.checked=value;label.className='check';}
    else if(number){control.type='number';control.step='any';control.value=value;}
    else {control.value=value??'';if(control.tagName==='TEXTAREA')control.rows=['body','script','voiceoverScript'].includes(key)?12:value&&String(value).length>200?5:3;}
    control.addEventListener('input',()=>set(bool?control.checked:number?(control.value===''?0:Number(control.value)):control.value));
    label.append(control);return label;
  }
  const upload=document.querySelector('[data-article-upload]');
  function renderFields(){
    editor.replaceChildren();
    const messageOptions=document.querySelector('#studio-message-options');
    const main=primaryFields[editor.dataset.kind]||Object.keys(values),details=messageOptions||element('details',undefined,'editor-details');
    if(!messageOptions)details.append(element('summary','More details'));
    const imageFields=upload?['imageUrl','imageAlt','imageCredit','imageCreditUrl']:[];
    for(const key of main)if(Object.hasOwn(values,key)&&!imageFields.includes(key))editor.append(draw(key,values[key],next=>values[key]=next));
    for(const [key,value] of Object.entries(values))if(!main.includes(key)&&!imageFields.includes(key))details.append(draw(key,value,next=>values[key]=next));
    if(!messageOptions&&details.children.length>1)editor.append(details);
  }
  renderFields();
  if(form.hasAttribute('data-workout-inline')){
    const status=form.querySelector('[data-editor-status]');
    form.addEventListener('studio-editor-serialize',()=>{fieldsInput.value=JSON.stringify(values);submitting=false;});
    form.addEventListener('studio-editor-reset',()=>{
      form.reset();values=structuredClone(savedValues);fieldsInput.value=JSON.stringify(values);dirty=false;submitting=false;renderFields();status.textContent='All changes saved';
    });
    form.addEventListener('studio-editor-error',()=>{submitting=false;});
    form.addEventListener('studio-editor-saved',event=>{
      savedValues=structuredClone(event.detail.fields);values=structuredClone(savedValues);
      form.querySelector('[name=title]').value=form.querySelector('[name=title]').defaultValue=event.detail.title;
      form.querySelector('[name=revision]').value=form.querySelector('[name=revision]').defaultValue=event.detail.revision;
      fieldsInput.value=fieldsInput.defaultValue=JSON.stringify(values);dirty=false;submitting=false;renderFields();status.textContent='All changes saved';
    });
  }
  form.addEventListener('submit',event=>{
    if(event.defaultPrevented)return;
    if(upload){
      values.imageAlt=upload.querySelector('[name=uploadAlt]').value;values.imageCredit=upload.querySelector('[name=uploadCredit]').value;
      if(values.imageCredit!==JSON.parse(fieldsInput.value).imageCredit)values.imageCreditUrl='';
    }
    fieldsInput.value=JSON.stringify(values);submitting=true;
  });
  form.addEventListener('submit',async event=>{
    if(event.defaultPrevented||editor.dataset.kind!=='article'||!form.querySelector('[name=revision]')||event.submitter?.value!=='preview')return;
    event.preventDefault();
    const popup=window.open('about:blank','_blank','popup,width=1200,height=900,scrollbars=yes,resizable=yes');
    if(popup)popup.opener=null;
    const status=form.querySelector('[data-editor-status]'),submit=event.submitter,label=submit.textContent;
    submit.disabled=true;submit.textContent='Saving…';status.textContent='Saving article for preview…';
    try{
      const body=new URLSearchParams(new FormData(form));body.set('intent','preview');body.set('previewWindow','yes');
      const response=await fetch(form.getAttribute('action'),{method:'POST',body,credentials:'same-origin',headers:{Accept:'application/json'}});
      const result=await response.json();if(!response.ok||!result.record||!result.previewUrl)throw new Error(result.error||'The save was not confirmed.');
      const target=new URL(result.previewUrl,location.origin);if(target.origin!==location.origin)throw new Error('The preview destination could not be verified.');
      savedValues=structuredClone(result.record.fields);values=structuredClone(savedValues);fieldsInput.value=fieldsInput.defaultValue=JSON.stringify(values);
      form.querySelector('[name=revision]').value=result.record.revision;form.querySelector('[name=title]').defaultValue=result.record.title;
      if(upload)upload.querySelector('[name=imageUpload]').value='';
      dirty=false;submitting=false;status.textContent='All changes saved';
      if(popup&&!popup.closed)popup.location.replace(target.href);
      else{const link=document.createElement('a');link.href=target.href;link.target='_blank';link.rel='noopener';link.dataset.reviewPreview='';link.textContent='Open article preview';status.append(' · ',link);}
    }catch(error){popup?.close();submitting=false;status.textContent=error.message||'Could not save. Your edits are still here.';}
    finally{submit.disabled=false;submit.textContent=label;}
  });
}

document.querySelectorAll('[data-copy-script]').forEach(button=>button.addEventListener('click',async()=>{
  const area=button.closest('.studio-video-tools'),status=area.querySelector('[data-copy-status]');
  try{await navigator.clipboard.writeText(area.querySelector('[data-script-text]').value);status.textContent='Script copied';}
  catch{status.textContent='Copy is unavailable in this browser. Open Edit content to select the script.';}
}));

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
  form.addEventListener('submit',event=>{
    if(event.defaultPrevented||form.hasAttribute('data-team-welcome'))return;
    // Keep the clicked button's name/value in the request (disabled buttons are omitted).
    const submit=event.submitter;
    if(submit){submit.setAttribute('aria-disabled','true');submit.textContent='Saving…';}
  });
});
