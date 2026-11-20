import test from 'node:test';
import assert from 'node:assert/strict';
import {articlePresentation,readerDocument,markdownArticle} from '../server/article-reader.mjs';
import {handleStudio} from '../server/studio.mjs';
import {publishedContent} from '../server/studio-publishing.mjs';
const body='EDITORIAL WORKFLOW STATUS: AWAITING APPROVAL.\n\n**Summary:** An introduction.\n**Short answer:** A concise answer.\n**Topics:** `food`, `habits`\n\n:::writing{title="Example"}\n# Example\n\nThe **original** introduction.\n\n## First question\n\n- One\n- Two\n\n## Second question\n\n1. First\n2. Second\n:::\n\n### Sources checked today\n\n- [Original research](https://example.com/research). \uE200genui\uE202private-reference\uE201\n\n### Proposed real hero photograph\nPrivate image note';
const record={id:'worker:example',title:'Example',kind:'article',status:'Draft',revision:1,fields:{body,imageAlt:'Test image',imageCredit:'Photographer'}};
test('plain production handoffs never appear in reader previews or replace the article',()=>{
 const source={...record,fields:{body:'## Can you trust the estimate?\nUse it as rough context.\n\nMargin note: Your wrist is a dashboard.\nSource email: Weekly Wisdom\nSource received: 2026-11-20\nSource sender: private@example.com\nSource Outlook message ID:\n'+ 'A'.repeat(1500)+'\nStatus: awaiting approval\nHero image source page: https://example.com/photo\nChecked sources JSON:\n[{"private":"notes"}]'}};
 const original=structuredClone(source),a=articlePresentation(source),html=readerDocument(source);
 assert.match(html,/Use it as rough context/);assert.equal(a.marginNote,'Your wrist is a dashboard.');
 assert.doesNotMatch(html,/Source email|Weekly Wisdom|private@example|Source Outlook|AAAAA|awaiting approval|Checked sources JSON|Hero image source page/);
 assert.deepEqual(source,original);
});
test('worker submission becomes a reader-facing article without mutating its source',()=>{
 const original=structuredClone(record),a=articlePresentation(record),html=readerDocument(record,'/image.jpg');
 assert.deepEqual(record,original);assert.equal(a.summary,'An introduction.');assert.equal(a.shortAnswer,'A concise answer.');assert.deepEqual(a.topics,['food','habits']);
 for(const value of ['class="kc-article-header"','class="kc-article-photo"','class="kc-quick-answer"','class="kc-article-layout"','In this guide','id="section-1"','href="#section-1"','<ul><li>One</li><li>Two</li></ul>','<ol><li>First</li><li>Second</li></ol>','https://example.com/research'])assert.ok(html.includes(value),value);
 assert.doesNotMatch(html,/EDITORIAL WORKFLOW|:::writing|private-reference|Private image note|\*\*Summary/);
});
test('plain drafts and malicious metadata stay safe; tables and links render',()=>{
 const html=readerDocument({...record,title:'<script>bad</script>',fields:{body:'A plain paragraph.',category:'" onmouseover="bad',topics:['"><script>bad</script>'],shortAnswer:'<img onerror=bad>'}});
 assert.doesNotMatch(html,/<script>|<img onerror|<[^>]+ onmouseover=/);assert.match(html,/A plain paragraph/);
 assert.doesNotMatch(markdownArticle('[bad](javascript:alert(1))\n\n<script>bad</script>'),/<script|href="javascript:/);
 assert.match(markdownArticle('| A | B |\n| --- | --- |\n| one | two |'),/<table><thead>/);
});
test('private article preview is read-only and uses the same article body as a reviewed release',async()=>{
 const actor={id:'admin',role:'admin'},api=async p=>p.includes('nufi_studio_items')?[{id:record.id,payload:record,revision:1}]:[],headers={};let output;
 const res={setHeader:(k,v)=>headers[k]=v,end:v=>output=v};
 await handleStudio({method:'GET'},res,{actor,api,load:async()=>({records:[]}),env:{},params:new URLSearchParams({studio:'article-preview',id:record.id})});
 assert.equal(res.statusCode,200);assert.equal(headers['Cache-Control'],'private, no-store');assert.match(headers['Content-Security-Policy'],/frame-ancestors 'self'/);assert.equal(output,readerDocument(record));
 const privateMain=/<main[\s\S]*<\/main>/.exec(output)[0];
 await publishedContent({headers:{host:'nutrition-fitness-website-2.vercel.app'}},res,new URLSearchParams({view:'studio-release',id:record.id}),async()=>[{payload:record}]);
 assert.equal(/<main[\s\S]*<\/main>/.exec(output)[0],privateMain);
 await handleStudio({method:'POST',body:{}},res,{actor,api,load:async()=>({records:[]}),env:{},params:new URLSearchParams({studio:'article-preview',id:record.id})});assert.equal(res.statusCode,405);
 let reads=0;await handleStudio({method:'GET'},res,{actor:{role:'staff',access:{library:false}},api:async()=>{reads++;},load:async()=>{reads++;},env:{},params:new URLSearchParams({studio:'article-preview',id:record.id})});assert.equal(res.statusCode,403);assert.equal(reads,0);
 await handleStudio({method:'GET'},res,{actor:{id:'unassigned',role:'staff'},api,load:async()=>({records:[]}),env:{},params:new URLSearchParams({studio:'article-preview',id:record.id})});assert.equal(res.statusCode,403);assert.doesNotMatch(output,/class="kc-article-header"/);
});
