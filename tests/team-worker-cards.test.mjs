import test from 'node:test';
import assert from 'node:assert/strict';
import {teamWorkCards,teamWorkDashboard,teamWorkPage,teamWorkRows} from '../server/studio-team-work.mjs';
function fixture(){
 const time=new Date().toISOString();
 const items=Array.from({length:12},(_,n)=>({id:'lesson:'+n,title:'Lesson update '+n,kind:'lesson',status:'Draft',workerId:'imogen',updatedAt:time,fields:{}}));
 items.push({id:'index',title:'Old backend index title',kind:'asset',status:'Draft',workerId:'imogen',updatedAt:time,fields:{courseProductionIndex:true,runner:{status:'working',updatedAt:time,currentSourceId:'C00547',stage:'native-branding-resume',projectId:'course-project'}}});
 items.push({id:'article',title:'Latest article',kind:'article',status:'In review',workerId:'nina',updatedAt:time,fields:{body:'Article'}});
 return {actor:{role:'admin',id:'admin'},items,byId:new Map(items.map(r=>[r.id,r])),people:[],projects:[{id:'course-project',name:'Course tracker',entries:[]}],tasks:[],assigned:new Set(),index:{records:[{id:'catalogue:C00547',title:'Understanding your metabolism'}]},hqProduction:{jobId:'old-job',status:'queued',updatedAt:'2026-01-01T00:00:00Z'}};
}
test('ongoing work appears once per worker while complete item history remains available',()=>{
 const data=fixture(),html=teamWorkDashboard(data),cards=teamWorkCards(data);
 assert.equal(cards.length,2);
 assert.equal((html.match(/data-work-owner="worker:imogen"/g)||[]).length,1);
 assert.match(html,/Understanding your metabolism/);assert.doesNotMatch(html,/Lesson update 0|Old backend index title|Queued for production/);
 assert.match(html,/view=history/);
 const history=teamWorkPage(new URLSearchParams({owner:'worker:imogen',view:'history'}),data);
 assert.match(history,/Lesson update 0/);assert.doesNotMatch(history,/Latest article/);
 assert.equal((teamWorkPage(new URLSearchParams(),data).match(/data-work-owner="worker:imogen"/g)||[]).length,1);
});
test('native production checkpoint supersedes older HQ state without inventing a running claim',()=>{
 const data=fixture();let rows=teamWorkRows(data).filter(r=>r.id.startsWith('production:'));
 assert.equal(rows.length,1);assert.equal(rows[0].status,'In progress');assert.match(rows[0].href,/project=course-project/);
 data.items.find(r=>r.id==='index').fields.runner.updatedAt='2026-01-02T00:00:00Z';
 rows=teamWorkRows(data).filter(r=>r.id.startsWith('production:'));assert.equal(rows[0].status,'Last saved progress');
 data.hqProduction.updatedAt='2026-01-03T00:00:00Z';
 rows=teamWorkRows(data).filter(r=>r.id.startsWith('production:'));assert.equal(rows[0].status,'Queued for production');
});
test('worker cards do not expose unassigned production work to staff',()=>{
 const data=fixture();data.actor={role:'staff',id:'joyce',access:{library:true,work:true,all_library:true,edit:true}};
 assert.equal(teamWorkCards(data).length,0);assert.doesNotMatch(teamWorkDashboard(data),/Understanding your metabolism|imogen/);
});

