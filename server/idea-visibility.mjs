// Team memberships come from administrator-managed team profiles, never request fields.
export const isIdea = r => r?.kind === 'settings' && r.id?.startsWith('studio:idea:');
export const ideaScope = r => r.fields?.visibility || 'personal';
export function ideaTeams(records) {
 const teams=new Map();
 for(const r of records)if(r.id.startsWith('studio:team-profile:')&&r.fields?.team?.trim())teams.set(r.id.slice('studio:team-profile:'.length),r.fields.team.trim());
 return teams;
}
export function canSeeIdea(actor,r,teams=new Map()) {
 if(!isIdea(r)||!['admin','staff'].includes(actor?.role))return false;
 const scope=ideaScope(r),owner=r.fields?.ownerId;
 if(scope==='personal')return owner?owner===actor.id:actor.role==='admin';
 if(scope==='company')return true;
 return scope==='team'&&Boolean(r.fields.team)&&teams.get(actor.id)?.toLowerCase()===r.fields.team.toLowerCase();
}
export const canManageIdea=(actor,r)=>Boolean(r)&&(r.fields?.ownerId?r.fields.ownerId===actor.id:actor.role==='admin');
