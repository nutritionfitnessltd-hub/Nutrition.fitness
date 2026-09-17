import {launchDate,workstreams,phases,tasks:seedTasks,team:seedTeam,decisions:seedDecisions} from './seed.js';
export {launchDate,workstreams,phases};
const KEY='nf_launch_control_v1';
const clone=x=>JSON.parse(JSON.stringify(x));
const initial={tasks:clone(seedTasks),team:clone(seedTeam),decisions:clone(seedDecisions),version:1};
function load(){try{const raw=localStorage.getItem(KEY);if(!raw)return clone(initial);const parsed=JSON.parse(raw);return parsed.tasks&&parsed.team&&parsed.decisions?parsed:clone(initial)}catch{return clone(initial)}}
export const state=load();
export const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
export const now=()=>new Date().toISOString();
export const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const ws=id=>workstreams.find(x=>x.id===id);
export const ph=id=>phases.find(x=>x.id===id);
export const statusLabel=s=>({todo:'To do',in_progress:'In progress',waiting:'Waiting',submitted:'Submitted',changes:'Needs changes',approved:'Approved',done:'Done'})[s]||s;
export const doneLike=t=>['approved','done'].includes(t.status);
export function formatDate(d){if(!d)return '—';return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(new Date(d+'T12:00:00'))}
export function daysUntil(d){const a=new Date();a.setHours(0,0,0,0);const b=new Date(d+'T00:00:00');return Math.ceil((b-a)/86400000)}
export const pct=(n,d)=>d?Math.round(n/d*100):0;
export const taskById=id=>state.tasks.find(t=>t.id===id);
export const ownerNames=()=>state.team.map(x=>x.name);
export const taskProgress=list=>pct(list.filter(doneLike).length,list.length);
export function dueClass(t){if(doneLike(t))return '';const n=daysUntil(t.due);if(n<0)return 'overdue';if(n<=3)return 'due-soon';return ''}
export function addActivity(t,text,by='James'){t.activity=t.activity||[];t.activity.unshift({at:now(),by,text})}
export function newTaskId(){const nums=state.tasks.map(t=>Number(t.id.replace('NF-',''))).filter(Number.isFinite);return 'NF-'+String(Math.max(...nums,0)+1).padStart(3,'0')}
export function resetPreview(){localStorage.removeItem(KEY);location.reload()}
