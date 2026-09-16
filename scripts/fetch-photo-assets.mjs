import fs from 'node:fs/promises';
const articles=JSON.parse(await fs.readFile('src/knowledge-centre/articles.json','utf8'));
const images=articles.filter(a=>a.image?.startsWith('https://images.unsplash.com/')).map(a=>({id:`knowledge-${a.id}`,url:a.image,alt:a.imageAlt,credit:a.imageCredit,creditUrl:a.imageCreditUrl}));
images.push({id:'programme-build',url:'https://images.unsplash.com/photo-1641337221253-fdc7237f6b61?w=1400&q=85&fm=jpg',alt:'A man holding a dumbbell in a gym',credit:'Luke Witter / Unsplash',creditUrl:'https://unsplash.com/photos/k47w6BeapCs'});
await fs.mkdir('public/assets/photos',{recursive:true});
const results=[];
for(let i=0;i<images.length;i+=5) await Promise.all(images.slice(i,i+5).map(async item=>{
 const u=new URL(item.url);u.searchParams.set('fm','jpg');u.searchParams.set('w','1400');u.searchParams.set('q','85');
 const file=`public/assets/photos/${item.id}.jpg`;
 try { const r=await fetch(u,{signal:AbortSignal.timeout(25000)});if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw new Error(`HTTP ${r.status}`);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<1000)throw new Error('Invalid image');await fs.writeFile(file,bytes);results.push({...item,file,status:'downloaded'});console.log('Saved',item.id,bytes.length); }
 catch(e){results.push({...item,file,status:'failed',error:e.message});console.warn('Image unavailable:',item.id,e.message);}
}));
await fs.writeFile('public/assets/photos/manifest.json',JSON.stringify(results,null,2));
console.log('Downloaded',results.filter(r=>r.status==='downloaded').length,'photographs.');
