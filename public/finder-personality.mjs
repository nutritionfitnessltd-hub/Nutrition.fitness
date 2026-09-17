/** Presentation only. Question values, routing, validation and reservations stay
 * in programme-finder.mjs / launch.mjs. Doodle text is real, selectable text. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const QUESTION_NOTES=Object.freeze({
 goal:'Your goal.\nNot your neighbour’s.',
 experience:'No fitness CV required.',
 equipment:'The spare room counts.',
 days:'Real life gets a vote.',
 minutes:'No two-hour gym epics.',
 focus:'A little extra love.',
 barrier:'Life happens. We get it.'
});
const TOPICS=Object.freeze({goal:'Your goal',experience:'Your starting point',equipment:'Your space & kit',days:'Your week',minutes:'Your time',focus:'Your focus',barrier:'Your real life'});
export const GOAL_DETAILS=Object.freeze({
 foundation:{tone:'petrol',caption:'A routine that feels doable.',icon:'strength'},
 muscle:{tone:'plum',caption:'A little more lift in your life.',icon:'muscle'},
 'fat-loss':{tone:'green',caption:'Good habits. Not crash diets.',icon:'heart'},
 fitness:{tone:'ochre',caption:'More get-up-and-go.',icon:'sun'},
 running:{tone:'terracotta',caption:'Find your stride.',icon:'shoe'},
 swimming:{tone:'petrol',caption:'Make a little splash.',icon:'swim'},
 cycling:{tone:'plum',caption:'A bit of forward motion.',icon:'bike'}
});
// Small, deliberately loose line drawings. Never use icons as the only label.
const SKETCHES=Object.freeze({
 strength:'<path d="M9 14h6v20H9Zm24 0h6v20h-6ZM4 19h5v10H4Zm35 0h5v10h-5ZM15 21l18-1m-18 8 18-1M21 9l-1-5m8 5 2-4"/>',
 muscle:'<path d="M12 32c-4-7-3-14 0-21l9-2 4 6-5 4-3-3-1 10c7-7 21-8 23 3 3 14-22 17-30 9m18-16c4 0 7 2 8 5M34 10l3-4m3 10 5-1"/>',
 heart:'<path d="M24 40S6 30 7 19C8 7 19 8 24 16 30 6 42 9 42 19c0 11-18 21-18 21Z"/><path d="m8 25 10 0 4-8 5 13 4-6h10"/>',
 sun:'<path d="M35 25c0 7-5 12-12 12S11 32 11 25s5-12 12-12 12 5 12 12ZM23 4v4m15 3-3 3m8 11h-4m-1 14-3-3M23 45v-4M7 39l4-3M3 25h4M7 10l4 4m7 11 4 5 7-9"/>',
 shoe:'<path d="m13 12 9 5 2 9 16 5c5 2 4 9-2 9H10c-4 0-4-6-2-9l5-19Zm-4 23h33M22 23l6-2m-1 6 6-2M3 15h6M1 22h6m-3 5h2"/>',
 swim:'<circle cx="33" cy="14" r="4"/><path d="m9 27 11-10 8 9m-8-9-7-7-7 3M3 33q5-5 10 0t10 0 10 0 11 0M3 41q5-5 10 0t10 0 10 0 11 0"/>',
 bike:'<circle cx="11" cy="33" r="8"/><circle cx="38" cy="33" r="8"/><path d="m11 33 10-18 8 18H11l16-13h7m-9-9h8l5 22M17 15h8"/>',
 arrow:'<path d="M6 7c27 20 61 18 66 0 3-11-22-5-17 7 5 12 25 10 45 6m-10-7 11 7-11 8"/>',
 curve:'<path d="M103 4c1 27-25 45-69 42M43 38l-11 8 12 6"/>',
 spark:'<path d="M11 27 3 22m14-8-3-9m13 8 5-9m3 18 10-4m-11 15 8 6"/>'
});
export function sketch(name){return SKETCHES[name]?`<svg class="finder-sketch" viewBox="0 0 ${name==='arrow'||name==='curve'?'112 56':'48 48'}" aria-hidden="true" focusable="false">${SKETCHES[name]}</svg>`:'';}
export function doodleNote(text,extra=''){return `<span class="finder-doodle ${esc(extra)}">${esc(text).replace(/\n/g,'<br> ')}</span>`;}
export function renderFinderHeader(){return `<header class="finder-head"><div class="finder-welcome"><div class="finder-welcome-copy"><p class="eyebrow">A starting point, not a sales pitch.</p><h1>Find your programme.<br><span class="finder-on-us"><span class="finder-desktop-offer">Your first month is on us.</span><span class="finder-mobile-offer">First month? On us.</span></span></h1></div><aside class="finder-free-note">${sketch('spark')}${doodleNote('Yep.\nActually free.')}${sketch('curve')}</aside></div><p class="lead"><span class="finder-desktop-intro">A few questions about your actual life. A programme that makes sense. </span>One free month of NUFI+ for everyone who completes the quiz.</p><p class="finder-perks"><span>No purchase required.</span><span>No payment card.</span><span>No automatic charge.</span></p></header>`;}
export function renderQuestion(q,step,total,selected){
 const goal=q.id==='goal', note=QUESTION_NOTES[q.id]||'One step at a time.';
 return `<div class="finder-progress-row"><span>Question ${step+1} of ${total}</span><span class="finder-topic">${esc(TOPICS[q.id]||'Your programme')}</span></div><div class="finder-progress" role="progressbar" aria-label="Quiz progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${step}">${Array.from({length:total},(_,i)=>`<span class="finder-progress-step ${i<step?'is-complete':i===step?'is-current':''}" aria-hidden="true"></span>`).join('')}</div><h2 class="finder-question" tabindex="-1" data-step-title id="question-title">${esc(q.title)}</h2><p class="finder-help" id="question-help">${esc(q.help)}${q.optional?' <span class="finder-pick">Optional</span>':''}</p><fieldset class="finder-options ${goal?'finder-goals':''}" aria-labelledby="question-title" aria-describedby="question-help">${q.options.map(o=>{
  const detail=goal?GOAL_DETAILS[o.value]:null;
  return `<label class="finder-option${detail?' finder-illustrated':''}"${detail?` data-finder-tone="${detail.tone}"`:''}><input type="${q.multiple?'checkbox':'radio'}" name="${esc(q.id)}" value="${esc(o.value)}" ${selected.includes(o.value)?'checked':''}>${detail?`<span class="finder-option-art" aria-hidden="true">${sketch(detail.icon)}</span>`:''}<span class="finder-option-copy"><span class="finder-option-label">${esc(o.label)}</span>${detail?`<span class="finder-option-caption">${esc(detail.caption)}</span>`:''}</span></label>`;
 }).join('')}${goal?`<div class="finder-choice-note">${sketch('curve')}${doodleNote(note)}</div>`:''}</fieldset><p class="finder-error" role="alert" hidden></p>${!goal?`<p class="finder-step-note">${doodleNote(note)}${sketch('arrow')}</p>`:''}<div class="finder-actions">${step?'<button class="finder-back" type="button" data-back>← Back</button>':'<span class="finder-time-note">About two minutes. No stopwatch required.</span>'}<button class="button" type="button" data-next>${step===total-1?'See my programme':'Next'} <span aria-hidden="true">→</span></button></div>`;
}
