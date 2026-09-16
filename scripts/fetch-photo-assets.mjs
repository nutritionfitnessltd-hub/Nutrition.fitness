import fs from 'node:fs/promises';
const articles=JSON.parse(await fs.readFile('src/knowledge-centre/articles.json','utf8'));
const images=articles.filter(a=>a.image?.startsWith('https://images.unsplash.com/')).map(a=>({id:`knowledge-${a.id}`,url:a.image,alt:a.imageAlt,credit:a.imageCredit,creditUrl:a.imageCreditUrl}));
images.push({id:'programme-build',url:'https://images.unsplash.com/photo-1641337221253-fdc7237f6b61',alt:'A man holding a dumbbell in a gym',credit:'Luke Witter / Unsplash',creditUrl:'https://unsplash.com/photos/k47w6BeapCs'});
images.push({id:'programme-bike',url:'https://images.unsplash.com/photo-1681295692824-b2e2ec762c52',alt:'Two people cycling on a road',credit:'Tuvalum / Unsplash',creditUrl:'https://unsplash.com/photos/RGHlH2p08zg'});
for(const [id,photo,alt] of [
 ['programme-swim','1530549387789-4c1017266635','Swimming in a pool'],
 ['recipe-oats','1517673400267-0251440c45dc','An illustrative breakfast bowl'],
 ['recipe-yogurt','1488477181946-6428a0291777','An illustrative fruit and yogurt dish'],
 ['recipe-cookies','1499636136210-6f4ee915583e','Illustrative homemade cookies'],
 ['recipe-chilli','1547592180-85f173990554','An illustrative bowl of food'],
 ['recipe-balls','1511381939415-e44015466834','Illustrative chocolate ingredients']
])images.push({id,url:`https://images.unsplash.com/photo-${photo}`,alt,credit:'Unsplash photography',creditUrl:'https://unsplash.com/license'});
await fs.mkdir('public/assets/photos',{recursive:true});
const results=[];
for(let i=0;i<images.length;i+=5)await Promise.all(images.slice(i,i+5).map(async item=>{
 const u=new URL(item.url);u.searchParams.set('fm','jpg');u.searchParams.set('w','1400');u.searchParams.set('q','85');const file=`public/assets/photos/${item.id}.jpg`;
 try{const bytes=await fs.readFile(file);if(bytes.length>1000&&bytes[0]===255&&bytes[1]===216){results.push({...item,file,status:'downloaded'});return;}}catch{}
 let error;
 for(let attempt=0;attempt<3;attempt++)try{const r=await fetch(u,{signal:AbortSignal.timeout(25000)});if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw new Error(`HTTP ${r.status}`);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<1000||bytes[0]!==255||bytes[1]!==216)throw new Error('Invalid JPEG');await fs.writeFile(file,bytes);results.push({...item,file,status:'downloaded'});console.log('Saved',item.id,bytes.length);return;}catch(e){error=e.message;await new Promise(r=>setTimeout(r,500*(attempt+1)));}
 results.push({...item,file,status:'failed',error});console.warn('Image unavailable:',item.id,error);
}));
results.sort((a,b)=>a.id.localeCompare(b.id));await fs.writeFile('public/assets/photos/manifest.json',JSON.stringify(results,null,2));
console.log('Available',results.filter(r=>r.status==='downloaded').length,'of',results.length,'photographs.');
if(results.some(r=>r.status==='failed'))throw new Error('Required photography could not be retrieved. No incomplete image build will be published.');
