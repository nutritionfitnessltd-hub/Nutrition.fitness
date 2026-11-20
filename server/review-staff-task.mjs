import {ghlCampaignUrl} from './ghl-newsletter-client.mjs';
import {randomUUID} from 'node:crypto';
import {HttpError,uuid} from './platform.mjs';
import {esc,url,form,hidden,input,textarea,select} from './studio-ui.mjs';
import {isNewsletterContent} from './studio-newsletter-type.mjs';
const approved=r=>r.status==='Approved'&&r.approval?.revision===r.revision;
export function staffTaskPanel(r,data,retained={}){
 if(data.actor.role!=='admin'||!approved(r))return '';
 const newsletter=isNewsletterContent(r),title=(newsletter?'Prepare and publish in GHL: ':'Prepare approved library content: ')+r.title;
 const brief=newsletter?'Check the approved GHL draft, images, formatting, mobile layout and links. Confirm the sender, audience, personalisation, unsubscribe link and agreed send time. Send a test email and complete final checks before scheduling or publishing in GHL. Record the campaign link and outcome here.':'Keep the approved content in the library. Check its files, images, formatting and links, then complete the agreed delivery task. Do not publish externally without explicit instructions. Record the outcome and any delivery link.';
 return '<section data-staff-task'+(retained.action==='review-assign'?'':' hidden')+'><h3>Create staff task</h3><p>'+esc(newsletter?'Standard task: Prepare and publish in GHL.':'Standard task: Prepare approved library content.')+'</p>'+form('review-assign',hidden('revision',r.revision)+hidden('taskId',retained.taskId||randomUUID())+select('staff','Assign to',{'':'Choose a person',...Object.fromEntries(data.people.map(p=>[p.id,p.name]))},retained.staff||'')+input('taskTitle','Task name',retained.taskTitle||title.slice(0,160),'text','required maxlength="160"')+textarea('taskBrief','Instructions / checklist',retained.taskBrief||brief,5)+input('due','Due date (optional)',retained.due||'','date'),{section:'review-preview',id:r.id},'Create task')+'</section>';
}
export async function createReviewTask(f,r,data,api){
 if(data.actor.role!=='admin')throw new HttpError(403,'Only the administrator can assign approved work.');
 if(Number(f.revision)!==r.revision||!approved(r))throw new HttpError(409,'Approve the latest saved version before assigning its handoff.');
 const staff=uuid(f.staff),id=uuid(f.taskId);if(!data.people.some(p=>p.id===staff))throw new HttpError(400,'Choose a team member.');
 if(typeof f.taskTitle!=='string'||!f.taskTitle.trim()||f.taskTitle.length>160||typeof f.taskBrief!=='string'||f.taskBrief.length>2200)throw new HttpError(400,'Add a task name and keep the checklist within 2200 characters.');
 const due=f.due||'';if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due))throw new HttpError(400,'Choose a valid due date.');
 const marker='Approved content version: '+r.revision;
 const campaign=data.ghlDrafts?.get(r.id),ghl=campaign?'\nGHL draft: '+ghlCampaignUrl(campaign):'';
 const duplicate=(data.tasks||[]).find(t=>t.record_id===r.id&&t.staff_id===staff&&!['Done','Complete'].includes(t.status)&&t.instructions?.includes(marker));
 if(!duplicate)await api('/rest/v1/nufi_library_tasks?on_conflict=id',{service:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},payload:{id,staff_id:staff,created_by:data.actor.id,record_id:r.id,record_title:r.title,title:f.taskTitle.trim(),instructions:marker+'\nReview: https://team.nutrition.fitness'+url('review-preview',{id:r.id}).replaceAll('&amp;','&')+ghl+'\n\n'+f.taskBrief.trim()+'\n\nIf the approved version changes, stop and request fresh approval.',due_date:due||null}});
 return {section:'review-preview',id:r.id,reviewed:'assigned',record:r};
}
