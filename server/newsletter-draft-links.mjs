import {ghlCampaignUrl} from './ghl-newsletter-client.mjs';
import {newsletterEligible} from './newsletter-sync-html.mjs';
import {esc} from './studio-ui.mjs';
export async function loadNewsletterDraftLinks(data,api){
 if(data.actor.role!=='admin')return;
 const rows=await api('/rest/v1/nufi_newsletter_sync?select=item_id,campaign_id:state->>campaignId&state->>campaignId=not.is.null',{service:true});
 data.ghlDrafts=new Map(rows.filter(r=>/^[a-zA-Z0-9_-]{1,100}$/.test(r.campaign_id||'')).map(r=>[r.item_id,r.campaign_id]));
}
export function newsletterDraftButton(data,record){
 const id=data.actor.role==='admin'&&newsletterEligible(record)&&data.ghlDrafts?.get(record.id);
 return id?'<a class="btn" href="'+esc(ghlCampaignUrl(id))+'" target="_blank" rel="noopener noreferrer">Open in GHL</a>':'';
}
