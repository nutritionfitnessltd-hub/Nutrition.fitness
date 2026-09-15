# Knowledge Centre — 15 September 2026

## Included
- Searchable `/knowledge-centre/` with topic and buyer-situation filters, sorting, active filters, pagination and URL-preserved state.
- 50 complete buyer guides: 15 Cost & prices, 20 Problems & solutions, 5 Confidence & concerns, 5 Comparisons, 5 Reviews. The agreed first ten retain priority.
- Readable article pages with a direct answer, section navigation, practical examples and comparison tables, source links, publication date, corporate byline, calculated reading time and related questions.
- Existing navy/plum styling and responsive layouts. The filter legend layout repair is retained.
- `/blog/` opens the hub when that route is not already owned by the base website. Original journal pages remain available.
- `SALES-FOLLOW-UP-PLAYBOOK.md` is an internal staff reference with 50 article-specific email drafts, 50 chat replies, discovery questions, suitability checks and measurement guidance. It is excluded from the public build. Nothing sends email or messages automatically.

## Editorial standard
Articles help a buyer decide whether, what and when to buy. They discuss cost, limitations, free alternatives and unsuitable purchases. The reviews are explicitly research-based, with commercial-interest disclosures and no invented hands-on testing, ratings, client outcomes or clinical review. Product prices are dated snapshots; hypothetical budgets are identified as examples.

NUFI membership pricing confirmed by the business is £29.99 monthly or £99 paid annually. The latter is £8.25 per month equivalent, paid upfront; twelve monthly payments total £359.88. Supplements and flavour shots are separate optional physical products. Billing terms and live service availability must be checked before sales use.

General health education uses cited primary sources. It does not diagnose, prescribe individual treatment or imply that AI replaces a clinician. The stressful-tracking article explicitly recommends appropriate support instead of a purchase.

The wider site remains a noindexed preview with payment, login and live NUFI services not connected. Publishing these articles does not implement those services. Photography is optional; no illustrative stock image has been presented as product testing or a customer outcome.

## Editing and building
Edit `src/knowledge-centre/articles.json`. Preserve IDs and slugs. Core fields include category, topics, situations, summary, priority, bodyHtml, status, publishedAt, shortAnswer, sources and salesUse. bodyHtml is editor-authored HTML; do not accept untrusted public input. No CMS write endpoint was added.

Each source has a title, direct URL and checkedAt date. Each salesUse record has buyerConcern, whenToSend, discoveryQuestion, emailSubject, emailBody, chatReply and nextStep. Internal salesUse content is not written to the public JSON index. Review dates and changing prices when revising the copy.

Taxonomy: `src/knowledge-centre/taxonomy.json`. Shell: derived from the restored website’s freshly built `dist/index.html`, preserving its header, footer, SVG sprite, fonts and shared scripts. No earlier global styles or shell are imported. Styles and browser logic: `public/knowledge-centre/`. Builder: `scripts/build-knowledge-centre.mjs`.

Run `npm run build` then `npm test`. The base website builder runs first, followed by `scripts/build-knowledge-centre.mjs`. The latter only writes Knowledge Centre pages, its optional `/blog/` alias, and additions to the existing route and search indexes. Pricing links point to the restored `/nufi/#pricing` section. Vercel uses Framework Other, output `dist` and the existing configuration. `KC_PUBLISHED_ONLY=1 npm run build` includes published articles only; all current 50 entries qualify. Published entries require a body, date, direct answer and sources. Optional images require alt text and credit.

## Verification and deployment
Automated checks cover the category distribution, editorial priorities, search, combined filters, article routes, complete bodies, sources, sales handoffs, public-index separation and existing commerce behaviour. A local-link and section-anchor audit is also run on the generated articles. A browser executable was unavailable in this workspace, so this update does not claim real-browser visual verification.

The GitHub repository is `nutritionfitnessltd-hub/Nutrition.fitness`. Its `main` branch deploys to the existing `nutrition-fitness-website-2.vercel.app` Vercel project. Keep the preview safeguards until the production services and content approval process are ready.


## Photography and handwritten notes — 15 September 2026

The Knowledge Centre now uses 50 distinct image selections: 49 free Unsplash photographs and the existing NUFI phone artwork for NUFI pricing. Image URLs, source-page credits, alt text and any custom crop position live with each article in `src/knowledge-centre/articles.json`. The photo sources are covered by the [Unsplash license](https://unsplash.com/license); photography is illustrative and does not imply product testing or endorsement. Images are served directly from the Unsplash image CDN with responsive sizes and lazy loading on cards.

Short, article-specific `marginNote` copy adds the original site's Kalam handwriting to selected cards and article photographs. The hub combines two linked photographs and small editorial asides. All presentation rules are scoped to Knowledge Centre classes; the existing homepage, shared CSS and site behaviour are unchanged.
