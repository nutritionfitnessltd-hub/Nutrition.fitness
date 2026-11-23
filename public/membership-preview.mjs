const dialog=document.querySelector('.mp-dialog');
const summaries={Essential:'Essential: £19.99 every four weeks. Practical nutrition and fitness tools, at your pace.','Passport Guided':'Passport Guided: £48.95 every four weeks for founding members, normally £69.95. Founding pricing continues while your membership stays continuously active.','Free six-week challenge':'Free six-week challenge: starts Monday 4 January 2027. Planned signup will explain card requirements, any renewal subscription and the first payment date before you join.'};
let trigger;
document.querySelectorAll('[data-membership-preview]').forEach(button=>button.addEventListener('click',()=>{trigger=button;dialog.querySelector('[data-membership-summary]').textContent=summaries[button.dataset.membershipPreview];dialog.showModal();}));
dialog?.querySelectorAll('.mp-dialog-close,[data-membership-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
dialog?.addEventListener('close',()=>trigger?.focus());
