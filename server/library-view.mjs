import { frame, activeShelf, shelfView, link } from './library-shelves.mjs';
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
  const options=[...byId.values()].filter(r=>r.parent===record.parent && r.kind==='structure' && r.fields.frequency).sort((a,b)=>a.fields.frequency-b.fields.frequency);
  const days=options.length>1?'<nav class="tabs" aria-label="Days per week">'+options.map(r=>'<a href="'+href({item:r.id,week:week.number})+'"'+(r.id===record.id?' aria-current="page"':'')+'>'+escape(r.fields.frequency)+' days</a>').join('')+'</nav>':'';
  return days+'<section><h2>Weekly workouts</h2><nav aria-label="Choose week">' + weeks.map(w =>
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
function contents(index, params, meta) {
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
    const preview=meta?.training?.[current.id] || meta?.assets?.[current.id]?.preview;
    const cover = !index.downloadsPaused && current.image && index.files[current.image];
    const parent = byId.get(current.parent);
    return '<nav><a href="' + path + '">Library</a> / <a href="' + href({group:current.group}) + '">' + escape(current.group) + '</a>' + (parent ? ' / <a href="' + href({item:parent.id}) + '">' + escape(parent.title) + '</a>' : '') + '</nav>' +
      '<article><a class="assign-link" href="'+link({work:'1',item:current.id})+'">Assign work</a><p class="meta">' + escape(current.kind) + ' · ' + escape(label(current.status)) + '</p><h1>' + escape(current.title) + '</h1>' +
      (preview ? '<img class="detail-preview" alt="" src="'+link({preview})+'">' : cover ? '<img class="cover" alt="" src="' + href({file:current.image,image:'1'}) + '">' : '') +
      (related.length ? '<section><h2>Explore ' + escape(current.title) + '</h2><ul>' + related.map(r => '<li><a href="' + href({item:r.id}) + '">' + escape(r.title) + '</a></li>').join('') + '</ul></section>' : '') +
      sections.join('') +
      (files.length ? '<section><h2>Files</h2>' + (index.downloadsPaused ? '<p>Downloads are temporarily unavailable.</p>' : '') + '<ul>' + files.map(([id,f]) => '<li>' + (index.downloadsPaused ? escape(f.name) : fileLink(id,f)) + '</li>').join('') + '</ul></section>' : '') +
      (!files.length && current.id.startsWith('catalogue:') && !current.fields.recipeText ? '<p>Catalogue entry. A downloadable copy has yet to be added.</p>' : '') + '</article>';
  }
  return shelfView(index,params,meta);
}
export function renderLibrary({login,error,index,params=new URLSearchParams(),meta={}}) {
  const section=index?activeShelf(params,index):'Content library';
  const alert=error?'<p role="alert">'+escape(error)+'</p>':'';
  const loginForm='<div class="auth"><h1>Content library</h1><form method="post" action="'+path+'"><label>Library password<input type="password" name="password" required maxlength="256" autocomplete="current-password"></label><button>Open library</button></form></div>';
  const main=alert+(login?loginForm:index?contents(index,params,meta):'<a href="'+path+'">Return to the library</a>');
  const note=index?.downloadsPaused?'<p class="availability" role="status">File downloads are temporarily unavailable. Recipes and workouts are open for reading.</p>':'';
  return frame({body:main+note,section,meta,guest:!!index,crumb:params.get('folder')||''});
}
