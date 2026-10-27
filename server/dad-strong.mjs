/**
 * Dad Strong coaching journeys. All copy is a COACH-REVIEW DRAFT until the
 * named coach signs it off and the corresponding GHL WhatsApp template is approved.
 * This module is deterministic, channel-agnostic, and never speaks as an AI.
 */
import {HttpError,uuid} from './platform.mjs';

export const WEEK_FOCUS=Object.freeze([
  'This week is about starting small. Pick three realistic workout slots and protect them.',
  'Consistency beats perfection. Make your next workout easy to start.',
  'Family food, not diet food: plan two dinners everyone can enjoy.',
  'Four weeks in. Look at the habits you have built, not just the scales.',
  'We are building strength now. Log your workouts so we can spot progress.',
  'Halfway through. Tell your coach what is working and what needs changing.',
  'Life gets busy. Use your shorter backup sessions whenever you need them.',
  'Time for a personal challenge. Aim to beat your own starting point.',
  'Good routines survive ordinary weeks. Focus on what you can repeat.',
  'Think ahead: what will keep you active after your twelve weeks finish?',
  'Nearly there. Stay consistent rather than trying to do everything at once.',
  'Your final week. Take stock of your progress and celebrate the work you have put in.'
]);
export const EVENT_KINDS=new Set([
  'enrolled','week_started','weekly_checkin_due','weekly_checkin_submitted',
  'workout_completed','workouts_missed','group_call_reminder',
  'coach_feedback_approved','progress_report_ready','programme_completed'
]);
const asDate=value=>{const n=Date.parse(value);if(!Number.isFinite(n))throw new HttpError(400,'Invalid event date.');return n;};
const cleanNumber=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw new HttpError(400,'Invalid '+label+'.');return v;};
export function validateDadEvent(raw,now=Date.now()){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'Invalid coaching event.');
 const eventId=uuid(raw.eventId),memberId=uuid(raw.memberId),kind=raw.kind;
 if(!EVENT_KINDS.has(kind))throw new HttpError(400,'Unknown coaching event.');
 const occurredAt=new Date(asDate(raw.occurredAt)).toISOString();
 if(asDate(occurredAt)>now+300000||asDate(occurredAt)<now-7*86400000)throw new HttpError(400,'Event is outside the accepted time window.');
 const metrics={};
 if(raw.workoutCount!==undefined)metrics.workoutCount=cleanNumber(raw.workoutCount,0,500,'workout count');
 if(raw.missedCount!==undefined)metrics.missedCount=cleanNumber(raw.missedCount,0,20,'missed count');
 return {eventId,memberId,kind,occurredAt,metrics};
}
export function londonParts(when){
 const f=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',weekday:'short'});
 const p=Object.fromEntries(f.formatToParts(when).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),weekday:p.weekday};
}
function isoDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z')))throw new HttpError(503,'Member start date is invalid.');return Date.parse(value+'T00:00:00Z');}
export function cohortWeek(startDate,when){const diff=Math.floor((isoDay(londonParts(when).date)-isoDay(startDate))/86400000);return diff<0?0:Math.floor(diff/7)+1;}
export function dueWeeklyEvents(member,now=new Date()){
 const {weekday,hour}=londonParts(now),week=cohortWeek(member.start_date,now);
 if(week<1||week>12||member.status!=='active')return [];
 const events=[];
 if(weekday==='Mon'&&hour>=9)events.push({kind:'week_started',week});
 if(weekday==='Sun'&&hour>=17)events.push({kind:'weekly_checkin_due',week});
 return events;
}
const shortName=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,40):'there';
export function planDadEvent(event,member,now=new Date()){
 const week=event.week??cohortWeek(member.start_date,new Date(event.occurredAt));
 if((week<1||week>12)&&event.kind!=='enrolled'&&event.kind!=='programme_completed')return {messages:[],tasks:[]};
 const first=shortName(member.first_name),coach=shortName(member.coach_name);
 const messages=[],tasks=[];
 const message=(key,text,suffix=key)=>messages.push({dedup_key:`dad:${member.user_id}:${week}:${suffix}`,member_id:member.user_id,template_key:key,week,message_preview:text});
 const task=(kind,suffix=kind)=>tasks.push({dedup_key:`dad:${member.user_id}:${week}:${suffix}`,member_id:member.user_id,kind,week,status:'open'});
 switch(event.kind){
  case 'enrolled':
   message('dad_welcome',`Hi ${first}, welcome to Dad Strong! I'm ${coach}, your coach. Your first step is to complete onboarding in NUFI+ and book our 30-minute call. Looking forward to meeting you.`,'welcome');
   task('onboarding_review','onboarding');break;
  case 'week_started':
   message('dad_weekly_focus',`Morning ${first}! Week ${week} of Dad Strong: ${WEEK_FOCUS[week-1]} Open NUFI+ for your plan. — ${coach}`);break;
  case 'weekly_checkin_due':
   message('dad_checkin',`Hi ${first}, your weekly Dad Strong check-in is ready in NUFI+. Tell me what went well and where you need help. I'll review it personally. — ${coach}`);break;
  case 'weekly_checkin_submitted':
   task('coach_checkin_review');break;
  case 'workout_completed':
   if([3,10,20,30].includes(event.metrics?.workoutCount))
    message('dad_milestone',`Great work, ${first}! You've logged ${event.metrics.workoutCount} workouts in Dad Strong. Keep showing up. — ${coach}`,`workout-${event.metrics.workoutCount}`);
   break;
  case 'workouts_missed':
   if((event.metrics?.missedCount??0)>=2){
    message('dad_reset',`Hi ${first}, busy week? No need to catch up on everything. There is a shorter session in NUFI+ when life gets hectic. Reply if you'd like us to adjust the plan. — ${coach}`,'reset');
    if(event.metrics.missedCount>=3)task('coach_reengagement','reengagement');
   }break;
  case 'group_call_reminder':
   message('dad_group_call',`Hi ${first}, your Dad Strong group coaching call is coming up. Check NUFI+ for your group's link and time. Bring your questions! — ${coach}`);break;
  case 'coach_feedback_approved':
   message('dad_feedback_ready',`Hi ${first}, I've reviewed your check-in and left personal feedback for you in NUFI+. Have a look when you can. — ${coach}`);break;
  case 'progress_report_ready':
   message('dad_report_ready',`Hi ${first}, your progress review is ready in NUFI+. Let's look at how far you've come. — ${coach}`);break;
  case 'programme_completed':
   message('dad_graduation',`Well done, ${first} — you've reached the end of Dad Strong! Your final review and suggested next steps are in NUFI+. It's been a pleasure coaching you. — ${coach}`,'graduation');
   task('graduation_review','graduation');break;
 }
 if(!member.whatsapp_opt_in_at||member.paused||member.status!=='active')messages.length=0;
 return {messages,tasks};
}
