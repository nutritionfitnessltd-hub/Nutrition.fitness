import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QUESTIONS} from '../public/programme-finder.mjs';
import {GOAL_DETAILS,QUESTION_NOTES,renderFinderHeader,renderQuestion,doodleNote,sketch} from '../public/finder-personality.mjs';
import {compileLaunchLayout,renderFinder} from '../src/launch-layout.mjs';

test('each goal has its own sketch and all seven questions retain their original inputs',()=>{
 assert.deepEqual(Object.keys(GOAL_DETAILS),QUESTIONS[0].options.map(o=>o.value));
 assert.equal(new Set(Object.values(GOAL_DETAILS).map(d=>d.icon)).size,7);
 for(const [step,q] of QUESTIONS.entries()){
  const html=renderQuestion(q,step,QUESTIONS.length,[q.options[0].value]);
  assert.equal((html.match(/<input /g)||[]).length,q.options.length);
  for(const o of q.options){assert.ok(html.includes(`value="${o.value}"`));assert.ok(html.includes(o.label));}
  assert.equal((html.match(/ checked/g)||[]).length,1);
  assert.ok(html.includes(`name="${q.id}"`));assert.ok(html.includes(q.multiple?'type="checkbox"':'type="radio"'));
  assert.match(html,/aria-labelledby="question-title" aria-describedby="question-help"/);
 }
});
test('doodle comments are text, distinct for each question and never replace an input label',()=>{
 assert.equal(new Set(Object.values(QUESTION_NOTES)).size,QUESTIONS.length);
 for(const q of QUESTIONS){
  assert.ok(QUESTION_NOTES[q.id]);assert.ok(renderQuestion(q,0,7,[]).includes(doodleNote(QUESTION_NOTES[q.id])));
 }
 assert.match(sketch('shoe'),/aria-hidden="true" focusable="false"/);
 assert.equal(sketch('untrusted'), '');
});
test('progress reports completed answers accurately, not a fake percentage',()=>{
 for(let step=0;step<QUESTIONS.length;step++){
  const html=renderQuestion(QUESTIONS[step],step,QUESTIONS.length,[]);
  assert.match(html,new RegExp(`aria-valuenow="${step}"`));
  assert.equal((html.match(/finder-progress-step /g)||[]).length,7);
  assert.equal((html.match(/is-complete/g)||[]).length,step);
  assert.equal((html.match(/is-current/g)||[]).length,1);
 }
});
test('presentation escapes dynamic labels and comments and adds no submission or storage logic',()=>{
 const q={id:'safe',title:'<script>alert(1)</script>',help:'A & B',options:[{value:'a" onclick="bad',label:'<img onerror=bad>'}]};
 const html=renderQuestion(q,0,1,[]);
 assert.doesNotMatch(html,/<script>|<img|value="a" onclick=/);
 assert.match(html,/&lt;script&gt;/);assert.match(html,/A &amp; B/);
 assert.equal(doodleNote('<img>'),'<span class="finder-doodle ">&lt;img&gt;</span>');
 const source=readFileSync(new URL('../public/finder-personality.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|\/api\/|document\.|window\./);
});
test('quiz keeps the free-month conditions, existing fonts and scoped styling',()=>{
 const header=renderFinderHeader();
 for(const text of ['No purchase required.','No payment card.','No automatic charge.','One free month of NUFI+'])assert.ok(header.includes(text));
 assert.match(renderFinder(),/finder-page finder-branded/);
 const html=compileLaunchLayout('<head></head><body><div class="preview-bar"></div><header class="site-header">nav</header><main id="main">Original page</main></body>','/');
 assert.equal((html.match(/href="\/finder-personality.css"/g)||[]).length,1);
 assert.ok(html.includes('Original page'));
 const css=readFileSync(new URL('../public/finder-personality.css',import.meta.url),'utf8');
 assert.match(css,/font-family:'Kalam',cursive/);assert.match(css,/prefers-reduced-motion/);assert.doesNotMatch(css,/@import|url\(/);
});
