/** Shared, two-pass static layout compiler. The base generator owns page bodies;
 * this compiler owns launch chrome. Unexpected base markup fails the build. */
import {LAUNCH} from '../public/launch-config.mjs';
import {renderFinderHeader} from '../public/finder-personality.mjs';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accentFor(route){if(route.startsWith('/recipes')||route.startsWith('/meal-planner'))return 'green';if(route.startsWith('/courses'))return 'terracotta';if(route.startsWith('/programmes')||route.startsWith('/nufi')||route.startsWith('/shop')||route.startsWith('/get-started'))return 'petrol';if(route.startsWith('/knowledge-centre'))return 'ochre';return 'plum';}
export function compileLaunchLayout(html,route){
 const preview=html.indexOf('<div class="preview-bar">'),header=html.indexOf('<header class="site-header">');
 if(preview<0||header<preview)throw new Error(`Base header contract changed: ${route}`);
 html=html.slice(0,preview)+html.slice(header);
 html=html.replace('<meta name="theme-color" content="#faf6ef">','<meta name="theme-color" content="#ffffff">');
 html=html.replace('</head>','<link rel="stylesheet" href="/launch.css"><link rel="stylesheet" href="/product-layout.css"><script type="module" src="/launch.mjs"></script><link rel="stylesheet" href="/form-modals.css"><script type="module" src="/form-modals.mjs"></script><link rel="stylesheet" href="/finder-personality.css"></head>');
 // Load the new highlights only on the homepage; other page styling is untouched.
 if(route==='/')html=html.replace('</head>','<link rel="stylesheet" href="/home-highlights.css" data-page-style="home"></head>');
 html=html.replace(/<body([^>]*)>/,`<body$1 data-accent="${accentFor(route)}">`);
 html=html.replace('href="/get-started/">Get started','href="/get-started/">Find my programme');
 // Shared across every page; Knowledge Centre pages inherit this same shell.
 const main='<main id="main">';
 if(!html.includes(main))throw new Error(`Page main landmark changed: ${route}`);
 html=html.replace(main,`${launchWidget()}${main}`);
 return html;
}
/** A single horizontal announcement below navigation, outside the hero. */
export function launchWidget(){
 const label=esc(LAUNCH.label), at=esc(LAUNCH.at);
 return `<section class="launch-widget launch-banner" aria-labelledby="launch-heading" aria-describedby="launch-scope"><div class="launch-banner-inner"><h2 id="launch-heading" class="launch-kicker" data-launch-kicker aria-label="Nutrition.Fitness goes live in…"><span class="launch-title-full" aria-hidden="true">Nutrition.Fitness goes live in…</span><span class="launch-title-medium" aria-hidden="true">We go live in…</span><span class="launch-title-short" aria-hidden="true">Live in</span></h2><div class="launch-clock" data-launch-clock role="timer" aria-live="off" aria-label="Time until the Nutrition.Fitness launch"><div><strong data-days>—</strong><span class="launch-unit" aria-label="days"><span class="launch-unit-full" aria-hidden="true">days</span><span class="launch-unit-short" aria-hidden="true">d</span></span></div><div><strong data-hours>—</strong><span class="launch-unit" aria-label="hours"><span class="launch-unit-full" aria-hidden="true">hrs</span><span class="launch-unit-short" aria-hidden="true">h</span></span></div><div><strong data-minutes>—</strong><span class="launch-unit" aria-label="minutes"><span class="launch-unit-full" aria-hidden="true">mins</span><span class="launch-unit-short" aria-hidden="true">m</span></span></div></div><p class="launch-date"><time datetime="${at}" aria-label="${label}"><span class="launch-date-full" aria-hidden="true">${label}</span><span class="launch-date-short" aria-hidden="true">1 Nov · 9am UK</span></time></p></div><p id="launch-scope" class="sr-only">The full system launches together: NUFI+ · Programmes · Meal planning · Courses · Supplements.</p></section>`;
}
export function renderFinder(){return `<div class="finder-page finder-branded">${renderFinderHeader()}<div data-programme-finder><p>Your programme finder is loading.</p><noscript><p>This interactive quiz needs JavaScript. You can still <a href="/programmes/">browse the programmes</a>.</p></noscript></div></div>`;}
