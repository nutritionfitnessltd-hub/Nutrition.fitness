# Nutrition.Fitness — November launch website

The approved multi-page website, extended in-place with the launch programme finder, structured recipes, meal planner/shopping list, programme/course system and proposed supplement imagery. Source is maintained on `launch/december-2026`, draft PR #1. The production/main baseline is deliberately preserved.

**Launch:** 1 November 2026 at 09:00 UK time. Everyone completing the programme finder may reserve one free calendar month of NUFI+, starting only at verified app activation on/after launch. No purchase/card/automatic charge.

## Run and test

Node 22. `npm run dev` builds and serves the website at `http://localhost:4173`. `npm run check` runs the Node suite, builds all pages and validates internal links/assets. `npm run build` generates `dist/`. The plain local server intentionally serves static pages only, not production account/CRM endpoints. Their UI must state that they are unconfigured, not simulate account success.

Deploy the repository root to a **Vercel preview** using the included `vercel.json`: Other framework, `npm run build`, output `dist`. API files are Vercel functions, not files to open with `file://`. No runtime npm package dependencies. The first clean checkout needs `node scripts/fetch-photo-assets.mjs` before building; it downloads the credited asset manifest. CI packages those local images with the source and generated site. This package does not include font files.

## Key pages

`/get-started/`, `/recipes/`, `/meal-planner/`, `/shopping-list/`, `/collections/`, `/recipe-edit/`, `/onboarding/`, `/programmes/`, `/courses/`, `/shop/`, `/account/`, `/admin/`.

Recipe and planner tools work as clearly labelled browser-only guest workspaces until accounts are configured. Account sync uses verified sessions, user-specific storage and optimistic version checks. A nutrition target is never silently inferred from the quiz. Edits to recipes do not rewrite already-logged food snapshots. The recipe library currently contains six recipes from the user's High Protein Kitchen, not the entire cookbook.

## Integration setup and limits

Read **`docs/LAUNCH-BUILD-STATUS.md`** before live deployment. It distinguishes finished code, six-recipe content coverage, external account/CRM configuration, the real NUFI app-access contract, tests and rollback. All server variable names are in `.env.example`; put actual values only in private environment settings.

The database migration is in `supabase/migrations/`. Never run `supabase/tests/bootstrap.sql` in a real project: it only creates a disposable CI auth scaffold. No project/credentials have been selected or configured by this build. No real email, payment, CRM contact or app entitlement has been created by tests.

Shop catalogue prices, stock, terms and proposed packaging are still examples. The original shopping flows remain explicitly demonstrations; production payment, fulfilment and the real app are not implemented by a static preview. Courses include reading lessons and personal completion, not invented video lessons or clinician-reviewed exercise prescriptions.

## File map

- `src/home.html`: preserved approved homepage.
- `scripts/build.mjs`, `src/experience.mjs`, `src/launch-layout.mjs`: page families and shared presentation.
- `public/food.mjs`, `public/food.css`: recipe/planner/course/account UI.
- `public/meal-core.mjs`, `public/food-store.mjs`: data rules, validation, guest/account persistence and conflict safety.
- `public/recipes-data.mjs`, `src/system-content.mjs`: source-backed recipe content and programme orientation.
- `public/launch*.mjs`, `public/programme-finder.mjs`: fixed launch contract and quiz.
- `api/`, `server/`: guarded server-only account, CRM, entitlement and admin adapters.
- `supabase/migrations/`, `supabase/tests/`: additive database schema and CI integrity tests.
- `tests/food-browser.py`: real HTTP browser journeys; explicit `--offline` harness is also available.

GitHub Actions runs code/link, PostgreSQL and HTTP browser checks and creates a complete ZIP plus screenshot evidence. Keep that ZIP for handover and rollback. The historical standalone HTML review generator is retired; use the actual HTTP website so module navigation, storage and connection errors behave correctly.


## Full High Protein Kitchen catalogue

The full supplied 100-recipe catalogue and actual book listing are now included. See `docs/COOKBOOK-IMPORT.md` for provenance, source-review notes, exact database-import boundaries and tests. The hosted database must be the existing Nutrition.Fitness project; no replacement or unrelated database is selected.
