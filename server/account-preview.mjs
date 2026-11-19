import {HttpError} from './platform.mjs';
import {accessFromForm,accessOptions} from './library-permissions.mjs';
import {handleStudio} from './studio.mjs';
import {esc} from './studio-ui.mjs';

export async function accountPreview(fields,{actor,api,load,env}){
 if(actor.role!=='admin')throw new HttpError(403,'Only the administrator can preview team accounts.');
 const id=String(fields.staff||'');if(!/^[a-f0-9-]{36}$/i.test(id))throw new HttpError(400,'Choose a team member to preview.');
 const people=await api('/rest/v1/nufi_library_staff?select=id,name,email,code_hash,access&id=eq.'+encodeURIComponent(id),{service:true});
 const person=people[0];if(!person)throw new HttpError(404,'This team member is unavailable.');
 const access=accessFromForm(fields),previewActor={role:'staff',id:person.id,name:person.name,email:person.email,access};
 const readOnlyApi=(path,options={})=>{if(options.method&&options.method!=='GET')throw new HttpError(403,'Account previews cannot save changes.');return api(path,options);};
 const response={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},end(body){this.body=body;}};
 await handleStudio({method:'GET'},response,{params:new URLSearchParams({studio:'home'}),actor:previewActor,api:readOnlyApi,load,env});
 if(response.statusCode!==200)throw new HttpError(503,'The account preview could not be loaded. No permissions have changed.');
 const enabled=accessOptions.filter(([key])=>access[key]).map(([,name])=>name);
 const banner='<section class="panel account-preview-notice" role="status"><h1>Preview: '+esc(person.name)+'</h1><p>Using the permissions selected in the Team form. Nothing has been saved.</p><p>'+esc(person.code_hash?'Account enabled.':'This account is disabled or has no password. This shows its workspace after it is enabled.')+'</p><p><strong>Enabled:</strong> '+esc(enabled.join(' · ')||'Dashboard only')+'</p><p>Read-only landing-page preview. Navigation and actions are disabled; close this window to return to Team.</p></section>';
 // Render the actual staff dashboard and navigation, with all side effects disabled.
 return response.body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<form\b[^>]*>/gi,'<fieldset disabled class="account-preview-form">').replace(/<\/form>/gi,'</fieldset>')
  .replace(/<a\b([^>]*)>/gi,(_,attributes)=>'<a'+attributes.replace(/\s+(?:href|target|download)="[^"]*"/gi,'')+' aria-disabled="true" tabindex="-1">')
  .replace('<main>','<main>'+banner).replace('<title>','<title>Account preview · ');
}
