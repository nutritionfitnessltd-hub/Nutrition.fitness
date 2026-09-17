import {state,save} from './store.js';
import {renderOverview,renderTasks,renderTimeline,renderDecisions,renderTeam} from './views.js';
import {openTask,wireNewTask} from './task-ui.js';
const root=document.querySelector('#view-root');let activeView='overview';
const titles={overview:'Launch overview',tasks:'Master task register',timeline:'Launch timeline',decisions:'Decisions register',team:'Team & ownership'};
function refresh(){document.querySelector('#page-title').textContent=titles[activeView];const task=id=>openTask(id,refresh);if(activeView==='overview')renderOverview(root,task,setView);if(activeView==='tasks')renderTasks(root,task);if(activeView==='timeline')renderTimeline(root);if(activeView==='decisions')renderDecisions(root,save);if(activeView==='team')renderTeam(root,save)}
function setView(view){activeView=view;document.querySelectorAll('#main-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));refresh()}
document.querySelectorAll('#main-nav button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelector('#export-btn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`nutrition-fitness-launch-control-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)});
wireNewTask(refresh,setView);refresh();
