import test from 'node:test';
import assert from 'node:assert/strict';
import {welcomePanel} from '../server/library-welcome.mjs';

test('welcome drafts escape names and passwords without changing the encoded email body',()=>{
  const person={name:'</textarea><img src=x onerror=alert(1)>',email:'member+team@example.test',code_hash:'never-expose-this'};
  const password='new<&>password',html=welcomePanel(person,{origin:'https://workspace.example.test',password});
  assert.ok(!html.includes(person.name));assert.ok(!html.includes(person.code_hash));
  assert.match(html,/&lt;\/textarea&gt;/);
  const draft=new URL(html.match(/data-welcome-email href="([^"]+)/)[1].replaceAll('&amp;','&'));
  assert.equal(decodeURIComponent(draft.pathname),person.email);
  assert.ok(draft.searchParams.get('body').includes('Hi '+person.name));
  assert.ok(draft.searchParams.get('body').includes('Password: '+password));
  assert.equal((html.match(/<textarea /g)||[]).length,1);
});
