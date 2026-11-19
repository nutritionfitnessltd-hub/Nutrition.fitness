import { HttpError } from './platform.mjs';
import { editable } from './studio-store.mjs';
import { changeStudio } from './studio-actions.mjs';
import { editorFields, referenceData } from './studio-editor.mjs';
import { esc, url, hidden } from './studio-ui.mjs';

export function inlineWorkoutForm(session, data, dayName) {
  if (data.actor.role !== 'admin' && !data.assigned.has(session.id)) return '';
  return '<div data-workout-editor hidden><h3>Edit ' + esc(dayName || 'workout') + '</h3><p class="meta">Changes apply wherever this workout is used.</p>' +
    '<form method="post" action="' + url('item',{id:session.id}) + '" id="studio-editor-form" class="studio-form content-editor workout-inline-editor" data-workout-inline>' +
    hidden('action','workout-inline-save') + hidden('revision',session.revision || 0) + hidden('dayName',dayName) +
    editorFields(session) + '<p role="alert" data-workout-error hidden></p>' +
    '<div class="studio-save-bar"><span role="status" data-editor-status>All changes saved</span><div class="studio-actions"><button type="submit" class="primary">Save workout</button><button type="button" data-workout-cancel>Cancel</button></div></div></form>' +
    referenceData(data) + '</div><script type="module" src="/studio-workout-inline.js"></script>';
}

export async function saveInlineWorkout(params, f, data, api) {
  const record = editable(data,params.get('id'));
  if (record?.kind !== 'session' || record.status === 'Archived') throw new HttpError(400,'Choose an active workout.');
  // Use the same validation, permissions and revision-checked save as the full editor.
  const result = await changeStudio(params,{...f,action:'content-save',intent:'draft'},data,api,{returnRecord:true});
  return result.record;
}
