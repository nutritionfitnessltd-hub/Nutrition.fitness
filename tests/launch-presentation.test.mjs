import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {launchWidget,compileLaunchLayout} from '../src/launch-layout.mjs';
import {LAUNCH} from '../public/launch-config.mjs';

test('banner announces the whole-system launch with compact phone labels',()=>{
 const markup=launchWidget();
 assert.match(markup,/Nutrition\.Fitness goes live in…/);
 assert.match(markup,/The full system launches together/);
 assert.match(markup,/launch-title-short/);
 assert.doesNotMatch(markup,/Less complicated starts/);
 for(const name of ['NUFI+','Programmes','Meal planning','Courses','Supplements'])assert.ok(markup.includes(name));
});
test('launch date remains 1 November 2026 at 9am UK',()=>{
 assert.equal(LAUNCH.at,'2026-11-01T09:00:00.000Z');
 assert.ok(launchWidget().includes(`<time datetime="${LAUNCH.at}" aria-label="${LAUNCH.label}">`));
});
test('timer exposes full unit names without repeated screen reader announcements',()=>{
 const markup=launchWidget();
 assert.match(markup,/aria-labelledby="launch-heading"/);
 assert.match(markup,/role="timer" aria-live="off"/);
 for(const unit of ['days','hours','minutes']){
  assert.match(markup,new RegExp(`data-${unit}`));
  assert.match(markup,new RegExp(`aria-label="${unit}"`));
 }
 assert.doesNotMatch(markup,/data-seconds/);
});
test('homepage compiler places exactly one banner after navigation before main, not inside hero',()=>{
 const base='<head></head><body><div class="preview-bar">preview</div><header class="site-header">links</header><nav class="mobile-nav">mobile</nav><main id="main"><section class="hero">approved hero</section></main></body>';
 const result=compileLaunchLayout(base,'/');
 assert.equal((result.match(/class="launch-widget launch-banner"/g)||[]).length,1);
 assert.ok(result.indexOf('launch-banner')>result.indexOf('</nav>'));
 assert.ok(result.indexOf('launch-banner')<result.indexOf('<main'));
 assert.ok(result.includes('<section class="hero">approved hero</section>'));
 assert.doesNotMatch(compileLaunchLayout(base,'/recipes/'),/class="launch-widget launch-banner"/);
 const builder=readFileSync(new URL('../scripts/build-launch.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(builder,/\$\{launchWidget\(\)\}/);
});
