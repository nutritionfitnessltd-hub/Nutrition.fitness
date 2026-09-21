# Nutrition.Fitness — November launch website

The Nutrition.Fitness multi-page website, extended in place with account access, protected website administration, the launch programme finder, source-backed recipes, meal planning, shopping lists and programmes. Vercel builds the deployable site from this source.

## Accounts and website management

The new full-page portal provides `/login/`, `/register/`, password recovery, `/account/` and `/admin/`. Administrators can manage members, recipe content, selected website copy, product descriptions, site settings and an activity log. These controls use verified sessions and protected server/database permissions.

**Live account activation remains pending service configuration and the first administrator assignment.** See [the account/admin handover](docs/ACCOUNT-ADMIN-HANDOVER.md) for the exact setup, supported fields, security checks and operational limits. Local previews clearly report unavailable account services.

**Launch:** 1 November 2026 at 09:00 UK time. Everyone completing the programme finder may reserve one free calendar month of NUFI+, starting only at verified app activation on/after launch. No purchase/card/automatic charge.

## Run and test

Node 22. `npm run dev` builds and serves the website at `http://localhost:4173`. `npm run check` runs the Node suite, builds all pages and validates internal links/assets. `npm run build` generates `dist/`. The plain local server intentionally serves static pages only, not production account/CRM endpoints. Their UI must state that they are unconfigured, not simulate account success.

Deploy the repository root to a **Vercel preview** using the included `vercel.json`: Other framework, `npm run build`, output `dist`. API files are Vercel functions, not files to open with `file://`. No runtime npm package dependencies. The first clean checkout needs `node scripts/fetch-photo-assets.mjs` before building; it downloads the credited asset manifest. CI packages those local images with the source and generated site. This package does not include font files.

## Key pages

`/get-started/`, `/recipes/`, `/meal-planner/`, `/shopping-list/`, `/collections/`, `/recipe-edit/`, `/onboarding/`, `/programmes/`, `/courses/`, `/shop/`, `/account/`, `/admin/`.

Recipe and planner tools work as clearly labelled browser-only guest workspaces until accounts are configured. Account sync uses verified sessions, user-specific storage and optimistic version checks. A nutrition target is never silently inferred from the quiz. Edits to recipes do not rewrite already-logged food snapshots. The catalogue contains the original 100 free recipes and 499 additional account-restricted recipe previews. Private cooking content requires verified access; held content stays unavailable until reviewed.

## Integration setup and limits

Read **`docs/LAUNCH-BUILD-STATUS.md`** before live deployment. It records the original launch integration boundaries. Current recipe coverage is documented in `docs/COOKBOOK-IMPORT.md`; the current account/admin release is documented in `docs/ACCOUNT-ADMIN-HANDOVER.md`. All server variable names are in `.env.example`; put actual values only in private environment settings.

The database migration is in `supabase/migrations/`. Never run `supabase/tests/bootstrap.sql` in a real project: it only creates a disposable CI auth scaffold. No project/credentials have been selected or configured by this build. No real email, payment, CRM contact or app entitlement has been created by tests.

Shop catalogue prices, stock, terms and proposed packaging are still examples. The original shopping flows remain explicitly demonstrations; production payment, fulfilment and the real app are not implemented by a static preview. Courses include reading lessons and personal completion, not invented video lessons or clinician-reviewed exercise prescriptions.

## File map

- `src/home.html`: preserved approved homepage.
- `scripts/build.mjs`, `src/experience.mjs`, `src/launch-layout.mjs`: page families and shared presentation.
- `public/food.mjs`, `public/food.css`: recipe/planner/course UI.
- `src/account-pages.mjs`, `public/account.mjs`, `public/account.css`: login, account and administration.
- `public/account-sync.mjs`: explicit account/guest plan sync and backup controls.
- `public/managed-content.mjs`: published content updates for the supported website fields.
- `public/meal-core.mjs`, `public/food-store.mjs`: data rules, validation, guest/account persistence and conflict safety.
- `public/recipes-data.mjs`, `src/system-content.mjs`: source-backed recipe content and programme orientation.
- `public/launch*.mjs`, `public/programme-finder.mjs`: fixed launch contract and quiz.
- `api/`, `server/`: guarded server-only account, CRM, entitlement and admin adapters.
- `supabase/migrations/`, `supabase/tests/`: additive database schema and CI integrity tests.
- `tests/food-browser.py`: real HTTP browser journeys; explicit `--offline` harness is also available.

GitHub Actions runs code/link, PostgreSQL and HTTP browser checks and creates a complete ZIP plus screenshot evidence. Keep that ZIP for handover and rollback. The historical standalone HTML review generator is retired; use the actual HTTP website so module navigation, storage and connection errors behave correctly.


## Full High Protein Kitchen catalogue

The full supplied 100-recipe catalogue and actual book listing are now included. See `docs/COOKBOOK-IMPORT.md` for provenance, source-review notes, exact database-import boundaries and tests. Use the owner-confirmed Nutrition.Fitness database project; do not reuse an unrelated business's database. No hosted project is selected by this source release.
