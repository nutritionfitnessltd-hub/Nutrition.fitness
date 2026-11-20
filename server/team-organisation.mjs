import {teamProfiles,teamAvatar} from './team-profiles.mjs';
import {esc,url,button,heading} from './studio-ui.mjs';

export function organisationMap(actor,staff,data){
  const members=teamProfiles(actor,staff,data),owner=members.find(m=>m.owner),visited=new Set();
  const card=m=>'<a class="org-card'+(m.owner?' org-owner':'')+'" data-team-open href="'+m.href+'"><span class="org-type'+(m.worker?' org-type-ai':'')+'">'+esc(m.type)+'</span>'+teamAvatar(m)+'<strong>'+esc(m.name)+'</strong><span class="org-role">'+esc(m.role)+'</span><span class="org-open">Edit profile <span aria-hidden="true">↗</span></span></a>';
  const branch=m=>{
    visited.add(m.key);const children=members.filter(c=>c.parent===m.key&&!visited.has(c.key));
    return '<li class="org-branch'+(children.length?' org-has-reports':'')+'">'+card(m)+(children.length?'<div class="org-report-label">Reports to '+esc(m.name)+'</div><ul class="org-reports">'+children.map(branch).join('')+'</ul>':'')+'</li>';
  };
  const tree=branch(owner),unplaced=members.filter(m=>!visited.has(m.key));
  return '<div class="team-directory organisation-directory">'+heading('Organisation map','Your team, at a glance. Open a profile to update their role.',button('Back to Team',url('team')))+
    '<div class="org-key"><span>'+members.filter(m=>!m.worker).length+' people</span><span>'+members.filter(m=>m.worker).length+' AI workers</span></div>'+
    '<section class="organisation-map" aria-label="Organisation reporting structure"><ul class="org-root">'+tree+'</ul></section>'+
    (unplaced.length?'<section class="org-unplaced"><h2>Reporting line needs setting</h2><p class="meta">Open a profile and choose who they report to.</p><div class="org-unplaced-grid">'+unplaced.map(card).join('')+'</div></section>':'')+'</div>';
}
