import { canAccess, canEditContent } from './library-permissions.mjs';
import { HttpError } from './platform.mjs';
import { descendants } from './studio-model.mjs';
import { editable, saveRecord } from './studio-store.mjs';
import { esc, url, button, hidden, input, select } from './studio-ui.mjs';

const resolve = (data, id) => data.byId.get(id) || data.byId.get('training:' + id);
export const canEditDays = (schedule, data) => canEditContent(data,schedule.id);

function availableWorkouts(schedule, data) {
  const schedules = data.items.filter(r => r.kind === 'structure' && r.status !== 'Archived' && (r.id === schedule.id || (schedule.parent && r.parent === schedule.parent)));
  const ids = new Set(schedules.flatMap(s => (s.fields.weeks || []).flatMap(w => w.sessionIds || [])));
  const rows = [...ids].map(id => resolve(data, id)).filter(r => r?.kind === 'session' && r.status !== 'Archived' && (data.actor.role === 'admin' || data.assigned.has(r.id)));
  return [...new Map(rows.map(r => [r.id, r])).values()].sort((a, b) => a.title.localeCompare(b.title));
}

function returnState(params, schedule, week, data) {
  const owner = data.byId.get(params.get('id'));
  const roots = owner ? [owner.id, ...data.projects.filter(p => p.studio?.rootId === owner.id).flatMap(p => p.entries.map(e => e.record).filter(Boolean))] : [];
  const programme = owner?.kind === 'programme' && descendants(roots, data.items).has(schedule.id);
  return { section:'item', id:programme ? owner.id : schedule.id, tab:'plan', schedule:schedule.id, week:String(week.number) };
}

export function workoutDaysEditor(params, data, schedule, week, submitted) {
  if (!canEditDays(schedule, data)) return '';
  const ids = week.sessionIds || [], state = returnState(params, schedule, week, data), choices = availableWorkouts(schedule, data);
  const options = Object.fromEntries(choices.map(r => [r.id, r.title]));
  // Keep an existing inaccessible/missing link visible; saving still validates every choice.
  for (const id of ids) {
    const r = resolve(data, id), key = r?.id || id;
    if (!Object.hasOwn(options, key)) options[key] = r?.title || 'Unavailable workout';
  }
  const rows = ids.map((id, i) => {
    const chosen = submitted ? String(submitted['session' + i] || '') : resolve(data, id)?.id || id;
    const label = submitted ? String(submitted['label' + i] || '') : week.dayLabels?.[i] || '';
    const rowOptions = { ...options };
    if (chosen && !Object.hasOwn(rowOptions, chosen)) rowOptions[chosen] = 'Unavailable selection';
    const current = resolve(data, chosen), canEdit = current?.kind === 'session' && (canEditContent(data,current.id));
    return '<fieldset class="workout-day-edit" data-day-row><legend>Day ' + (i + 1) + '</legend><div class="workout-day-fields">' +
      input('label' + i, 'Day name (optional)', label, 'text', 'maxlength="40" placeholder="e.g. Monday" data-day-label') +
      select('session' + i, 'Workout', rowOptions, chosen) + '</div><div class="studio-actions">' +
      '<button type="button" data-move-day="-1"' + (i === 0 ? ' disabled' : '') + '>Move earlier</button><button type="button" data-move-day="1"' + (i === ids.length - 1 ? ' disabled' : '') + '>Move later</button>' +
      (canEdit ? button('Edit this workout', url('item', {id:current.id, tab:'edit'})) : '') + '</div></fieldset>';
  }).join('');
  return '<section id="days-editor" class="panel workout-days-editor"><h3>Edit days · Week ' + esc(week.number) + '</h3><p>Name the days, change their order or choose a workout from this programme. These schedule changes apply to this week only.</p>' +
    '<p class="meta">Editing a workout changes its content wherever that workout is used.</p>' +
    '<form method="post" action="' + url('item', {...state, editDays:'1'}) + '" data-week-days' + (submitted ? ' data-unsaved="true"' : '') + '>' +
    hidden('action','workout-days-save') + hidden('schedule',schedule.id) + hidden('week',week.number) + hidden('revision',submitted?.revision ?? schedule.revision ?? 0) + hidden('count',ids.length) + rows +
    '<noscript><p>Enable JavaScript to reorder the days. You can still change their names and workouts.</p></noscript>' +
    '<div class="studio-save-bar"><span role="status" data-days-status>' + (submitted ? 'Unsaved changes' : 'All changes saved') + '</span><div class="studio-actions"><button class="primary"' + (!ids.length ? ' disabled' : '') + '>Save days</button>' + button('Cancel',url('item',state)) + '</div></div></form></section><script type="module" src="/studio-workout-days.js"></script>';
}

export async function saveWorkoutDays(params, f, data, api) {
  const schedule = editable(data, String(f.schedule || ''));
  if (schedule.kind !== 'structure' || schedule.status === 'Archived') throw new HttpError(400, 'Choose an active weekly plan.');
  const revision = Number(f.revision);
  if (!Number.isInteger(revision) || revision < 0 || revision !== (schedule.revision || 0)) throw new HttpError(409, 'This schedule has changed. Open the latest weekly plan before saving your changes.');
  const index = schedule.fields.weeks?.findIndex(w => String(w.number) === String(f.week));
  if (!(index >= 0)) throw new HttpError(400, 'Choose a week from this plan.');
  const week = schedule.fields.weeks[index], count = week.sessionIds?.length || 0;
  if (!count || count > 32 || Number(f.count) !== count) throw new HttpError(400, 'Keep the number of days in this weekly plan. Choose another training frequency to change the number of days.');
  const allowed = new Set(availableWorkouts(schedule, data).map(r => r.id));
  for (const id of week.sessionIds) { const r = resolve(data, id); if (r?.kind === 'session' && r.status !== 'Archived') allowed.add(r.id); }
  const ids = [], labels = [];
  for (let i = 0; i < count; i++) {
    const workout = resolve(data, String(f['session' + i] || ''));
    if (!workout || !allowed.has(workout.id)) throw new HttpError(400, 'Choose an available programme workout for Day ' + (i + 1) + '.');
    const label = String(f['label' + i] || '').trim();
    if (label.length > 40 || /[\u0000-\u001f]/.test(label)) throw new HttpError(400, 'Keep each day name to 40 characters on one line.');
    ids.push(workout.id); labels.push(label);
  }
  const next = structuredClone(schedule);
  next.fields.weeks[index] = {...next.fields.weeks[index], sessionIds:ids, dayLabels:labels};
  next.status = 'Draft'; delete next.approval; delete next.revision; delete next.updatedAt;
  await saveRecord(api, data.actor, next, revision);
  return {...returnState(params, schedule, week, data), day:'1', notice:'days-saved'};
}
