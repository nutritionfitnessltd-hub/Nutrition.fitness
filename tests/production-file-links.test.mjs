import test from 'node:test';
import assert from 'node:assert/strict';
import {productionFileLinks} from '../server/production-file-links.mjs';
test('production files are clickable and duplicate references appear once',()=>{
 const url='https://nutritionfitness.sharepoint.com/sites/Nutrition.fitness/Shared%20Documents/lesson.png';
 const html=productionFileLinks({fields:{nativePreviewUrl:url,assetUrls:[url,'https://www.canva.com/design/copy/edit'],production:{files:[{url,name:'Checked lesson preview'}]}}});
 assert.match(html,/href="https:\/\/nutritionfitness.sharepoint.com/);assert.match(html,/Checked lesson preview/);assert.equal((html.match(/lesson\.png/g)||[]).length,1);assert.match(html,/Open editable Canva copy/);
});
test('production files reject executable links, credentials and unrelated hosts',()=>{
 assert.equal(productionFileLinks({assetUrls:['javascript:alert(1)','https://attacker.test/file','https://x:y@nutritionfitness.sharepoint.com/file']}),'');
});

test('course folders and working copies use saved names and reject unsafe destinations',()=>{
 const html=productionFileLinks({fields:{courseFolders:{'Sleep & recovery':{url:'https://www.canva.com/folder/sleep'},'Do not link':{url:'https://attacker.test/file'}},assetUrls:['https://www.canva.com/folder/sleep'],ownedWorkingCopies:[{title:'<script>unsafe</script>',collection:'Sleep & recovery',canvaUrl:'https://www.canva.com/design/copy/edit',pageCount:10}]}},{document:true});
 assert.match(html,/Sleep &amp; recovery/);assert.equal((html.match(/href="https:\/\/www.canva.com\/folder\/sleep"/g)||[]).length,1);
 assert.match(html,/Canva folder/);assert.match(html,/Browse 1 working copy/);assert.match(html,/&lt;script&gt;unsafe&lt;\/script&gt;/);assert.doesNotMatch(html,/attacker.test|<script>/);
});
