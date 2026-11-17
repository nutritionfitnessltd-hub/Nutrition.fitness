const path = '/content-library/';
const escape = value => String(value ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' })[c]);
const href = values => path + '?' + escape(new URLSearchParams(values).toString());
const label = key => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());
const fileLink = (id, file) => '<a href="' + href({file:id}) + '" download>' + escape(file.name) + '</a>';
function weekView(record, params, byId) {
  const weeks = record.fields.weeks;
  const week = weeks.find(w => String(w.number) === params.get('week')) || weeks[0];
  if (!week) return '';
  const rows = (week.sessionIds || []).map((id, day) => {
    const session = byId.get('training:' + id);
    return '<tr><th scope="row">' + (day + 1) + '</th><td>' + field(id, byId) + '</td><td>' + escape(session?.fields.duration ? session.fields.duration + ' min' : '—') + '</td></tr>';
  }).join('');
  return '<section><h2>Weekly workouts</h2><nav aria-label="Choose week">' + weeks.map(w =>
    '<a href="' + href({item:record.id,week:w.number}) + '"' + (w===week?' aria-current="page"':'') + '>Week ' + escape(w.number) + '</a>'
  ).join('') + '</nav><h3>Week ' + escape(week.number) + (week.title?' · '+escape(week.title):'') + '</h3>' +
    (week.message ? '<p>'+escape(week.message)+'</p>':'') +
    '<table><thead><tr><th>Day</th><th>Workout</th><th>Duration</th></tr></thead><tbody>'+rows+'</tbody></table>' +
    field(Object.fromEntries(Object.entries(week).filter(([key])=>!['sessionIds','number','title','message'].includes(key))),byId)+'</section>';
}
function field(value, byId) {
  if (Array.isArray(value)) return '<ol>' + value.map(item => '<li>' + field(item, byId) + '</li>').join('') + '</ol>';
  if (value && typeof value === 'object') return '<dl>' + Object.entries(value).map(([key, val]) => '<dt>' + escape(label(key)) + '</dt><dd>' + field(val, byId) + '</dd>').join('') + '</dl>';
  if (typeof value === 'string' && (byId.has('training:' + value) || byId.has(value))) {
    const ref = byId.get('training:' + value) || byId.get(value);
    return '<a href="' + href({item:ref.id}) + '">' + escape(ref.title) + '</a>';
  }
  return escape(typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value);
}
function contents(index, params) {
  const byId = new Map(index.records.map(r => [r.id, r]));
  const current = byId.get(params.get('item'));
  if (current) {
    const files = current.files.map(id => [id,index.files[id]]).filter(([,f]) => f);
    const related = index.records.filter(r => r.parent === current.id);
    const sections = Object.entries(current.fields).map(([name,value]) => {
      if(name==='weeks' && current.kind==='structure' && Array.isArray(value))return weekView(current, params, byId);
      const title=({warmup:'Warm-up',blocks:'Main workout',cooldown:'Cool-down',recipeText:'Recipe',stageIds:'Stages'})[name] || label(name);
      return '<section><h2>' + escape(title) + '</h2><div class="prose">' + field(value,byId) + '</div></section>';
    });
    const cover = current.image && index.files[current.image];
    const parent = byId.get(current.parent);
    return '<nav><a href="' + path + '">Library</a> / <a href="' + href({group:current.group}) + '">' + escape(current.group) + '</a>' + (parent ? ' / <a href="' + href({item:parent.id}) + '">' + escape(parent.title) + '</a>' : '') + '</nav>' +
      '<article><p class="meta">' + escape(current.kind) + ' · ' + escape(label(current.status)) + '</p><h1>' + escape(current.title) + '</h1>' +
      (cover ? '<img class="cover" alt="" src="' + href({file:current.image,image:'1'}) + '">' : '') +
      (related.length ? '<section><h2>Explore ' + escape(current.title) + '</h2><ul>' + related.map(r => '<li><a href="' + href({item:r.id}) + '">' + escape(r.title) + '</a></li>').join('') + '</ul></section>' : '') +
      sections.join('') +
      (files.length ? '<section><h2>Files</h2><ul>' + files.map(([id,f]) => '<li>' + fileLink(id,f) + '</li>').join('') + '</ul></section>' : '') +
      (!files.length && current.id.startsWith('catalogue:') && !current.fields.recipeText ? '<p>Catalogue entry. A downloadable copy has yet to be added.</p>' : '') + '</article>';
  }
  const group=params.get('group') || '', q=(params.get('q') || '').slice(0,160);
  const groups=[...new Set(index.records.map(r=>r.group))].sort();
  const rows=index.records.filter(r=>(!group || r.group===group) && (!q || (r.title+' '+r.kind+' '+(r.fields.collection||'')).toLowerCase().includes(q.toLowerCase())));
  const pages=Math.max(1,Math.ceil(rows.length/30)), page=Math.min(pages,Math.max(1,Number.parseInt(params.get('page'),10)||1));
  return '<h1>Content library</h1><form class="search" method="get" action="'+path+'"><label>Search<input type="search" name="q" value="'+escape(q)+'" maxlength="160" placeholder="Find a recipe, workout or guide"></label><label>Collection<select name="group"><option value="">All collections</option>'+groups.map(g=>'<option'+(g===group?' selected':'')+'>'+escape(g)+'</option>').join('')+'</select></label><button>Search</button></form><p class="meta">'+rows.length+' results · Page '+page+' of '+pages+'</p><ul class="items">'+rows.slice((page-1)*30,page*30).map(r=>'<li><a href="'+href({item:r.id})+'"><strong>'+escape(r.title)+'</strong><span>'+escape(r.group)+' · '+escape(r.kind)+' · '+escape(label(r.status))+'</span></a></li>').join('')+'</ul>'+(!rows.length?'<p>Try another search or choose a different collection.</p>':'')+'<nav>'+(page>1?'<a href="'+href({q,group,page:page-1})+'">← Previous</a>':'')+' '+(page<pages?'<a href="'+href({q,group,page:page+1})+'">Next →</a>':'')+'</nav>';
}
export function renderLibrary({login,error,index,params}) {
  const main=(error?'<p role="alert">'+escape(error)+'</p>':'')+(login?'<h1>Content library</h1><p>Enter the password you received with your invitation.</p><form method="post" action="'+path+'"><label>Library password<input type="password" name="password" required maxlength="256" autocomplete="current-password"></label><button>Open library</button></form>':index?contents(index,params):'<a href="'+path+'">Return to the library</a>');
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Content library | Nutrition.fitness</title><link rel="stylesheet" href="/library-reader.css"></head><body><header><a href="'+path+'"><b>nutrition</b>.fitness</a>'+(index?'<form method="post" action="'+path+'"><button name="action" value="logout">Sign out</button></form>':'')+'</header><main>'+main+'</main></body></html>';
}
