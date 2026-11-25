const parts=(instant,timeZone)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
const epoch=p=>Date.UTC(p.year,p.month-1,p.day,p.hour||0,p.minute||0,p.second||0);
export function localInstant(date,time,zone,end=false){
 const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number),target=Date.UTC(year,month-1,day,hour,minute),offsets=new Set();
 for(let h=-36;h<=36;h+=6){const t=target+h*3600000;offsets.add(epoch(parts(t,zone))-t);}
 const candidates=[...offsets].map(offset=>target-offset).filter(t=>epoch(parts(t,zone))===target).sort((a,b)=>a-b);
 return candidates.length?(end?candidates.at(-1):candidates[0]):null;
}
const iso=t=>new Date(t).toISOString().slice(0,10);
export function upcomingHours(schedule,viewerZone,now=Date.now()){
 const today=parts(now,schedule.timeZone),midnight=Date.UTC(today.year,today.month-1,today.day),rows=[];let skipped=false;
 for(let offset=-1;offset<=8;offset++){
  const date=midnight+offset*86400000,index=(new Date(date).getUTCDay()+6)%7,day=schedule.days[index];if(!day)continue;
  const start=localInstant(iso(date),day.start,schedule.timeZone),end=localInstant(iso(date+(day.end<day.start?86400000:0)),day.end,schedule.timeZone,true);
  if(start===null||end===null){skipped=true;continue;}if(end<=now||start>=now+7*86400000)continue;
  const fmt=(t)=>new Intl.DateTimeFormat('en-GB',{timeZone:viewerZone,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t);
  rows.push({start,end,label:fmt(start)+' – '+fmt(end)});
 }
 return {rows:rows.sort((a,b)=>a.start-b.start),skipped};
}
