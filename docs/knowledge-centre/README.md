# Knowledge Centre update — 15 September 2026

## Included
- /knowledge-centre/ with search, suggested searches, three filter groups, dynamic counts, sorting, active filter removal, pagination and URL-preserved state.
- 50 individually addressable draft guide pages: 15 Cost, 20 Problems, 5 Confidence, 5 Comparisons, 5 Reviews. The agreed first 10 have priority.
- White background, existing navy/plum typography, responsive filter panel and responsive grid.
- Blog navigation changed to Knowledge Centre across the saved website. /blog/ opens the new hub; existing /blog/article/ URLs remain available.
- Article template with summary, editorial status, topic links, related articles and optional photography, credit, publication date and calculated reading time.

## Content status
All 50 guides are drafts, not finished articles. The earlier blog pages were also generic templates, so no editorial content has been represented as published. Prices, testing results, reviews and author credentials have not been invented. Individual real photography is not yet supplied; draft cards use an intentional text layout. Add a distinct relevant photograph, alt text and credit to each completed article. Published cards automatically display the image and reading time.

## Source
Edit src/knowledge-centre/articles.json. Fields: id, slug, title, category, topics, situations, summary, status, priority, bodyHtml, publishedAt, image, imageAlt, imageCredit. bodyHtml is trusted editor-authored HTML; do not write untrusted user input to it. No CMS backend or public write endpoint has been added.
Taxonomy: src/knowledge-centre/taxonomy.json.
HTML shell: src/knowledge-centre/shell.html.
Styles and browser behaviour: public/knowledge-centre/.
Build: scripts/build-knowledge-centre.mjs.

## Build and review
Run npm run build and npm test. Serve dist with a static HTTP server. On Vercel keep Framework Other, output dist and the existing vercel.json. All existing preview/noindex safeguards remain.
The default build includes clearly marked drafts for structural review. KC_PUBLISHED_ONLY=1 npm run build excludes drafts and removes their generated routes. With the present data this gives an empty library: write and approve the guides before a public content launch. Published entries require body, publication date and image metadata.

## Verification
Build passed. Eight automated checks passed, including the existing commerce tests and new taxonomy, search, filter and article-route tests. 1,854 local links/assets referenced from Knowledge Centre HTML resolved. Published-only mode removes all draft pages and records. A browser executable could not be installed due to download timeouts; visual, keyboard and real-browser interaction QA remains outstanding.

## Deployment status
The existing Nutrition.Fitness live deployment could not be identified through the available Sites, GitHub or Vercel connections. No live site was changed. Apply these files to the current project only after matching the source version; the base is NUTRITION-FITNESS-ORIGINAL-DESIGN-DEVELOPER-STRUCTURE.zip. This package is not based on an inferred live checkout.
