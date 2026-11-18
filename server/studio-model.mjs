import { HttpError } from './platform.mjs';

export const kinds = {
  programme:'Training programme', stage:'Training stage', structure:'Weekly schedule', session:'Workout',
  exercise:'Exercise', activity:'Activity or drill', recipe:'Recipe', mealplan:'Meal plan',
  course:'Course', lesson:'Lesson', article:'Knowledge Centre article', ebook:'Book', leadmagnet:'Lead magnet', challenge:'Challenge',
  communication:'Coaching message', campaign:'Marketing content', workflow:'GHL workflow',
  asset:'Creative asset', rule:'Progression rule', review:'Check-in', learning:'Learning content'
};
export const states=['Draft','In review','Changes requested','Approved','Archived'];
export const templates={
  programme:{name:'Training programme',description:'Stages, workouts, demonstrations and coaching.',kind:'programme'},
  challenge:{name:'Challenge',description:'A weekly journey with training, food and encouragement.',kind:'challenge'},
  course:{name:'Course',description:'Lessons, practical activities and supporting resources.',kind:'course'},
  mealplan:{name:'Recipe collection or meal plan',description:'Choose recipes and prepare the supporting material.',kind:'mealplan'},
  campaign:{name:'Marketing campaign',description:'Landing page, emails, social posts and creative briefs.',kind:'campaign'},
  custom:{name:'Your idea',description:'Describe the outcome and build a project around it.',kind:'article'}
};
export function blankFields(kind){
  const fields={
    programme:{purpose:'',audience:'',outcome:'',weeks:12,scheduleIds:[]},
    stage:{description:'',entryCriteria:'',exitCriteria:'',weeks:12,frequencies:[3,4,5],equipment:[],stageNotes:''},
    structure:{frequency:3,spacing:'',restRules:'',weeks:[{number:1,title:'',message:'',progression:'',sessionIds:[]}],busyWeek:{explanation:'',sessionIds:[]}},
    session:{introduction:'',duration:45,warmup:[''],blocks:[{type:'exercise',referenceId:'',sets:3,repMin:8,repMax:12,restSeconds:90,effortType:'RIR',effortValue:3,notes:''}],cooldown:['']},
    exercise:{aliases:[],movement:'',muscles:[],equipment:[],instructions:[''],cues:[''],mistakes:[],easierId:'',harderId:'',alternatives:[],media:{videoUrl:'',thumbnailUrl:'',status:'missing'}},
    activity:{type:'',effort:'',notes:'',durationMinutes:0,distanceMetres:0,workSeconds:0,restSeconds:0,repetitions:1},
    recipe:{servings:1,ingredients:[''],instructions:[''],prepMinutes:0,cookMinutes:0,nutrition:{calories:'',protein:'',carbohydrates:'',fat:'',basis:'per serving',source:''},allergens:[],imageUrl:'',sourceText:''},
    mealplan:{introduction:'',days:[{day:1,title:'',recipeIds:[]}],shoppingList:[],notes:''},
    course:{audience:'',outcome:'',introduction:'',lessonIds:[]},
    lesson:{introduction:'',body:'',takeaway:'',activity:'',videoUrl:''},
    article:{introduction:'',body:'',takeaway:''},
    leadmagnet:{audience:'',purpose:'',headline:'',introduction:'',contentIds:[],callToAction:''},
    ebook:{bookType:'Guide',introduction:'',chapters:[{title:'',body:''}],coverUrl:''},
    challenge:{audience:'',outcome:'',weeks:6,introduction:'',programmeIds:[],recipeIds:[]},
    communication:{channel:'WhatsApp',trigger:'',timing:'',subject:'',body:'',callToAction:'',replyPaths:[{reply:'',response:'',nextStep:''}]},
    campaign:{channel:'Email',audience:'',headline:'',body:'',callToAction:'',assetIds:[]},
    workflow:{trigger:'',audience:'',steps:[{timing:'',channel:'WhatsApp',messageId:'',reply:'',nextStep:''}],exitCondition:''},
    asset:{type:'Image',brief:'',dimensions:'',altText:'',url:'',sourceRecordId:''},
    rule:{instructions:'',repeatWhen:'',progressWhen:''},review:{questions:[''],nextStep:''},learning:{body:'',takeaway:''}
  };
  return structuredClone(fields[kind] || fields.article);
}
export function cleanText(value,max=4000){
  if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new HttpError(400,'Check the text length and try again.');
  return value.trim();
}
export function validateFields(value,depth=0){
  if(depth>16)throw new HttpError(400,'The content is nested too deeply.');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(typeof value==='string'){cleanText(value,100000);return;}
  if(Array.isArray(value)){if(value.length>500)throw new HttpError(400,'Use up to 500 entries in a section.');value.forEach(v=>validateFields(v,depth+1));return;}
  if(value&&typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(k)||k.length>100)throw new HttpError(400,'Invalid content field.');
      validateFields(v,depth+1);
    }
    return;
  }
  throw new HttpError(400,'Check the content fields.');
}
export function validateShape(kind,fields){
  const expected=blankFields(kind);
  for(const [key,sample] of Object.entries(expected)){
    if(!Object.hasOwn(fields,key))continue;
    const value=fields[key];
    const matches=Array.isArray(sample)?Array.isArray(value):sample&&typeof sample==='object'?value&&typeof value==='object'&&!Array.isArray(value):typeof sample===typeof value;
    if(!matches)throw new HttpError(400,'Check the format of '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
  }
}
export function canonical(record){
  const mapped=({draft:'Draft',review:'In review',approved:'Approved',archived:'Archived'})[record.status]||record.status;
  return {...record,status:states.includes(mapped)?mapped:'Draft',revision:0,
    kind:record.kind==='Individual recipe'?'recipe':record.kind,fields:record.fields||{},sourceId:record.id};
}
export function references(record,byId){
  const ids=new Set();
  function walk(value){
    if(typeof value==='string'){
      if(byId.has(value))ids.add(value);
      else if(byId.has('training:'+value))ids.add('training:'+value);
    }else if(Array.isArray(value))value.forEach(walk);
    else if(value&&typeof value==='object')Object.values(value).forEach(walk);
  }
  walk(record.fields);ids.delete(record.id);return [...ids];
}
export function descendants(start,records){
  const byId=new Map(records.map(r=>[r.id,r])),children=new Map();
  for(const r of records){if(!children.has(r.parent))children.set(r.parent,[]);children.get(r.parent).push(r.id);}
  const seen=new Set(),queue=[...start];
  while(queue.length){
    const id=queue.pop();if(seen.has(id))continue;seen.add(id);
    const record=byId.get(id);if(record)queue.push(...references(record,byId),...(children.get(id)||[]));
  }
  return seen;
}
export function issues(record,records){
  const d=record.fields||{},out=[],present=v=>Array.isArray(v)?v.some(present):typeof v==='string'?!!v.trim():Boolean(v);
  const required={
    programme:['purpose','audience'],stage:['entryCriteria','exitCriteria'],structure:['spacing','weeks'],
    session:['warmup','blocks','cooldown'],exercise:['movement','equipment','instructions','cues'],
    recipe:['ingredients','instructions'],course:['outcome'],lesson:['body'],article:['body'],
    communication:['channel','trigger','timing','body'],campaign:['body'],workflow:['trigger','steps'],asset:['brief']
  };
  for(const key of required[record.kind]||[])if(!present(d[key]))out.push('Add '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
  if(record.kind==='programme'&&!((record.id==='training:nufi365'&&d.weeks===52)||[4,6,8,12].includes(d.weeks)))out.push('Choose a programme length of 4, 6, 8 or 12 weeks. NUFI365 remains 52 weeks.');
  if(record.kind==='exercise'&&!d.media?.videoUrl)out.push('Add a demonstration video.');
  if(record.kind==='recipe'&&!(Number(d.servings)>0))out.push('Confirm servings.');
  if(record.kind==='session'){
    for(const [i,b] of (d.blocks||[]).entries()){
      if(!records.some(r=>r.id===b.referenceId||r.id==='training:'+b.referenceId))out.push('Choose an exercise or activity for block '+(i+1)+'.');
      if(b.type==='exercise'&&(!(b.sets>0)||!(b.repMin>0||b.durationSeconds>0||b.distanceMetres>0)))out.push('Complete the working targets for block '+(i+1)+'.');
    }
  }
  if(record.source?.needsChecking)out.push('Compare the imported content with its source and confirm the check.');
  return [...new Set(out)];
}
export function makeProjectPlan(kind,weeks){
  const entries=[{week:0,kind:'Creative asset',title:'Hero image and cover',notes:'Prepare the programme image, cover and accessible image description.'},
    {week:0,kind:'Welcome content',title:'Welcome and what to expect',notes:'Explain the outcome, equipment, weekly commitment and where to get help.'}];
  const focus={programme:'Workouts and progression',challenge:'Training, food and weekly action',course:'Lesson and practical activity',mealplan:'Recipes and shopping list',campaign:'Campaign copy and creative',custom:'Weekly content'};
  for(let week=1;week<=weeks;week++){
    entries.push({week,kind:'Content to create',title:focus[kind]+' · Week '+week,notes:week===1?'Establish the starting point and explain the first useful action.':week===weeks?'Review progress and explain the next step.':'Build on the previous week with a clear purpose and manageable next step.'});
    entries.push({week,kind:'PT WhatsApp message',title:'Coaching check-in · Week '+week,notes:'Tie the message to this week’s content. Include a reply for doing well and a reply for needing support.'});
  }
  entries.push({week:0,kind:'Marketing content',title:'Launch email and social posts',notes:'Explain who this is for, what is included and how to start.'});
  return entries.map(e=>({...e,status:'To do',record:null,assignedAsset:false}));
}
