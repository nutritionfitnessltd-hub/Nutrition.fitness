import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {studioFrame} from '../server/studio-ui.mjs';
import {messagesPage} from '../server/team-messages.mjs';
import {messageFixture} from './team-messages-fixture.mjs';
import {createConversation} from '../server/team-message-store.mjs';
const hostCode=await fs.readFile(new URL('../public/team-message-panel.js',import.meta.url),'utf8');
const messageCode=await fs.readFile(new URL('../public/team-messages.js',import.meta.url),'utf8');
const actor={id:'11111111-1111-4111-8111-111111111111',role:'staff',name:'Sam',access:{}};
const click=(w,node)=>node.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
function host({mobile=false,url='https://team.example/content-library/?work=1&studio=home'}={}){
 const dom=new JSDOM(studioFrame('<h1>My work</h1><textarea id="work-draft">Work in progress</textarea>','home',actor),{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.matchMedia=()=>({matches:mobile,addEventListener(){}});Object.defineProperty(w,'innerWidth',{value:mobile?390:1500,writable:true});w.eval(hostCode);
 return {dom,w,panel:w.document.querySelector('[data-message-panel]'),toggle:w.document.querySelector('[data-message-panel-toggle]'),frame:w.document.querySelector('[data-message-panel-frame]'),close:w.document.querySelector('[data-message-panel-close]')};
}
test('drawer starts collapsed and unloaded; collapse/reopen keeps the iframe, composer and main work untouched',()=>{
 const h=host();try{
  assert.ok(h.panel.hidden);assert.equal(h.frame.getAttribute('src'),null);assert.equal(h.toggle.getAttribute('aria-expanded'),'false');
  click(h.w,h.toggle);assert.ok(!h.panel.hidden);assert.equal(new URL(h.frame.src).searchParams.get('panel'),'1');
  const source=h.frame.src,frame=h.frame,doc=h.frame.contentDocument;doc.append(doc.createElement('html'));doc.documentElement.append(doc.createElement('body'));const textarea=doc.createElement('textarea');textarea.value='Unsent message';doc.body.append(textarea);
  click(h.w,h.close);assert.ok(h.panel.hidden);assert.equal(h.toggle.getAttribute('aria-expanded'),'false');
  click(h.w,h.toggle);assert.equal(h.frame,frame);assert.equal(h.frame.src,source);assert.equal(h.frame.contentDocument,doc);assert.equal(textarea.value,'Unsent message');assert.equal(h.w.document.getElementById('work-draft').value,'Work in progress');
 }finally{h.dom.window.close();}
});
test('navigation opens the drawer, keyboard resizing stays bounded, and unread activity never opens it',()=>{
 const h=host();try{
  const nav=h.w.document.querySelector('a[href*="studio=messages"]');click(h.w,nav);assert.ok(!h.panel.hidden);
  const resize=h.w.document.querySelector('[data-message-panel-resize]');resize.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert.equal(resize.getAttribute('aria-valuenow'),'500');
  resize.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(resize.getAttribute('aria-valuenow'),'360');resize.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(resize.getAttribute('aria-valuenow'),'644');
  click(h.w,h.close);h.w.dispatchEvent(new h.w.MessageEvent('message',{data:{type:'unread',unread:4},origin:'https://team.example',source:h.frame.contentWindow}));assert.ok(h.panel.hidden);
 }finally{h.dom.window.close();}
});
test('mobile drawer is modal and restores focus; Escape and trusted child collapse work but foreign messages do not',()=>{
 const h=host({mobile:true});try{
  h.toggle.focus();click(h.w,h.toggle);assert.equal(h.panel.getAttribute('role'),'dialog');assert.equal(h.panel.getAttribute('aria-modal'),'true');assert.equal(h.w.document.querySelector('.shell').inert,true);
  h.w.dispatchEvent(new h.w.MessageEvent('message',{data:{type:'team-message-panel-close'},origin:'https://other.example',source:h.frame.contentWindow}));assert.ok(!h.panel.hidden);
  h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.ok(h.panel.hidden);assert.equal(h.w.document.querySelector('.shell').inert,false);assert.equal(h.w.document.activeElement,h.toggle);
 }finally{h.dom.window.close();}
});
test('account previews cannot activate the actual account drawer; non-human frames have no launcher',()=>{
 const h=host({url:'https://team.example/content-library/?work=1&studio=home&accountPreview=fixture'});try{assert.ok(h.toggle.hidden);click(h.w,h.toggle);assert.ok(h.panel.hidden);assert.equal(h.frame.getAttribute('src'),null);}finally{h.dom.window.close();}
 assert.doesNotMatch(studioFrame('','home',{role:'worker',id:'imogen'}),/data-message-panel-toggle/);
});
test('compact messages suspend reads while collapsed, preserve actor-scoped drafts and keep in-panel navigation compact',async()=>{
 const f=messageFixture(),id=await createConversation(f.api,f.admin,f.people,{kind:'direct',members:JSON.stringify([f.staff.id])});
 const body=await messagesPage(new URLSearchParams({conversation:id,panel:'1'}),f.staff,f.api,{}),html=studioFrame(body,'messages',f.staff,{messagesEmbedded:true});
 const make=()=>{const dom=new JSDOM(html,{url:'https://team.example/content-library/?work=1&studio=messages&conversation='+id+'&panel=1',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;const calls=[];w.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>options?{revision:2}:{unread:0,mentions:0,threads:[{id,revision:2}]}};};w.matchMedia=()=>({matches:false});return {dom,w,calls};};
 const first=make();let saved,key;
 try{
  first.w.eval(messageCode);assert.equal(first.calls.length,0);assert.ok(!first.w.document.querySelector('[data-message-panel]'));assert.ok(!first.w.document.querySelector('.shell'));
  const form=first.w.document.querySelector('[data-message-compose]');form.elements.body.value='Draft that survives collapsing';form.elements.body.dispatchEvent(new first.w.Event('input',{bubbles:true}));key=first.w.sessionStorage.key(0);saved=first.w.sessionStorage.getItem(key);assert.ok(key.includes(f.staff.id));
  first.w.dispatchEvent(new first.w.MessageEvent('message',{origin:'https://team.example',source:first.w,data:{type:'team-message-panel-visibility',visible:true}}));await new Promise(r=>setTimeout(r,0));assert.ok(first.calls.some(c=>c.options?.method==='POST'));
  first.w.dispatchEvent(new first.w.MessageEvent('message',{origin:'https://team.example',source:first.w,data:{type:'team-message-panel-visibility',visible:false}}));assert.equal(form.elements.body.value,'Draft that survives collapsing');
  assert.ok([...first.w.document.querySelectorAll('a[href*="studio=messages"]')].every(a=>new URL(a.href).searchParams.get('panel')==='1'));
 }finally{first.dom.window.close();}
 const second=make();try{second.w.sessionStorage.setItem(key,saved);second.w.eval(messageCode);assert.equal(second.w.document.querySelector('[data-message-compose]').elements.body.value,'Draft that survives collapsing');}finally{second.dom.window.close();}
});

test('Messages pill shows trusted unread count and clears it without opening the drawer',()=>{
 const h=host();try{const badge=h.toggle.querySelector('[data-message-unread]');
 for(const n of [3,0]){h.w.dispatchEvent(new h.w.MessageEvent('message',{data:{type:'team-message-unread',unread:n},origin:'https://team.example',source:h.frame.contentWindow}));assert.equal(badge.hidden,n===0);assert.equal(badge.textContent,String(n));assert.ok(h.panel.hidden);}
 h.w.dispatchEvent(new h.w.MessageEvent('message',{data:{type:'team-message-unread',unread:99},origin:'https://other.example',source:h.frame.contentWindow}));assert.ok(badge.hidden);
 }finally{h.dom.window.close();}
});

test('incoming chat refresh keeps the composer draft and Enter sends while Shift Enter does not',async()=>{
 const f=messageFixture(),id=await createConversation(f.api,f.admin,f.people,{kind:'direct',members:JSON.stringify([f.staff.id])});
 const html=studioFrame(await messagesPage(new URLSearchParams({conversation:id}),f.staff,f.api,{}),'messages',f.staff);
 const dom=new JSDOM(html,{url:'https://team.example/content-library/?work=1&studio=messages&conversation='+id,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{let release;const gate=new Promise(r=>release=r);w.fetch=async(url,options)=>options?.method==='POST'?{ok:true,json:async()=>({revision:2})}:String(url).includes('poll=1')?(await gate,{ok:true,json:async()=>({unread:1,threads:[{id,revision:3}]})}):{ok:true,text:async()=>html.replace('<div class="message-stream">','<div class="message-stream"><p id="incoming">Hello there</p>')};w.matchMedia=()=>({matches:false});w.eval(messageCode);
 const form=w.document.querySelector('[data-message-compose]'),body=form.elements.body;assert.ok(form.querySelector(':scope > button'));assert.equal(form.querySelector(':scope > button').closest('details'),null);body.value='Keep my draft';body.dispatchEvent(new w.Event('input',{bubbles:true}));let submits=0;form.requestSubmit=()=>submits++;
 body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(submits,0);body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(submits,1);
 release();await new Promise(r=>setTimeout(r,30));assert.ok(w.document.getElementById('incoming'));assert.equal(form.elements.body,body);assert.equal(body.value,'Keep my draft');
 }finally{dom.window.close();}
});

test('clean composer uses a paperclip modal, uploads selected files and inserts @ mentions',async()=>{
 const f=messageFixture(),id=await createConversation(f.api,f.admin,f.people,{kind:'direct',members:JSON.stringify([f.staff.id])});
 const html=studioFrame(await messagesPage(new URLSearchParams({conversation:id}),f.staff,f.api,{BLOB_READ_WRITE_TOKEN:'fixture'}),'messages',f.staff);
 const dom=new JSDOM(html,{url:'https://team.example/content-library/?work=1&studio=messages&conversation='+id,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{w.fetch=async()=>({ok:false,status:503});w.matchMedia=()=>({matches:false});w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};w.eval(messageCode.replace("import('/team-message-upload.js')","Promise.resolve()"));
 const form=w.document.querySelector('[data-message-compose]'),body=form.elements.body;assert.equal(form.querySelector('select[data-message-mention]'),null);assert.equal(form.querySelector('.chat-extras'),null);
 const open=form.querySelector('[data-attachment-open]'),dialog=form.querySelector('dialog');assert.ok(open);assert.ok(!dialog.open);click(w,open);assert.ok(dialog.open);dialog.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.ok(!dialog.open);assert.equal(w.document.activeElement,open);
 body.value='Hi @Al';body.setSelectionRange(body.value.length,body.value.length);body.dispatchEvent(new w.Event('input',{bubbles:true}));const list=form.querySelector('[role=listbox]');assert.ok(!list.hidden);assert.equal(list.children[0].textContent,f.admin.name);let submitted=0;form.requestSubmit=()=>submitted++;body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(body.value,'Hi @'+f.admin.name+' ');assert.equal(submitted,0);assert.ok(list.hidden);
 const source=await fs.readFile(new URL('../client/team-message-upload.mjs',import.meta.url),'utf8');w.CSS={escape:s=>s};const calls=[];w.fetch=async(url,options)=>{const payload=JSON.parse(options.body);calls.push(payload.action);return {ok:true,json:async()=>payload.action==='message-file-save'?{file:{id:'10000000-0000-4000-8000-000000000001',name:'fixture.txt'}}:{saved:true}};};w.eval(source.replace("import {upload} from '@vercel/blob/client';",''));
 const picker=dialog.querySelector('input[type=file]');Object.defineProperty(picker,'files',{value:[new w.File(['fixture'],'fixture.pdf',{type:'application/pdf'})]});picker.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,60));assert.deepEqual(calls,['message-file-upload','message-file-save']);assert.match(form.elements.files.value,/10000000/);assert.equal(open.querySelector('[data-attachment-count]').textContent,'1');assert.ok(!open.querySelector('[data-attachment-count]').hidden);
 }finally{dom.window.close();}
});

test('People shows presence from authenticated polling, including active heartbeat',async()=>{
 const f=messageFixture(),html=studioFrame(await messagesPage(new URLSearchParams(),f.staff,f.api,{}),'messages',f.staff),dom=new JSDOM(html,{url:'https://team.example/content-library/?work=1&studio=messages',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 try{w.document.hasFocus=()=>true;w.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({unread:0,threads:[],presence:[{id:f.other.id,status:'online'}]})};};w.eval(messageCode);await new Promise(r=>setTimeout(r,10));const status=w.document.querySelector('[data-team-presence="'+f.other.id+'"]');assert.equal(status.dataset.status,'online');assert.equal(status.textContent,'Online');const heartbeat=calls.find(c=>c.options?.method==='POST');assert.deepEqual(JSON.parse(heartbeat.options.body),{action:'message-presence',active:true});
 }finally{dom.window.close();}
});
