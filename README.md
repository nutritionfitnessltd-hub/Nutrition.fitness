# Nutrition.Fitness — complete Vercel build

This is the full public-site and interactive review package, not just the homepage.

## Homepage handover rule
The homepage in `dist/index.html` intentionally returns to the approved original Nutrition.Fitness styling. The only change is section mapping/order so it corresponds to the developers’ existing homepage journey. **Do not add additional homepage rows, additional feature sets, a new colour system, or a new hero.** See `docs/HOMEPAGE-STRUCTURE-MAP.md`.

## Deploy to a clean Vercel project
1. Unzip the folder.
2. Create a new Vercel project from this folder/repository.
3. Framework preset: **Other**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Deploy as a preview first.

The package already contains the generated `dist/` output.

## Included
- Approved homepage direction with Jeff & Steff retained as illustrated AI coaches.
- Full NUFI marketing routes and six pillars.
- 8 main workout programmes + 10 bolt-ons.
- Recipes, interactive browser-preview meal planner and shopping list.
- Shop with 5 supplement concepts + 6 flavour-shot SKUs.
- Product pages, Build a Box, subscriptions, basket and checkout preview.
- Courses and course landing pages.
- About, why, story, trust, reviews, blog, help, contact and legal shells.
- Account/login/member-area preview routes.
- Shared CSS/JS, product mockups, responsive assets, data files, commerce logic and tests.

## Important production gate
This is intentionally a **preview/review build**. It is noindexed and does not take payment or authenticate users. Connect the real catalogue/CMS, identity, checkout/subscriptions, verified webhooks, fulfilment, support forms and secured NUFI APIs before production.

Do not remove the preview safeguards merely to make buttons look live.

## Knowledge Centre update
See docs/knowledge-centre/README.md. The searchable Knowledge Centre includes 50 complete, sourced buyer guides, with cost and problems accounting for 35 articles. The staff follow-up playbook in docs/knowledge-centre/SALES-FOLLOW-UP-PLAYBOOK.md provides a tailored email, chat reply and discovery question for each guide. This repository deploys to the existing nutrition-fitness-website-2 Vercel project through GitHub.
