import { inlineWorkoutForm } from './studio-workout-inline.mjs';
import { esc, url, button } from './studio-ui.mjs';
import { fieldLabel } from '../public/studio-fields.mjs';

const has = v => v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0);
const reference = (id, data) => data.byId.get(id) || data.byId.get('training:' + id);
const link = r => '<a href="' + url('item', { id: r.id, tab: 'preview' }) + '">' + esc(r.title) + '</a>';
const range = (min, max) => has(min) ? String(min) + (has(max) && String(max) !== String(min) ? '–' + max : '') : has(max) ? 'Up to ' + max : '';

// Unknown content stays available, including nested prescriptions and future fields.
function valueHtml(value, data) {
  if (Array.isArray(value)) return '<ul>' + value.map(v => '<li>' + valueHtml(v, data) + '</li>').join('') + '</ul>';
  if (value && typeof value === 'object') return '<dl>' + Object.entries(value).filter(([, v]) => has(v)).map(([k, v]) => '<dt>' + esc(fieldLabel(k)) + '</dt><dd>' + valueHtml(v, data) + '</dd>').join('') + '</dl>';
  const ref = typeof value === 'string' ? reference(value, data) : null;
  return ref ? link(ref) : esc(typeof value === 'boolean' ? value ? 'Yes' : 'No' : value);
}

function dose(block) {
  let unit = block.unit || (has(block.durationSeconds) ? 'sec' : has(block.distanceMetres) ? 'metres' : 'reps');
  unit = unit.replace(/\/side/g, ' each side');
  if (block.perSide && !/side/i.test(unit)) unit += ' each side';
  const targets = Array.isArray(block.setTargets) ? block.setTargets : [];
  const simpleTargets = targets.length && targets.every(t => ['string', 'number'].includes(typeof t));
  if (simpleTargets) {
    if (targets.every(t => String(t) === String(targets[0])) && (!has(block.sets) || Number(block.sets) === targets.length)) {
      return { main: targets.length + ' × ' + targets[0] + ' ' + unit };
    }
    return { main: (has(block.sets) ? block.sets : targets.length) + ' sets', targets: targets.map((t, i) => 'Set ' + (i + 1) + ': ' + t + ' ' + unit).join(' · ') };
  }
  const target = range(block.repMin, block.repMax);
  const parts = [target ? target + ' ' + (block.unit || 'reps').replace(/\/side/g, ' each side') : '', has(block.durationSeconds) ? block.durationSeconds + ' sec' : '', has(block.distanceMetres) ? block.distanceMetres + ' metres' : ''].filter(Boolean);
  let main = (has(block.sets) ? block.sets + (parts.length ? ' × ' : ' sets') : '') + parts.join(' · ');
  if (block.perSide && main && !/side/i.test(main)) main += ' each side';
  return { main: main || 'See prescription', structuredTargets: targets.length ? targets : null };
}

function exerciseRow(block, index, data) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return '<li class="workout-exercise">' + valueHtml(block, data) + '</li>';
  const ref = reference(block.referenceId, data), prescription = dose(block);
  const rest = has(block.restDisplay) ? block.restDisplay : range(block.restSeconds, block.restMaxSeconds);
  const effort = has(block.effortValue) ? (String(block.effortType).toUpperCase() === 'RIR' ? block.effortValue + ' reps in reserve' : [block.effortType, block.effortValue].filter(has).join(' ')) : block.effortType;
  const metrics = [['Sets & target', prescription.main], ['Effort', effort], ['Rest', rest ? rest + (has(block.restDisplay) ? '' : ' sec') : '']];
  const handled = new Set(['type','referenceId','sets','setTargets','unit','repMin','repMax','durationSeconds','distanceMetres','perSide','effortType','effortValue','restSeconds','restMaxSeconds','restDisplay','method','tempo','notes','primaryLift']);
  const details = Object.entries(block).filter(([k, v]) => !handled.has(k) && has(v));
  const title = ref ? link(ref) : esc(block.title || block.name || (block.referenceId ? 'Unavailable exercise (' + block.referenceId + ')' : block.type === 'activity' ? 'Activity' : 'Exercise'));
  return '<li class="workout-exercise"><div class="workout-exercise-head"><span class="workout-number" aria-hidden="true">' + (index + 1) + '</span><h4>' + title + '</h4>' + (block.primaryLift ? '<span class="studio-status">Primary lift</span>' : '') + '</div>' +
    '<dl class="workout-metrics">' + metrics.filter(([, v]) => has(v)).map(([label, v]) => '<div><dt>' + label + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>' +
    (prescription.targets ? '<p class="workout-set-targets">' + esc(prescription.targets) + '</p>' : '') +
    (prescription.structuredTargets ? '<div>Set targets' + valueHtml(prescription.structuredTargets, data) + '</div>' : '') +
    ([block.method, has(block.tempo) ? 'Tempo: ' + block.tempo : ''].filter(has).length ? '<p class="workout-method">' + esc([block.method, has(block.tempo) ? 'Tempo: ' + block.tempo : ''].filter(has).join(' · ')) + '</p>' : '') +
    (has(block.notes) ? '<div class="workout-cue">' + valueHtml(block.notes, data) + '</div>' : '') +
    (details.length ? '<details class="workout-details"><summary>Coaching &amp; alternatives</summary><dl>' + details.map(([k, v]) => '<dt>' + esc(({ ruleId: 'Training rule', commonError: 'What to avoid', stopRule: 'When to stop', approvedSwaps: 'Approved alternatives' })[k] || fieldLabel(k)) + '</dt><dd>' + valueHtml(v, data) + '</dd>').join('') + '</dl></details>' : '') + '</li>';
}

export function workoutSession(session, data, { standalone = false, dayName = '', inline = false } = {}) {
  const f = session.fields || {}, blocks = Array.isArray(f.blocks) ? f.blocks : has(f.blocks) ? [f.blocks] : [];
  const canEdit = data.actor.role === 'admin' || data.assigned.has(session.id);
  const section = (title, value) => has(value) ? '<section class="workout-preparation"><h3>' + title + '</h3><div class="prose">' + valueHtml(value, data) + '</div></section>' : '';
  const extra = Object.fromEntries(Object.entries(f).filter(([k, v]) => !['duration','introduction','warmup','blocks','cooldown','adjustmentRuleIds'].includes(k) && has(v)));
  return '<div class="workout-session">' + (!standalone ? '<header class="workout-header"><div><h3>' + esc(session.title) + '</h3><p>' + [has(f.duration) ? esc(f.duration) + ' min' : '', blocks.length + (blocks.length === 1 ? ' exercise / activity' : ' exercises / activities')].filter(Boolean).join(' · ') + '</p></div>' + (canEdit ? (inline ? '<button type="button" data-workout-edit>' + esc(dayName ? 'Edit ' + dayName + ' workout' : 'Edit workout') + '</button>' : button(dayName ? 'Edit ' + dayName + ' workout' : 'Edit workout', url('item', { id: session.id, tab: 'edit' }))) : '') + '</header>' : has(f.duration) ? '<p class="workout-duration">' + esc(f.duration) + ' min</p>' : '') +
    (has(f.introduction) ? '<div class="workout-introduction prose">' + valueHtml(f.introduction, data) + '</div>' : '') +
    section('Warm-up', f.warmup) + '<section class="workout-main"><h3>Main work</h3>' + (blocks.length ? '<ol class="workout-exercises">' + blocks.map((b, i) => exerciseRow(b, i, data)).join('') + '</ol>' : '<p>No exercises have been added yet.</p>') + '</section>' +
    section('Cool-down', f.cooldown) + (Object.keys(extra).length ? '<details class="workout-guidance"><summary>Coaching &amp; session guidance</summary>' + valueHtml(extra, data) + '</details>' : '') + '</div>';
}

export function workoutDays(params, data, sessions, href, labels = []) {
  if (!sessions.length) return '<p class="studio-empty">No workouts have been added to this week yet.</p>';
  const requested = Number(params.get('day')), day = Number.isInteger(requested) && requested >= 1 && requested <= sessions.length ? requested : 1;
  return '<nav class="workout-days" aria-label="Workout days">' + sessions.map((s, i) => '<a data-session-id="' + esc(s?.id || '') + '" href="' + href(i + 1) + '#workout"' + (i + 1 === day ? ' aria-current="page"' : '') + '><span>Day ' + (i + 1) + (labels[i] ? ' · ' + esc(labels[i]) : '') + '</span><strong>' + esc(s?.title.split(' — ').at(-1) || 'Session unavailable') + '</strong>' + (has(s?.fields.duration) ? '<small>' + esc(s.fields.duration) + ' min</small>' : '') + '</a>').join('') + '</nav>' +
    '<section id="workout" class="workout-selected" aria-label="Day ' + day + ' workout"><p class="workout-day-label">Day ' + day + ' of ' + sessions.length + '</p>' + (sessions[day - 1] ? '<div data-workout-preview>'+workoutSession(sessions[day - 1], data, {dayName:'Day ' + day,inline:true})+'</div><p role="status" data-workout-saved></p>'+inlineWorkoutForm(sessions[day - 1],data,'Day ' + day) : '<p class="studio-empty">This session is unavailable. Choose another day or check the linked workout.</p>') + '</section>';
}
