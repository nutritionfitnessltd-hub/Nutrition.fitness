import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { platform, membership, verifiedUser, cookies, email, uuid, HttpError, session } from './platform.mjs';
import { signInProvisioned } from './provisioned-login.mjs';
import { esc, frame, link } from './library-shelves.mjs';
import { projectScreen, changeProject } from './library-projects.mjs';

const cookieName='__Host-nufi-library-work';
const route='/content-library/?work=1';
const statuses=['To do','In progress','Ready for review','Done'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const sign=(key,s)=>createHmac('sha256',key).update('library-work:v1:'+s).digest('base64url');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const service={service:true};
const staffTable='/rest/v1/nufi_library_staff';
const tasksTable='/rest/v1/nufi_library_tasks';
const field=(name,value)=>'<input type="hidden" name="'+name+'" value="'+esc(value)+'">';
const options=(items,current)=>items.map(v=>'<option'+(v===current?' selected':'')+'>'+esc(v)+'</option>').join('');
const personOptions=(staff,id)=>staff.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===id?' selected':'')+'>'+esc(s.name)+'</option>').join('');
const form=(action,inner,url=route)=>'<form method="post" action="'+url+'" class="edit-form">'+field('action',action)+inner+'</form>';
const post=(payload,prefer='return=representation')=>({service:true,method:'POST',headers:{Prefer:prefer},payload});
function writePage(res,status,body) {
  res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(frame({body,section:'Work assignments',work:true}));
}
function redirect(res,item) {
  res.statusCode=303;res.setHeader('Location',route+(item?'&item='+encodeURIComponent(item):''));res.end();
}
function setWorkCookie(res,value,seconds) {
  res.setHeader('Set-Cookie',cookieName+'='+value+'; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age='+seconds);
}
function issue(res,key,claims) {
  const expires=Math.floor(Date.now()/1000)+3600;
  const payload=Buffer.from(JSON.stringify({...claims,expires})).toString('base64url');
  setWorkCookie(res,payload+'.'+sign(key,payload),3600);
}
function signInPage(item,projectParams={}) {
  const target=link({work:'1',item,...projectParams});
  const credentials='<label>Email<input type="email" name="email" maxlength="254" autocomplete="username" required></label>';
  return '<h1>Work assignments</h1><div class="work-login"><section class="panel"><h2>Administrator</h2>'+form('admin-login',credentials+'<label>Website account password<input type="password" name="password" autocomplete="current-password" required></label><button class="primary">Open admin screen</button>',target)+'</section><section class="panel"><h2>My assignments</h2>'+form('staff-login',credentials+'<label>Personal work code<input type="password" name="code" maxlength="128" autocomplete="current-password" required></label><button>Open my queue</button>',target)+'</section></div>';
}
function readText(value,name,max,required=true) {
  if(typeof value!=='string'||(required&&!value.trim())||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new HttpError(400,'Check '+name+' and try again.');
  return value.trim();
}
function dueDate(s) {
  if(!s) return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new HttpError(400,'Choose a valid due date.');
  return s;
}
async function readActor(req,res,api,env,key) {
  const scoped={...env,NUFI_ACCOUNT_MANAGEMENT_READY:'true',NUFI_AUTH_MODE:'provisioned'};
  const jar=cookies(req),token=jar[cookieName]||'';
  if(token.length<1400){
    const [payload,mac]=token.split('.');
    if(payload&&same(sign(key,payload),mac)) {
      let claims;try{claims=JSON.parse(Buffer.from(payload,'base64url'));}catch{return null;}
      if(claims.expires>Date.now()/1000){
        if(claims.role==='admin'){
          const rows=await api('/rest/v1/nufi_members?user_id=eq.'+uuid(claims.id)+'&role=eq.admin&status=eq.active&select=user_id',service);
          if(rows.length)return {role:'admin',id:claims.id};
        }else if(claims.role==='staff'){
          const rows=await api(staffTable+'?id=eq.'+uuid(claims.id)+'&select=id,name,code_hash',service);
          if(rows[0]?.code_hash && same(sign(key,rows[0].code_hash),claims.generation))return {role:'staff',id:claims.id,name:rows[0].name};
        }
      }
    }
  }
  if(jar['__Host-nufi-access']||jar['__Host-nufi-refresh']){
    try{const current=await session(req,res,scoped);if(current.member?.role==='admin')return {role:'admin',id:current.user.id};}
    catch(e){if(![401,403].includes(e.status))throw e;}
  }
  return null;
}
async function login(fields,res,api,env,key) {
  const address=email(fields.email);
  if(fields.action==='admin-login'){
    const scoped={...env,NUFI_ACCOUNT_MANAGEMENT_READY:'true',NUFI_AUTH_MODE:'provisioned'};
    const result=await signInProvisioned(address,fields,api,scoped,res);
    const user=verifiedUser(result.user);
    const member=await membership(user,api,scoped);
    if(member?.role!=='admin')throw new HttpError(403,'An active website administrator account is required.');
    issue(res,key,{role:'admin',id:user.id});
  }else{
    const code=String(fields.code||'').trim();
    if(code.length<20||code.length>128)throw new HttpError(401,'Check your email and personal work code.');
    const rows=await api(staffTable+'?email=eq.'+encodeURIComponent(address)+'&select=id,code_hash',service);
    if(!rows[0]?.code_hash||!same(hash(code),rows[0].code_hash))throw new HttpError(401,'Check your email and personal work code.');
    issue(res,key,{role:'staff',id:rows[0].id,generation:sign(key,rows[0].code_hash)});
  }
}
function tasksMarkup(tasks,staff,actor) {
  if(!tasks.length)return '<p>No assignments match this view.</p>';
  return tasks.map(t=>{
    const who=staff.find(s=>s.id===t.staff_id)?.name||actor.name||'';
    const stateForm=form('update',field('id',t.id)+field('revision',t.revision)+'<label>Status<select name="status">'+options(statuses,t.status)+'</select></label><button>Save status</button>');
    return '<section class="task"><strong>'+esc(t.title)+'</strong><a href="'+link({item:t.record_id})+'">'+esc(t.record_title)+'</a><small>'+esc([who,t.due_date?'Due '+t.due_date:'',t.status].filter(Boolean).join(' · '))+'</small>'+(t.instructions?'<p>'+esc(t.instructions)+'</p>':'')+stateForm+'</section>';
  }).join('');
}
async function dashboard(params,api,actor,load) {
  const admin=actor.role==='admin', requested=params.get('staff')||'';
  const staff=admin?await api(staffTable+'?select=id,name,email&order=name.asc',service):[];
  const person=admin&&staff.some(s=>s.id===requested)?requested:'';
  const status=statuses.includes(params.get('status'))?params.get('status'):'';
  const page=Math.min(10000,Math.max(1,parseInt(params.get('page'))||1));
  const filter=(admin?(person?'&staff_id=eq.'+person:''):'&staff_id=eq.'+actor.id)+(status?'&status=eq.'+encodeURIComponent(status):'');
  const rows=await api(tasksTable+'?select=id,title,instructions,staff_id,record_id,record_title,due_date,status,revision&order=due_date.asc.nullslast,created_at.desc,id.asc&limit=31&offset='+((page-1)*30)+filter,service);
  let out='<div class="workbar"><h1>'+esc(admin?'Work assignments':actor.name+'’s assignments')+'</h1>'+form('work-logout','<button>Leave work screen</button>')+'</div><div class="panels">';
  out+='<section class="panel"><h2>Projects</h2><a class="btn" href="'+link({work:'1',projects:'1'})+'">'+(admin?'Create and manage projects':'Open my projects')+'</a></section>';
  if(admin){
    const q=(params.get('find')||'').trim().slice(0,160);
    const item=params.get('item');
    const index=q||item?await load():null;
    const selected=index?.records.find(r=>r.id===item);
    const found=q?index.records.filter(r=>r.title.toLowerCase().includes(q.toLowerCase())).slice(0,25):[];
    out+='<section class="panel"><h2>Assign work</h2><form class="workbar" action="/content-library/">'+field('work','1')+'<label>Find a library item<input type="search" name="find" value="'+esc(q)+'" required></label><button>Find content</button></form>';
    if(q)out+=found.length?'<ul>'+found.map(r=>'<li><a href="'+link({work:'1',item:r.id})+'">'+esc(r.title)+'</a> · '+esc(r.group)+'</li>').join('')+'</ul>':'<p>No matching library items.</p>';
    if(selected)out+='<h3>'+esc(selected.title)+'</h3>'+form('create',field('id',randomUUID())+field('item',selected.id)+'<label>Task<input name="title" maxlength="160" placeholder="What needs doing?" required></label><label>Assign to<select name="staff" required>'+personOptions(staff,person)+'</select></label><label>Due date (optional)<input type="date" name="due"></label><label>Instructions (optional)<textarea name="instructions" rows="3" maxlength="3000"></textarea></label><button class="primary">Create assignment</button>');
    out+='</section>';
  }
  out+='<section class="panel"><h2>'+esc(admin?'Assigned work':'My work')+'</h2><form class="workbar" action="/content-library/">'+field('work','1')+(admin?'<label>Assignee<select name="staff"><option value="">Everyone</option>'+personOptions(staff,person)+'</select></label>':'')+'<label>Status<select name="status"><option value="">All statuses</option>'+options(statuses,status)+'</select></label><button>Filter</button></form>'+tasksMarkup(rows.slice(0,30),staff,actor)+'<nav class="pages">'+(page>1?'<a href="'+link({work:'1',page:page-1,staff:person,status})+'">Previous</a>':'')+(rows.length>30?'<a href="'+link({work:'1',page:page+1,staff:person,status})+'">Next</a>':'')+'</nav></section>';
  if(admin)out+='<section class="panel"><h2>Team</h2>'+staff.map(s=>'<div class="team-row"><span><strong>'+esc(s.name)+'</strong><br>'+esc(s.email)+'</span>'+form('issue-code',field('staff',s.id)+'<button>Issue new work code</button>')+'</div>').join('')+'<details><summary>Add a colleague</summary>'+form('add-staff','<label>Name<input name="name" maxlength="100" required></label><label>Email<input name="email" type="email" required></label><button>Add colleague</button>')+'</details></section>';
  return out+'</div>';
}
async function change(actor,f,api,load) {
  if(f.action==='update'){
    const revision=Number(f.revision);
    if(!Number.isSafeInteger(revision)||revision<1||!statuses.includes(f.status))throw new HttpError(400,'Choose a valid task status.');
    const rows=await api(tasksTable+'?id=eq.'+uuid(f.id)+'&revision=eq.'+revision+(actor.role==='staff'?'&staff_id=eq.'+actor.id:''),{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{status:f.status,revision:revision+1}});
    if(!rows.length)throw new HttpError(409,'The assignment changed. Reopen the queue to see its current status.');
    return;
  }
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(f.action==='add-staff'){
    await api(staffTable,post({name:readText(f.name,'the name',100),email:email(f.email)}));return;
  }
  if(f.action==='issue-code'){
    const code=randomBytes(24).toString('base64url');
    const rows=await api(staffTable+'?id=eq.'+uuid(f.staff),{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{code_hash:hash(code)}});
    if(!rows.length)throw new HttpError(404,'Colleague not found.');
    return '<h1>Personal work code</h1><p>Share this code privately with '+esc(rows[0].name)+' at '+esc(rows[0].email)+'. They can enter it under My assignments. Issuing another code replaces this one.</p><p><code class="staff-code">'+esc(code)+'</code></p><a href="'+route+'">Return to work assignments</a>';
  }
  if(f.action!=='create')throw new HttpError(400,'Unknown work action.');
  const item=(await load()).records.find(r=>r.id===f.item);
  if(!item)throw new HttpError(400,'Choose an item in the library.');
  const data={id:uuid(f.id),created_by:actor.id,staff_id:uuid(f.staff),record_id:item.id,record_title:item.title,title:readText(f.title,'the task title',160),instructions:readText(f.instructions||'','the instructions',3000,false),due_date:dueDate(f.due)};
  await api(tasksTable+'?on_conflict=id',post(data,'resolution=ignore-duplicates,return=minimal'));
}
export async function handleLibraryWork(req,res,{env,load,params,apiFactory=platform}) {
  const item=params.get('item')||'';
  const projects=params.get('projects')==='1';
  const destination=projects?{projects:'1',...(params.get('project')?{project:params.get('project')}:{}),...(params.get('week')?{week:params.get('week')}:{})}:{};
  try {
    if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Use the work screen to continue.');
    const key=env.NUFI_LIBRARY_CATALOGUE_KEY;
    if(!key)throw new HttpError(503,'The work screen is being connected.');
    if(req.method==='POST' && req.headers.origin!=='https://'+req.headers.host)throw new HttpError(403,'Open the work screen to continue.');
    const f=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
    if(req.method==='POST'&&f.action==='work-logout'){setWorkCookie(res,'',0);return redirect(res);}
    const api=apiFactory(env);
    if(req.method==='POST'&&['admin-login','staff-login'].includes(f.action)){
      await login(f,res,api,env,key);
      if(projects){res.statusCode=303;res.setHeader('Location',route+'&'+new URLSearchParams(destination));return res.end();}
      return redirect(res,item);
    }
    const actor=await readActor(req,res,api,env,key);
    if(!actor)return writePage(res,401,signInPage(item,destination));
    if(projects){
      if(req.method==='GET')return writePage(res,200,await projectScreen(params,actor,api,load));
      const next=await changeProject(params,f,actor,api,load);
      res.statusCode=303;res.setHeader('Location',route+'&projects=1&'+new URLSearchParams(next));return res.end();
    }
    if(req.method==='POST'){
      const message=await change(actor,f,api,load);
      return message?writePage(res,200,message):redirect(res);
    }
    return writePage(res,200,await dashboard(params,api,actor,load));
  }catch(e){
    const status=e instanceof HttpError?e.status:503;
    return writePage(res,status,'<p role="alert">'+esc(e instanceof HttpError?e.message:'The work screen could not be loaded. Please try again shortly.')+'</p>'+(status===401?signInPage(item,destination):'<a href="'+link({work:'1',...destination})+'">Return to '+(projects?'projects':'work assignments')+'</a>'));
  }
}
