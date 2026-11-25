import {randomUUID} from 'node:crypto';
import {HttpError} from './platform.mjs';
import {cleanText} from './studio-model.mjs';

export const offeringSections=[
 ['offering','Offering brief',[
  ['Define the offering','Agree the audience, problem, outcome, format, inclusions, price and launch date. Record open decisions in the project brief.'],
  ['Approve the offering','Review the promise, evidence, pricing and scope before production begins.']]],
 ['build','Build the offering',[
  ['Create the product or service','Build the agreed offering and supporting resources. Add working file links to the task.'],
  ['Check delivery and quality','Check completeness, accuracy, accessibility and the customer delivery experience.']]],
 ['messaging','Messaging & creative',[
  ['Write the core messaging','Agree benefits, selling points, objections, tone and supporting evidence.'],
  ['Prepare launch creative','Create approved images, graphics and reusable copy for the page, emails and socials.']]],
 ['landing','Landing page',[
  ['Write the landing page','Include a headline, benefits, inclusions, evidence, pricing, FAQs and a clear call to action.'],
  ['Build and review the landing page','Add approved copy and creative; check mobile layout, accessibility, forms and links.']]],
 ['funnel','Sales funnel',[
  ['Map the customer journey','Document traffic source → landing page → purchase, booking or enquiry → confirmation → follow-up.'],
  ['Connect the funnel','Connect forms, contact tags, routing and automations. Check consent and unsubscribe behaviour where applicable.']]],
 ['emails','Emails',[
  ['Prepare the email sequence','Draft welcome, launch, reminder and follow-up emails. Include a lead magnet or waitlist only if needed.'],
  ['Test and approve emails','Check copy, personalisation, links, timing, audience, consent and unsubscribe links before scheduling.']]],
 ['socials','Socials',[
  ['Plan the social campaign','Choose channels and dates for teasers, education, launch, offering highlights, FAQs and reminders.'],
  ['Create and approve social content','Prepare captions, images and videos with a clear next action. Review before scheduling.'],
  ['Schedule the social campaign','Record publishing dates and post links; check destination URLs and tracking.']]],
 ['onboarding','Purchase & onboarding',[
  ['Set up the sales route','Configure checkout, booking or enquiry handling to match the selected sales route.'],
  ['Prepare customer onboarding','Set up confirmation, welcome instructions, delivery/access and customer support.'],
  ['Test the customer experience','Run a complete test from first visit to confirmation, delivery and support. Check failed and duplicate submissions.']]],
 ['launch','Launch checklist',[
  ['Set up measurement','Agree targets and configure lead, sale, conversion and revenue tracking appropriate to the sales route.'],
  ['Complete final launch approval','Check the offering, page, funnel, emails, socials, delivery and tracking. Record approval before going live.'],
  ['Go live and monitor','Publish only after approval. Check live links and the first customer journeys; record issues and owners.']]],
 ['results','Results & improvements',[
  ['Review launch results','Compare leads, sales, conversion and revenue with targets; collect customer feedback.'],
  ['Plan improvements','Record lessons, prioritise improvements and assign the next actions.']]],
];
export const offeringFields={offeringType:'Offering type / format',audience:'Who is it for?',outcome:'Customer outcome',price:'Price / pricing plan',salesRoute:'Sales route',decisions:'Decisions needed'};
export function offeringDetails(f){
 const out={};for(const key of Object.keys(offeringFields))out[key]=cleanText(f[key]||'',key==='decisions'?2000:500);
 if(out.salesRoute&&!['online','booking','enquiry'].includes(out.salesRoute))throw new HttpError(400,'Choose a valid sales route.');
 return out;
}
export function offeringTasks(sections){
 const selected=new Set(sections),tasks=[];let previous=[];
 for(const [key,label,rows] of offeringSections){
  if(!selected.has(key))continue;
  const current=rows.map(([title,notes])=>({id:randomUUID(),title:label+': '+title,notes,dependsOn:[...previous]}));
  // Tasks within a section can run together; the next stage waits for this section.
  previous=current.map(t=>t.id);tasks.push(...current);
 }
 return tasks;
}
