import { requireAccess } from './library-permissions.mjs';
import { HttpError } from './platform.mjs';
import { esc, link } from './library-shelves.mjs';
import {courseLessons,lessonAssetLink,videoLength,scriptCopy} from './course-lessons.mjs';

const assetPage = (id, extra = {}) => link({ work: '1', assets: id, ...extra });
export const assetButton = (id, label = 'Asset links') =>
  '<a class="asset-link" href="' + assetPage(id) + '">' + esc(label) + '</a>';

function sourceLink(entry) {
  try {
    const url = new URL(entry.url);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return '<li><a href="' + esc(url.href) + '" rel="noreferrer noopener" target="_blank">' +
      esc(entry.label) + '</a> <small>' + esc(url.hostname) + '</small></li>';
  } catch { return ''; }
}

export async function assetScreen(params, actor, api, load, display) {
  requireAccess(actor,'originals','sources');
  const id = params.get('assets');
  const admin = actor.role === 'admin';
  const back = '<a class="back" href="' + link({ work:'1' }) + '">← Work assignments</a>';
  if (id === 'all' && !admin) throw new HttpError(403, 'Open asset links from your assigned work.');
  const index = await load();
  if (id === 'all') {
    const directory = new Set(await display('asset-directory') || []);
    const query = (params.get('find') || '').trim().slice(0,160);
    const records = index.records.filter(r => directory.has(r.id) && r.title.toLowerCase().includes(query.toLowerCase()));
    const pages = Math.max(1, Math.ceil(records.length / 40));
    const page = Math.max(1, Math.min(pages, parseInt(params.get('page')) || 1));
    return back + '<h1>Original assets</h1><form class="workbar" action="/content-library/"><input type="hidden" name="work" value="1"><input type="hidden" name="assets" value="all"><label>Find an asset<input name="find" type="search" value="' + esc(query) +
      '"></label><button>Search</button></form><p>' + records.length + ' items with a link or file location</p><ul>' +
      records.slice((page-1)*40,page*40).map(r => '<li>'+assetButton(r.id,r.title)+' · '+esc(r.group)+'</li>').join('') +
      '</ul><nav class="pages">' + (page>1?'<a href="'+assetPage(id,{page:page-1,find:query})+'">Previous</a>':'') +
      ' Page '+page+' of '+pages+' ' + (page<pages?'<a href="'+assetPage(id,{page:page+1,find:query})+'">Next</a>':'')+'</nav>';
  }
  const records = new Map(index.records.map(r => [r.id,r]));
  const record = records.get(id);
  if (!record) throw new HttpError(404, 'This library item is unavailable.');
  const courses = id.startsWith('course:') || (!admin && id.startsWith('catalogue:')) ? (await display('shelves'))?.courses || {} : {};
  if (!admin) {
    const related = new Set([id]);
    for (let parent = records.get(record.parent); parent && !related.has(parent.id); parent = records.get(parent.parent)) related.add(parent.id);
    for (const [name,course] of Object.entries(courses)) {
      if (course.members?.includes(id)) related.add('course:'+name);
    }
    const allowed = await api('/rest/v1/rpc/nufi_library_can_open_asset', {
      service:true, method:'POST', payload:{ staff:actor.id, items:[...related] }
    });
    if (allowed !== true) throw new HttpError(403, 'This asset is outside your assigned work.');
  }
  if(params.has('lesson')){
    const entry=id.startsWith('course:')&&courseLessons(courses[record.title]||{}).find(e=>e.key===params.get('lesson'));
    if(!entry)throw new HttpError(404,'This course lesson is unavailable.');
    const lesson=await display('course-lesson:'+record.title+':'+entry.key);
    if(!lesson)throw new HttpError(404,'The lesson resources are unavailable.');
    return '<a class="back" href="'+link({work:'1',studio:'archive',item:id})+'">← '+esc(record.title)+'</a><h1>'+esc(entry.title)+'</h1><p>Lesson '+esc(entry.position)+' of '+courseLessons(courses[record.title]).length+' · Original video '+esc(videoLength(lesson.videoSeconds))+'</p>'+
      (lesson.canvaAvailable===false?'<p>Separate Canva source link still needs checking. The original video and script are available below.</p>':'')+
      '<section><h2>Original files</h2><ul class="source-list">'+(lesson.links||[]).map(sourceLink).join('')+'</ul></section>'+scriptCopy(lesson);
  }
  const asset = await display('asset-links:'+id);
  const links = (asset?.links || []).map(sourceLink).join('');
  const locations = (asset?.locations || []).map(l => '<li>'+esc(l.label)+'<br><code>'+esc(l.path)+'</code></li>').join('');
  const children = new Set(index.records.filter(r => r.parent === id).map(r=>r.id));
  if (id.startsWith('course:')) for (const member of courses[record.title]?.members || []) children.add(member);
  const nested = [...children].map(k=>records.get(k)).filter(Boolean);
  return back+'<h1>'+esc(record.title)+'</h1>'+
    (links?'<section><h2>Open original assets</h2><ul class="source-list">'+links+'</ul></section>':'')+
    (locations?'<section><h2>File locations</h2><ul class="source-list">'+locations+'</ul></section>':'')+
    (id.startsWith('course:')&&courseLessons(courses[record.title]||{}).some(e=>e.key)?'<section><h2>Lesson scripts and videos</h2><ol>'+courseLessons(courses[record.title]).filter(e=>e.key).map(e=>'<li>'+lessonAssetLink(id,e,e.title)+'</li>').join('')+'</ol></section>':'')+
    (nested.length?'<section><h2>Included items</h2><ul>'+nested.map(r=>'<li>'+assetButton(r.id,r.title)+'</li>').join('')+'</ul></section>':'')+
    (!links&&!locations&&!nested.length?'<p>No original link or file location has been recorded for this item.</p>':'')+
    (admin?assetButton('all','Browse all original assets'):'');
}
