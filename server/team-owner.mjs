// A directory entry is not a login: preserve the administrator's existing auth.
export async function includeAdministrator(api,actor,people){
 if(actor.role!=='admin'||people.some(p=>p.id===actor.id))return people;
 const user=await api('/auth/v1/admin/users/'+encodeURIComponent(actor.id),{service:true});
 if(user?.id!==actor.id||typeof user.email!=='string')return people;
 const email=user.email.toLowerCase();
 if(people.some(p=>p.email?.toLowerCase()===email))return people;
 const name=String(user.user_metadata?.full_name||user.user_metadata?.name||'James Calam').trim().slice(0,100);
 const rows=await api('/rest/v1/nufi_library_staff?on_conflict=id',{service:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},payload:{id:actor.id,name,email}});
 return [...people,...(Array.isArray(rows)?rows:[])];
}
