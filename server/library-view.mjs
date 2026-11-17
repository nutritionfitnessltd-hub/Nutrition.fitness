import { frame, activeShelf, shelfView, link } from './library-shelves.mjs';
import { assetButton } from './library-assets.mjs';
const path = '/content-library/';
const escape = value => String(value ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' })[c]);
const href = values => path + '?' + escape(new URLSearchParams(values).toString());
const label = key => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());
const fileLink = (id, file) => '<a href="' + href({file:id}) + '" download>' + escape(file.name) + '</a>';
function weekView(record, params, byId) {
  const weeks = record.fields.weeks;
  const week = weeks.find(w => String(w.number) === params.get('week')) || weeks[0];
  if (!week) return '';
  const sessions=(week.sessionIds||[]).map(id=>byId.get('training:'+id));
  const row=(name,cell)=>'<tr><th scope="row">'+escape(name)+'</th>'+sessions.map(s=>'<td>'+cell(s?.fields||{})+'</td>').join('')+'</tr>';
  const phase=(name,key)=>row(name,d=>d[key]?.length?'<details><summary>View '+name.toLowerCase()+'</summary>'+field(d[key],byId)+'</details>':'—');
  const blockRows=Array.from({length:Math.max(0,...sessions.map(s=>s?.fields.blocks?.length||0))},(_,i)=>row('Block '+(i+1),d=>{
    const b=d.blocks?.[i];if(!b)return '—';
    const ref=byId.get('training:'+b.referenceId);
    const activity=ref?.fields||{};
    const dose=b.setTargets?.length?b.setTargets.join(' / ')+' '+(b.unit||'reps'):b.repMin?b.sets+' × '+b.repMin+(b.repMax>b.repMin?'–'+b.repMax:'')+' reps':b.durationSeconds?b.durationSeconds+' seconds':b.distanceMetres?b.distanceMetres+' m':'';
    const activityDose=activity.repetitions>1?(activity.setDistanceMetres?activity.repetitions+' × '+activity.setDistanceMetres+' m':activity.workSeconds?activity.repetitions+' × '+activity.workSeconds+' seconds':''):activity.durationMinutes?activity.durationMinutes+' min':activity.distanceMetres?activity.distanceMetres+' m':'';
    const effort=b.effortType==='RIR'?b.effortValue+' reps left':b.effortType==='RPE'?'Effort '+b.effortValue+'/10':'';
    return (ref?'<a href="'+href({item:ref.id})+'">'+escape(ref.title)+'</a>':escape(b.title||b.type))+'<small>'+escape([dose||activityDose,b.restDisplay?b.restDisplay+' rest':b.restSeconds?b.restSeconds+' s rest':'',effort].filter(Boolean).join(' · '))+'</small>';
  })).join('');
  const table='<div class="week-scroll"><table><thead><tr><th>Workout</th>'+sessions.map((s,i)=>'<th scope="col">Day '+(i+1)+'<br>'+(s?'<a href="'+href({item:s.id})+'">'+escape(s.title)+'</a>':'Session unavailable')+'</th>').join('')+'</tr></thead><tbody>'+row('Duration',d=>d.duration?escape(d.duration)+' min':'—')+phase('Warm-up','warmup')+blockRows+phase('Cool-down','cooldown')+'</tbody></table></div>';
  const options=[...byId.values()].filter(r=>r.parent===record.parent && r.kind==='structure' && r.fields.frequency).sort((a,b)=>a.fields.frequency-b.fields.frequency);
  const days=options.length>1?'<nav class="tabs" aria-label="Days per week">'+options.map(r=>'<a href="'+href({item:r.id,week:week.number})+'"'+(r.id===record.id?' aria-current="page"':'')+'>'+escape(r.fields.frequency)+' days</a>').join('')+'</nav>':'';
  return days+'<section><h2>Weekly workouts</h2><nav aria-label="Choose week">' + weeks.map(w =>
    '<a href="' + href({item:record.id,week:w.number}) + '"' + (w===week?' aria-current="page"':'') + '>Week ' + escape(w.number) + '</a>'
  ).join('') + '</nav><h3>Week ' + escape(week.number) + (week.title?' · '+escape(week.title):'') + '</h3>' +
    (week.message ? '<p>'+escape(week.message)+'</p>':'') +
    table +
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
  const current = byId.get(params.get('item')) || (activeShelf(params,index)==='Courses' && byId.get('course:'+params.get('folder')));
  if (current) {
    const course=current.kind==='Course outline' && meta.courses?.[current.title];
    if(course){
      const tab=params.get('tab')||(course.sections.length?'lessons':'support');
      const row=(id,title)=>byId.has(id)?'<a href="'+href({item:id,from:current.id})+'">'+escape(byId.get(id).title)+'</a> '+assetButton(id):'<span>'+escape(title||'File unavailable')+'</span>';
      const modules=course.sections.map(s=>'<section><h2>'+escape(s.title)+'</h2><ol>'+s.entries.map(e=>'<li>'+row(e.id,e.title)+'</li>').join('')+'</ol></section>').join('');
      const roles=[...new Set(course.support.map(s=>s.role))];
      const resources=roles.map(role=>'<section><h2>'+escape(role)+'</h2><ul>'+course.support.filter(s=>s.role===role).map(s=>'<li>'+row(s.id)+'</li>').join('')+'</ul></section>').join('');
      return '<a class="back" href="'+href({shelf:'Courses'})+'">← Courses</a><article><a class="assign-link" href="'+href({work:'1',item:current.id})+'">Assign work</a><h1>'+escape(current.title)+'</h1>'+assetButton(current.id,'Course asset links')+'<p>'+escape(({confirmed:'Course order confirmed',partial:'Course order partly confirmed',unconfirmed:'Lesson order needs checking'})[course.order]||'Lesson order needs checking')+'</p><nav class="tabs">'+[['lessons','Lessons'],['support','Supporting files']].map(([t,name])=>'<a href="'+href({item:current.id,tab:t})+'"'+(t===tab?' aria-current="page"':'')+'>'+name+'</a>').join('')+'</nav>'+(tab==='support'?resources||'<p>No supporting files recorded.</p>':modules||'<p>No lesson order has been confirmed.</p>')+'</article>';
    }
    const files = current.files.map(id => [id,index.files[id]]).filter(([,f]) => f);
    const related = index.records.filter(r => r.parent === current.id);
    const sections = Object.entries(current.fields).map(([name,value]) => {
      if(name==='weeks' && current.kind==='structure' && Array.isArray(value))return weekView(current, params, byId);
      const title=({warmup:'Warm-up',blocks:'Main workout',cooldown:'Cool-down',recipeText:'Recipe',stageIds:'Stages'})[name] || label(name);
      return '<section><h2>' + escape(title) + '</h2><div class="prose">' + field(value,byId) + '</div></section>';
    });
    const preview=meta?.training?.[current.id] || meta?.assets?.[current.id]?.preview;
    const cover = !index.downloadsPaused && current.image && index.files[current.image];
    const parent = byId.get(current.parent)||byId.get(params.get('from'));
    return '<nav><a href="' + path + '">Library</a> / <a href="' + href({group:current.group}) + '">' + escape(current.group) + '</a>' + (parent ? ' / <a href="' + href({item:parent.id}) + '">' + escape(parent.title) + '</a>' : '') + '</nav>' +
      '<article><a class="assign-link" href="'+link({work:'1',item:current.id})+'">Assign work</a><p class="meta">' + escape(current.kind) + ' · ' + escape(label(current.status)) + '</p><h1>' + escape(current.title) + '</h1>' + (current.id.startsWith('catalogue:') || current.kind==='asset' || related.length ? assetButton(current.id) : '') +
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
