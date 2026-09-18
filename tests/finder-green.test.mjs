import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GOAL_DETAILS} from '../public/finder-personality.mjs';
const css=readFileSync(new URL('../public/finder-personality.css',import.meta.url),'utf8');
test('quiz uses scoped green/sage tokens, not pink or plum surfaces',()=>{
 assert.match(css,/--finder-accent:var\(--green,#376747\)/);
 assert.match(css,/--finder-surface:#e9eedf/);
 assert.doesNotMatch(css,/--finder-plum|--finder-pink|var\(--plum|#863954|#f6edf1|#f0e2e9/);
 assert.ok(Object.values(GOAL_DETAILS).every(d=>d.tone!=='plum'));
});
test('green colours remain scoped to the quiz, not the brand palette',()=>{
 assert.doesNotMatch(css,/:root\s*\{|--plum\s*:|body\s*\{/);
 assert.match(css,/\.finder-branded :is\(a,button,input,select,textarea\):focus-visible/);
});
test('specified green foreground and surface meet normal-text contrast',()=>{
 function lum(hex){const c=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;}
 for(const [a,b] of [['376747','e9eedf'],['ffffff','376747'],['ffffff','2b5238']]){
  const x=lum(a),y=lum(b);assert.ok((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)>=4.5);
 }
});
