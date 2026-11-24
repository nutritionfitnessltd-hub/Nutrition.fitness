import {randomUUID} from 'node:crypto';
export function taskFixture(){
 const admin={id:randomUUID(),name:'James',role:'admin'},owner={id:randomUUID(),name:'Kasia',role:'staff',access:{work:true,edit:true}},staff={id:randomUUID(),name:'Joyce',role:'staff',access:{work:true,edit:true}},outsider={id:randomUUID(),name:'Other',role:'staff',access:{work:true,edit:true}};
 const people=[admin,owner,staff,outsider].map(p=>({...p,email:p.name.toLowerCase()+'@example.com'}));
 const project={id:randomUUID(),name:'Supplement launch',created_by:admin.id,creator_id:owner.id,revision:1,weeks:1,status:'Planning',studio:{type:'blank'},entries:[{id:randomUUID(),title:'Confirm sourcing',notes:'Check prices and delivery.',kind:'Task',week:0,status:'To do',assignee:staff.id}]};
 const assignment={id:randomUUID(),title:'Prepare product photos',instructions:'Prepare the first set.',staff_id:staff.id,created_by:admin.id,record_id:'assignment:example',status:'To do',revision:1};
 const rows=new Map([['studio:notifications',{id:'studio:notifications',revision:1,payload:{id:'studio:notifications',kind:'settings',fields:{tasksEnabled:true,enabled:false,reviewers:[]}}}]]),requests=[];
 const api=async(endpoint,options={})=>{
  const u=new URL(endpoint,'https://example.test'),q=u.searchParams;
  if(endpoint.includes('rpc/nufi_studio_save')){const p=options.payload,old=rows.get(p.item);if((old?.revision||0)!==p.expected)return [];const row={id:p.item,revision:p.expected+1,payload:structuredClone(p.document)};rows.set(row.id,row);return [structuredClone(row)];}
  if(endpoint.includes('nufi_studio_items')){const id=q.get('id');return [...rows.values()].filter(r=>!id||id==='not.like.studio:notification:*'?!id||!r.id.startsWith('studio:notification:'):id==='eq.'+r.id).map(r=>structuredClone(r));}
  if(endpoint.includes('nufi_library_staff')){const ids=q.get('id')?.slice(3).replace(/[()]/g,'').split(',');return people.filter(p=>!ids||ids.includes(p.id));}
  if(endpoint.includes('nufi_library_projects')){
   if(q.get('id')&&q.get('id')!=='eq.'+project.id)return [];
   if(options.method==='PATCH'){if(q.get('revision')!=='eq.'+project.revision)return [];Object.assign(project,structuredClone(options.payload));}
   return [structuredClone(project)];
  }
  if(endpoint.includes('nufi_library_tasks')){
   if(q.get('id')&&q.get('id')!=='eq.'+assignment.id||q.get('staff_id')&&q.get('staff_id')!=='eq.'+assignment.staff_id)return [];
   if(options.method==='PATCH'){if(q.get('revision')!=='eq.'+assignment.revision)return [];Object.assign(assignment,options.payload);}
   return [structuredClone(assignment)];
  }
  return [];
 };
 const env={EXCHANGE_TENANT_ID:'tenant',EXCHANGE_CLIENT_ID:'client',EXCHANGE_CLIENT_SECRET:'test-only'};
 const fetcher=async(url,options)=>{requests.push({url,options});return url.includes('/token')?new Response(JSON.stringify({access_token:'test-token'})):new Response(null,{status:202});};
 const data=(actor=admin)=>({actor,projects:[structuredClone(project)],tasks:[structuredClone(assignment)],people,items:[],byId:new Map(),assigned:new Set()});
 const params=(standalone=false)=>new URLSearchParams({studio:'task',...(standalone?{task:assignment.id}:{project:project.id,entry:project.entries[0].id})});
 return {admin,owner,staff,outsider,people,project,assignment,rows,requests,api,env,fetcher,data,params,load:async()=>({records:[],files:{}})};
}
