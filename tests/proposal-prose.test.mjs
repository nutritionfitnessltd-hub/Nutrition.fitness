import test from 'node:test';
import assert from 'node:assert/strict';
import {documentText,proposalText,readableParagraphs} from '../server/document-reader.mjs';
import {proposalSample} from './proposal-prose-sample.mjs';

test('the reported unstructured paragraph becomes options, method and explicit limits',()=>{
 const html=proposalText(proposalSample);
 assert.match(html,/<h4>Option A<\/h4>/);assert.match(html,/<h4>Option B<\/h4>/);assert.match(html,/you\u2019re getting back to exercise/);
 assert.match(html,/<h4>How the test works<\/h4><ul><li>Both explicitly show free, no card, no auto-upgrade, app-led, no personal coach\./);
 assert.match(html,/<li>Record anonymous comprehension and CTA preference, not health or payment details\.<\/li>/);
 assert.match(html,/<h4>Effort &amp; approval limits<\/h4><p>Estimated 2\u20133 staff hours, \u00a30 ad budget proposed; no money or recruitment authorised\.<\/p>/);
 assert.ok(html.indexOf('Option A')<html.indexOf('Option B'));assert.ok(html.indexOf('Option B')<html.indexOf('How the test works'));
});

test('dense prose gains sentence-boundary breaks while dates, abbreviations and amounts survive',()=>{
 const text='Dr. Smith will review the document on 24 November 2026. '+('This is the existing sentence with all its original qualifiers. '.repeat(8))+'The estimate remains \u00a30.50 per item.';
 const parts=readableParagraphs(text);assert.ok(parts.length>1);assert.equal(parts.join(' '),text.trim());assert.match(documentText(text),/\u00a30\.50/);
});

test('existing headings and lists remain structured and ambiguous or unsafe alternatives stay inert',()=>{
 const structured='## Existing section\n\n- First step\n- Second step';assert.equal(proposalText(structured),documentText(structured,{headingLevel:4}));
 const ambiguous='A: a short label without a quoted alternative. B: another label.';assert.equal(proposalText(ambiguous),documentText(ambiguous,{headingLevel:4}));
 const input='Compare these. A: "<script>alert(1)</script>". B: "Keep the safe text". No approval has been given.';
 const html=proposalText(input);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot;Keep the safe text&quot;\./);assert.match(html,/No approval has been given/);
});
