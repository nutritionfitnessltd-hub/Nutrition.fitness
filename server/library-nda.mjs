import { createHash } from 'node:crypto';
import { esc, link } from './library-shelves.mjs';
import { HttpError, email, text, uuid } from './platform.mjs';

const table='/rest/v1/nufi_library_nda_acceptances';
const service={service:true};
const identityFilter=actor=>'actor_role=eq.'+encodeURIComponent(actor.role)+'&actor_id=eq.'+encodeURIComponent(actor.id);
const ownUrl=params=>'/content-library/?'+new URLSearchParams([...params].filter(([k])=>!['nda','receipt'].includes(k)));
const agreementHtml=value=>'<div class="nda-document">'+value.split('\n\n').map(p=>{const lines=p.split('\n');return /^\d+\. /.test(lines[0])?'<h2>'+esc(lines.shift())+'</h2><p>'+esc(lines.join('\n')).replaceAll('\n','<br>')+'</p>':'<p>'+esc(p).replaceAll('\n','<br>')+'</p>';}).join('')+'</div>';
function shell(body){return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Confidentiality agreement | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/library-nda.css"></head><body class="studio"><main class="nda-shell"><a class="brand" href="/content-library/"><b>nutrition</b>.fitness</a>'+body+'</main></body></html>';}
function render(res,status,body){res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(shell(body));}
function download(res,value){res.statusCode=200;res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="Nutrition-fitness-confidentiality-agreement.txt"');res.end(value);}
function receiptText(r){return r.document_text+'\n\nACCEPTANCE RECORD\nName: '+r.full_name+'\nEmail: '+r.email+'\nIdentity: '+r.identity_basis+'\nAccepted (UTC): '+r.accepted_at+'\nReceipt: '+r.id+'\nDocument SHA-256: '+r.document_hash+'\n';}
async function currentAgreement(api){
  const rows=await api('/rest/v1/nufi_library_nda_agreements?active=eq.true&select=version,document_text,document_hash&limit=1',service);
  const document=rows?.[0];
  if(!document||typeof document.version!=='string'||!/^[a-zA-Z0-9.-]{1,80}$/.test(document.version)||typeof document.document_text!=='string'||document.document_text.length<40||document.document_text.length>60000||createHash('sha256').update(document.document_text).digest('hex')!==document.document_hash)throw new Error('Agreement unavailable');
  return document;
}
async function accepted(api,actor,ndaHash){const rows=await api(table+'?'+identityFilter(actor)+'&document_hash=eq.'+ndaHash+'&select=*&limit=1',service);if(!Array.isArray(rows))throw new Error('NDA lookup unavailable');return rows[0];}
async function accountEmail(api,actor){
  if(actor.role==='staff'){const rows=await api('/rest/v1/nufi_library_staff?id=eq.'+uuid(actor.id)+'&select=email',service);return email(rows[0]?.email);}
  const user=await api('/auth/v1/admin/users/'+uuid(actor.id),service);return email(user.email);
}
export async function requireLibraryNda(req,res,{actor,api,params}){
  // Called only after authentication; never trust posted actor IDs, times or document text.
  try{
    const {version:ndaVersion,document_text:ndaText,document_hash:ndaHash}=await currentAgreement(api);
    const record=await accepted(api,actor,ndaHash);
    if(params.get('nda')==='copy'&&req.method==='GET'){download(res,record?receiptText(record):ndaText);return true;}
    const fields=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
    const accepting=req.method==='POST'&&fields.action==='accept-nda';
    if(record&&!accepting)return false;
    let error='',status=200;
    if(accepting){
      if(req.headers.origin!=='https://'+req.headers.host)throw new HttpError(403,'Open the agreement on the workspace to continue.');
      try{
        if(fields.document_hash!==ndaHash||fields.version!==ndaVersion)throw new HttpError(409,'The agreement has changed. Please read this version before accepting.');
        if(fields.agree!=='1')throw new HttpError(400,'Tick the agreement checkbox if you agree to these terms.');
        const fullName=text(fields.full_name,'your full name',120);
        const address=actor.role==='guest'?email(fields.email):await accountEmail(api,actor);
        if(!record)await api(table+'?on_conflict=actor_role,actor_id,document_hash',{service:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},payload:{actor_role:actor.role,actor_id:actor.id,full_name:fullName,email:address,identity_basis:actor.role==='guest'?'Guest details (self-declared)':'Authenticated '+actor.role+' account',agreement_version:ndaVersion,document_hash:ndaHash,document_text:ndaText}});
        // Confirm durable persistence before granting any access, even on a repeated submit.
        if(!record&&!await accepted(api,actor,ndaHash))throw new Error('Acceptance was not saved');
        res.statusCode=303;res.setHeader('Location',ownUrl(params));res.end();return true;
      }catch(e){if(!(e instanceof HttpError))throw e;error=e.message;status=e.status;}
    }else if(req.method!=='GET'){error='Please accept the confidentiality agreement before using the workspace. Your change has not been saved.';status=403;}
    const action=esc(ownUrl(params));
    render(res,status,'<h1>Before you enter</h1><p>Please read and accept this confidentiality agreement to access the Nutrition.fitness content workspace.</p><p><a href="'+action+(params.size?'&amp;':'')+'nda=copy">Download the agreement</a> · Version '+ndaVersion+'</p>'+agreementHtml(ndaText)+(error?'<p role="alert">'+esc(error)+'</p>':'')+'<form method="post" action="'+action+'" class="nda-accept"><input type="hidden" name="action" value="accept-nda"><input type="hidden" name="version" value="'+ndaVersion+'"><input type="hidden" name="document_hash" value="'+ndaHash+'"><label>Your full name<input name="full_name" autocomplete="name" maxlength="120" required value="'+esc(typeof fields.full_name==='string'?fields.full_name.slice(0,120):'')+'"></label>'+(actor.role==='guest'?'<label>Your email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><p class="meta">Guest details are self-declared. Team members should sign in with their individual account.</p>':'<p class="meta">This acceptance will be linked to your signed-in account.</p>')+'<label class="remember-me"><input type="checkbox" name="agree" value="1" required>I have read and agree to this confidentiality agreement. By typing my full name and selecting Accept and continue, I intend to sign it electronically.</label><button class="primary">Accept and continue</button></form><form method="post" action="/content-library/?work=1" class="nda-exit"><input type="hidden" name="action" value="work-logout"><button>Decline and sign out</button></form>');return true;
  }catch{
    render(res,503,'<h1>We could not check your agreement</h1><p>Please try again. Your content stays private until acceptance can be confirmed.</p><a href="'+esc(ownUrl(params))+'">Try again</a><form method="post" action="/content-library/?work=1"><input type="hidden" name="action" value="work-logout"><button>Sign out</button></form>');return true;
  }
}
export async function ndaAdminScreen(req,res,{actor,api,params}){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(req.method!=='GET')throw new HttpError(405,'Acceptance records cannot be edited.');
  const receipt=params.get('receipt');
  if(receipt){const rows=await api(table+'?id=eq.'+uuid(receipt)+'&select=*&limit=1',service);if(!rows[0])throw new HttpError(404,'Acceptance record not found.');download(res,receiptText(rows[0]));return null;}
  const {version:ndaVersion,document_text:ndaText}=await currentAgreement(api);
  const page=Math.max(1,Math.min(10000,parseInt(params.get('page'))||1));
  const rows=await api(table+'?select=id,actor_id,actor_role,full_name,email,identity_basis,agreement_version,accepted_at&order=accepted_at.desc,id.asc&limit=51&offset='+((page-1)*50),service);
  return '<h1>Confidentiality agreements</h1><p>Everyone must accept the current agreement before accessing private content. Team and administrator acceptance is linked to their individual account. Guest details are self-declared and apply to that guest session.</p><p>Current version: '+ndaVersion+' · <a href="'+link({work:'1',studio:'nda',nda:'copy'})+'">Download your agreement and receipt</a></p><details class="panel"><summary>Read the current agreement</summary>'+agreementHtml(ndaText)+'</details><p class="meta">These terms were drafted for Nutrition.Fitness UK Ltd and should be reviewed by your solicitor. Records preserve the wording accepted; changes require a new version and acceptance.</p><h2>Acceptance records</h2>'+(rows.length?'<ul class="studio-list">'+rows.slice(0,50).map(r=>'<li><div><strong>'+esc(r.full_name)+'</strong><br>'+esc(r.email)+'<br><small>'+esc(r.identity_basis)+' · '+esc(r.accepted_at)+' (UTC) · Version '+esc(r.agreement_version)+'</small></div><a href="'+link({work:'1',studio:'nda',receipt:r.id})+'">Download signed record</a></li>').join('')+'</ul>':'<p>No agreements have been accepted yet.</p>')+'<nav class="pages">'+(page>1?'<a href="'+link({work:'1',studio:'nda',page:page-1})+'">Previous</a>':'')+(rows.length>50?'<a href="'+link({work:'1',studio:'nda',page:page+1})+'">Next</a>':'')+'</nav>';
}
