import test from 'node:test';
import assert from 'node:assert/strict';
import {launchPackPreview} from '../server/studio-launch-pack.mjs';
import {itemPage} from '../server/studio-pages.mjs';
import {reviewWindowDocument} from '../server/studio-review.mjs';

function fixture(){
 const image={bucket:'worker-content',path:'content-manager/00000000-0000-4000-8000-000000000001.png',type:'image/png'};
 const r={id:'launch',kind:'campaign',title:'Course launch pack',status:'Draft',revision:4,workerId:'imogen',comments:[],workerImage:image,fields:{coursePack:true,courseId:'course',introduction:'Course overview',audience:'Adults',outcome:'Understand the basics',marketingCopy:'Headline: Start here.\nSupport: Build understanding.',introductionScript:'Welcome to the course.',introductionScriptTimingEstimateSeconds:50,welcomeEmail:'Subject: Welcome\nHello [first name]',socialCopy:'One lesson at a time.',body:'# Original briefing',videoThumbnailAssetId:'video',socialImageAssetId:'social',imageAlt:'Learning at a kitchen table',imageCredit:'AI-generated artwork'}};
 const course={id:'course',kind:'course',title:'Course',fields:{},status:'Draft'};
 const video={id:'video',kind:'asset',title:'Video thumbnail',fields:{imageAlt:'Walking in a park',imageCredit:'AI-generated artwork'},status:'Draft',workerImage:image};
 const social={...video,id:'social',title:'Social image'};
 const items=[r,course,video,social],data={actor:{role:'admin',id:'james',name:'James'},items,byId:new Map(items.map(i=>[i.id,i])),assigned:new Set(),projects:[],people:[]};
 return {r,data,video};
}
test('launch pack defaults to a structured preview with saved copy, timing and three downloadable images',()=>{
 const {r,data}=fixture(),html=itemPage(new URLSearchParams({id:r.id}),data);
 for(const label of ['Launch pack sections','Course overview','Learning outcomes','Landing page copy','Introduction video script','Welcome email','Social post','Images','Copy script','3 / 3 added','Estimated narration: 50 seconds'])assert.ok(html.includes(label),label);
 assert.equal((html.match(/download="/g)||[]).length,3);
 assert.match(html,/studio=article-image/);assert.doesNotMatch(html,/amp;amp;|id="studio-editor"|<h2>Content<\/h2>/);
 assert.match(html,/<\/nav><section id="launch-overview"/);
 assert.match(html,/<details><summary>Original worker submission<\/summary><pre># Original briefing/);
 assert.match(itemPage(new URLSearchParams({id:r.id,tab:'edit'}),data),/id="studio-editor"/);
});
test('standalone marketing review loads base styling and keeps review actions',()=>{
 const {r,data}=fixture(),html=reviewWindowDocument(new URLSearchParams({id:r.id}),data);
 assert.match(html,/href="\/library-reader.css"/);assert.match(html,/class="content-review-window"/);
 assert.match(html,/launch-pack/);assert.match(html,/>Approve</);assert.match(html,/>Request changes</);
 assert.equal((html.match(/<h1>/g)||[]).length,1);
});
test('copy, alt text and notes are escaped; unsupported hero URLs are not rendered',()=>{
 const {r,data}=fixture();delete r.workerImage;r.fields.heroImageUrl='javascript:alert(1)';r.fields.introductionScript='<script>attack()</script>';r.fields.body='</pre><img src=x onerror=attack()>';
 const html=launchPackPreview(r,data);
 assert.doesNotMatch(html,/javascript:|<script>|<img src=x/);assert.match(html,/&lt;script&gt;/);assert.match(html,/2 \/ 3 added/);
});
test('unreadable and archived assets are not exposed through the pack',()=>{
 const {r,data,video}=fixture();data.actor={role:'staff',id:'staff',access:{library:true,work:true}};data.assigned=new Set([r.id]);
 let html=launchPackPreview(r,data);assert.match(html,/1 \/ 3 added/);assert.doesNotMatch(html,/id=video|id=social|Open course/);
 data.actor.role='admin';video.status='Archived';html=launchPackPreview(r,data);assert.match(html,/2 \/ 3 added/);assert.doesNotMatch(html,/id=video/);
 data.actor.role='staff';data.assigned.clear();assert.equal(launchPackPreview(r,data),'');
});
