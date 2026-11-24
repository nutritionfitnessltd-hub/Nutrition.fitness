import { HttpError } from './platform.mjs';

export const accessOptions = [
  ['library', 'Content library', 'Browse and read working content.'],
  ['all_library', 'All company content (read only)', 'Read all company library content, including unfinished drafts. Editing still requires an assignment or authorship.'],
  ['shared_library', 'Shared content & brand assets', 'Read approved or explicitly shared content and brand assets. Editing still requires an assignment.'],
  ['originals', 'Originals', 'Browse the reference library and archive.'],
  ['studio', 'Studio', 'Create and import drafts within assigned projects. Requires Content library and editing.'],
  ['work', 'Work', 'See assigned projects, tasks and the calendar.'],
  ['edit', 'Edit assigned work', 'Edit assigned content and update assigned tasks.'],
  ['ai', 'AI drafting', 'Generate drafts and images using the connected AI account. Requires Content library and editing.'],
  ['sources', 'Open original files & links', 'Open archive downloads and assigned Canva, Drive and other source links. Requires Originals.']
];
export const reviewOptions = [
  ['review_articles', 'Articles', ['article']],
  ['review_food', 'Recipes & meal plans', ['recipe', 'mealplan']],
  ['review_training', 'Training programmes & workouts', ['programme','stage','structure','session','exercise','activity','rule','review']],
  ['review_courses', 'Courses & lessons', ['course','lesson','learning']],
  ['review_books', 'Books & guides', ['ebook','leadmagnet']],
  ['review_challenges', 'Challenges', ['challenge']],
  ['review_marketing', 'Messages, marketing & creative assets', ['communication','campaign','workflow','asset']]
];
export const defaultAccess = Object.freeze(Object.fromEntries([...accessOptions.map(([key]) => [key, !['shared_library','all_library'].includes(key)]), ...reviewOptions.map(([key]) => [key, false])]));
const keys = new Set(Object.keys(defaultAccess));
export function accessFor(actor) {
  // NULL is the migration-compatible legacy setting. Invalid saved values fail closed.
  if (actor?.role === 'admin') return Object.fromEntries([...keys].map(key=>[key,true]));
  if (actor?.role !== 'staff') return {};
  const raw = actor.access == null ? defaultAccess : actor.access;
  const access = Object.fromEntries([...keys].map(key => [key, raw?.[key] === true]));
  access.studio &&= access.library && access.edit;
  access.shared_library &&= access.library;
  access.all_library &&= access.library;
  access.ai &&= access.library && access.edit;
  access.sources &&= access.originals;
  return access;
}
export const canAccess = (actor, key) => actor?.role === 'admin' || accessFor(actor)[key] === true;
export function requireAccess(actor, ...keys) {
  if (keys.some(key => !canAccess(actor, key))) throw new HttpError(403, 'Your account does not have access to this feature. Ask your administrator to update your access.');
}
export const canEditContent = (data, id) => !data.byId?.get(id)?.sourceOnly && (data.actor.role === 'admin' ||
  (canAccess(data.actor, 'library') && canAccess(data.actor, 'edit') && data.assigned.has(id)));
export const reviewsKind = (actor, kind) => actor?.role === 'admin' ||
  (canAccess(actor,'library') && canAccess(actor,'work') && reviewOptions.some(([key,,kinds])=>kinds.includes(kind)&&canAccess(actor,key)));
export const canReviewContent = (data, record) => Boolean(record) && !record.sourceOnly && (data.actor.role === 'admin' ||
  (record.status === 'In review' && reviewsKind(data.actor,record.kind)));
const sharedKinds = new Set(['article','recipe','mealplan','programme','programme-family','stage','structure','session','exercise','activity','rule','review','course','lesson','learning','ebook','leadmagnet','challenge','communication','campaign','workflow','asset','product']);
export const canReadSharedContent = (actor, record) => Boolean(record) && sharedKinds.has(record.kind) &&
  (canAccess(actor,'all_library') || canAccess(actor,'shared_library') && record.status !== 'Archived' &&
  (record.status === 'Approved' || record.shared === true || record.fields?.shared === true));
export const canReadContent = (data, record) => Boolean(record) && (data.actor.role === 'admin' || (record.kind === 'supplier' && canAccess(data.actor,'library')) || data.assigned.has(record.id) || canReadSharedContent(data.actor,record) || canReviewContent(data,record) || data.reviewSupport?.has(record.id) || data.reviewedNow === record.id);

export function accessFromForm(fields) {
  if (fields.accessVersion !== '1') throw new HttpError(400, 'Reopen the team settings before saving access.');
  for (const [key, value] of Object.entries(fields)) if (key.startsWith('access_') &&
    (!keys.has(key.slice(7)) || value !== '1')) throw new HttpError(400, 'Choose valid access options.');
  return accessFor({ role: 'staff', access: Object.fromEntries([...keys].map(key => [key, fields['access_' + key] === '1'])) });
}

const routes = {
  'brand-file': ['shared_library'],
  task: ['work'], suppliers: ['library'], supplier: ['library'], products: ['library'], product: ['library'], 'product-creatives': ['library'], 'product-asset': ['library'], 'product-file': ['library'], 'product-upload': ['library'],
  'shiny-things': ['library'], home: [], 'team-work': [], assets: [], 'brand-media': ['library'], 'workspace-archive': [], library: ['library'], exercises: ['library'], item: ['library'], history: ['library'], 'review-history': ['work','library'],
  'book-file': ['library'], 'article-image': ['library'], 'article-preview': ['library'], 'newsletter-preview': ['library'], 'newsletter-html': ['library'], 'mealplan-image': ['library'],
  archive: ['originals'], create: ['studio'], new: ['studio'], import: ['studio', 'originals'],
  builder: ['studio'], 'worker-requests': ['studio'], projects: ['work'], project: ['work'],
  review: ['work', 'library'], 'review-preview': ['work', 'library'], calendar: ['work'], journey: ['work', 'library'],
  release: ['work', 'library'], export: ['work', 'library']
};
const actions = {
  'idea-save': ['library','edit'], 'idea-discussion': ['library','edit'],
  'course-structure-review': ['work','library'],
  'product-save': ['library','edit'], 'product-asset-save': ['library','edit'], 'product-asset-link': ['library','edit'], 'product-asset-status': ['library','edit'], 'product-file-save': ['library','edit'],
  'review-decision': ['work', 'library'], 'review-retry': ['work', 'library'],
  'content-save': ['library', 'edit'], 'content-comment': ['library', 'edit'],
  'content-review': ['library', 'edit'], 'workout-inline-save': ['library', 'edit'],
  'workout-days-save': ['library', 'edit'], 'content-create': ['studio', 'edit'],
  'import-preview': ['studio', 'originals', 'edit'], 'import-save': ['studio', 'originals', 'edit'],
  'ai-draft': ['library', 'edit', 'ai'], 'mealplan-generate': ['library', 'edit', 'ai'],
  'mealplan-image-generate': ['library', 'edit', 'ai'],
  'task-message': ['work'], 'task-note': ['work','edit'], 'task-file-save': ['work','edit'], 'assignment-status': ['work','edit'], 'task-save': ['work', 'edit'], 'task-add': ['work', 'edit'],
  'task-delete': ['work', 'edit'], 'task-restore': ['work', 'edit'], 'tracking-update': ['work', 'edit'],
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
    if(section==='task'&&fields.type==='blob.generate-client-token'){requireAccess(actor,'work','edit');return;}
    if (section === 'product-upload' && fields.type === 'blob.generate-client-token') { requireAccess(actor,'library','edit'); return; }
    if (!Object.hasOwn(actions, fields.action)) throw new HttpError(403, 'This action is not available to your account.');
    requireAccess(actor, ...actions[fields.action]);
    if (fields.action === 'mealplan-generate' && !params.get('id')) requireAccess(actor, 'studio');
  }
}
