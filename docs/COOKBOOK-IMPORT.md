# The High Protein Kitchen: full catalogue import

## Implemented
All 100 numbered recipes from the supplied `High-Protein-Kitchen-Designed(2).pdf` (143 pages) are in `data/cookbooks/high-protein-kitchen.json`. Source counts are 22 breakfasts, 24 lunches, 25 dinners, 14 snacks and 15 drinks; 1,038 ingredient rows and 575 method steps. Every recipe retains its page, source hash, published yield, per-serving estimate and method. 99 original recipe photographs plus the real front/back covers were extracted. Recipe 85 (Chocolate fudge bars, page 121) has no supplied photograph and is explicitly marked rather than matched to an unrelated image.

The six existing recipe identifiers remain stable. Personal recipe overrides remain authoritative and historical eaten nutrition is not rewritten. Timings not supplied as totals remain unknown, not zero. Original alternative measures, ambiguous package amounts and ranges are retained rather than silently converted. Source discrepancies are noted alongside the affected recipes and listed in `catalogue-manifest.json`; no guessed ingredients or altered nutrition have been inserted.

The book is listed in Shop and Recipe Books with its actual cover, 100-recipe contents and 143-page digital edition. Digital PDF and hardback are planned formats. No approved selling price was supplied, so its price is explicitly pending and it cannot be ordered for a made-up price or for zero. The complete paid PDF is NOT included in the public website or repository.

The shared countdown banner is retained on every generated page, including all 100 recipe pages and the book. Launch remains 1 November 2026, 09:00 UK.

## Existing Nutrition.Fitness database only
The user explicitly requires the database already used by `nutrition-fitness-website-2` / Nutrition.Fitness. Do not create a replacement project. Do not apply this to Love Stories Events, Castle Grove or a similarly named/unknown project.

`supabase/migrations/202609160003_recipe_catalogue.sql` and `supabase/seeds/high-protein-kitchen.sql` are prepared for the verified existing Nutrition.Fitness database. They add public read-only catalogue records without altering private workspaces, member identities or logs. Re-imports preserve rows marked `editor_override`. Before applying live, inspect the actual site's database reference and existing recipe schema, confirm a backup, and map these records into that schema where appropriate. Never infer the project reference from the organisation name.

No live database import is claimed here. During this change, the Vercel project read returned 403 and the current Supabase connection did not expose a confirmed Nutrition.Fitness project. The site catalogue is available immediately from its deterministic bundled mirror; that is distinct from a successful write to a hosted database. No unrelated database was read or written.

## Rebuild and checks
`npm run check` regenerates `public/recipes-data.mjs`, the PostgreSQL seed and source audit, builds all pages, then validates internal links and exactly one countdown per page. PostgreSQL CI imports the seed twice to check idempotence and verifies public-read/no-public-write permissions. Browser tests run against unmodified HTTP pages; the deployed read-only test does not create accounts, submit forms, or change customer data.

`python scripts/extract-cookbook.py /private/path/to/High-Protein-Kitchen-Designed\(2\).pdf` is an edition-specific, hash-guarded extraction tool using PyMuPDF and Pillow. The private PDF is not required to build the committed site. The authoritative source values are not independently nutrition-analysed.

## Rollback
Revert the catalogue/book change through Git and redeploy; retained previous recipe IDs protect saved plans. Database seed/migration are not auto-run by Vercel. Do not delete private data to roll back a catalogue. No release gates, CRM credentials, payments, DNS or app activation flags were changed.
