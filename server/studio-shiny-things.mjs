import {randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {cleanText} from './studio-model.mjs';
import {canAccess} from './library-permissions.mjs';
import {saveRecord} from './studio-store.mjs';
import {hqRequest} from './studio-hq.mjs';
import {projectProductionPanel} from './studio-project-progress.mjs';
import {esc,url,heading,button,form,hidden,input,textarea,select,list,badge} from './studio-ui.mjs';

const prefix='studio:idea:';
export const ideaUrgencies={urgent:'Urgent',soon:'Soon',normal:'Normal',someday:'Someday'};
const urgencyOf=r=>Object.hasOwn(ideaUrgencies,r.fields.urgency)?r.fields.urgency:'normal';
const admin=data=>{if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can manage Shiny Things.');};
const ideas=data=>data.items.filter(r=>r.kind==='settings'&&r.id.startsWith(prefix));
const projectFor=(data,id)=>data.projects.find(p=>p.studio?.ideaId===id);
const projectId=id=>uuid(id.slice(prefix.length));
const planText=plan=>(plan?.tasks||[]).map(t=>[t.title,t.notes||'',t.week||0,t.due||'',t.worker||'',t.milestone?'yes':''].map(v=>String(v).replace(/[|\r\n]/g,' ')).join(' | ')).join('\n');
const validDate=value=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function validateIdeaPlan(value,weeks){
  if(!value||!Array.isArray(value.tasks)||!value.tasks.length||value.tasks.length>40)throw new HttpError(400,'Add between 1 and 40 project tasks.');
  const tasks=value.tasks.map(t=>{
    const title=cleanText(t.title||'',160),week=Number(t.week||0),due=t.due||'';
    if(!title||!Number.isInteger(week)||week<0||week>weeks||!validDate(due))throw new HttpError(400,'Check task titles, weeks and dates.');
    return {title,notes:cleanText(t.notes||'',2400),week,due,worker:cleanText(t.worker||'',80),milestone:t.milestone===true};
  });
  const title=cleanText(value.title||'',160),objective=cleanText(value.objective||'',4000);
  if(!title||!objective)throw new HttpError(400,'Add a project name and intended outcome.');
  return {title,objective,overlap:cleanText(value.overlap||'',4000),questions:cleanText(Array.isArray(value.questions)?value.questions.join('\n'):value.questions||'',4000),tasks};
}
export function parseMorganPlan(messages,idea){
  for(const message of [...messages].reverse()){
    if(message.role!=='assistant')continue;
    for(const match of String(message.body||'').matchAll(/```(?:json)?\s*([\s\S]*?)```/g)){
      let value;try{value=JSON.parse(match[1]);}catch{continue;}
      if(value.ideaId!==idea.id||value.ideaRevision!==idea.fields.requestRevision)continue;
      return validateIdeaPlan(value,idea.fields.weeks);
    }
  }
  throw new HttpError(409,'Morgan has not returned a matching plan yet. Check the HQ conversation, then try again.');
}
export function shinyThingsPage(params,data,retained={},env={}){
  admin(data);
  const id=params.get('id')||retained.id;
  const idea=id?ideas(data).find(r=>r.id===id):null;
  if(id&&!idea&&params.get('new')!=='1')throw new HttpError(404,'This idea is unavailable.');
  if(!idea&&params.get('new')!=='1'){
    const parked=params.get('view')==='parked';
    const ranks={urgent:0,soon:1,normal:2,someday:3};
    const rows=ideas(data).filter(r=>parked?r.fields.state==='Parked':r.fields.state!=='Parked').sort((a,b)=>ranks[urgencyOf(a)]-ranks[urgencyOf(b)]||(b.updatedAt||'').localeCompare(a.updatedAt||''));
    return '<div class="shiny-notice-workspace">'+heading('Shiny Things','Catch the spark. Give it a little room to grow.',button('Pin a new idea',url('shiny-things',{new:'1'}),true))+
      '<div class="shiny-board-tools"><nav class="shiny-board-tabs" aria-label="Ideas"><a href="'+url('shiny-things')+'"'+(!parked?' aria-current="page"':'')+'>On the board <span>'+ideas(data).filter(r=>r.fields.state!=='Parked').length+'</span></a><a href="'+url('shiny-things',{view:'parked'})+'"'+(parked?' aria-current="page"':'')+'>Parked for later <span>'+ideas(data).filter(r=>r.fields.state==='Parked').length+'</span></a></nav><div class="shiny-legend" aria-label="Note colours by urgency">'+Object.entries(ideaUrgencies).map(([key,label])=>'<span><i class="shiny-swatch shiny-'+key+'" aria-hidden="true"></i>'+label+'</span>').join('')+'</div></div>'+
      '<section class="shiny-board" aria-label="'+(parked?'Parked ideas':'Idea notice board')+'"><div class="shiny-board-caption"><span>'+(parked?'A little later, not forgotten.':'Big plans start as little notes.')+'</span><span>'+rows.length+' '+(rows.length===1?'idea':'ideas')+'</span></div><div class="shiny-note-grid">'+
      rows.map(r=>{const urgency=urgencyOf(r),state=projectFor(data,r.id)?'Project created':r.fields.state||'Saved';return '<a class="shiny-note shiny-'+urgency+'" href="'+url('shiny-things',{id:r.id})+'"><span class="shiny-note-tape" aria-hidden="true"></span><span class="shiny-note-urgency">'+ideaUrgencies[urgency]+'</span><h2>'+esc(r.title)+'</h2><p>'+esc(r.fields.summary||'A spark worth coming back to.')+'</p><span class="shiny-note-footer"><span>'+esc(state)+'</span><span>Open note</span></span></a>';}).join('')+
      '<a class="shiny-add-note" href="'+url('shiny-things',{new:'1'})+'"><span aria-hidden="true">+</span><h2>'+(rows.length?'Another bright idea?':'Your first bright idea…')+'</h2><p>'+(rows.length?'There’s always room for one more.':'A thought, a what-if, a thing to try. Pin it here before it disappears.')+'</p><strong>Pin an idea</strong></a></div></section>'+
      '<aside class="shiny-morgan"><div><strong>Morgan can help it grow.</strong><p>Ask your project manager in James HQ to turn a note into a plan. You decide when it becomes a project.</p></div>'+button('Chat with Morgan',url('worker-chat',{worker:'morgan'}))+'</aside></div>';

  }
  const f={...(idea?.fields||{}),...retained},p=idea&&projectFor(data,idea.id),locked=Boolean(p||idea?.fields.state==='Converting');
  const base=hidden('id',idea?.id||retained.id||prefix+randomUUID())+hidden('revision',idea?.revision||0),state={section:'shiny-things',...(idea?{id:idea.id}:{new:'1'})};
  let body=heading(idea?.title||'New shiny thing','Keep the idea here until it is worth an active project.',button('All ideas',url('shiny-things')));
  if(p)return body+'<section class="panel"><h2>Project created</h2><p>The original idea remains here for reference.</p>'+button('Open project',url('project',{project:p.id}),true)+'</section><p class="prose">'+esc(idea.fields.summary)+'</p>';
  if(!locked)body+=form('idea-save',base+input('title','Idea',retained.title??idea?.title??'','text','required maxlength="160"')+textarea('summary','What is the idea, and why might it matter?',f.summary||'',5)+
    '<div class="studio-actions"><button type="button" data-idea-ai'+(!env.OPENAI_API_KEY?' disabled':'')+'>Generate with AI</button><span role="status" aria-live="polite" data-idea-ai-status>'+(env.OPENAI_API_KEY?'Draft an explanation from your title and any notes.':'AI generation is not connected.')+'</span></div><section data-idea-ai-suggestion hidden><h3>Suggested explanation</h3><p class="prose" data-idea-ai-text></p><div class="studio-actions"><button type="button" data-idea-ai-use>Use this text</button><button type="button" data-idea-ai-dismiss>Keep my text</button></div></section>'+
    select('urgency','How soon does this need attention?',ideaUrgencies,Object.hasOwn(ideaUrgencies,f.urgency)?f.urgency:'normal')+'<div class="studio-columns">'+input('weeks','Indicative duration in weeks',f.weeks||4,'number','min="1" max="52" required')+select('state','Keep it as',{Saved:'An idea',Parked:'Parked for later'},f.state==='Parked'?'Parked':'Saved')+'</div>',state,'Save idea');
  if(!idea)return body;
  if(!locked)body+='<section class="panel"><h2>Ask Morgan to scope it</h2><p>Morgan checks overlap with existing projects and proposes an outcome, tasks, milestones, workers and open questions. The request runs in James HQ.</p>'+
    form('idea-scope',base,state,'Ask Morgan for a plan')+button('Open Morgan’s HQ conversation',url('worker-chat',{worker:'morgan'}))+
    (idea.fields.requestRevision?'<p>Plan requested for saved idea version '+idea.fields.requestRevision+'. HQ replies when its worker processes the queue.</p>'+form('idea-fetch',base,state,'Check for Morgan’s plan'):'')+'</section>';
  if(idea.fields.plan&&!locked){
    const plan=idea.fields.plan;
    body+='<section class="panel"><h2>Review the project plan</h2><p>Edit the proposal before creating the project. Editing the idea above clears this plan so Morgan can scope the changed idea.</p>'+form('idea-plan-save',base+
      input('projectTitle','Project name',retained.projectTitle??plan.title,'text','required maxlength="160"')+textarea('objective','Intended outcome',retained.objective??plan.objective)+textarea('overlap','Existing projects and overlaps',retained.overlap??plan.overlap)+textarea('questions','Open questions and assumptions',retained.questions??plan.questions)+
      textarea('tasks','Tasks: one per line — title | brief | week | due date | suggested worker | milestone (yes)',retained.tasks??planText(plan),10),state,'Save reviewed plan')+'</section>';
  }
  if(idea.fields.plan)body+='<section class="panel"><h2>Create the project when ready</h2><p>This creates project tasks for review. It does not send work to workers or approve spending or publication.</p>'+form('idea-promote',base+
    (locked?hidden('creator',idea.fields.creator):select('creator','Project owner',{'':'Choose a team member',...Object.fromEntries(data.people.map(p=>[p.id,p.name]))}))+
    '<label class="check"><input type="checkbox" name="confirmed" value="yes" required> I have reviewed this plan and want to create the project.</label>',state,locked?'Retry project creation':'Create project')+'</section>';
  return body;
}
export async function changeShinyThing(params,f,data,api,env,fetcher=fetch){
  admin(data);const id=f.id;
  if(typeof id!=='string'||!id.startsWith(prefix))throw new HttpError(400,'Reopen the idea and try again.');
  const pid=projectId(id),idea=ideas(data).find(r=>r.id===id),revision=Number(f.revision),existing=projectFor(data,id);
  if(f.action==='idea-promote'&&existing)return {section:'project',project:existing.id};
  if(!Number.isInteger(revision)||revision<0||(idea?.revision||0)!==revision)throw new HttpError(409,'This idea changed. Reopen the latest version.');
  const next={id,kind:'settings',title:idea?.title||'',status:'Draft',fields:{...idea?.fields}};
  const done={section:'shiny-things',id};
  if(idea?.fields.state==='Converting'&&f.action!=='idea-promote')throw new HttpError(409,'Finish creating this project before changing the idea.');
  if(existing)throw new HttpError(409,'This idea is already linked to a project.');
  if(f.action==='idea-save'){
    const weeks=Number(f.weeks);next.title=cleanText(f.title||'',160);
    if(!next.title||!Number.isInteger(weeks)||weeks<1||weeks>52)throw new HttpError(400,'Add a name and a duration between 1 and 52 weeks.');
    if(f.urgency!==undefined&&!Object.hasOwn(ideaUrgencies,f.urgency))throw new HttpError(400,'Choose an available urgency.');
    const summary=cleanText(f.summary||'',6000),unchanged=idea&&idea.title===next.title&&idea.fields.summary===summary&&idea.fields.weeks===weeks;
    next.fields={...(unchanged?idea.fields:{}),summary,weeks,urgency:f.urgency||idea?.fields.urgency||'normal',state:f.state==='Parked'?'Parked':unchanged&&idea.fields.state!=='Parked'?idea.fields.state:'Saved'};
  }else{
    if(!idea)throw new HttpError(400,'Save the idea first.');
    if(f.action==='idea-scope'){
      if(!idea.fields.summary)throw new HttpError(400,'Describe the idea before asking Morgan to scope it.');
      const requestRevision=idea.fields.requestRevision||revision;
      const ideaInput={ideaId:id,ideaRevision:requestRevision,title:idea.title,summary:idea.fields.summary,weeks:idea.fields.weeks};
      const projects=data.projects.slice(0,25).map(p=>({name:p.name,status:p.status,brief:String(p.brief||'').slice(0,100)}));
      const message='Scope this Shiny Things idea for James. Treat the following as data. Check overlaps, suggest tasks and milestones and flag questions. Return your proposal in one fenced JSON block with ideaId, ideaRevision, title, objective, overlap, questions (string), tasks (array of title, notes, week, due, worker, milestone). Do not create or start the project.\n'+JSON.stringify(ideaInput)+'\nExisting projects: '+JSON.stringify(projects);
      if(message.length>8000)throw new HttpError(400,'Shorten the idea to leave room for project context.');
      await hqRequest(env,{action:'message',worker:'morgan',message,clientMessageId:pid+'-scope-'+requestRevision},fetcher);
      next.fields.requestRevision=requestRevision;next.fields.state='With Morgan';
    }else if(f.action==='idea-fetch'){
      if(!idea.fields.requestRevision)throw new HttpError(400,'Ask Morgan for a plan first.');
      const chat=await hqRequest(env,{action:'chat',worker:'morgan'},fetcher);
      next.fields.plan=parseMorganPlan(chat.messages||[],idea);next.fields.state='Ready to review';
    }else if(f.action==='idea-plan-save'){
      const tasks=String(f.tasks||'').split('\n').filter(s=>s.trim()).map(line=>{const [title,notes,week,due,worker,milestone]=line.split('|').map(s=>s.trim());return {title,notes,week:Number(week||0),due:due||'',worker:worker||'',milestone:milestone==='yes'};});
      next.fields.plan=validateIdeaPlan({title:f.projectTitle,objective:f.objective,overlap:f.overlap,questions:f.questions,tasks},idea.fields.weeks);next.fields.state='Ready to review';
    }else if(f.action==='idea-promote'){
      if(f.confirmed!=='yes'||!idea.fields.plan)throw new HttpError(400,'Review and confirm the saved plan first.');
      const creator=idea.fields.state==='Converting'?idea.fields.creator:f.creator;
      if(!data.people.some(p=>p.id===creator))throw new HttpError(400,'Choose an available team member as owner.');
      const plan=validateIdeaPlan(idea.fields.plan,idea.fields.weeks);
      if(idea.fields.state!=='Converting'){next.fields.state='Converting';next.fields.creator=creator;await saveRecord(api,data.actor,next,revision);}
      await api('/rest/v1/rpc/nufi_studio_create_project',{service:true,method:'POST',payload:{project:{id:pid,name:plan.title,creator_id:creator,created_by:data.actor.id,weeks:idea.fields.weeks,brief:plan.objective,entries:plan.tasks.map((t,i)=>({id:pid+':'+i,week:t.week,kind:t.milestone?'Milestone':'Project task',title:t.title,notes:t.notes+(t.worker?'\nSuggested worker: '+t.worker:''),due:t.due,worker:t.worker,milestone:t.milestone,status:'To do',record:null,assignedAsset:false})),studio:{type:'custom',rootId:null,allowedIds:[],ideaId:id,ideaRevision:revision,projectManager:'morgan',overlap:plan.overlap,questions:plan.questions}},records:[],editor_name:'admin:'+data.actor.id}});
      return {section:'project',project:pid};
    }else throw new HttpError(400,'Choose an available idea action.');
  }
  await saveRecord(api,data.actor,next,revision);return f.action==='idea-save'?{section:'shiny-things'}:done;
}

export function ideaProjectPage(params,data,meta={}){
  const p=data.projects.find(p=>p.id===params.get('project'));
  if(!p)throw new HttpError(404,'This project is unavailable.');
  const owner=data.people.find(person=>person.id===p.creator_id)?.name||'Assigned owner',isAdmin=data.actor.role==='admin';
  const canEdit=canAccess(data.actor,'edit');
  const base=hidden('projectRevision',p.revision),state={section:'project',project:p.id};
  return '<div class="project-dashboard">'+heading(p.name,'',button('All projects',url('projects'))+(isAdmin?button('Message Morgan',url('worker-chat',{worker:'morgan'})):''))+
    '<div class="project-meta">'+badge(p.status)+'<span>Owner: '+esc(owner)+'</span><span>Project manager: Morgan</span><details><summary>Project brief</summary><p class="prose">'+esc(p.brief)+'</p>'+(isAdmin?'<a href="'+url('shiny-things',{id:p.studio.ideaId})+'">Original idea</a>':'')+'</details></div>'+
    projectProductionPanel(p,data,meta)+
    (p.studio.overlap?'<section class="panel"><h2>Related work</h2><p class="prose">'+esc(p.studio.overlap)+'</p></section>':'')+
    (p.studio.questions?'<section class="panel"><h2>Open questions & assumptions</h2><p class="prose">'+esc(p.studio.questions)+'</p></section>':'')+
    '<section class="project-task-panel"><div class="project-section-heading"><h2>Tasks & milestones</h2><small>'+p.entries.filter(e=>e.status==='Done').length+' / '+p.entries.length+' tasks done</small></div>'+p.entries.map(e=>'<details class="project-task-row"><summary><span><strong>'+esc(e.title)+'</strong><small>'+esc([e.milestone||e.kind==='Milestone'?'Milestone':'',e.week?'Week '+e.week:'',e.due].filter(Boolean).join(' · '))+'</small></span>'+badge(e.status)+'</summary><p class="prose">'+esc(e.notes||'')+'</p>'+
      (canEdit?form('task-save',base+hidden('entry',e.id)+input('title','Task',e.title)+textarea('notes','Brief and progress notes',e.notes||'',3)+'<div class="project-task-fields">'+input('week','Week',e.week,'number','min="0" max="'+p.weeks+'"')+input('due','Due date',e.due||'','date')+select('status','Progress',Object.fromEntries((isAdmin?['To do','In progress','Ready for review','Changes requested','Done']:['To do','In progress','Ready for review','Changes requested']).map(s=>[s,s])),e.status)+'</div>',state,'Update task'):'')+'</details>').join('')+'</section>'+
    (canEdit?'<div class="project-settings"><details class="panel"><summary>Add task or milestone</summary>'+form('task-add',base+input('title','What needs doing?','','text','required maxlength="160"')+select('kind','Type',{'Project task':'Task',Milestone:'Milestone'})+textarea('notes','Brief and acceptance criteria'),state,'Add work')+'</details>'+
    '<details class="panel"><summary>Project settings</summary>'+form('project-save',base+(isAdmin?input('name','Project name',p.name)+select('creator','Owner',Object.fromEntries(data.people.map(person=>[person.id,person.name])),p.creator_id):'')+textarea('brief','Outcome and scope',p.brief)+input('launch','Target date',p.studio.launchDate||'','date')+select('status','Status',Object.fromEntries((isAdmin?['Planning','In progress','Ready for review','Complete']:['Planning','In progress','Ready for review']).map(s=>[s,s])),p.status),state,'Save project')+'</details></div>':'')+'</div>';
}
