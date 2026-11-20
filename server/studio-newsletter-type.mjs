// Shared detection without pulling the HTML renderer into model validation.
export const isNewsletter = r => r?.kind==='communication' && typeof r.fields?.emailHtml==='string' && !!r.fields.emailHtml.trim();
export const isNewsletterContent = r => isNewsletter(r)||r?.kind==='newsletter'||r?.kind==='communication'&&/\bnewsletter\b/i.test([r.fields?.channel,r.fields?.type,r.fields?.contentType,r.title].filter(Boolean).join(' '));
