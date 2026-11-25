import {randomUUID} from 'node:crypto';
export function messageFixture(){
 const admin={role:'admin',id:randomUUID(),name:'Alex Morgan'},staff={role:'staff',id:randomUUID(),name:'Sam Taylor',access:{}},other={role:'staff',id:randomUUID(),name:'Robin Lee',access:{}},outsider={role:'admin',id:randomUUID(),name:'Casey Jones'};
 const people=[admin,staff,other,outsider].map(p=>({...p,email:p.name.split(' ')[0].toLowerCase()+'@example.test',created_at:'2025-01-01T00:00:00.000Z'}));
 const rows=new Map(),calls=[];let conflict=null;
 const api=async(endpoint,options={})=>{
  calls.push({endpoint,options});const q=new URL(endpoint,'https://fixture.invalid').searchParams;
  if(endpoint.startsWith('/rest/v1/nufi_team_threads')){
   const id=q.get('id')?.slice(3);
   if(options.method==='POST'){
    if(rows.has(options.payload.id))return [];
    const row=structuredClone(options.payload);rows.set(row.id,row);return [structuredClone(row)];
   }
   if(options.method==='PATCH'){
    if(conflict){const action=conflict;conflict=null;await action(rows.get(id));return [];}
    const row=rows.get(id);if(!row||q.get('revision')!=='eq.'+row.revision)return [];
    Object.assign(row,structuredClone(options.payload));return [structuredClone(row)];
   }
   if(id)return rows.has(id)?[structuredClone(rows.get(id))]:[];
   const member=q.get('or')?.match(/member_ids\.cs\.\{([^}]+)\}/)?.[1];
   return [...rows.values()].filter(r=>!member||r.member_ids.includes(member)||r.payload.kind==='announcements').slice(Number(q.get('offset')||0),Number(q.get('offset')||0)+Number(q.get('limit')||500)).map(r=>structuredClone(q.get('select')?.includes('payload:summary')?{...r,payload:r.summary}:r));
  }
  if(endpoint.startsWith('/rest/v1/nufi_library_staff'))return people.slice(Number(q.get('offset')||0),Number(q.get('offset')||0)+500).map(p=>structuredClone(p));
  if(endpoint.includes('/rpc/nufi_studio_save'))return [{revision:1,payload:options.payload.document}];
  return [];
 };
 const send=(body='Hello',extra={})=>({action:'message-send',messageId:randomUUID(),body,...extra});
 return {admin,staff,other,outsider,people,rows,calls,api,send,conflict:fn=>{conflict=fn;}};
}
