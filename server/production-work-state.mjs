export const workStates=['Not started','Running','Stopped','Blocked','Completed'];
export function productionWorkState(row,checkpoint,update={}){
 const matching=Boolean(checkpoint?.currentSourceId)&&String(checkpoint?.currentSourceId||'').replace(/^catalogue:/,'')===String(row.sourceId||'').replace(/^catalogue:/,'');
 const checkpointTime=Date.parse(checkpoint?.updatedAt||''),manualTime=Date.parse(update.at||'');
 const current=matching&&(!Number.isFinite(manualTime)||checkpointTime>=manualTime);
 const completedTime=Date.parse(row.completedAt||'');
 if(['Awaiting review','Approved','Saved to SharePoint'].includes(row.status)&&Number.isFinite(completedTime)&&(!matching||!Number.isFinite(checkpointTime)||completedTime>checkpointTime)&&(!Number.isFinite(manualTime)||completedTime>manualTime))return {label:'Completed',source:'Checked export saved; awaiting review or delivery',at:row.completedAt};
 if(current){
  if(['blocked','failed','error'].includes(checkpoint.status))return {label:'Blocked',source:'Production runner',at:checkpoint.updatedAt};
  if(['stopped','paused','cancelled','canceled'].includes(checkpoint.status))return {label:'Stopped',source:'Production runner',at:checkpoint.updatedAt};
  if(row.working)return {label:'Running',source:'Recent production checkpoint',at:checkpoint.updatedAt};
  if(checkpoint.status==='working')return {label:'Unconfirmed',source:'No recent checkpoint; running is not confirmed',at:checkpoint.updatedAt};
 }
 if(workStates.includes(update.workState))return {label:update.workState,source:'Reported update',at:update.at};
 if(row.working)return {label:'Running',source:'Recent production checkpoint',at:checkpoint?.updatedAt};
 if(['Awaiting review','Approved','Saved to SharePoint'].includes(row.status))return {label:'Completed',source:'Production complete; review and delivery shown separately',at:row.record?.updatedAt};
 return {label:row.status==='To do'?'Not started':'Unconfirmed',source:row.status==='To do'?'No work recorded':'No current running, stopped or blocked state has been reported',at:row.record?.updatedAt};
}
