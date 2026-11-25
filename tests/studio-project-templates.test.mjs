import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTemplatesPage,saveProjectTemplate,savedOffering,offeringTemplateId,validateSections} from '../server/studio-project-templates.mjs';
import {projectCreatePage} from '../server/studio-project-create.mjs';
const actor={role:'admin',id:'11111111-1111-4111-8111-111111111111'};
const data=()=>({actor,byId:new Map(),people:[{id:actor.id,name:'Owner'}]});
const fields=()=>({revision:'0',templateTitle:'New launch',sectionCount:'1','sectionKey.0':'offering','sectionName.0':'Offer','taskCount.0':'2','taskTitle.0.0':'Define it','taskNotes.0.0':'Agreed brief','taskTitle.0.1':'Remove me','removeTask.0.1':'1','newTaskTitle.0':'Approve it',newSectionName:'Launch',newSectionTask:'Go live'});
test('administrator can save amended sections and tasks, reload and seed a future project',async()=>{
 const d=data();let payload;await saveProjectTemplate(fields(),d,async(path,opts)=>{assert.match(path,/nufi_studio_save/);payload=opts.payload;return [{}];});
 assert.equal(payload.expected,0);assert.equal(payload.item,offeringTemplateId);
 d.byId.set(offeringTemplateId,{...payload.document,revision:1});
 const saved=savedOffering(d);assert.equal(saved.title,'New launch');assert.deepEqual(saved.sections[0][2],[['Define it','Agreed brief'],['Approve it','']]);assert.equal(saved.sections[1][1],'Launch');
 const html=projectCreatePage(new URLSearchParams(),d,{name:'Example',creator:actor.id,projectTemplate:'offering',step:'tasks',applyTemplate:'1','include.offering':'1'});
 assert.match(html,/Offer: Approve it/);assert.doesNotMatch(html,/Remove me|Write the landing page/);
 assert.match(projectTemplatesPage(new URLSearchParams({saved:'1'}),d),/Template saved/);
});
test('staff cannot view or save templates; stale revisions never overwrite changes',async()=>{
 const d=data();d.actor={...actor,role:'staff'};assert.throws(()=>projectTemplatesPage(new URLSearchParams(),d),e=>e.status===403);
 await assert.rejects(saveProjectTemplate(fields(),d,async()=>assert.fail()),e=>e.status===403);
 d.actor=actor;d.byId.set(offeringTemplateId,{title:'Saved',revision:2,fields:{sections:[['offer','Offer',[['Task','']]]]}});
 await assert.rejects(saveProjectTemplate(fields(),d,async()=>assert.fail()),e=>e.status===409);
});
test('invalid or empty templates are rejected and editor retains unsaved values',async()=>{
 for(const sections of [[],[['x','', [['Task','']]]],[['x','Offer',[]]],[['x','Offer',[['','']]]],[['x','Offer',[['Task','']]],['x','Again',[['Task','']]]]])assert.throws(()=>validateSections(sections),e=>e.status===400);
 const f=fields();f['removeSection.0']='1';f.newSectionName='';f.newSectionTask='';await assert.rejects(saveProjectTemplate(f,data(),async()=>assert.fail()),e=>e.status===400);
 const html=projectTemplatesPage(new URLSearchParams(),data(),{templateTitle:'Unsaved name','taskTitle.0.0':'Unsaved task',newSectionName:'Unsaved section'});assert.match(html,/Unsaved name/);assert.match(html,/Unsaved task/);assert.match(html,/Unsaved section/);
});
