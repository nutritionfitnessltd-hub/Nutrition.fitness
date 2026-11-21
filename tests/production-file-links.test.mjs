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
