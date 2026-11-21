import test from 'node:test';
import assert from 'node:assert/strict';
import {teamProductionPanel} from '../server/team-production.mjs';
import {workerSettingsCommand} from '../server/team-worker-settings.mjs';
import {handleLibraryWork} from '../server/library-work.mjs';
test('production questions are visible in Team and answers target the existing job, not the chat',()=>{
 const html=teamProductionPanel('imogen',{jobId:'existing-job',version:14,status:'queued',result:'Saved <report>',progress:{blockers:[{itemId:'C00546',detail:'Copy failed',question:'Which editable copy should be used?'}],readyItems:[{itemId:'C00545',title:'Next lesson'}]}});
 assert.match(html,/Queued for production/);assert.match(html,/Which editable copy/);assert.match(html,/Work that can continue/);assert.match(html,/Next lesson/);assert.match(html,/team-production-reply/);assert.match(html,/value="14"/);assert.match(html,/Saved &lt;report&gt;/);assert.doesNotMatch(html,/hq-message/);
 assert.equal(teamProductionPanel('nina',{}),'');assert.doesNotMatch(teamProductionPanel('imogen',null),/<form/);
 assert.doesNotMatch(teamProductionPanel('imogen',{status:'working',jobId:'j'}),/team-production-reply/);
});
test('production reply accepts only Imogen and a current revision',()=>{
 assert.deepEqual(workerSettingsCommand({action:'team-production-reply',worker:'imogen',version:'0',message:' Continue other work '}),{action:'worker-production-reply',worker:'imogen',version:0,message:'Continue other work'});
 for(const args of [{worker:'nina',version:0,message:'x'},{worker:'imogen',version:-1,message:'x'},{worker:'imogen',version:0,message:''}])assert.throws(()=>workerSettingsCommand({action:'team-production-reply',...args}));
});
test('Team HTTP form reaches the production reply API and returns to Imogen',async()=>{
 const calls=[],res={headers:{},setHeader(k,v){this.headers[k]=v;},end(b){this.body=b;}};
 await handleLibraryWork({method:'POST',headers:{host:'example.test',origin:'https://example.test'},body:{action:'team-production-reply',worker:'imogen',version:'14',message:'Continue ready lessons'}},res,{env:{NUFI_LIBRARY_CATALOGUE_KEY:'fixture',NUFI_HQ_SITE_TOKEN:'fixture'},params:new URLSearchParams({studio:'team',worker:'imogen'}),copyActor:{role:'admin',id:'owner'},apiFactory:()=>async()=>[],load:async()=>({records:[]}),fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({ok:true});}});
 assert.equal(res.statusCode,303);assert.equal(calls[0].action,'worker-production-reply');assert.equal(calls[0].version,14);assert.match(res.headers.Location,/worker=imogen/);
});
