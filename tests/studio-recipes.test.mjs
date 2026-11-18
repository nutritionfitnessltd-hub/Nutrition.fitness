import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeImage,recipePreview} from '../server/studio-recipes.mjs';
import {validateShape} from '../server/studio-model.mjs';
import {library,itemPage} from '../server/studio-pages.mjs';

test('published recipes show photos and full methods without inventing unknown timings or nutrition',()=>{
 const r={id:'website-recipe:fixture',kind:'recipe',title:'Fixture recipe',status:'Approved',revision:1,publication:{status:'published'},fields:{servings:2,prepMinutes:null,cookMinutes:0,imageUrl:'/assets/cookbook/recipe-001.webp',ingredients:[{sourceText:'100 g beans',quantity:100,name:'beans'}],instructions:['Rinse the beans.'],nutrition:null,allergenNote:'Check labels.',recipeSource:'Source book'}};
 validateShape('recipe',r.fields);
 const data={actor:{role:'admin'},items:[r],byId:new Map([[r.id,r]]),assigned:new Set(),projects:[],people:[],tasks:[]};
 const card=library(new URLSearchParams({bucket:'published',kind:'recipe'}),data);
 assert.match(card,/<img src="\/assets\/cookbook\/recipe-001.webp"/);
 const html=itemPage(new URLSearchParams({id:r.id}),data);
 assert.match(html,/100 g beans/);assert.match(html,/Rinse the beans/);assert.match(html,/Nutrition figures are not available/);
 assert.doesNotMatch(html,/Preparation: 0|id="studio-editor"/);assert.match(html,/Cooking: 0/);
 assert.match(itemPage(new URLSearchParams({id:r.id,tab:'edit'}),data),/id="studio-editor"/);
 const unsafe={...r,title:'<script>bad</script>',fields:{...r.fields,imageUrl:'https://untrusted.example/image.jpg',instructions:['<script>bad</script>']}};
 assert.equal(recipeImage(unsafe),'');assert.doesNotMatch(recipePreview(unsafe),/<script>|untrusted.example/);
 assert.throws(()=>validateShape('recipe',{prepMinutes:'unknown'}));
});
