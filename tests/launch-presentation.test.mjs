import test from 'node:test';
import assert from 'node:assert/strict';
import {launchWidget} from '../src/launch-layout.mjs';
import {LAUNCH} from '../public/launch-config.mjs';

test('countdown states explicitly that Nutrition.Fitness goes live',()=>{
 const markup=launchWidget();
 assert.match(markup, /Nutrition\.Fitness goes live in…/);
 assert.match(markup, /The full system launches together/);
 assert.doesNotMatch(markup, /Less complicated starts/);
});
test('launch date remains the agreed 1 November 2026 at 9am UK time',()=>{
 assert.equal(LAUNCH.at,'2026-11-01T09:00:00.000Z');
 assert.ok(launchWidget().includes(`<time datetime="${LAUNCH.at}">${LAUNCH.label}</time>`));
});
test('countdown exposes labelled days/hours/minutes without a live announcement loop',()=>{
 const markup=launchWidget();
 assert.match(markup,/aria-labelledby="launch-heading"/);
 assert.match(markup,/role="timer" aria-live="off"/);
 for(const unit of ['days','hours','minutes']) assert.match(markup,new RegExp(`data-${unit}`));
 assert.doesNotMatch(markup,/data-seconds|aria-hidden="true"/);
});
test('launch message identifies the whole offering, not just NUFI+',()=>{
 const markup=launchWidget();
 for(const name of ['NUFI+','Programmes','Meal planning','Courses','Supplements'])assert.ok(markup.includes(name));
});
