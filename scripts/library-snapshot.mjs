import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { list, put } from '@vercel/blob';

const [command, workspaceArg, liveArg, outputArg] = process.argv.slice(2);
if (!['prepare','publish'].includes(command) || !workspaceArg || !liveArg || !outputArg) throw new Error('Use prepare|publish WORKSPACE LIVE_INDEX PRIVATE_OUTPUT');
const workspace=await realpath(workspaceArg);
const out=path.resolve(outputArg);
const repo=await realpath(process.cwd());
if (!path.relative(repo,out).startsWith('..'+path.sep) || out===repo) throw new Error('Use a private output directory outside the website repository.');
const publicDir=path.join(workspace,'ContentManager','public');
const libraryDir=path.join(workspace,'Nutrition.Fitness Content');
const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.mp4':'video/mp4','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const data=name=>json(path.join(workspace,'ContentManager','data',name+'.json'));
const files={}, paths={}, byPath=new Map();
function within(root,file){const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
async function attach(record,candidate,cover=false){
  if(!candidate || !types[path.extname(candidate).toLowerCase()]) return;
  let file;
  try{file=await realpath(candidate);}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return;throw e;}
  if(!within(publicDir,file)&&!within(libraryDir,file))return;
  let id=byPath.get(file);
  if(!id){
    const info=await stat(file);if(!info.isFile())return;
    const hash=createHash('sha256');
    for await(const chunk of createReadStream(file))hash.update(chunk);
    id=hash.digest('hex');
    files[id]={name:path.basename(file),type:types[path.extname(file).toLowerCase()],size:info.size};
    paths[id]=file;byPath.set(file,id);
  }
  if(cover)record.image=id;
  else if(!record.files.includes(id))record.files.push(id);
}
function publishedFile(url){
  if(typeof url!=='string'||!/^\/(downloads|covers|training-assets)\//.test(url)||url.includes('..'))return;
  return path.join(publicDir,url);
}
const hidden=/^(_|source|author|comment|reviewer|internal|audit|prompt|evidence|workflow|development|livePublishing|rightsNotes|origin|localPath|relativePath|path$|id$|schemaVersion|visualInspection|fileName|filename|spreadsheet|workbook|worksheet|drive|contact|emailAddress|owner|credential|password|token|secret|privateKey)/i;
function clean(value){
  if(typeof value==='string'){
    if(/https?:\/\/|file:\/\/|[a-z]:[\\/]|\\\\|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value))return undefined;
    return value.trim()||undefined;
  }
  if(Array.isArray(value)){const items=value.map(clean).filter(x=>x!==undefined);return items.length?items:undefined;}
  if(value&&typeof value==='object'){const pairs=Object.entries(value).filter(([k])=>!hidden.test(k)).map(([k,v])=>[k,clean(v)]).filter(([,v])=>v!==undefined);return pairs.length?Object.fromEntries(pairs):undefined;}
  if(typeof value==='number'||typeof value==='boolean')return value;
}
const trainingFields='purpose description audience outcome suitableFor entryCriteria exitCriteria frequencies frequency duration durationMin durationMax introduction warmup blocks cooldown coaching trainingGuidance equipment instructions cues mistakes progression caution shortVersion alternatives spacing restRules weeks busyWeek stageIds adjustmentRuleIds questions outcomes channel subject previewText headline body ctaLabel suggestedTiming expectations faqs altText usageNotes movement muscles secondaryMuscles effort notes durationMinutes distanceMetres trigger action exceptions explanation memberPromise levels phases monthlyCoachingRoadmap lessons messages levelWeeks weekStart weekEnd sessionDrafts programmeRules'.split(' ');
function pick(obj,keys){return Object.fromEntries(keys.map(k=>[k,clean(obj?.[k])]).filter(([,v])=>v!==undefined));}
async function prepare(){
  const live=await json(path.resolve(liveArg)),seed=await data('training-seed'),catalogue=await data('catalogue'),courses=await data('courses');
  const training=new Map(seed.map(x=>[x.id,x]));
  for(const r of live.refined.filter(x=>x.area==='training'))training.set(r.record.id,r.record);
  const records=[];
  const groups={programme:'Programmes',stage:'Training stages',structure:'Weekly plans',session:'Workouts',exercise:'Exercises',activity:'Activities',review:'Training reviews',rule:'Training guidance',learning:'Lessons',asset:'Training assets',campaign:'Marketing',communication:'Member emails and messages'};
  for(const item of live.areas.training){
    if(item.status==='archived')continue;
    const source=training.get(item.id);if(!source)throw new Error('Missing current training record '+item.id);
    const d=source.data;
    const parent=item.kind==='structure'?d.stageId:item.kind==='stage'||['asset','campaign','communication','learning'].includes(item.kind)?d.programmeId:null;
    const row={id:'training:'+item.id,group:groups[item.kind]||'Training',kind:item.kind,title:item.title,status:item.status,parent:parent?'training:'+parent:null,fields:pick(d,trainingFields),files:[]};
    if(d.path){await attach(row,publishedFile(d.path));if(/\.(png|jpe?g|webp)$/i.test(d.path))row.image=row.files[0];}
    records.push(row);
  }
  const byId=new Map(catalogue.assets.map(a=>[a.id,a]));
  const recipeFolders=new Map((await readdir(path.join(libraryDir,'Recipes'),{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>[d.name.split(' - ')[0],path.join(libraryDir,'Recipes',d.name)]));
  for(const item of live.areas.catalogue){
    const a=byId.get(item.id)||{};
    const row={id:'catalogue:'+item.id,title:item.title,kind:a.type||'Catalogue item',group:item.kind||'Catalogue',status:item.status,fields:pick(a,['collection','topic','pages']),files:[]};
    await attach(row,publishedFile(a.thumbnail),true);
    await attach(row,publishedFile(a.finalUrl));
    for(const c of Object.values(a.components||{})){await attach(row,publishedFile(c.downloadUrl));}
    if(a.localPath)await attach(row,a.localPath);
    const folder=recipeFolders.get(item.id);
    if(folder){
      for(const sub of ['01 Originals','02 Branded','03 Website Content']){
        const dir=path.join(folder,sub);let entries=[];
        try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
        for(const entry of entries.filter(v=>v.isFile())){
          const file=path.join(dir,entry.name);
          if(entry.name==='Canva source text.txt'){
            const text=(await readFile(file,'utf8')).split(/\r?\n\s*\r?\n/).slice(1).join('\n\n').split(/\r?\n/).filter(line=>!/(https?:\/\/|[A-Za-z]:\\|@[\w.-]+\.)/.test(line)).join('\n').trim();
            if(text)row.fields.recipeText=text;
          }else if(sub==='03 Website Content' && entry.name.endsWith('.json')){
            const recipe=await json(file);Object.assign(row.fields,pick(recipe,['description','yieldServings','prepMinutes','cookMinutes','ingredients','instructions','allergens']));
          }else{await attach(row,file);}
        }
      }
    }
    records.push(row);
  }
  for(const course of courses.courses){
    records.push({id:'course:'+course.name,title:course.name,group:'Courses',kind:'Course outline',status:'reference',files:[],fields:{modules:course.sections.map(s=>({title:s.title,lessons:s.entries.map(e=>byId.has(e.assetId)?'catalogue:'+e.assetId:e.title)}))}});
  }
  for(const {record} of live.refined.filter(x=>x.area==='drafts'))records.push({id:'draft:'+record.id,title:record.title,kind:record.kind,status:'draft',group:'Content drafts',files:[],fields:pick(record,['body','ingredients','method','servings','allergens'])});
  const index={version:1,asOf:live.at,records,files};
  await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'index.json.gz'),gzipSync(JSON.stringify(index)));
  await writeFile(path.join(out,'upload.json'),JSON.stringify(paths));
  console.log(JSON.stringify({records:records.length,files:Object.keys(files).length,bytes:Object.values(files).reduce((sum,f)=>sum+f.size,0),recipeTexts:records.filter(r=>r.fields.recipeText).length}));
}
async function publish(){
  const upload=await json(path.join(out,'upload.json'));
  const prefix='nutrition-library/v1/files/';
  const existing=new Set();let cursor;
  do{const page=await list({prefix,cursor});for(const blob of page.blobs)existing.add(blob.pathname);cursor=page.hasMore?page.cursor:undefined;}while(cursor);
  const items=Object.entries(upload);
  let completed=0;
  for(const [hash,file] of items){
    completed++;
    if(existing.has(prefix+hash))continue;
    // Upload exactly the bytes used by the published content address.
    const bytes=await readFile(file);
    if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('A source file changed. Prepare the index again.');
    await put(prefix+hash,bytes,{access:'private',addRandomSuffix:false,multipart:bytes.length>8*1024*1024});
    if(completed%10===0||completed===items.length)console.log('Uploaded '+completed+' of '+items.length+' files.');
  }
  await put('nutrition-library/v1/index.json.gz',await readFile(path.join(out,'index.json.gz')),{access:'private',allowOverwrite:true,addRandomSuffix:false,cacheControlMaxAge:60,contentType:'application/octet-stream'});
  console.log('Private library index published after all downloads.');
}
if(command==='prepare')await prepare();else await publish();
