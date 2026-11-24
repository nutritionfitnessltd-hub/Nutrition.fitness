// Retire an old generated training snapshot without deleting its source material.
// Later deliberate edits and newly created studio records are outside the reset.
const generatedKinds=new Set(['programme','programme-family','stage','structure','session','communication','campaign','asset','learning','review']);
export function applyProgrammeResets(records){
 const resets=[...records.values()].filter(r=>r.kind==='settings'&&r.fields?.programmeReset===true&&r.fields.active===true&&Number.isFinite(Date.parse(r.fields.cutoff)));
 for(const reset of resets){
  const cutoff=Date.parse(reset.fields.cutoff),explicit=new Set(reset.fields.recordIds||[]);
  for(const [id,record] of records){
   if(!(id.startsWith('training:')&&generatedKinds.has(record.kind)||explicit.has(id)))continue;
   if(record.updatedAt&&Date.parse(record.updatedAt)>cutoff)continue;
   if(record.status==='Archived')continue;
   records.set(id,{...record,status:'Archived',archivedAt:reset.fields.cutoff,archivedReason:'Previous generated programme material retired for a gradual rebuild.',archiveBatchId:reset.id});
  }
 }
 return records;
}

