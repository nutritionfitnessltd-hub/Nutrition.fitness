import { HttpError } from './platform.mjs';

export const accessOptions = [
  ['library', 'Content library', 'Browse and read working content.'],
  ['originals', 'Originals', 'Browse the reference library and archive.'],
  ['studio', 'Studio', 'Create and import drafts within assigned projects. Requires Content library and editing.'],
  ['work', 'Work', 'See assigned projects, tasks and the calendar.'],
  ['edit', 'Edit assigned work', 'Edit assigned content and update assigned tasks.'],
  ['ai', 'AI drafting', 'Generate drafts and images using the connected AI account. Requires Content library and editing.'],
  ['sources', 'Open original files & links', 'Open archive downloads and assigned Canva, Drive and other source links. Requires Originals.']
];
export const defaultAccess = Object.freeze(Object.fromEntries(accessOptions.map(([key]) => [key, true])));
const keys = new Set(accessOptions.map(([key]) => key));
export function accessFor(actor) {
  // NULL is the migration-compatible legacy setting. Invalid saved values fail closed.
  if (actor?.role === 'admin') return { ...defaultAccess };
  if (actor?.role !== 'staff') return {};
  const raw = actor.access == null ? defaultAccess : actor.access;
  const access = Object.fromEntries([...keys].map(key => [key, raw?.[key] === true]));
  access.studio &&= access.library && access.edit;
  access.ai &&= access.library && access.edit;
  access.sources &&= access.originals;
  return access;
}
export const canAccess = (actor, key) => actor?.role === 'admin' || accessFor(actor)[key] === true;
export function requireAccess(actor, ...keys) {
  if (keys.some(key => !canAccess(actor, key))) throw new HttpError(403, 'Your account does not have access to this feature. Ask your administrator to update your access.');
}
export const canEditContent = (data, id) => data.actor.role === 'admin' ||
  (canAccess(data.actor, 'library') && canAccess(data.actor, 'edit') && data.assigned.has(id));

export function accessFromForm(fields) {
  if (fields.accessVersion !== '1') throw new HttpError(400, 'Reopen the team settings before saving access.');
  for (const [key, value] of Object.entries(fields)) if (key.startsWith('access_') &&
    (!keys.has(key.slice(7)) || value !== '1')) throw new HttpError(400, 'Choose valid access options.');
  return accessFor({ role: 'staff', access: Object.fromEntries([...keys].map(key => [key, fields['access_' + key] === '1'])) });
}

const routes = {
  home: [], assets: [], 'brand-media': ['library'], 'workspace-archive': [], library: ['library'], exercises: ['library'], item: ['library'], history: ['library'],
  'book-file': ['library'], 'article-image': ['library'], 'article-preview': ['library'], 'mealplan-image': ['library'],
  archive: ['originals'], create: ['studio'], new: ['studio'], import: ['studio', 'originals'],
  builder: ['studio'], 'worker-requests': ['studio'], projects: ['work'], project: ['work'],
  review: ['work', 'library'], 'review-preview': ['work', 'library'], calendar: ['work'], journey: ['work', 'library'],
  release: ['work', 'library'], export: ['work', 'library']
};
const actions = {
  'content-save': ['library', 'edit'], 'content-comment': ['library', 'edit'],
  'content-review': ['library', 'edit'], 'workout-inline-save': ['library', 'edit'],
  'workout-days-save': ['library', 'edit'], 'content-create': ['studio', 'edit'],
  'import-preview': ['studio', 'originals', 'edit'], 'import-save': ['studio', 'originals', 'edit'],
  'ai-draft': ['library', 'edit', 'ai'], 'mealplan-generate': ['library', 'edit', 'ai'],
  'mealplan-image-generate': ['library', 'edit', 'ai'],
  'task-save': ['work', 'edit'], 'task-add': ['work', 'edit'],
  'task-attach': ['work', 'library', 'edit'], 'project-save': ['work', 'edit']
};
export function authorizeStudioRequest(actor, section, method, fields = {}, params = new URLSearchParams()) {
  if (actor.role === 'admin') return;
  if (section === 'media' && method === 'GET') {
    if (params.get('preview') === 'brand-font') return;
    if (canAccess(actor, 'library') || canAccess(actor, 'originals')) return;
    throw new HttpError(403, 'Preview access is not enabled for your account.');
  }
  if (!Object.hasOwn(routes, section)) throw new HttpError(403, 'Administrator access is required.');
  requireAccess(actor, ...routes[section]);
  if (method === 'POST') {
    if (!Object.hasOwn(actions, fields.action)) throw new HttpError(403, 'This action is not available to your account.');
    requireAccess(actor, ...actions[fields.action]);
    if (fields.action === 'mealplan-generate' && !params.get('id')) requireAccess(actor, 'studio');
  }
}
