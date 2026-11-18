import { signedDetails, detailsForm, signatureMarkup, identityImage } from './library-nda-details.mjs';
import { createHash } from 'node:crypto';
import { esc, link } from './library-shelves.mjs';
import { HttpError, email, text, uuid } from './platform.mjs';

const table='/rest/v1/nufi_library_nda_acceptances';
const service={service:true};
const identityFilter=actor=>'actor_role=eq.'+encodeURIComponent(actor.role)+'&actor_id=eq.'+encodeURIComponent(actor.id);
const ownUrl=params=>'/content-library/?'+new URLSearchParams([...params].filter(([k])=>!['nda','receipt'].includes(k)));
const agreementHtml=value=>'<div class="nda-document">'+value.split('\n\n').map(p=>{const lines=p.split('\n');return /^\d+\. /.test(lines[0])?'<h2>'+esc(lines.shift())+'</h2><p>'+esc(lines.join('\n')).replaceAll('\n','<br>')+'</p>':'<p>'+esc(p).replaceAll('\n','<br>')+'</p>';}).join('')+'</div>';
function shell(body){return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Confidentiality agreement | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/library-nda.css"><script type="module" src="/library-nda.js"></script></head><body class="studio"><main class="nda-shell"><a class="brand" href="/content-library/"><b>nutrition</b>.fitness</a>'+body+'</main></body></html>';}
function render(res,status,body){res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(shell(body));}
function download(res,value){res.statusCode=200;res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="Nutrition-fitness-confidentiality-agreement.txt"');res.end(value);}
const receiptColumns='id,actor_role,actor_id,full_name,email,identity_basis,agreement_version,document_text,document_hash,accepted_at,signed_details,postal_address,signature_method,signature_name,signature_strokes,identity_received,identity_sha256,identity_removed_at,identity_removed_by';
async function serveReceipt(req,res,{api,actor,params,id,admin}){
 const filter='id=eq.'+uuid(id)+(admin?'':'&'+identityFilter(actor));
 const rows=await api(table+'?'+filter+'&select='+receiptColumns+'&limit=1',service),r=rows[0];
 if(!r)throw new HttpError(404,'Signed agreement not found.');
 const base=admin?{work:'1',studio:'nda',receipt:r.id}:{work:actor.role==='guest'?undefined:'1',nda:'record'};
 if(params.get('nda')==='identity'||params.get('identity')==='1'){
  if(!r.identity_received||r.identity_removed_at)throw new HttpError(404,'The ID image is not available.');
  const images=await api(table+'?'+filter+'&select=identity_image&limit=1',service);
  const image=identityImage(images[0]?.identity_image);
  res.statusCode=200;res.setHeader('Content-Type','image/webp');res.setHeader('Content-Disposition','inline; filename="identity-document.webp"');res.setHeader('Cache-Control','private, no-store');res.end(image.bytes);return;
 }
 const identityStatus=!r.identity_received?'Not collected for this earlier version':r.identity_removed_at?'ID image removed on '+r.identity_removed_at:'ID supplied — not verified';
 const details='<h1>Your signed agreement</h1><p>NDA reference: <strong>'+esc(r.id)+'</strong></p><section class="nda-document"><h2>ACCEPTANCE RECORD</h2><dl><dt>Name</dt><dd>'+esc(r.full_name)+'</dd><dt>Address</dt><dd>'+esc(r.postal_address||'Not collected for this earlier version').replaceAll('\n','<br>')+'</dd><dt>Email</dt><dd>'+esc(r.email)+'</dd><dt>Signed (UTC)</dt><dd>'+esc(r.accepted_at)+'</dd><dt>Agreement version</dt><dd>'+esc(r.agreement_version)+'</dd><dt>Account</dt><dd>'+esc(r.identity_basis)+'</dd><dt>Proof of identity</dt><dd>'+esc(identityStatus)+'</dd></dl><h2>Signature</h2>'+signatureMarkup(r)+'</section>'+agreementHtml(r.document_text)+'<p class="meta">Document SHA-256: '+esc(r.document_hash)+'</p>';
 if(params.get('nda')==='copy'||params.get('download')==='1'){
  res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="Nutrition-fitness-signed-agreement.html"');
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signed agreement</title><style>body{max-width:820px;margin:40px auto;padding:20px;font:16px/1.6 sans-serif;color:#103441}h1{font-size:28px}h2{font-size:19px}dt{font-weight:bold}dd{margin:0 0 12px}svg{width:100%;max-width:720px;height:auto}.nda-typed-signature{font:32px cursive}.meta{overflow-wrap:anywhere}@media print{body{margin:0}}</style>'+details+'</html>');return;
 }
 let actions='<div class="nda-record-actions"><a class="btn" href="'+link({...base,download:'1'})+'">Download signed agreement</a><button type="button" data-nda-print>Print / save as PDF</button>';
 if(r.identity_received&&!r.identity_removed_at)actions+='<a class="btn" href="'+link({...base,identity:'1'})+'" target="_blank" rel="noopener">View ID photo</a>';
 actions+='<a class="btn primary" href="/content-library/">Continue to the workspace</a></div>';
 const remove=admin&&r.identity_received&&!r.identity_removed_at?'<form class="nda-id-removal" method="post" action="'+link({work:'1',studio:'nda'})+'"><input type="hidden" name="action" value="remove-nda-id"><input type="hidden" name="receipt" value="'+esc(r.id)+'"><h2>Remove ID image</h2><p>This permanently removes the uploaded ID image. The signed agreement, signature and record that ID was supplied remain.</p><label class="remember-me"><input type="checkbox" name="confirm_remove" value="1" required>I confirm that this ID image is no longer needed.</label><button>Remove ID image</button></form>':'';
 render(res,200,actions+details+remove);
}
async function currentAgreement(api){
  const rows=await api('/rest/v1/nufi_library_nda_agreements?active=eq.true&select=version,document_text,document_hash,requires_identity&limit=1',service);
  const document=rows?.[0];
  if(!document||typeof document.version!=='string'||!/^[a-zA-Z0-9.-]{1,80}$/.test(document.version)||typeof document.document_text!=='string'||document.document_text.length<40||document.document_text.length>60000||createHash('sha256').update(document.document_text).digest('hex')!==document.document_hash)throw new Error('Agreement unavailable');
  return document;
}
async function accepted(api,actor,ndaHash){const rows=await api(table+'?'+identityFilter(actor)+'&document_hash=eq.'+ndaHash+'&select=id,signed_details&limit=1',service);if(!Array.isArray(rows))throw new Error('NDA lookup unavailable');return rows[0];}
async function accountEmail(api,actor){
  if(actor.role==='staff'){const rows=await api('/rest/v1/nufi_library_staff?id=eq.'+uuid(actor.id)+'&select=email',service);return email(rows[0]?.email);}
  const user=await api('/auth/v1/admin/users/'+uuid(actor.id),service);return email(user.email);
}
export async function requireLibraryNda(req,res,{actor,api,params}){
  // Called only after authentication; never trust posted actor IDs, times or document text.
  try{
    const {version:ndaVersion,document_text:ndaText,document_hash:ndaHash,requires_identity:requiresIdentity}=await currentAgreement(api);
    const found=await accepted(api,actor,ndaHash);
    const record=found&&(!requiresIdentity||found.signed_details)?found:null;
    if(req.method==='GET'&&['copy','record','identity'].includes(params.get('nda'))){
      if(record){await serveReceipt(req,res,{api,actor,params,id:record.id,admin:false});return true;}
      if(params.get('nda')==='copy'){download(res,ndaText);return true;}
    }
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
        const details=requiresIdentity?signedDetails(fields,fullName):{};
        if(!record)await api(table+'?on_conflict=actor_role,actor_id,document_hash',{service:true,method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},payload:{actor_role:actor.role,actor_id:actor.id,full_name:fullName,email:address,identity_basis:actor.role==='guest'?'Guest details (self-declared)':'Authenticated '+actor.role+' account',agreement_version:ndaVersion,document_hash:ndaHash,document_text:ndaText,...details}});
        // Confirm durable persistence before granting any access, even on a repeated submit.
        if(!record&&!await accepted(api,actor,ndaHash))throw new Error('Acceptance was not saved');
        res.statusCode=303;res.setHeader('Location',ownUrl(params));res.end();return true;
      }catch(e){if(!(e instanceof HttpError))throw e;error=e.message;status=e.status;}
    }else if(req.method!=='GET'){error='Please accept the confidentiality agreement before using the workspace. Your change has not been saved.';status=403;}
    const action=esc(ownUrl(params));
    render(res,status,'<h1>Before you enter</h1><p>Please read and sign this agreement to access the Nutrition.fitness content workspace.</p><p><a href="'+action+(params.size?'&amp;':'')+'nda=copy">Download the agreement</a> · Version '+ndaVersion+'</p>'+agreementHtml(ndaText)+(error?'<p role="alert">'+esc(error)+'</p>':'')+'<form method="post" action="'+action+'" class="nda-accept"><input type="hidden" name="action" value="accept-nda"><input type="hidden" name="version" value="'+ndaVersion+'"><input type="hidden" name="document_hash" value="'+ndaHash+'"><label>Your full name<input name="full_name" autocomplete="name" maxlength="120" required value="'+esc(typeof fields.full_name==='string'?fields.full_name.slice(0,120):'')+'"></label>'+(actor.role==='guest'?'<label>Your email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><p class="meta">Guest details are self-declared. Team members should sign in with their individual account.</p>':'<p class="meta">This acceptance will be linked to your signed-in account.</p>')+(requiresIdentity?detailsForm(fields):'')+'<label class="remember-me"><input type="checkbox" name="agree" value="1" required>I have read and agree to this agreement, including its confidentiality and intellectual-property terms. I confirm these are my details and intend my signature to sign this agreement electronically.</label><button class="primary">Accept and continue</button></form><form method="post" action="/content-library/?work=1" class="nda-exit"><input type="hidden" name="action" value="work-logout"><button>Decline and sign out</button></form>');return true;
  }catch(error){
    const status=error instanceof HttpError&&error.status<500?error.status:503;
    render(res,status,'<h1>We could not open your agreement or file</h1><p>'+esc(status<500?error.message:'Please try again. Your content stays private until acceptance can be confirmed.')+'</p><a href="'+esc(ownUrl(params))+'">Return to the workspace</a><form method="post" action="/content-library/?work=1"><input type="hidden" name="action" value="work-logout"><button>Sign out</button></form>');return true;
  }
}
export async function ndaAdminScreen(req,res,{actor,api,params}){
  if(actor.role!=='admin')throw new HttpError(403,'Administrator access is required.');
  if(req.method==='POST'){
    const f=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
    if(req.headers.origin!=='https://'+req.headers.host)throw new HttpError(403,'Open the workspace to continue.');
    if(f.action!=='remove-nda-id')throw new HttpError(405,'Signed agreements cannot be edited.');
    if(f.confirm_remove!=='1')throw new HttpError(400,'Confirm that you want to remove this ID image.');
    const rows=await api(table+'?id=eq.'+uuid(f.receipt)+'&identity_image=not.is.null',{service:true,method:'PATCH',headers:{Prefer:'return=representation'},payload:{identity_image:null,identity_removed_at:new Date().toISOString(),identity_removed_by:actor.id}});
    res.statusCode=303;res.setHeader('Location','/content-library/?work=1&studio=nda&receipt='+uuid(f.receipt));res.end();return null;
  }
  if(req.method!=='GET')throw new HttpError(405,'Use the agreement screen.');
  const receipt=params.get('receipt');
  if(receipt){await serveReceipt(req,res,{api,actor,params,id:uuid(receipt),admin:true});return null;}
  const {version:ndaVersion,document_text:ndaText}=await currentAgreement(api);
  const page=Math.max(1,Math.min(10000,parseInt(params.get('page'))||1));
  const rows=await api(table+'?select=id,actor_id,actor_role,full_name,email,identity_basis,agreement_version,accepted_at&order=accepted_at.desc,id.asc&limit=51&offset='+((page-1)*50),service);
  return '<h1>Confidentiality agreements</h1><p>Everyone must accept the current agreement before accessing private content. Team and administrator acceptance is linked to their individual account. Guest details are self-declared and apply to that guest session.</p><p>Current version: '+ndaVersion+' · <a href="'+link({work:'1',studio:'nda',nda:'copy'})+'">Download your agreement and receipt</a></p><details class="panel"><summary>Read the current agreement</summary>'+agreementHtml(ndaText)+'</details><p class="meta">These terms were drafted for Nutrition.Fitness UK Ltd and should be reviewed by your solicitor. Records preserve the wording accepted; changes require a new version and acceptance.</p><h2>Acceptance records</h2>'+(rows.length?'<ul class="studio-list">'+rows.slice(0,50).map(r=>'<li><div><strong>'+esc(r.full_name)+'</strong><br>'+esc(r.email)+'<br><small>'+esc(r.identity_basis)+' · '+esc(r.accepted_at)+' (UTC) · Version '+esc(r.agreement_version)+'</small></div><a href="'+link({work:'1',studio:'nda',receipt:r.id})+'">View signed agreement</a></li>').join('')+'</ul>':'<p>No agreements have been accepted yet.</p>')+'<nav class="pages">'+(page>1?'<a href="'+link({work:'1',studio:'nda',page:page-1})+'">Previous</a>':'')+(rows.length>50?'<a href="'+link({work:'1',studio:'nda',page:page+1})+'">Next</a>':'')+'</nav>';
}
