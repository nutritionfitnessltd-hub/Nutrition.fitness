import { authorizeStudioRequest, canAccess } from './library-permissions.mjs';
import { saveInlineWorkout } from './studio-workout-inline.mjs';
import { workoutSession } from './studio-workouts.mjs';
import { workoutDaysEditor } from './studio-workout-days.mjs';
import { builderPage, workerPreview, saveWorkerRequest, workerRequestsPage } from './studio-workers.mjs';
import { randomUUID } from 'node:crypto';
import { sendBookFile } from './studio-books.mjs';
import { saveArticleImage, sendArticleImage } from './studio-article-images.mjs';
import { HttpError } from './platform.mjs';
import { displayEntry } from './library-display.mjs';
import { studioData, editable, projectFor, saveRecord, mergeStudioRecord } from './studio-store.mjs';
import { templates, blankFields, issues, descendants, cleanText } from './studio-model.mjs';
import { home, library, createPage, projectList, projectPage, itemPage, newItem, reviewPage, calendar, journey, releasePage } from './studio-pages.mjs';
import { archivePage, importPage, extractDrafts, importPreview } from './studio-import.mjs';
import { changeStudio, projectDraft, createItem } from './studio-actions.mjs';
import { mealPlanOptions, generateMealPlan } from './studio-mealplans.mjs';
import { mealPlanForm } from './studio-mealplan-ui.mjs';
import { generateMealPhoto, sendMealPhoto } from './studio-mealplan-images.mjs';
import { generateDraft, generateProjectOutline } from './studio-ai.mjs';
import { esc, url, heading, button, hidden, input, textarea, select, form, list, studioFrame } from './studio-ui.mjs';

function write(res,status,body,section,actor,meta){
  res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(studioFrame(body,section,actor,meta||{}));
}
function planPreview(f,data){
  const {project}=projectDraft(f,data);
  return heading('Your plan',project.name+' · '+project.weeks+' weeks')+
    '<p>'+esc(project.brief)+'</p>'+form('project-create',Object.entries(f).filter(([k])=>k!=='action').map(([k,v])=>hidden(k,v)).join('')+
      '<div class="panel"><p>Creator: '+esc(data.people.find(p=>p.id===project.creator_id)?.name||'Assigned creator')+' · '+project.entries.length+' tasks</p><details><summary>See the steps</summary>'+list(project.entries,e=>'<div><strong>'+esc(e.title)+'</strong><small>'+(e.week?'Week '+e.week:'Preparation')+' · '+esc(e.notes)+'</small></div>')+'</details></div>',
      {section:'create'},'Start this work');
}
function standardsPage(data,env){
  const r=data.byId.get('studio:standards');
  return heading('Brand & standards','Save guidance that will accompany future AI drafts.')+
    form('standards-save',hidden('revision',r?.revision||0)+textarea('guidance','Nutrition.fitness writing and content guidance',r?.fields.guidance||'Use clear, friendly British English. Explain the next useful action. Use our approved programmes as references. Keep coaching notes varied and specific to the week.',12),{section:'standards'},'Save guidance')+
    '<section class="panel"><h2>Connections</h2><p>OpenAI drafting · '+(env.OPENAI_API_KEY?'Connected':'Awaiting API-key setup')+'</p><p>App publishing · Import format awaiting confirmation</p><p>Canva · Open the original design and import its PDF export</p></section>';
}
async function history(params,data,api){
  const r=editable(data,params.get('id'));
  const versions=await api('/rest/v1/nufi_studio_versions?item_id=eq.'+encodeURIComponent(r.id)+'&select=revision,payload,created_at&order=revision.desc&limit=50',{service:true});
  for(const version of versions)version.payload=mergeStudioRecord(data.index.records.find(x=>x.id===r.id),version.payload);
  return heading('Version history',r.title,button('Back to content',url('item',{id:r.id})))+
    list(versions,v=>'<div><strong>Version '+v.revision+'</strong><small>'+esc(v.created_at.slice(0,16).replace('T',' '))+' · '+esc(v.payload.status)+'</small><details><summary>Read this version</summary><pre class="source-text">'+esc(JSON.stringify(v.payload.fields,null,2))+'</pre></details></div>','The original imported version is available. Saving changes will begin the version history.');
}
function exportPackage(params,data,res){
  const p=projectFor(data,params.get('project')),approved=params.get('mode')==='approved';
  if(approved&&data.actor.role!=='admin')throw new HttpError(403,'Administrator access is required to release content.');
  const ids=descendants([p.studio.rootId,...p.entries.map(e=>e.record)].filter(Boolean),data.items);
  const records=data.items.filter(r=>ids.has(r.id));
  if(!records.length)throw new HttpError(400,'Attach content before exporting this project.');
  if(approved&&(p.entries.some(e=>e.status!=='Done')||records.some(r=>r.status!=='Approved'||issues(r,data.items).length)))throw new HttpError(400,'Finish the production tasks and approve the linked content before exporting a release.');
  const payload={format:'nutrition.fitness.content-package',version:1,mode:approved?'approved':'review',createdAt:new Date().toISOString(),
    project:{id:p.id,name:p.name,weeks:p.weeks,journey:p.entries.map(e=>({week:e.week,title:e.title,contentId:e.record,status:e.status}))},
    content:records.map(r=>({id:r.id,kind:r.kind,title:r.title,version:r.revision||1,status:r.status,parent:r.parent,fields:Object.fromEntries(Object.entries(r.fields).filter(([key])=>key!=='sourceText'))}))};
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="nutrition-fitness-'+(approved?'release':'review')+'.json"');
  res.statusCode=200;res.end(JSON.stringify(payload,null,2));
}
export async function handleStudio(req,res,{params,actor,api,load,env,fetcher=fetch,imageStore}){
  const section=params.get('studio')||'home';
  let data,meta;
  const f=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
  try{
    authorizeStudioRequest(actor,section,req.method,f,params);
    if(Buffer.byteLength(JSON.stringify(f))>1200000)throw new HttpError(413,'Import a smaller section of this document.');
    if(section==='media'){
      if(req.method!=='GET')throw new HttpError(405,'Use GET to open a preview.');
      const id=params.get('preview')||'';
      const file=/^(?:[a-f0-9]{32}|brand-font)$/.test(id)&&await displayEntry(env,id);
      if(!file?.data||!['image/webp','image/png','image/jpeg','font/woff2'].includes(file.type))throw new HttpError(404,'Preview unavailable.');
      res.setHeader('Content-Type',file.type);res.statusCode=200;return res.end(Buffer.from(file.data,'base64'));
    }
    [data,meta]=await Promise.all([studioData(api,actor,load),displayEntry(env,'shelves').catch(()=>({}))]);
    meta=meta||{};
    data.aiReady=Boolean(env.OPENAI_API_KEY)&&canAccess(actor,'ai');
    if(section==='book-file')return await sendBookFile(req,res,params,data);
    if(section==='article-image')return await sendArticleImage(req,res,params,data);
    if(section==='mealplan-image')return await sendMealPhoto(req,res,params,data);
    if(req.method==='POST'){
      if(f.action==='workout-inline-save'){
        const dayName=cleanText(f.dayName||'Workout',40);
        const record=await saveInlineWorkout(params,f,data,api);
        res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');
        return res.end(JSON.stringify({record,preview:workoutSession(record,data,{dayName,inline:true})}));
      }
      if(f.action==='worker-step'||params.get('flowBack')==='1'&&['worker-preview','worker-save'].includes(f.action))return write(res,200,builderPage(params,data,meta,f),'builder',actor,meta);
      if(f.action==='worker-preview')return write(res,200,workerPreview(f,data,meta),'builder',actor,meta);
      if(f.action==='worker-save'){
        const id=await saveWorkerRequest(f,data,meta,api);
        res.statusCode=303;res.setHeader('Location',url('worker-requests',{id}).replaceAll('&amp;','&'));return res.end();
      }
      if(f.action==='mealplan-generate'){
        const current=params.get('id')?editable(data,params.get('id')):null;
        if(current&&(current.kind!=='mealplan'||current.revision!==Number(f.revision)))throw new HttpError(409,'Reopen the latest meal plan before generating it again.');
        if(!current&&actor.role!=='admin'){
          if(!f.project)throw new HttpError(403,'Choose an assigned project for this meal plan.');
          projectFor(data,f.project);
        }
        const id=current?.id||'studio:'+String(f.id||'').replace(/^studio:/,'');
        if(!current&&!/^studio:[0-9a-f-]{36}$/i.test(id))throw new HttpError(400,'Reopen the meal planner and try again.');
        if(!current&&data.byId.has(id)){
          res.statusCode=303;res.setHeader('Location',url('item',{id}).replaceAll('&amp;','&'));return res.end();
        }
        const result=await generateMealPlan({env,data,options:mealPlanOptions(f),fetcher});
        const draft={...current,id,kind:'mealplan',title:result.title,fields:result.fields,status:'Draft',parent:current?.parent||null,comments:[...(current?.comments||[]),{id:randomUUID(),body:result.notes||'Meal plan drafted from the recipe library for review.',author:'Drafting assistant',at:new Date().toISOString()}]};
        delete draft.approval;delete draft.revision;delete draft.updatedAt;
        if(current)await saveRecord(api,actor,draft,current.revision);
        else await createItem(draft,f.project,f.entry,data,api);
        res.statusCode=303;res.setHeader('Location',url('item',{id}).replaceAll('&amp;','&'));return res.end();
      }
      if(f.action==='mealplan-image-generate'){
        const r=editable(data,params.get('id'));
        if(r.kind!=='mealplan'||r.revision!==Number(f.revision))throw new HttpError(409,'Reopen the latest meal plan before generating an image.');
        const draft=structuredClone(r),recipe=draft.fields.generatedRecipes?.find(x=>x.id===f.recipe);
        if(!recipe||draft.fields.imagePreference!=='generated')throw new HttpError(400,'Enable generated images and choose a new recipe draft.');
        if(!recipe.fields.imageAsset){
          recipe.fields.imageAsset=await generateMealPhoto({env,recipe,fetcher,store:imageStore});
          recipe.fields.imageNote='AI-generated serving suggestion. Review against the recipe before publishing.';
          draft.status='Draft';delete draft.approval;delete draft.revision;delete draft.updatedAt;
          await saveRecord(api,actor,draft,r.revision);
        }
        res.statusCode=303;res.setHeader('Location',(url('item',{id:r.id})+'#'+recipe.id).replaceAll('&amp;','&'));return res.end();
      }
      if(f.action==='plan-preview'){
        projectDraft(f,data);
        if(f.assist==='yes'){
          const generated=await generateProjectOutline({env,brief:{name:f.name,template:f.template,weeks:Number(f.weeks),audience:f.audience,outcome:f.outcome,brief:f.brief},standards:data.byId.get('studio:standards')?.fields.guidance});
          f.outline=JSON.stringify(generated.fields.entries);
        }
        return write(res,200,planPreview(f,data),'create',actor,meta);
      }
      if(f.action==='import-preview'){
        const drafts=extractDrafts(f.sourceText,f.kind,f.sourceName,f.source);
        return write(res,200,importPreview(drafts,f,data),'import',actor,meta);
      }
      if(f.action==='standards-save'){
        if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
        await saveRecord(api,actor,{id:'studio:standards',kind:'settings',title:'Brand & standards',status:'Draft',fields:{guidance:cleanText(f.guidance,12000)}},Number(f.revision));
        res.statusCode=303;res.setHeader('Location',url('standards').replaceAll('&amp;','&'));return res.end();
      }
      if(f.action==='ai-draft'){
        const r=editable(data,params.get('id'));
        if(r.kind==='mealplan')throw new HttpError(400,'Use the meal plan settings to generate a complete menu with library recipes.');
        if(r.revision!==Number(f.revision))throw new HttpError(409,'Reopen the latest version before drafting.');
        const result=await generateDraft({env,record:r,prompt:cleanText(f.prompt,8000),standards:data.byId.get('studio:standards')?.fields.guidance,
          exercises:data.items.filter(x=>x.kind==='exercise'&&x.status==='Approved').map(x=>({id:x.id,title:x.title,equipment:x.fields.equipment}))});
        const draft={...r,...result,status:'Draft',comments:[...(r.comments||[]),{id:randomUUID(),body:result.notes||'AI draft created for review.',author:'Drafting assistant',at:new Date().toISOString()}]};
        delete draft.notes;delete draft.approval;
        await saveRecord(api,actor,draft,r.revision);
        res.statusCode=303;res.setHeader('Location',url('item',{id:r.id}).replaceAll('&amp;','&'));return res.end();
      }
      const next=await (f.action==='content-save'&&f.imageUpload?saveArticleImage(params,f,data,api,env):changeStudio(params,f,data,api));
      res.statusCode=303;res.setHeader('Location',url(next.section,next).replaceAll('&amp;','&'));return res.end();
    }
    let body;
    switch(section){
      case 'home':body=home(data,meta);break;
      case 'library':case 'exercises':body=library(params,data,meta||{});break;
      case 'create':body=createPage(params,data);break;
      case 'builder':body=builderPage(params,data,meta);break;
      case 'worker-requests':body=workerRequestsPage(params,data);break;
      case 'projects':body=projectList(params,data);break;
      case 'project':body=projectPage(params,data);break;
      case 'item':body=itemPage(params,data);break;
      case 'new':body=newItem(params,data);break;
      case 'review':body=reviewPage(params,data);break;
      case 'calendar':body=calendar(data);break;
      case 'journey':body=journey(params,data);break;
      case 'release':body=releasePage(params,data);break;
      case 'export':return exportPackage(params,data,res);
      case 'history':body=await history(params,data,api);break;
      case 'archive':body=archivePage(params,data,meta||{});break;
      case 'import':body=importPage(params,data);break;
      case 'settings':
        if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
        body=heading('Settings','Manage your team, brand guidance and connections.')+'<div class="studio-cards">'+
          button('Team & permissions',url('team'))+button('Brand & connections',url('standards'))+'</div>';break;
      case 'standards':
        if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
        body=standardsPage(data,env);break;
      case 'project-from':{
        if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
        const r=data.byId.get(params.get('id'));if(!r)throw new HttpError(404,'Content unavailable.');
        body=heading('Assign work: '+r.title,'Choose a creator and tell them what needs doing.')+
          form('plan-preview',hidden('id',randomUUID())+hidden('rootId',r.id)+hidden('template',Object.hasOwn(templates,r.kind)?r.kind:'custom')+
            hidden('name','Finish '+r.title)+textarea('brief','What needs doing?')+hidden('audience',r.fields.audience||'')+
            hidden('outcome',r.fields.outcome||'')+(r.kind==='programme'?hidden('weeks',r.fields.weeks)+'<p>Programme length: '+esc(r.fields.weeks)+' weeks</p>':input('weeks','Number of weeks',Math.min(52,Number(r.fields.weeks)||6),'number','min="1" max="52" required'))+
            select('creator','Creator',Object.fromEntries(data.people.map(p=>[p.id,p.name])))+input('launch','Target launch date','','date'),
            {section:'create'},'Show the plan');break;
      }
      default:throw new HttpError(404,'This studio page is unavailable.');
    }
    return write(res,200,body,section,actor,meta);
  }catch(error){
    if(req.method==='POST'&&f.action==='workout-inline-save'){
      res.statusCode=error instanceof HttpError?error.status:503;res.setHeader('Content-Type','application/json; charset=utf-8');
      return res.end(JSON.stringify({error:error instanceof HttpError?error.message:'Could not save the workout. Your edits are still here.'}));
    }
    let body='<p role="alert">'+esc(error instanceof HttpError?error.message:'The studio could not complete this request. Please try again.')+'</p>';
    if(req.method==='POST'&&f.action==='content-save'&&data?.byId.has(params.get('id'))){
      try{
        const original=data.byId.get(params.get('id'));
        data.byId.set(original.id,{...original,title:f.title,fields:JSON.parse(f.fields),revision:Number(f.revision),...(original.source&&f.sourceChecked==='yes'?{source:{...original.source,needsChecking:false}}:{})});
        data.unsaved=true;data.unsavedFeedback=f.feedback||'';
        const editParams=new URLSearchParams(params);editParams.set('tab','edit');
        body+='<p>Your unsaved edits are shown below. For a version conflict, open the latest saved copy in another tab before combining changes.</p>'+itemPage(editParams,data);
      }catch{body+='<details><summary>Unsaved content</summary><pre class="source-text">'+esc(f.fields||'')+'</pre></details>';}
    }else if(req.method==='POST'&&f.action==='workout-days-save'&&data){
      const schedule=data.byId.get(f.schedule),week=schedule?.fields.weeks?.find(w=>String(w.number)===String(f.week));
      if(schedule?.kind==='structure'&&week&&(data.actor.role==='admin'||data.assigned.has(schedule.id))){
        body+='<p>Your unsaved day changes are shown below. If the schedule changed, open the latest weekly plan before combining your changes.</p>'+button('Open latest weekly plan',url('item',{id:params.get('id'),tab:'plan',schedule:schedule.id,week:week.number}))+workoutDaysEditor(params,data,schedule,week,f);
      }
    }else if(req.method==='POST'&&['worker-step','worker-preview','worker-save'].includes(f.action)&&data?.actor.role==='admin'){
      try{body+=f.action==='worker-save'?workerPreview(f,data,meta):builderPage(params,data,meta,f);}catch{body+=button('Choose original material',url('builder'));}
    }else if(req.method==='POST'&&f.action==='content-create'&&data){
      data.unsaved=true;body+=newItem(params,data,f);
    }else if(req.method==='POST'&&f.action==='mealplan-generate'&&data){
      body+=mealPlanForm(data,f,params.get('id')?data.byId.get(params.get('id')):null);
    }else if(req.method==='POST'&&f.action==='mealplan-image-generate'&&data){
      body+=button('Back to the saved meal plan',url('item',{id:params.get('id')}));
    }else if(req.method==='POST'&&f.action==='plan-preview'&&data){
      body+=createPage(new URLSearchParams({template:f.template}),data,f);
    }else if(req.method==='POST'&&['import-preview','import-save'].includes(f.action)&&data){
      body+=importPage(params,data,'',f);
    }else body+=button('Return to the studio',url());
    return write(res,error instanceof HttpError?error.status:503,body,section,actor,meta);
  }
}
