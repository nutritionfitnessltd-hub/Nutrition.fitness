import {HttpError,email,uuid} from './platform.mjs';
import {esc,url,form,hidden,input,button} from './studio-ui.mjs';

export function teamEmailEditor(person,owner=false){
 if(owner)return '';
 return '<details class="team-profile-section"><summary>Edit email address</summary>'+form('team-email-save',hidden('staff',person.id)+hidden('accessRevision',person.access_revision||1)+input('email','Sign-in & notification email',person.email,'email','required maxlength="254"')+'<p class="meta">This updates the sign-in and notification address. Existing signed agreements keep their original details. Send a fresh welcome email after correcting an address.</p>',{section:'team',person:person.id},'Save email address')+'</details>';
}
export async function saveTeamEmail(f,actor,api){
 if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
 const id=uuid(f.staff);if(id===actor.id)throw new HttpError(400,'This editor is for team-member email addresses.');
 const address=email(f.email),revision=Number(f.accessRevision);
 if(!Number.isSafeInteger(revision)||revision<1)throw new HttpError(400,'Reopen the profile before saving the email address.');
 let rows;
 try{rows=await api('/rest/v1/nufi_library_staff?id=eq.'+id+'&access_revision=eq.'+revision,{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{email:address,access_revision:revision+1,access_updated_at:new Date().toISOString(),access_updated_by:actor.id}});}
 catch(e){if(e.status===409||e.code==='23505')throw new HttpError(409,'This email address is already in use. Choose a different address.');throw e;}
 if(!rows.length)throw new HttpError(409,'This profile changed. Reopen it before saving the email address.');
 return rows[0];
}
export async function loadTeamIdentity(api,actor,personId){
 if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
 const id=uuid(personId),role=id===actor.id?(actor.authRole||'admin'):'staff';
 const rows=await api('/rest/v1/nufi_library_nda_acceptances?actor_role=eq.'+role+'&actor_id=eq.'+id+'&select=id,actor_id,actor_role,full_name,postal_address,identity_received,identity_removed_at,accepted_at&order=accepted_at.desc,id.desc&limit=1',{service:true});
 return rows.find(r=>r.actor_id===id&&r.actor_role===role)||null;
}
export function teamIdentityPanel(receipt,unavailable=false){
 return '<section class="team-profile-section"><h2>Address &amp; ID</h2>'+(unavailable?'<p>Onboarding details could not be loaded. Refresh the profile to try again.</p>':!receipt?'<p>No address or ID has been submitted yet. These details appear here once onboarding is completed.</p>':'<dl class="team-identity-details"><dt>Full name supplied</dt><dd>'+esc(receipt.full_name||'Not supplied')+'</dd><dt>Address supplied</dt><dd style="white-space:pre-wrap">'+esc(receipt.postal_address||'Not collected for this agreement')+'</dd><dt>ID document</dt><dd>'+esc(receipt.identity_removed_at?'ID image removed':receipt.identity_received?'ID supplied — not verified':'Not supplied')+'</dd></dl><div class="studio-actions">'+(receipt.identity_received&&!receipt.identity_removed_at?button('View ID document',url('nda',{receipt:receipt.id,identity:'1'})):'')+button('View signed agreement',url('nda',{receipt:receipt.id}))+'</div>')+'</section>';
}
