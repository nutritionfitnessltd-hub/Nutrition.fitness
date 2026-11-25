import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {teamWorkDashboard,teamWorkPage} from '../server/studio-team-work.mjs';
import {workerIdeaSummaries} from '../server/studio-ideas.mjs';
import {changeHq} from '../server/studio-hq.mjs';
import {startTeamWorkFilters} from '../public/studio-team-work-filters.mjs';
const fixture=()=>({actor:{role:'admin',id:'owner'},items:[],byId:new Map(),people:[{id:'person',name:'Joyce'}],projects:[],tasks:[{id:'task',title:'Prepare artwork',staff_id:'person',status:'To do',created_at:new Date().toISOString()}],assigned:new Set(),hqIdeas:{andy:{id:'proposal-1',title:'A useful proposal',state:'pending',version:7,createdAt:new Date().toISOString()}}});
test('list filters hide AI or people, survive live replacements, and clear saved preferences',async()=>{
 const data=fixture(),html=teamWorkDashboard(data);assert.match(html,/<ul class="team-work-list">/);assert.doesNotMatch(html,/team-worker-grid/);assert.match(html,/name="expectedVersion" value="7"/);assert.match(html,/>Dismiss<\/button>/);
 const dom=new JSDOM(html,{url:'https://example.test'}),{document,MutationObserver,localStorage,Event}=dom.window;
 const state=startTeamWorkFilters({doc:document,Observer:MutationObserver,storage:localStorage});const select=document.querySelector('[name=type]');select.value='people';select.dispatchEvent(new Event('change',{bubbles:true}));assert.equal(document.querySelector('[data-work-type=ai]').hidden,true);assert.equal(document.querySelector('[data-work-type=people]').hidden,false);
 document.querySelector('[data-work-filter-scope]').outerHTML=html;await new Promise(r=>setTimeout(r,0));assert.equal(document.querySelector('[data-work-type=ai]').hidden,true);
 const form=document.querySelector('[data-team-work-filters]');form.elements.type.value='ai';form.elements.type.dispatchEvent(new Event('change',{bubbles:true}));assert.equal(document.querySelector('[data-work-type=people]').hidden,true);form.reset();await new Promise(r=>setTimeout(r,0));assert.equal(document.querySelector('[data-work-type=people]').hidden,false);assert.equal(document.querySelector('[data-work-type=ai]').hidden,false);state.observer.disconnect();dom.window.close();
 data.hqIdeas.andy.state='active';assert.doesNotMatch(teamWorkDashboard(data),/>Dismiss<\/button>/);assert.match(teamWorkPage(new URLSearchParams({type:'people'}),data),/Prepare artwork/);assert.doesNotMatch(teamWorkPage(new URLSearchParams({type:'people'}),data),/A useful proposal/);
});
test('dismiss uses the saved HQ proposal version, returns to the list, and rejects staff',async()=>{
 const env={NUFI_HQ_SITE_TOKEN:'fixture'},data=fixture(),sent=[];
 const fetcher=async(_url,options)=>{sent.push(JSON.parse(options.body));return new Response(JSON.stringify({version:7,ideas:[data.hqIdeas.andy]}));};
 const summaries=await workerIdeaSummaries(env,fetcher);assert.equal(summaries.andy.version,7);
 const form={action:'hq-idea',worker:'andy',decision:'reject-idea',ideaId:'proposal-1',expectedVersion:'7',returnTo:'home'};
 assert.deepEqual(await changeHq(new URLSearchParams(),form,data,()=>{},env,fetcher),{section:'home'});assert.equal(sent.at(-1).action,'reject-idea');assert.equal(sent.at(-1).ideaId,'proposal-1');assert.equal(sent.at(-1).expectedVersion,7);
 await assert.rejects(()=>changeHq(new URLSearchParams(),form,{...data,actor:{role:'staff'}},()=>{},env,fetcher),e=>e.status===403);
});
