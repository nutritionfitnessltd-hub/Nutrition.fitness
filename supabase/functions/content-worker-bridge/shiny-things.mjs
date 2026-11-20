import {DraftError} from './worker-drafts.mjs';
export const ideaPrefix='studio:idea:';
export const ideaPriorities=['urgent','soon','normal','someday'];
export const ideaStatuses=['Saved','Parked','With Morgan','Ready to review','Converting','Project created'];
export function ideaId(value){if(typeof value!=='string'||!/^studio:idea:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new DraftError(400,'Use the saved Shiny Things ID.');return value;}
function object(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new DraftError(400,'Use only the documented idea fields.');}
function text(value,max,required=false){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||required&&!value.trim())throw new DraftError(400,'Check the idea text and field lengths.');return value.trim();}
export function ideaResult(row,website,project){
 const r=row.payload,f=r.fields||{};
 return {id:row.id,url:website+'/content-library/?work=1&studio=shiny-things&id='+encodeURIComponent(row.id),revision:row.revision,title:r.title,description:f.summary||'',category:f.category||'',status:project?'Project created':f.state||'Saved',priority:ideaPriorities.includes(f.urgency)?f.urgency:'normal',updatedAt:row.updated_at,...(project?{projectUrl:website+'/content-library/?work=1&studio=project&project='+encodeURIComponent(project.id)}:{})};
}
export function ideaDocument(input,current){
 object(input,['id','revision','title','description','category','status','priority']);const id=ideaId(input.id);
 if(!Number.isSafeInteger(input.revision)||input.revision<0)throw new DraftError(400,'Provide the current revision.');
 if((current?.revision||0)!==input.revision)throw new DraftError(409,'This idea changed. Retrieve its latest revision before updating.');
 if(current&&(current.id!==id||current.payload.kind!=='settings'))throw new DraftError(404,'Idea not found.');
 const old=current?.payload||{},fields={...old.fields};
 if(fields.state==='Converting')throw new DraftError(409,'This idea is being converted to a project. Finish that in the board first.');
 if(input.status!==undefined&&!['Saved','Parked'].includes(input.status))throw new DraftError(400,'Set status to Saved or Parked. Morgan and project states are managed by the board.');
 if(input.priority!==undefined&&!ideaPriorities.includes(input.priority))throw new DraftError(400,'Choose urgent, soon, normal or someday.');
 const title=input.title===undefined?old.title:text(input.title,160,true);if(!title)throw new DraftError(400,'Add an idea title.');
 const description=input.description===undefined?fields.summary||'':text(input.description,6000),category=input.category===undefined?fields.category||'':text(input.category,100);
 const changed=current&&(title!==old.title||description!==(fields.summary||''));
 if(changed){delete fields.plan;delete fields.requestRevision;fields.state=fields.state==='Parked'?'Parked':'Saved';}
 return {...old,id,kind:'settings',title,status:old.status||'Draft',fields:{...fields,summary:description,category,weeks:fields.weeks||4,state:input.status||fields.state||'Saved',urgency:input.priority||fields.urgency||'normal'}};
}
export async function shinyAction(input,connection,api,website){
 if(connection.id!=='content-manager'||connection.namespace!=='worker:content-manager:')throw new DraftError(403,'This connection is not authorised for the administrator’s idea board.');
 object(input,['action','id','revision','title','description','category','status','priority','query','offset','limit']);
 const rowFor=async(id)=>(await api('/rest/v1/nufi_studio_items?select=*&id=eq.'+encodeURIComponent(ideaId(id))))[0];
 const projectFor=async(id)=>(await api('/rest/v1/nufi_library_projects?select=id&studio->>ideaId=eq.'+encodeURIComponent(id)+'&limit=1'))[0];
 if(input.action==='idea-list'){
  const offset=input.offset??0,limit=input.limit??25,query=input.query===undefined?'':text(input.query,300).toLowerCase();
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)throw new DraftError(400,'Use a limit between 1 and 50 and a nonnegative offset.');
  if(input.status!==undefined&&!ideaStatuses.includes(input.status)||input.priority!==undefined&&!ideaPriorities.includes(input.priority))throw new DraftError(400,'Choose a valid status or priority.');
  if(input.category!==undefined)text(input.category,100);
  const rows=[];for(let page=0;;page+=500){const batch=await api('/rest/v1/nufi_studio_items?select=*&id=like.studio:idea:*&order=id&limit=500&offset='+page);rows.push(...batch.filter(r=>r.payload?.kind==='settings'));if(batch.length<500)break;}
  const projects=[];for(let page=0;;page+=500){const batch=await api('/rest/v1/nufi_library_projects?select=id,studio&studio->>ideaId=not.is.null&order=id&limit=500&offset='+page);projects.push(...batch);if(batch.length<500)break;}
  const items=rows.map(r=>ideaResult(r,website,projects.find(p=>p.studio?.ideaId===r.id))).filter(r=>(!input.status||r.status===input.status)&&(!input.priority||r.priority===input.priority)&&(!input.category||r.category===input.category)&&(!query||[r.title,r.description,r.category].join(' ').toLowerCase().includes(query)));
  return {items:items.slice(offset,offset+limit),total:items.length,nextOffset:offset+limit<items.length?offset+limit:null};
 }
 if(input.action==='idea-get'){const row=await rowFor(input.id);if(!row||row.payload?.kind!=='settings')throw new DraftError(404,'Idea not found.');return ideaResult(row,website,await projectFor(row.id));}
 if(!['idea-create','idea-update'].includes(input.action))throw new DraftError(400,'Choose an available idea action.');
 const current=await rowFor(input.id);
 if(input.action==='idea-create'&&current)throw new DraftError(409,'This idea ID already exists. Retrieve it before deciding whether to update.');
 if(input.action==='idea-update'&&!current)throw new DraftError(404,'Idea not found.');
 if(await projectFor(input.id))throw new DraftError(409,'This idea is already linked to a project and is read only.');
 const {action,query,offset,limit,...values}=input;
 const document=ideaDocument({...values,revision:action==='idea-create'?0:values.revision},current);
 const rows=await api('/rest/v1/rpc/nufi_studio_save','POST',{item:document.id,expected:action==='idea-create'?0:input.revision,document,editor_name:'worker:'+connection.id});
 if(!rows.length)throw new DraftError(409,'This idea changed. Retrieve the saved entry before retrying.');
 return ideaResult(rows[0],website);
}
