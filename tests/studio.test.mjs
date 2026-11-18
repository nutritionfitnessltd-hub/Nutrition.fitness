import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { canonical, descendants, issues } from '../server/studio-model.mjs';
import { studioData, mergeStudioRecord } from '../server/studio-store.mjs';
import { projectDraft, changeStudio } from '../server/studio-actions.mjs';
import { extractDrafts, archivePage } from '../server/studio-import.mjs';
import { handleStudio } from '../server/studio.mjs';
import { generateDraft } from '../server/studio-ai.mjs';
import { library, itemPage, createPage, projectList } from '../server/studio-pages.mjs';
import { studioFrame } from '../server/studio-ui.mjs';

const admin={role:'admin',id:randomUUID()},staff={role:'staff',id:randomUUID(),name:'Creator'};
const exercise={id:'training:ex-one',kind:'exercise',title:'Chair stand',status:'draft',fields:{movement:'squat',equipment:['chair'],instructions:['Stand up'],cues:['Controlled movement']},files:[]};
const session={id:'training:session-one',kind:'session',title:'First workout',status:'draft',fields:{warmup:['Walk'],blocks:[{referenceId:'ex-one',type:'exercise',sets:2,repMin:8}],cooldown:['Walk']},files:[]};
const other={id:'training:ex-other',kind:'exercise',title:'Other exercise',status:'draft',fields:{},files:[]};
const load=async()=>({records:[exercise,session,other],files:{}});
function fixture(actor=admin){
  const items=[exercise,session,other].map(canonical);
  return {actor,items,byId:new Map(items.map(r=>[r.id,r])),people:[{id:staff.id,name:'Creator'}],projects:[],tasks:[],assigned:new Set([session.id,exercise.id]),index:{records:items,files:{}}};
}

test('library retains separate content types while creation and programme navigation stay simple',()=>{
  const data=fixture(),html=library(new URLSearchParams(),data);
  assert.equal((html.match(/class="[^"]*\bstudio-type-card\b[^"]*"/g)||[]).length,21);
  for(const type of ['recipe','mealplan','course','article','ebook','communication','workflow','asset'])assert.ok(html.includes('kind='+type));
  const frame=studioFrame(html,'library',admin);
  const nav=frame.match(/aria-label="Studio navigation">(.*?)<\/nav>/s)[1];
  assert.equal((nav.match(/class="studio-nav-section"/g)||[]).length,6);
  assert.ok(nav.indexOf('Projects')<nav.indexOf('Assets'));
  for(const label of ['Home','Projects','Assets','Content Studio','Content Library','Brand & Media','Software Releases','Team','Archive'])assert.ok(nav.includes(label));
  assert.doesNotMatch(nav,/Published|Drafts/); // Status controls have one home, in the library.
  assert.match(html,/<summary>More content types<\/summary>/);
  const create=createPage(new URLSearchParams(),data);
  assert.match(create,/Use an original/);
  assert.match(create,/studio=new&amp;kind=campaign/);
  assert.doesNotMatch(projectList(new URLSearchParams(),data),/aria-label="Project content types"/);
});

test('approved drafts remain separate from content explicitly recorded as published',()=>{
  const data=fixture();
  data.items[0].status='Approved';data.items[1].publication={status:'published',destination:'app'};
  const drafts=library(new URLSearchParams({view:'all',bucket:'drafts'}),data);
  const published=library(new URLSearchParams({view:'all',bucket:'published'}),data);
  const checked=library(new URLSearchParams({view:'all',bucket:'checked'}),data);
  assert.doesNotMatch(drafts,/Chair stand|First workout/);
  assert.match(checked,/Chair stand/);assert.doesNotMatch(checked,/First workout/);
  assert.match(published,/First workout/);assert.doesNotMatch(published,/Chair stand/);
});

test('archive preserves original collection folders, recipe tabs and course lessons in the studio',()=>{
  const data=fixture();
  data.index.records=[{id:'catalogue:book',group:'Recipes',kind:'Recipe book',title:'Example book',fields:{},files:[]},{id:'course:Example course',group:'Courses',kind:'Course outline',title:'Example course',fields:{},files:[]},{id:'catalogue:lesson',group:'Courses',kind:'Lesson',title:'First lesson',fields:{body:'Lesson text'},files:[]}];
  const meta={assets:{'catalogue:book':{shelf:'Recipe collection'}},courses:{'Example course':{order:'confirmed',members:['catalogue:lesson'],sections:[{title:'Basics',entries:[{id:'catalogue:lesson'}]}],support:[]}}};
  const recipes=archivePage(new URLSearchParams({shelf:'Recipes'}),data,meta);
  for(const label of ['Recipe books &amp; meal plans','Individual recipes','Supporting files','Source collections'])assert.ok(recipes.includes(label)||recipes.includes(label.replace('&amp;','&')));
  assert.match(recipes,/studio=archive&amp;shelf=Recipes.*folder=Recipe\+collection/);
  assert.match(recipes,/name="studio" value="archive"/);
  const course=archivePage(new URLSearchParams({item:'course:Example course'}),data,meta);
  assert.match(course,/Basics/);assert.match(course,/First lesson/);
  assert.match(course,/studio=archive&amp;item=catalogue%3Alesson/);
  assert.match(course,/work=1&amp;assets=course%3AExample\+course/);
  assert.match(course,/studio=import&amp;source=course%3AExample\+course/);
});

test('programme dashboard switches week and frequency without losing workout sections',()=>{
  const data=fixture();
  const programme=canonical({id:'training:plan',kind:'programme',title:'Sample plan',fields:{weeks:4,purpose:'Build confidence',audience:'New lifters'}});
  const schedules=[3,4,5].map(f=>canonical({id:'training:plan-'+f,kind:'structure',parent:programme.id,title:f+' days',fields:{frequency:f,weeks:[1,2].map(number=>({number,title:'Week focus '+number,message:'Coach note '+number,sessionIds:Array(f).fill(session.id)}))}}));
  data.items.push(programme,...schedules);data.byId=new Map(data.items.map(r=>[r.id,r]));
  const overview=itemPage(new URLSearchParams({id:programme.id}),data);
  assert.match(overview,/aria-label="Programme content"/);
  assert.doesNotMatch(overview,/id="studio-editor"/);
  assert.match(overview,/Assign work/);
  for(const days of [3,4,5]){
    const html=itemPage(new URLSearchParams({id:programme.id,tab:'plan',schedule:'training:plan-'+days,week:'2'}),data);
    assert.match(html,/Coach note 2/);
    assert.equal((html.match(/<span>Day /g)||[]).length,days);
    for(const label of ['Warm-up','Main work','Cool-down'])assert.ok(html.includes(label));
    assert.match(html,/Chair stand/);
    assert.match(html,/schedule=training%3Aplan-/);
  }
  assert.match(itemPage(new URLSearchParams({id:programme.id,tab:'edit'}),data),/id="studio-editor"/);
  data.actor=staff;data.assigned.clear();
  assert.doesNotMatch(itemPage(new URLSearchParams({id:programme.id}),data),/Assign work|Edit &amp; review/);
});

test('programme messages include work attached through a project',()=>{
  const data=fixture(),root=canonical({id:'training:plan',kind:'programme',title:'Plan',fields:{weeks:4}}),message=canonical({id:'studio:message',kind:'communication',title:'Week one welcome',fields:{body:'Welcome'}});
  data.items.push(root,message);data.byId=new Map(data.items.map(r=>[r.id,r]));
  data.projects=[{id:'project-one',studio:{rootId:root.id},entries:[{record:message.id}],creator_id:staff.id}];
  const html=itemPage(new URLSearchParams({id:root.id,tab:'messages'}),data);
  assert.match(html,/Week one welcome/);
  assert.match(html,/project=project-one/);
});
test('training references retain session-specific dose and reusable exercise instructions',()=>{
  assert.deepEqual([...descendants([session.id],[session,exercise])].sort(),[exercise.id,session.id].sort());
  assert.equal(issues(session,[session,exercise]).length,0);
  assert.match(issues(exercise,[exercise]).join(' '),/demonstration/);
});
test('programme revisions preserve source workout doses and later full edits replace the revision',()=>{
  const base=canonical(session);
  const revised=mergeStudioRecord(base,{id:base.id,_basePatch:true,title:'Week 12 review',fields:{coaching:'Review the programme'},removedFields:['obsolete']});
  assert.deepEqual(revised.fields.blocks,base.fields.blocks);
  assert.deepEqual(revised.fields.warmup,base.fields.warmup);
  assert.deepEqual(revised.fields.cooldown,base.fields.cooldown);
  assert.equal(revised._basePatch,undefined);
  const full={...revised,fields:{warmup:['New preparation'],blocks:[],cooldown:['Walk']}};
  assert.deepEqual(mergeStudioRecord(base,full),full);
  assert.equal(base.title,session.title);
});
test('programme projects accept standard durations and reserve the year-long exception for NUFI365',()=>{
  const d=fixture(),input={template:'programme',id:randomUUID(),name:'Programme',creator:staff.id};
  for(const weeks of [4,6,8,12])assert.equal(projectDraft({...input,weeks},d).project.weeks,weeks);
  for(const weeks of [13,26,52])assert.throws(()=>projectDraft({...input,weeks},d),/Choose 4/);
  d.byId.set('training:nufi365',{id:'training:nufi365',kind:'programme',fields:{weeks:52}});
  assert.equal(projectDraft({...input,weeks:52,rootId:'training:nufi365'},d).project.weeks,52);
});
test('recipe extraction preserves source evidence and leaves missing nutrition and servings for review',()=>{
  const text='Vegetable bowl\nIngredients\n100 g beans\nMethod\nWarm the beans.';
  const [r]=extractDrafts(text,'recipe','Source book','catalogue:source');
  assert.deepEqual(r.fields.ingredients,['100 g beans']);
  assert.deepEqual(r.fields.instructions,['Warm the beans.']);
  assert.equal(r.fields.servings,0);
  assert.equal(r.fields.nutrition.calories,'');
  assert.equal(r.source.needsChecking,true);
  assert.equal(r.source.text,text);
});
test('project brief produces a weekly production plan with assigned immutable scope',()=>{
  const d=fixture();
  const draft=projectDraft({template:'programme',id:randomUUID(),name:'Finish strength',weeks:6,creator:staff.id,rootId:session.id},d);
  assert.equal(draft.project.weeks,6);
  assert.ok(draft.project.entries.some(e=>e.week===6&&e.kind==='PT WhatsApp message'));
  assert.ok(draft.project.studio.allowedIds.includes(exercise.id));
  assert.throws(()=>projectDraft({template:'programme'},fixture(staff)),/Administrator/);
});
test('changing content links cannot expand staff edit permissions',async()=>{
  const saved={...canonical(session),fields:{blocks:[{referenceId:'ex-other'}]}};
  const api=async url=>{
    if(url.includes('nufi_studio_items'))return [{id:session.id,revision:1,payload:saved}];
    if(url.includes('nufi_library_projects'))return [{studio:{allowedIds:[session.id,exercise.id]},entries:[]}];
    return [];
  };
  const data=await studioData(api,staff,load);
  assert.ok(data.assigned.has(exercise.id));assert.ok(!data.assigned.has(other.id));
  await assert.rejects(changeStudio(new URLSearchParams({id:other.id}),{action:'content-save',revision:0},data,api),e=>e.status===403);
});
test('content review is role-limited and stale writes never change the saved copy',async()=>{
  const data=fixture(staff),calls=[];
  const api=async(url,options)=>{calls.push([url,options]);return [{revision:1}];};
  const params=new URLSearchParams({id:session.id});
  await assert.rejects(changeStudio(params,{action:'content-review',revision:0,status:'Approved'},data,api),e=>e.status===403);
  await assert.rejects(changeStudio(params,{action:'content-save',revision:2,title:'Changed',fields:'{}'},data,api),e=>e.status===409);
  assert.equal(calls.length,0);
  await changeStudio(params,{action:'content-review',revision:0,status:'In review'},data,api);
  assert.equal(calls[0][1].payload.document.status,'In review');
});
test('draft save clears approval, validates fields and records the expected version',async()=>{
  const d=fixture(),calls=[],params=new URLSearchParams({id:session.id});
  d.byId.get(session.id).status='Approved';
  await changeStudio(params,{action:'content-save',revision:0,title:'Updated workout',fields:JSON.stringify(session.fields)},d,async(url,options)=>{calls.push(options);return [{}];});
  assert.equal(calls[0].payload.document.status,'Draft');
  assert.equal(calls[0].payload.expected,0);
  await assert.rejects(changeStudio(params,{action:'content-save',revision:0,title:'Unsafe',fields:'{"__proto__":{"unsafe":true}}'},d,async()=>assert.fail()),/Invalid content field/);
});
test('studio pages render repository data and export excludes internal comments',async()=>{
  const data=fixture(),project={id:randomUUID(),name:'Training project',creator_id:staff.id,weeks:1,status:'Planning',brief:'',revision:1,studio:{rootId:session.id,allowedIds:[session.id,exercise.id]},entries:[{id:randomUUID(),week:1,title:'Workout',record:session.id,status:'To do'}]};
  const api=async url=>{
    if(url.includes('nufi_library_projects'))return [project];
    if(url.includes('nufi_library_staff'))return data.people;
    return [];
  };
  for(const section of ['home','library','exercises','projects','project','item','archive','import','review','calendar','journey','release']){
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
    await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:section,project:project.id,id:session.id}),actor:admin,api,load,env:{}});
    assert.equal(res.statusCode,200,section);
    assert.match(res.body,/Team Workspace/);
  }
  const res={setHeader(){},end(v){this.body=v;}};
  await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:'export',project:project.id,mode:'review'}),actor:admin,api,load,env:{}});
  assert.equal(res.statusCode,200);assert.equal(JSON.parse(res.body).content.length,2);
  await handleStudio({method:'GET'},res,{params:new URLSearchParams({studio:'export',project:project.id,mode:'approved'}),actor:admin,api,load,env:{}});
  assert.equal(res.statusCode,400);
});
test('OpenAI requests use server credentials, structured outputs and human-reviewed drafts',async()=>{
  let called;
  const result=await generateDraft({env:{OPENAI_API_KEY:'fixture-key'},record:{kind:'article',title:'A',fields:{}},prompt:'Write a short introduction',fetcher:async(url,opts)=>{
    called=JSON.parse(opts.body);assert.equal(url,'https://api.openai.com/v1/responses');
    return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({title:'A',fieldsJson:'{"body":"Draft"}',notes:'Review this draft.'})}]}]})};
  }});
  assert.equal(called.store,false);assert.equal(called.text.format.type,'json_schema');assert.equal(result.fields.body,'Draft');
  await assert.rejects(generateDraft({env:{},record:{},prompt:'Draft'}),e=>e.status===503);
});
