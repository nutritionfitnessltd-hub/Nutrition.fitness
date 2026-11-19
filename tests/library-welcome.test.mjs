import test from 'node:test';
import assert from 'node:assert/strict';
import {welcomePanel} from '../server/library-welcome.mjs';

test('welcome drafts escape names and include a secure setup marker rather than a password',()=>{
  const person={id:'fixture',name:'</textarea><img src=x onerror=alert(1)>',email:'member+team@example.test',code_hash:'never-expose-this'};
  const password='new<&>password',html=welcomePanel(person,{origin:'https://workspace.example.test',password,env:{NUFI_LIBRARY_CATALOGUE_KEY:'test-only'}});
  assert.ok(!html.includes(person.name));assert.ok(!html.includes(person.code_hash));
  assert.match(html,/&lt;\/textarea&gt;/);
  assert.match(html,/name="action" value="send-welcome"/);
  assert.ok(html.includes('{{SET_PASSWORD_LINK}}'));
  assert.ok(!html.includes('Password:')&&!html.includes('new&lt;&amp;&gt;password'));
  assert.ok(html.includes('value="'+person.email+'"'));
  assert.equal((html.match(/<textarea /g)||[]).length,1);
});
