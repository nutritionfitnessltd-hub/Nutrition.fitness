// Cache database rows only, never an actor's permissions or rendered pages.
// Refresh with revision metadata, transferring bodies only for changed records.
const snapshots=new Map();
const generations=new Map();
const reads=new Map();
export async function sharedWorkspaceRead(scope,endpoint,headers,run){
  const key=scope+'\n'+(generations.get(scope)||0)+'\n'+endpoint+'\n'+JSON.stringify(headers);
  let pending=reads.get(key);
  if(!pending){pending=run().finally(()=>{if(reads.get(key)===pending)reads.delete(key);});reads.set(key,pending);}
  const value=await pending,copy=structuredClone(value);
  if(Array.isArray(copy)&&Number.isInteger(value.totalRows))Object.defineProperty(copy,'totalRows',{value:value.totalRows});
  return copy;
}
export function invalidateWorkspaceRows(scope){
  generations.set(scope,(generations.get(scope)||0)+1);
  for(const state of snapshots.values())if(state.scope===scope){state.expires=0;state.pending=null;}
}
export async function workspaceRows(api,url,readRows){
  const scope=api.workspaceScope;
  if(!scope)return readRows(api,url);
  const key=scope+'\n'+url,now=Date.now(),generation=generations.get(scope)||0;
  let state=snapshots.get(key);
  if(state?.rows&&!api.workspaceFresh&&state.expires>now)return structuredClone(state.rows);
  if(!state){state={scope};snapshots.set(key,state);while(snapshots.size>4)snapshots.delete(snapshots.keys().next().value);}
  if(!state.pending){const pending=(async()=>{
    let rows;
    if(!state.rows)rows=await readRows(api,url);
    else{
      const revisions=await readRows(api,url.replace('select=id,payload,revision,updated_at','select=id,revision,updated_at'));
      const old=new Map(state.rows.map(row=>[row.id,row]));
      const changed=revisions.filter(row=>old.get(row.id)?.revision!==row.revision||old.get(row.id)?.updated_at!==row.updated_at);
      const changedIds=new Set(changed.map(row=>row.id));
      const fresh=new Map();
      for(let i=0;i<changed.length;i+=40){
        const ids=changed.slice(i,i+40).map(row=>encodeURIComponent(JSON.stringify(row.id))).join(',');
        const batch=await readRows(api,'/rest/v1/nufi_studio_items?select=id,payload,revision,updated_at&order=id&id=in.('+ids+')');
        for(const row of batch)fresh.set(row.id,row);
      }
      rows=revisions.map(row=>fresh.get(row.id)||(!changedIds.has(row.id)?old.get(row.id):null)).filter(Boolean);
    }
    if((generations.get(scope)||0)===generation){state.rows=rows;state.expires=Date.now()+2000;}
    return rows;
  })().finally(()=>{if(state.pending===pending)state.pending=null;});state.pending=pending;}
  return structuredClone(await state.pending);
}
