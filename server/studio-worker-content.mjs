export const workerNames={nina:'Nina',imogen:'Imogen',marcus:'Marcus',rory:'Rory',nigel:'Nigel',martina:'Martina',andy:'Andy',alex:'Alex'};
const workerKey=value=>typeof value==='string'&&Object.hasOwn(workerNames,value.toLowerCase())?value.toLowerCase():'';

export function contentWorker(record,byId=new Map(),seen=new Set()){
  if(!record||seen.has(record.id))return '';
  seen.add(record.id);
  // An explicit assignment, including "none", wins over inherited attribution.
  if(Object.hasOwn(record,'workerId'))return workerKey(record.workerId);
  for(const value of [record.workerSource?.workerId,record.workerSource?.worker,record.fields?.production?.worker,record.fields?.workerId,record.fields?.worker]){
    const id=workerKey(value);if(id)return id;
  }
  if(record.parent){const id=contentWorker(byId.get(record.parent),byId,seen);if(id)return id;}
  // Compatibility for Nina's original connector articles, which predate named attribution.
  if(record.workerSource?.system==='Content Manager connector'&&record.workerSource.kind==='article')return 'nina';
  return '';
}
export function workerContent(data,worker){
  return data.items.filter(r=>!['settings','worker-request'].includes(r.kind)&&r.status!=='Archived'&&
    (data.actor.role==='admin'||data.assigned.has(r.id))&&contentWorker(r,data.byId)===worker)
    .sort((a,b)=>(b.updatedAt||b.workerSource?.receivedAt||'').localeCompare(a.updatedAt||a.workerSource?.receivedAt||'')||a.title.localeCompare(b.title));
}
