# Recipe library website import

The website builds its recipe library from two supplied datasets:

- `data/cookbooks/high-protein-kitchen.json`: the existing 100 recipes. Their identifiers, content and original photographs remain unchanged.
- `data/cookbooks/recipe-library.json`: additional recipes extracted from the supplied recipe books. This file contains `source`, `books` and `recipes`. Each new recipe uses the existing meal-planner schema, with `sourceBookId`, `sourceBookTitle` and `sourceBooks` for its book/page references.

## Verified import, 21 September 2026

All 31 supplied PDF books were recovered and checked, covering 1,343 pages and 622 recipe entries. Matching complete recipe content consolidated 123 repeat entries into 499 additional recipes. Together with the existing edition, the website contains 599 recipes from 32 books and 598 supplied photographs. All 499 additional recipes have their original source photograph; the existing edition retains its one explicitly missing photograph.

Nineteen imported recipes have incomplete or conflicting source nutrition. Their printed figures and review notes remain in the source dataset, while their planner nutrition is unavailable until confirmed. Ingredients and methods remain usable. Exact amounts scale; ranges and compound quantities preserve their complete printed wording. Duplicate detection compares ingredients, ordered method, yield, nutrition and nutrition basis, preserving distinct variants.

The complete source PDFs were packaged separately for the owner. The public repository contains recipe data, selected recipe photographs, source book identifiers, page references and file hashes. It does not contain the full PDFs or Canva share links.

`scripts/build-recipe-catalogue.mjs` appends the additional recipes after the original catalogue. It rejects duplicate recipe identifiers and unknown source books. Recipe duplicates across books are represented once by the extraction dataset, with each book retained in `sourceBooks`. The website does not merge personal recipe changes into the public catalogue.

## Website behaviour

The recipe library shows its actual recipe count and offers search, meal, book and ordering controls. A recipe may appear in more than one book filter. The filter counts are unique recipes within that book; their sum can therefore exceed the complete catalogue count. Filter selections are preserved in the page URL.

Each recipe page shows its source book and page, original ingredients and method, supplied photograph when available, serving basis and source nutrition. Recipes with missing or ambiguous nutrition remain usable for planning and shopping, while their nutrition is marked for review and omitted from structured nutrient claims. A missing photograph remains explicit.

The original High Protein Kitchen product, price status and cover remain unchanged. Its recipe and category links select that book's own recipes.

Personal versions take priority over the bundled recipe with the same identifier. Their original book membership remains available for filtering, even after saving or restoring a browser workspace. Adding recipes does not rewrite previous meal plans, collections or logged food. Nutrition in an existing food log remains a snapshot of the version that was eaten.

## Generated files and checks

`npm run build` generates the browser mirror at `public/recipes-data.mjs`, recipe pages, and `data/cookbooks/website-catalogue-manifest.json`. The latter records the combined recipe count, per-book membership counts, category counts, photographs and recipes requiring nutrition review. The existing `catalogue-manifest.json` and `high-protein-kitchen.sql` continue to describe only the original 100-recipe edition.

Run `npm run check` for source, planner, catalogue, link and banner tests. Catalogue tests verify every source record, recipe page, JSON-LD method, planner import, shopping list, nutrition snapshot and local image. The existing browser acceptance scripts also check the complete catalogue count while retaining the original book's category checks.

The completed local import passed all 197 Node tests with no skips, the site build, 64,123 internal link/asset checks and the banner check on all 759 generated pages. `python3 scripts/test-extract-recipe-library.py` passed nine extraction regression tests. Browser regression suites run in the existing GitHub Actions workflow.

This website build does not apply a hosted database migration. The existing Nutrition.Fitness database must be identified independently before any database import; a bundled website catalogue is not evidence of a hosted database write.
