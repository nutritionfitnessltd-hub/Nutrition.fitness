import {newState,validateState,clone,exportState,importState} from './meal-core.mjs';
const GUEST='nufi-food-v1:guest';
export class FoodStore {
 constructor({storage=globalThis.localStorage,fetcher=globalThis.fetch?.bind(globalThis)}={}){
  this.storage=storage;this.fetcher=fetcher;this.key=GUEST;this.state=newState();this.member=null;this.remoteVersion=0;this.pending=false;this.status='Saved on this browser only';this.conflict=false;this.busy=false;this.listeners=new Set();
  try{this.readLocal();}catch(e){this.status=`Your saved data could not be opened: ${e.message} It has not been overwritten.`;this.conflict=true;}
  globalThis.addEventListener?.('storage',e=>{if(e.key===this.key&&e.newValue){try{const saved=JSON.parse(e.newValue);if(saved.state.revision!==this.state.revision){this.conflict=true;this.status='Another tab changed this plan. Reload before editing; your current view has not been overwritten.';this.emit();}}catch{}}});
 }
 readLocal(){const raw=this.storage.getItem(this.key);if(!raw)return;const value=JSON.parse(raw);this.state=validateState(value.state);this.remoteVersion=value.remoteVersion||0;this.pending=value.pending===true;}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 emit(){for(const fn of this.listeners)fn(this);}
 persist(){this.storage.setItem(this.key,JSON.stringify({state:this.state,remoteVersion:this.remoteVersion,pending:this.pending}));}
 async init(){
  if(!this.fetcher)return this;
  try{const res=await this.fetcher('/api/member-data',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)});if(!res.ok)return this;const data=await res.json();if(!data.user?.id)return this;
   this.member=data.user;this.key=`nufi-food-v1:${data.user.id}`;this.state=newState();this.pending=false;this.conflict=false;this.remoteVersion=0;try{this.readLocal();}catch(e){this.conflict=true;throw new Error('This account’s saved browser copy is damaged and has not been overwritten.');}
   if(this.pending){if(this.remoteVersion!==data.version){this.conflict=true;this.status='Your account changed on another device. Download your local plan before choosing which copy to keep.';}}
   else {this.state=data.state?validateState(data.state):newState();this.remoteVersion=data.version;this.persist();this.status='Saved to your account';}
   if(this.pending&&!this.conflict)await this.flush();
  }catch(e){this.status=this.member?'Account sync unavailable. Your browser copy is still here.':'Saved on this browser only · account sync is not connected';}
  this.emit();return this;
 }
 mutate(fn){
  if(this.conflict)throw new Error(this.status);
  const raw=this.storage.getItem(this.key);if(raw){const current=JSON.parse(raw);if(current.state.revision!==this.state.revision){this.conflict=true;throw new Error('Another tab has a newer version. Reload before editing.');}}
  const previous=this.state,oldPending=this.pending,next=clone(previous);fn(next);next.revision=previous.revision+1;this.state=validateState(next);this.pending=!!this.member;
  try{this.persist();}catch(e){this.state=previous;this.pending=oldPending;throw new Error('Your browser could not save this change. Download a backup and free storage before trying again.');}
  this.status=this.member?'Saved in this browser · syncing…':'Saved on this browser only';this.emit();if(this.member)this.flush();return this.state;
 }
 async flush(){
  if(!this.member||this.busy||this.conflict||!this.pending)return;this.busy=true;
  try{while(this.pending&&!this.conflict){const sentRevision=this.state.revision;const response=await this.fetcher('/api/member-data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:this.member.id,state:this.state,expectedVersion:this.remoteVersion}),signal:AbortSignal.timeout(12000)});const data=await response.json().catch(()=>({}));if(response.status===409){this.conflict=true;throw new Error('Your account has a newer plan on another device. Your local copy is preserved. Download it before reloading.');}if(!response.ok)throw new Error(data.error||'Account sync failed. Your changes are saved in this browser.');this.remoteVersion=data.version;this.pending=this.state.revision!==sentRevision;const raw=this.storage.getItem(this.key);if(raw&&JSON.parse(raw).state.revision!==this.state.revision){this.conflict=true;throw new Error('Another tab changed the local plan during sync. It has not been overwritten. Download this view before reloading.');}this.persist();this.status=this.pending?'Syncing newer changes…':'Saved to your account';this.emit();}}
  catch(e){this.status=e.message;this.emit();}finally{this.busy=false;}
 }
 async reloadAccount(){if(!this.member)throw new Error('Sign in before loading your account plan.');const res=await this.fetcher('/api/member-data');const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not load your account plan.');if(data.user?.id!==this.member.id)throw new Error('The signed-in account changed. Reload the page before continuing.');this.state=data.state?validateState(data.state):newState();this.remoteVersion=data.version;this.pending=false;this.conflict=false;this.persist();this.status='Account version loaded';this.emit();}
 importFile(raw){const incoming=importState(raw);return this.mutate(s=>{const rev=s.revision;Object.assign(s,incoming,{revision:rev});});}
 exportFile(){return exportState(this.state);}
 guestFile(){const raw=this.storage.getItem(GUEST);return raw?exportState(validateState(JSON.parse(raw).state)):null;}
}
