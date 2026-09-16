/** Shared, two-pass static layout compiler. The base generator owns page bodies;
 * this compiler owns launch chrome. Unexpected base markup fails the build. */
import {LAUNCH} from '../public/launch-config.mjs';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accentFor(route){if(route.startsWith('/recipes')||route.startsWith('/meal-planner'))return 'green';if(route.startsWith('/courses'))return 'terracotta';if(route.startsWith('/programmes')||route.startsWith('/nufi')||route.startsWith('/shop')||route.startsWith('/get-started'))return 'petrol';if(route.startsWith('/knowledge-centre'))return 'ochre';return 'plum';}
export function compileLaunchLayout(html,route){
 const preview=html.indexOf('<div class="preview-bar">'),header=html.indexOf('<header class="site-header">');
 if(preview<0||header<preview)throw new Error(`Base header contract changed: ${route}`);
 html=html.slice(0,preview)+html.slice(header);
 html=html.replace('<meta name="theme-color" content="#faf6ef">','<meta name="theme-color" content="#ffffff">');
 html=html.replace('</head>','<link rel="stylesheet" href="/launch.css"><script type="module" src="/launch.mjs"></script></head>');
 html=html.replace(/<body([^>]*)>/,`<body$1 data-accent="${accentFor(route)}">`);
 html=html.replace('href="/get-started/">Get started','href="/get-started/">Find my programme');
 return html;
}
export function launchWidget(){return `<div class="launch-widget"><p class="launch-kicker" data-launch-kicker>Less complicated starts 1 December.</p><div class="launch-clock" data-launch-clock aria-hidden="true"><div><strong data-days>—</strong><span>Days</span></div><div><strong data-hours>—</strong><span>Hours</span></div><div><strong data-minutes>—</strong><span>Minutes</span></div></div><p class="launch-date"><time datetime="${LAUNCH.at}">${LAUNCH.label}</time> · The whole system, together.</p></div>`;}
export function renderFinder(){return `<div class="finder-page"><header class="finder-head"><p class="eyebrow">A starting point, not a sales pitch.</p><h1>Find your programme.<br><span class="plum">Your first month is on us.</span></h1><p class="lead">A few questions about your actual life. A programme that makes sense. One free month of NUFI+ for everyone who completes the quiz.</p><p class="finder-perks">No purchase required. No payment card. No automatic charge.</p></header><div data-programme-finder><p>Your programme finder is loading.</p><noscript><p>This interactive quiz needs JavaScript. You can still <a href="/programmes/">browse the programmes</a>.</p></noscript></div></div>`;}
