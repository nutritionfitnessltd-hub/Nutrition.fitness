// Shared detection without pulling the HTML renderer into model validation.
export const isNewsletter = r => r?.kind==='communication' && typeof r.fields?.emailHtml==='string' && !!r.fields.emailHtml.trim();
export const isNewsletterContent = r => isNewsletter(r)||r?.kind==='newsletter'||r?.kind==='communication'&&/\bnewsletter\b/i.test([r.workerSource?.kind,r.fields?.channel,r.fields?.type,r.fields?.contentType,r.title].filter(Boolean).join(' '));
export const newsletterDraftDue = (r,revision,now=Date.now()) => isNewsletterContent(r)&&r.status==='Approved'&&r.approval?.revision===revision&&r.ghlDraftPlan?.revision===revision&&['queued','scheduled'].includes(r.ghlDraftPlan.state)&&Date.parse(r.ghlDraftPlan.scheduledAt)<=now;
