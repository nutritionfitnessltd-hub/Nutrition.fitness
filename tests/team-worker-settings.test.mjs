import test from 'node:test';
import assert from 'node:assert/strict';
import {workerSettingsPanel,workerSettingsCommand} from '../server/team-worker-settings.mjs';
import {handleLibraryWork} from '../server/library-work.mjs';
const settings={organisationVersion:9,employee:{instructions:'Check evidence <script>'},routines:[{id:'routine1',version:0,title:'Daily ideas',enabled:true,cadence:'daily',time:'09:00',weekday:1,priority:'Normal',nextRunAt:'2026-11-21T09:00:00Z'}]};
test('prompt and live schedules appear expanded with versioned edit controls and escaped content',()=>{
 const html=workerSettingsPanel('alex',settings);assert.match(html,/<h2>AI prompt/);assert.match(html,/<h2>Schedule/);assert.match(html,/Check evidence &lt;script&gt;/);assert.match(html,/Daily ideas/);assert.match(html,/name="version" value="0"/);assert.match(html,/Pause schedule/);assert.match(html,/Europe\/London/);assert.doesNotMatch(html,/<script>/);
});
test('settings outage does not offer a blank overwrite and retains read-only prompt',()=>{const html=workerSettingsPanel('alex',null,'HQ unavailable','Keep James informed.');assert.match(html,/HQ unavailable/);assert.match(html,/Keep James informed/);assert.doesNotMatch(html,/<form/);});
test('commands forward only worker-scoped fields and preserve zero routine versions',()=>{
 assert.deepEqual(workerSettingsCommand({action:'team-worker-prompt-save',worker:'alex',version:'9',instructions:'Review only',employeeId:'other'}),{action:'worker-prompt-save',worker:'alex',version:9,instructions:'Review only'});
 assert.deepEqual(workerSettingsCommand({action:'team-worker-routine-toggle',worker:'alex',version:'0',routineId:'routine1',enabled:'no'}),{action:'worker-routine-toggle',worker:'alex',version:0,routineId:'routine1',enabled:false});
 const c=workerSettingsCommand({action:'team-worker-routine-save',worker:'alex',version:'0',routineId:'routine1',title:' Daily ideas ',cadence:'weekly',time:'10:30',weekday:'1',priority:'Normal'});assert.equal(c.version,0);assert.equal(c.weekday,1);assert.equal(c.title,'Daily ideas');
 for(const f of [{action:'team-worker-prompt-save',worker:'other',version:9,instructions:'x'},{action:'team-worker-prompt-save',worker:'alex',version:9,instructions:'x'.repeat(4001)},{action:'team-worker-routine-toggle',worker:'alex',version:0,routineId:'routine1',enabled:'maybe'}])assert.throws(()=>workerSettingsCommand(f));
});
test('team handler sends settings to HQ and returns to the same worker modal',async()=>{
 const calls=[],res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 await handleLibraryWork({method:'POST',headers:{host:'example.test',origin:'https://example.test'},body:{action:'team-worker-prompt-save',worker:'alex',version:'9',instructions:'Review only'}},res,{env:{NUFI_LIBRARY_CATALOGUE_KEY:'fixture',NUFI_HQ_SITE_TOKEN:'fixture'},params:new URLSearchParams({studio:'team',worker:'alex'}),copyActor:{role:'admin',id:'owner'},apiFactory:()=>async()=>[],load:async()=>({records:[]}),fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({ok:true}));}});
 assert.equal(res.statusCode,303);assert.match(res.headers.Location,/tab=workers&worker=alex&saved=worker-settings/);assert.equal(calls[0].action,'worker-prompt-save');assert.equal(calls[0].version,9);
});
