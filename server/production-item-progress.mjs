import {esc} from './studio-ui.mjs';

const stages={queued:'Waiting for cloud preparation',preparing:'Preparation', 'ready-for-pc':'Ready for PC finishing',editing:'PC editor finishing',qa:'Final quality checks','awaiting-review':'Ready for review',blocked:'Blocked',finished:'Production finished','reference-only':'Reference / support item'};
const timeLabel=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(value))+' London time';
export function productionItemProgress(p,data,sourceId,now=Date.now()){
 const job=data.backgroundControls?.get(p.id)?.fields?.backgroundJob;
 if(job?.projectId!==p.id)return null;
 const key=String(sourceId||'').replace(/^catalogue:/,''),entry=job.itemProgress?.[key];
 const at=Date.parse(entry?.updatedAt||'');
 if(!entry||!Object.hasOwn(stages,entry.stage)||!['cloud','pc'].includes(entry.worker)||!Number.isFinite(at)||at>now)return null;
 return {sourceId:key,stage:entry.stage,label:stages[entry.stage],worker:entry.worker==='pc'?'PC worker':'Cloud worker',at,updatedAt:entry.updatedAt,note:typeof entry.note==='string'?entry.note.slice(0,1200):'',stale:['preparing','editing','qa'].includes(entry.stage)&&now-at>15*60*1000};
}
export function productionItemProgressHtml(progress){
 if(!progress)return '';
 return '<div class="tracker-item-progress" aria-label="Production progress"><p><b>'+esc(progress.label)+'</b> · '+esc(progress.worker)+(progress.stale?' · activity unconfirmed':'')+'</p>'+(progress.note?'<p>'+esc(progress.note)+'</p>':'')+'<small>Last reported: '+esc(timeLabel(progress.at))+'</small></div>';
}
export function latestProductionProgress(p,data,rows){
 const entries=rows.map(r=>productionItemProgress(p,data,r.sourceId)).filter(Boolean).sort((a,b)=>b.at-a.at);
 if(!entries.length)return '';
 const workers=['PC worker','Cloud worker'].map(worker=>entries.find(e=>e.worker===worker)).filter(Boolean);
 return '<section class="production-checkpoint" aria-label="Latest worker progress"><h2>Latest worker progress</h2>'+workers.map(e=>'<p><b>'+esc(e.worker)+'</b> · '+esc(e.sourceId)+' · '+esc(e.label)+(e.stale?' · activity unconfirmed':'')+'<br><small>'+esc(timeLabel(e.at))+'</small></p>').join('')+'<p class="meta">Stages show saved checkpoints, not a percentage estimate. Approval follows the checked content record.</p></section>';
}
