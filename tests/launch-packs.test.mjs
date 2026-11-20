import test from 'node:test';
import assert from 'node:assert/strict';
import {launchPackParent,launchPackParts} from '../server/launch-packs.mjs';
import {itemPage} from '../server/studio-pages.mjs';
import {teamWorkRows} from '../server/studio-team-work.mjs';
import {coursePack,courseProductionBrief} from '../server/studio-courses.mjs';
function fixture(){
 const pack={id:'pack',title:'Course launch pack',kind:'marketing',status:'Draft',workerId:'imogen',fields:{coursePack:true,courseId:'course'}};
 const child={id:'social',title:'Social artwork',kind:'asset',status:'Draft',workerId:'imogen',fields:{launchPackId:'pack',courseId:'course',launchPackPart:'socialImage'}};
 const data={actor:{role:'admin'},items:[pack,child],byId:new Map([[pack.id,pack],[child.id,child]]),assigned:new Set(),tasks:[],projects:[],people:[]};
 return {pack,child,data};
}
test('launch-pack children sit inside the parent instead of becoming separate team jobs',()=>{
 const {pack,child,data}=fixture();
 const rows=teamWorkRows(data);assert.deepEqual(rows.map(r=>r.recordId),['pack']);
 const html=itemPage(new URLSearchParams({id:pack.id}),data);assert.match(html,/Launch pack contents/);assert.match(html,/Social artwork/);assert.match(html,/studio=item.*id=social/);
 assert.equal(launchPackParent(child,data),pack);
 child.fields.courseId='different-course';assert.equal(launchPackParent(child,data),null);assert.equal(teamWorkRows(data).length,2);
});
test('a child remains visible when its parent is missing or outside the assignee’s access',()=>{
 const {child,data}=fixture();data.actor={role:'staff',id:'staff'};data.assigned.add(child.id);
 assert.equal(launchPackParent(child,data),null);assert.equal(teamWorkRows(data).some(r=>r.recordId===child.id),true);
 data.byId.delete('pack');assert.equal(launchPackParent(child,data),null);
});
test('separate copy deliverables feed course readiness and future production specifies branded generation',()=>{
 const {pack,data}=fixture();const course={id:'course',kind:'course',title:'Course',fields:{}};
 const copy={id:'landing',kind:'marketing',status:'Draft',fields:{launchPackId:pack.id,launchPackPart:'landingPage',body:'Approved wording for checking'}};
 data.items.push(copy);data.byId.set(copy.id,copy);
 assert.equal(coursePack(course,data).fields.marketingCopy,copy.fields.body);
 assert.match(courseProductionBrief,/Generate new images/);assert.match(courseProductionBrief,/do not select stock or library photos/);assert.match(courseProductionBrief,/fields.launchPackId/);
 assert.equal(launchPackParts.length,8);
});
