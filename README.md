# Nutrition.Fitness — complete website preview, v2

A real, responsive, multi-page website built around the approved cream, petrol, plum, aqua, blush and sage design. This is an importable front-end and developer handover, not another image mock-up.

**Status:** 62 generated pages plus a custom 404. The shop, basket, preferences and subscription controls work as clearly labelled local demonstrations. This package has not been deployed to a public URL by this conversation.

## Start here

**Review without installing anything:** open `nutrition-fitness-review.html` in a desktop browser. It contains the complete page set, styles, pictures and interactions in one file. Use the toolbar to jump between pages or switch to a narrow mobile preview. It is a local review file, not public hosting. A restrictive document previewer may block scripts: download and open the file in an ordinary browser instead.

**Run the source website:** use Node.js 22, then run `npm run dev` from the project root. The local address is `http://localhost:4173`. There are no runtime package dependencies. `npm run build` regenerates `dist/`; `npm run check` runs the Node tests, rebuilds and checks internal links.

**Deploy on Vercel:** import the project root as an **Other** project, use `npm run build`, and publish the `dist` directory. `vercel.json` is already included. See `docs/DEPLOY-TO-VERCEL.md`. No payment, AI or database keys are needed to publish the demonstration website.

## What is included

- The approved homepage, adapted to real page links and the plain-powder product model.
- NUFI+ landing page, membership comparison and a three-step onboarding preview.
- Eight programme landing pages: Start, Lose, Build, Strong, Fit, Home, Run and Hybrid.
- Five course landing pages with expandable proposed module outlines.
- Recipe ideas, recipe-book pages, a journal, coach selection and supporting brand pages.
- Thirteen shop product pages: three plain powders, six separate flavour shots and four digital recipe-book concepts.
- A subscription builder with explicit powder/shot quantities and four- or eight-week delivery options.
- Basket and order-review pages, local demonstration receipts, and example subscription management.
- Full-site search, catalogue filters, mobile navigation, empty states and a custom 404.
- A site map, source data, test suites and developer integration notes.

## The product model

The powder stays plain. Flavour shots are separate products, represented as pipette/dropper bottles. No flavour is silently blended into a powder, and no shot is included unless selected. One-off is the product-page default.

Product-page add-on shots are labelled **one-off**. The box builder is the explicit way to put shots on repeat. Four weeks means 28 days; eight weeks means 56 days. Optional NUFI+ digital membership is monthly or annual and is not silently treated as the same billing interval as physical deliveries.

All prices, pack sizes, delivery fees, discounts, membership terms and curricula are **illustrative and awaiting approval**. They are not assertions about final commercial terms.

## What is not live

No real account registration, payment capture, shipping, stock reservation, email sending, membership activation, live AI coaching, lesson media, ebook delivery or server-side subscription renewal is enabled. No customer database is included. Preview data stays in the browser; it is not an authoritative account record.

An optional, disabled-by-default Stripe **test-only** server adapter is included for developers. It refuses live secret-key prefixes. It is not connected to the main demo checkout and is not a complete live commerce backend. Mocked API tests do not establish an end-to-end Stripe deployment.

Jeff and Steff are explicitly AI coaches. The onboarding preview creates a preferences outline, not a health assessment or invented macro targets. Full product formulas, allergen declarations, nutrition values, policy documents and course/programme content must be verified before launch.

## Where to edit

| File | Purpose |
|---|---|
| `src/home.html` | Approved homepage body |
| `scripts/build.mjs` | Shared header/footer, landing-page templates and generated page content |
| `src/data.mjs` | Products, example prices in GBP pence, programmes, courses, recipe ideas and journal content |
| `src/commerce.mjs` | Shared validation, pricing, delivery and recurring-group calculation |
| `public/base.css` | Original approved homepage styles |
| `public/site.css` | Expanded site styles and responsive layouts |
| `public/site.mjs` | Local interactive journeys |
| `public/assets/` | Images and favicon, without bundled font files |
| `api/checkout.js` | Optional Stripe test session starter, disabled without server environment variables |
| `dist/` | Prebuilt, deployable static website |
| `docs/` | Deployment, integration, QA, content sign-off and page inventory |

Change source files, not just `dist/`, then rebuild. The review HTML is a generated review-only wrapper; it is **not** the production site architecture. Run `npm run review` after rebuilding when you need to refresh it.

## Handover and rollback

Use a separate preview project first. Do not overwrite the existing developer site, production domain, payment setup or customer records. The original single-page delivery and current developer environment have not been modified. Keep this ZIP as the v2 rollback artefact.

This is a framework-independent HTML/CSS/JavaScript site, not a WordPress theme or plugin ZIP. Developers can deploy it as supplied or port the actual markup, tokens and interactions into their existing application while retaining its real account and commerce services.

## Restoration and Knowledge Centre — 15 September 2026

This source restores the user-uploaded `nutrition-fitness-complete-site-v2.zip` (SHA-256 `acc4c6522c8a44a85e630e796a75be9468f1f9097044902fa30642ae59723ad3`). The original homepage source, base/site stylesheets, client interactions, data, API and public assets are preserved. The original homepage rebuilt byte-for-byte before integration.

The Knowledge Centre adds 50 full buyer guides, search, question/topic/situation filters, related articles and the sales follow-up playbook. Its pages reuse the restored site header, footer, fonts and scripts. It is included in navigation, the site map and site-wide search. A separate navigation stylesheet extends the original compact menu breakpoint to make room for the additional navigation link. Existing journal pages remain available.

Build: `npm run build` runs the original site builder, then the Knowledge Centre builder. The original 35 checkout/commerce tests passed; the seven Knowledge Centre tests and internal link checker verify the integration. Cloud browser access to the local preview was blocked, so no new local browser visual verification is claimed. The screenshots and standalone review bundled in the original ZIP are historical previews and are excluded from this restored source deployment.
