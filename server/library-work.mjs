import {teamWorkSnapshot,renderTeamPage,saveTeamProfile} from './studio-team.mjs';
import {hqRequest} from './studio-hq.mjs';
import { reviewOptions, accessOptions, accessFor, accessFromForm, canAccess, requireAccess } from './library-permissions.mjs';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { platform, membership, verifiedUser, cookies, email, uuid, HttpError } from './platform.mjs';
import { signInProvisioned, consumePasswordAttempt } from './provisioned-login.mjs';
import { esc, link } from './library-shelves.mjs';
import { projectScreen, changeProject } from './library-projects.mjs';

import { welcomePanel, sendWelcome, requestTeamReset } from './library-welcome.mjs';
import { libraryLogin } from './library-login.mjs';
import {verifyTeamPassword,readTeamPasswordLink,completeTeamPassword,teamPasswordPage} from './team-passwords.mjs';
import { requireLibraryNda, ndaAdminScreen } from './library-nda.mjs';
import { studioFrame } from './studio-ui.mjs';
import { handleStudio } from './studio.mjs';
import { accountPreview, workingCopy, copyResponse } from './account-preview.mjs';
import {myAccountScreen,changeMyAccount} from './my-account.mjs';
import { assetButton, assetScreen } from './library-assets.mjs';
import { displayEntry } from './library-display.mjs';

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
function writePage(res,status,body,actor,section='work') {
  res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(actor?studioFrame(body,section,actor):libraryLogin({error:'Please sign in to continue.'}));
}
function redirect(res,item) {
  res.statusCode=303;res.setHeader('Location',route+(item?'&item='+encodeURIComponent(item):''));res.end();
}
function setWorkCookie(res,value,seconds) {
  res.setHeader('Set-Cookie',cookieName+'='+value+'; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age='+seconds);
}
function issue(res,key,claims,remember=false) {
  const seconds=remember?30*24*60*60:3600;
  const expires=Math.floor(Date.now()/1000)+seconds;
  const payload=Buffer.from(JSON.stringify({...claims,expires})).toString('base64url');
  setWorkCookie(res,payload+'.'+sign(key,payload),seconds);
}
function signInPage(res,status,item,destination={},error='') {
  res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(libraryLogin({target:link({work:'1',item,...destination}),error}));
}
export function clearLibraryCookies(res){
  res.setHeader('Set-Cookie',[cookieName+'=; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age=0','__Host-nufi-library=; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=0']);
}
export async function libraryActor(req,res,env,apiFactory=platform){
  if(!cookies(req)[cookieName])return null;
  if(!env.NUFI_LIBRARY_CATALOGUE_KEY)return null;
  return readActor(req,res,apiFactory(env),env,env.NUFI_LIBRARY_CATALOGUE_KEY);
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
          const rows=await api(staffTable+'?id=eq.'+uuid(claims.id)+'&select=id,name,code_hash,access',service);
          if(rows[0]?.code_hash && same(sign(key,rows[0].code_hash),claims.generation))return {role:'staff',id:claims.id,name:rows[0].name,access:rows[0].access};
        }
      }
    }
  }
  return null;
}
async function login(fields,res,api,env,key) {
  const address=email(fields.email);
  await consumePasswordAttempt(address,api,env,res);
  const staff=fields.action==='admin-login'?[]:await api(staffTable+'?email=eq.'+encodeURIComponent(address)+'&select=id,code_hash',service);
  if(staff.length||fields.action==='staff-login'){
    const supplied=fields.password??fields.code;
    const code=typeof supplied==='string'?supplied.trim():'';
    if(await verifyTeamPassword(code,staff[0])){
      issue(res,key,{role:'staff',id:staff[0].id,generation:sign(key,staff[0].code_hash)},fields.remember==='1');return;
    }
    if(fields.action==='staff-login')throw new HttpError(401,'The email or password was not recognised, or this account is not enabled.');
  }
  const scoped={...env,NUFI_ACCOUNT_MANAGEMENT_READY:'true',NUFI_AUTH_MODE:'provisioned'};
  let result;
  try{result=await signInProvisioned(address,fields,api,scoped,res,{attemptConsumed:true});}
  catch(e){if([400,401].includes(e.status))throw new HttpError(401,'The email or password was not recognised, or this account is not enabled.');throw e;}
  const user=verifiedUser(result.user),member=await membership(user,api,scoped);
  if(member?.role!=='admin'){
    if(result.access_token)try{await api('/auth/v1/logout?scope=local',{method:'POST',access:result.access_token});}catch{}
    throw new HttpError(401,'The email or password was not recognised, or this account is not enabled.');
  }
  issue(res,key,{role:'admin',id:user.id},fields.remember==='1');
}
function accessFields(access){
  const current=accessFor({role:'staff',access});
  return field('accessVersion','1')+'<fieldset class="team-access"><legend>Access</legend><p class="meta">Tick what this person can use. Dashboard and their own signed agreement are always available. Review responsibilities are set separately below. Publishing and Settings remain administrator-only.</p><div class="team-access-grid">'+accessOptions.map(([key,title,description])=>'<label class="team-access-option"><input type="checkbox" name="access_'+key+'" value="1"'+(current[key]?' checked':'')+'><span><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></span></label>').join('')+'</div></fieldset><fieldset class="team-access"><legend>Review responsibilities</legend><p class="meta">Allow this person to approve or request changes when these content types are submitted. Requires Content library and Work access. Other people’s drafts stay private.</p><div class="team-access-grid">'+reviewOptions.map(([key,title])=>'<label class="team-access-option"><input type="checkbox" name="access_'+key+'" value="1"'+(current[key]?' checked':'')+'><span><strong>'+esc(title)+'</strong><small>Review submitted work and retain your review history.</small></span></label>').join('')+'</div></fieldset>';
}
async function teamScreen(api,actor,origin,env,params=new URLSearchParams(),fetcher=fetch){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  const [staff,data]=await Promise.all([api(staffTable+'?select=id,name,email,code_hash,access,access_revision&order=name.asc',service),teamWorkSnapshot(api)]);
  const target=link({work:'1',studio:'team'});
  const createMarkup=form('create-user','<label>Full name<input name="name" maxlength="100" required autocomplete="off"></label><label>Email<input name="email" type="email" maxlength="254" required autocomplete="off"></label>'+accessFields(null)+'<button class="primary">Create user</button>',target);
  const accessMarkup=s=>'<p>'+(s.code_hash?'Access enabled':'Access disabled or password not set')+'</p><div class="studio-actions">'+(s.code_hash?'<details class="team-welcome-details"><summary>Reset password</summary>'+welcomePanel(s,{origin,env,purpose:'reset'})+'</details>':form('issue-code',field('staff',s.id)+'<button>Enable account</button>',target))+(s.code_hash?form('disable-user',field('staff',s.id)+'<button>Disable access</button>',target):'')+'</div>'+form('save-access',field('staff',s.id)+field('accessRevision',s.access_revision||1)+accessFields(s.access)+'<div class="studio-actions"><button class="primary">Save access</button><button type="submit" name="previewAccount" value="yes" data-account-preview formaction="/content-library/?work=1&amp;studio=account-preview" formtarget="_blank" formnovalidate>Preview account ↗</button></div>',target)+(s.code_hash?'<details class="team-welcome-details"><summary>Send welcome details to '+esc(s.name)+'</summary>'+welcomePanel(s,{origin,env})+'</details>':'<p class="meta">Enable this account to prepare its welcome email and password setup link.</p>');
  let hqChat,hqError;
  if(params.get('worker'))try{hqChat=await hqRequest(env,{action:'chat',worker:params.get('worker')},fetcher);}catch(e){hqError=e.message;}
  return renderTeamPage({params,actor,staff,data,accessMarkup,createMarkup,hqChat,hqError});
}

function passwordResult(person,origin,env){
  return '<h1>Account ready</h1><p>Send the welcome email so '+esc(person.name)+' can choose their own password. No password is included in the email.</p><section class="panel"><p>Email: <strong>'+esc(person.email)+'</strong></p>'+welcomePanel(person,{origin,env})+'</section><a class="btn" href="'+link({work:'1',studio:'team'})+'">Back to Team & permissions</a>';
}
function tasksMarkup(tasks,staff,actor) {
  if(!tasks.length)return '<p>No assignments match this view.</p>';
  return tasks.map(t=>{
    const who=staff.find(s=>s.id===t.staff_id)?.name||actor.name||'';
    const stateForm=!canAccess(actor,'edit')?'':form('update',field('id',t.id)+field('revision',t.revision)+'<label>Status<select name="status">'+options(statuses,t.status)+'</select></label><button>Save status</button>');
    return '<section class="task"><strong>'+esc(t.title)+'</strong><a href="'+link({item:t.record_id})+'">'+esc(t.record_title)+'</a>'+(canAccess(actor,'sources')?assetButton(t.record_id):'')+'<small>'+esc([who,t.due_date?'Due '+t.due_date:'',t.status].filter(Boolean).join(' · '))+'</small>'+(t.instructions?'<p>'+esc(t.instructions)+'</p>':'')+stateForm+'</section>';
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
  if(canAccess(actor,'studio'))out+='<section class="panel"><h2>Content studio</h2><a class="btn primary" href="'+link({work:'1',studio:'home'})+'">Open content studio</a></section>';
  out+='<section class="panel"><h2>Projects</h2><a class="btn" href="'+link({work:'1',projects:'1'})+'">'+(admin?'Create and manage projects':'Open my projects')+'</a></section>';
  if(admin){
    out+='<section class="panel"><h2>Original assets</h2>'+assetButton('all','Browse original assets')+'</section>';
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
  if(admin)out+='<section class="panel"><a href="'+link({work:'1',studio:'team'})+'">Team & permissions</a></section>';
  return out+'</div>';
}
async function change(actor,f,api,load,origin,env) {
  if(f.action==='update'){
    requireAccess(actor,'work','edit');
    const revision=Number(f.revision);
    if(!Number.isSafeInteger(revision)||revision<1||!statuses.includes(f.status))throw new HttpError(400,'Choose a valid task status.');
    const rows=await api(tasksTable+'?id=eq.'+uuid(f.id)+'&revision=eq.'+revision+(actor.role==='staff'?'&staff_id=eq.'+actor.id:''),{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{status:f.status,revision:revision+1}});
    if(!rows.length)throw new HttpError(409,'The assignment changed. Reopen the queue to see its current status.');
    return;
  }
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(f.action==='create-user'){
    const password=randomBytes(24).toString('base64url');
    const person={id:randomUUID(),name:readText(f.name,'the name',100),email:email(f.email),code_hash:hash(password),access:accessFromForm(f)};
    try{await api(staffTable,post(person));}catch(e){if(e.status===409)throw new HttpError(409,'A team member with this email already exists. Use Reset password for that person.');throw e;}
    return passwordResult(person,origin,env);
  }
  if(f.action==='save-access'){
    const access=accessFromForm(f),revision=Number(f.accessRevision);
    if(!Number.isSafeInteger(revision)||revision<1)throw new HttpError(400,'Reopen the team settings before saving access.');
    const rows=await api(staffTable+'?id=eq.'+uuid(f.staff)+'&access_revision=eq.'+revision,{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{access,access_revision:revision+1,access_updated_at:new Date().toISOString(),access_updated_by:actor.id}});
    if(!rows.length)throw new HttpError(409,'This person’s access changed. Reopen Team & permissions before saving again.');
    return;
  }
  if(f.action==='disable-user'){
    const rows=await api(staffTable+'?id=eq.'+uuid(f.staff),{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{code_hash:null}});
    if(!rows.length)throw new HttpError(404,'Team member not found.');return;
  }
  if(f.action==='add-staff'){
    await api(staffTable,post({name:readText(f.name,'the name',100),email:email(f.email)}));return;
  }
  if(f.action==='issue-code'){
    const code=randomBytes(24).toString('base64url');
    const rows=await api(staffTable+'?id=eq.'+uuid(f.staff)+'&code_hash=is.null',{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{code_hash:hash(code)}});
    if(!rows.length)throw new HttpError(409,'This account is already enabled or has changed. Use its password reset email instead.');
    return passwordResult(rows[0],origin,env);
  }
  if(f.action!=='create')throw new HttpError(400,'Unknown work action.');
  const item=(await load()).records.find(r=>r.id===f.item);
  if(!item)throw new HttpError(400,'Choose an item in the library.');
  const data={id:uuid(f.id),created_by:actor.id,staff_id:uuid(f.staff),record_id:item.id,record_title:item.title,title:readText(f.title,'the task title',160),instructions:readText(f.instructions||'','the instructions',3000,false),due_date:dueDate(f.due)};
  await api(tasksTable+'?on_conflict=id',post(data,'resolution=ignore-duplicates,return=minimal'));
}
export async function handleLibraryWork(req,res,{env,load,params,apiFactory=platform,fetcher=fetch,copyActor}) {
  const origin='https://'+req.headers.host;
  const item=params.get('item')||'';
  const projects=params.get('projects')==='1';
  const asset=params.get('assets');
  const studio=params.get('studio');
  const destination=params.get('reader')==='1'?Object.fromEntries([...params].filter(([k])=>['reader','file','image','preview'].includes(k))):studio?Object.fromEntries([...params].filter(([k])=>['studio','id','project','week','source','template','kind','tab','category','schedule','view','contentKind','shelf','folder','item','from','progress','q','page','reader','file','image','preview','collection','bucket','bookType','build','worker','person'].includes(k))):asset?{assets:asset}:projects?{projects:'1',...(params.get('project')?{project:params.get('project')}:{}),...(params.get('week')?{week:params.get('week')}:{})}:{};
  let actor;
  const f=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
  const welcomeJson=req.method==='POST'&&['send-welcome','send-password-reset'].includes(f.action)&&req.headers.accept?.includes('application/json');
  const json=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');return res.end(JSON.stringify(value));};
  try {
    if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Use the work screen to continue.');
    const key=env.NUFI_LIBRARY_CATALOGUE_KEY;
    if(!key)throw new HttpError(503,'The work screen is being connected.');
    if(req.method==='POST' && req.headers.origin!=='https://'+req.headers.host)throw new HttpError(403,'Open the work screen to continue.');
    if(req.method==='POST'&&f.action==='work-logout'&&!params.has('accountPreview')&&!copyActor){clearLibraryCookies(res);res.statusCode=303;res.setHeader('Location','/content-library/');return res.end();}
    const api=apiFactory(env);
    if(params.has('teamPassword')){
      if(params.has('accountPreview')||copyActor)throw new HttpError(403,'Account changes are unavailable in a working copy.');
      // Keep token paths out of referrers without stripping Origin from native form POSTs.
      res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','strict-origin');
      res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
      const page=(status,options)=>{res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(teamPasswordPage(options));};
      if(params.get('teamPassword')==='forgot'){
        if(req.method==='GET')return page(200,{forgot:true});
        if(f.action!=='request-team-reset')return page(400,{forgot:true,error:'Request a password reset email to continue.'});
        try{await requestTeamReset(f.email,{api,env,res,fetcher});}
        catch(e){if(e.status===400||e.status===429)return page(e.status,{forgot:true,error:e.message});/* Do not disclose account existence or delivery state. */}
        return page(200,{forgot:true,requested:true});
      }
      const token=req.method==='POST'?f.token:params.get('token');let purpose;
      try{
        ({purpose}=await readTeamPasswordLink(token,api,env));
        if(req.method==='GET')return page(200,{token,purpose});
        if(f.action!=='complete-team-password')throw new HttpError(400,'Use the password form to continue.');
        await consumePasswordAttempt('team-password-complete:'+token.split('.')[1],api,env,res);
        await completeTeamPassword(f,api,env);clearLibraryCookies(res);
        return page(200,{done:true});
      }catch(e){return page(e instanceof HttpError?e.status:503,{...(purpose&&e.status===400?{token,purpose}:{}),error:e instanceof HttpError?e.message:'Your password could not be saved. Please request a new email.'});}
    }
    if(req.method==='POST'&&['sign-in','admin-login','staff-login'].includes(f.action)&&!params.has('accountPreview')&&!copyActor){
      await login(f,res,api,env,key);
      if(params.get('reader')==='1'){
        const next=Object.fromEntries([...params].filter(([k])=>['file','image','preview'].includes(k)));
        res.statusCode=303;res.setHeader('Location','/content-library/?'+new URLSearchParams(next));return res.end();
      }
      if(f.action==='sign-in'&&!projects&&!asset&&!studio){res.statusCode=303;res.setHeader('Location',route+'&studio=home');return res.end();}
      if(projects||asset||studio){res.statusCode=303;res.setHeader('Location',route+'&'+new URLSearchParams(destination));return res.end();}
      return redirect(res,item);
    }
    actor=copyActor||await readActor(req,res,api,env,key);
    if(!actor&&welcomeJson)return json(401,{error:'Sign in again before sending. Your welcome message is still here.'});
    if(!actor)return signInPage(res,401,item,destination);
    const ndaParams=params.has('accountPreview')?new URLSearchParams([...params].filter(([key])=>!['nda','receipt','identity','download'].includes(key))):params;
    if((!copyActor||req.method==='GET'&&params.has('nda'))&&await requireLibraryNda(req,res,{actor,api,params:copyActor?params:ndaParams}))return;
    if(params.has('accountPreview')){
      const id=params.get('accountPreview'),copy=await workingCopy(api,actor,id);
      if(req.method==='GET'&&params.get('copyStatus')==='1')return json(200,{access:copy.actor.access});
      if(req.method==='POST'&&f.action==='work-logout'){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><title>Working copy closed</title><h1>Working copy closed</h1><p>You can close this window. Your administrator account is still signed in.</p>');}
      // No external writes, account changes or paid generation from a copy.
      if(req.method==='POST'&&!['content-save','content-comment','content-review','workout-inline-save','workout-days-save','project-save','task-save','task-add','task-attach','update','content-create','import-preview','import-save'].includes(f.action))return writePage(copyResponse(res,id),403,'<p role="alert">This action is unavailable in the working copy.</p>',copy.actor,'home');
      const safeEnv=Object.fromEntries(['NUFI_LIBRARY_CATALOGUE_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SITE_URL'].filter(k=>env[k]).map(k=>[k,env[k]]));
      const next=new URLSearchParams(params);next.delete('accountPreview');
      return handleLibraryWork(req,copyResponse(res,id,copy.actor.access),{env:safeEnv,load,params:next,apiFactory:()=>copy.api,copyActor:copy.actor,fetcher:async()=>{throw new HttpError(403,'External actions are unavailable in the working copy.');}});
    }
    if(studio==='account'){
      if(req.method==='POST'){
        if(copyActor)throw new HttpError(403,'Account changes are unavailable in the working copy.');
        const result=await changeMyAccount(f,{actor,api,env,res});
        if(result.saved==='password')issue(res,key,{role:actor.role,id:actor.id,...(result.codeHash?{generation:sign(key,result.codeHash)}:{})});
        res.statusCode=303;res.setHeader('Location',route+'&studio=account&saved='+result.saved);return res.end();
      }
      return writePage(res,200,await myAccountScreen(actor,api,params,env,{copy:!!copyActor}),actor,'account');
    }
    if(studio==='nda'){
      const page=await ndaAdminScreen(req,res,{actor,api,params});
      if(page!==null)return writePage(res,200,page,actor,'nda');
      return;
    }
    if(studio==='account-preview'){
      if(req.method!=='POST')throw new HttpError(405,'Open account preview from the Team access form.');
      const destination=await accountPreview(f,{actor,api});
      res.statusCode=303;res.setHeader('Location',destination);res.setHeader('Cache-Control','private, no-store');return res.end();
    }
    if(studio==='team'){
      if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
      if(req.method==='POST'){
        if(['send-welcome','send-password-reset'].includes(f.action)){
          const purpose=f.action==='send-password-reset'?'reset':'setup';
          const result=await sendWelcome(f,{api,actor,env,origin,fetcher},purpose);
          if(welcomeJson)return json(200,{state:result.state,detail:result.detail});
          return writePage(res,200,'<h1>'+(purpose==='reset'?'Password reset email':'Welcome email')+'</h1>'+welcomePanel(result.person,{origin,env,draft:f,result,purpose})+'<a href="'+link({work:'1',studio:'team'})+'">Back to Team & permissions</a>',actor,'team');
        }
        if(f.action==='team-profile-save'){const staff=await api(staffTable+'?select=id,name,email&order=name.asc',service);await saveTeamProfile(f,actor,staff,await teamWorkSnapshot(api),api);res.statusCode=303;res.setHeader('Location',route+'&studio=team&person='+encodeURIComponent(f.staff));return res.end();}
        if(!['create-user','issue-code','disable-user','save-access'].includes(f.action))throw new HttpError(400,'Choose a team action.');
        const message=await change(actor,f,api,load,origin,env);
        if(message)return writePage(res,200,message,actor,'team');
        res.statusCode=303;res.setHeader('Location',route+'&studio=team'+(f.action==='save-access'?'&saved=access&person='+encodeURIComponent(f.staff):f.action==='disable-user'?'&person='+encodeURIComponent(f.staff):''));return res.end();
      }
      return writePage(res,200,(params.get('saved')==='access'?'<p role="status" class="panel">Access saved. The new settings apply on this person’s next request.</p>':'')+await teamScreen(api,actor,origin,env,params,fetcher)+'<script type="module" src="/team-account-preview.js"></script>',actor,'team');
    }
    if(studio)return handleStudio(req,res,{params,actor,api,load,env,fetcher});
    if(asset){
      requireAccess(actor,'originals','sources');
      if(req.method!=='GET')throw new HttpError(405,'Open the asset page to continue.');
      return writePage(res,200,await assetScreen(params,actor,api,load,id=>displayEntry(env,id)),actor);
    }
    if(projects){
      requireAccess(actor,'work');
      if(req.method==='POST')requireAccess(actor,'edit');
      if(req.method==='GET'&&actor.role==='staff') { res.statusCode=303;res.setHeader('Location',route+'&studio=projects');return res.end(); }
      if(req.method==='GET')return writePage(res,200,await projectScreen(params,actor,api,load),actor);
      const next=await changeProject(params,f,actor,api,load);
      res.statusCode=303;res.setHeader('Location',route+'&projects=1&'+new URLSearchParams(next));return res.end();
    }
    if(req.method==='POST'){
      const message=await change(actor,f,api,load,origin,env);
      return message?writePage(res,200,message,actor):redirect(res);
    }
    if(!params.has('assignments')&&!['item','find','staff','status','page'].some(k=>params.has(k)))return handleStudio(req,res,{params:new URLSearchParams({studio:'home'}),actor,api,load,env});
    requireAccess(actor,'work');
    return writePage(res,200,await dashboard(params,api,actor,load),actor);
  }catch(e){
    const status=e instanceof HttpError?e.status:503;
    const message=e instanceof HttpError?e.message:'The workspace could not complete this request. Please try again.';
    if(welcomeJson)return json(status,{error:message});
    if(!actor)return signInPage(res,status,item,destination,message);
    return writePage(res,status,'<p role="alert">'+esc(message)+'</p><a href="'+link({work:'1',...(asset?{}:destination)})+'">Return to the workspace</a>',actor,studio==='team'?'team':'work');
  }
}
