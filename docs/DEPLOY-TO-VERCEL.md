# Deploy this preview to Vercel

## Current status

The files are prepared for Vercel, but no public deployment was created in this conversation. The Vercel actions were not exposed to the conversation's tool set, even after the user reported connecting the app. There is no verified live URL to report. A local HTML review file is included so review is not blocked by hosting.

## Project settings

Use a new preview project rather than replacing an existing live deployment.

| Setting | Value |
|---|---|
| Root directory | Folder containing this package's `package.json` and `vercel.json` |
| Framework preset | Other |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22.x, as declared in `package.json` |
| Required environment variables for the demo site | None |

Vercel's documented `buildCommand`, `outputDirectory`, `framework` and routing properties are used in the supplied configuration. The Node build has been run locally; the Vercel platform build still needs to be verified after import.

Import the source repository/project containing the extracted ZIP, select the root above, and deploy. Record the deployment URL returned by Vercel. Open the homepage, a direct product URL such as `/shop/plain-whey/`, and `/subscriptions/` in a private browser window. Refresh each direct URL. Check the custom 404 and the API's disabled response before sharing the preview link with the developers.

The package intentionally retains `noindex` in page metadata, HTTP headers and `robots.txt`. This prevents draft pricing and content being presented as finished search-engine pages. Keep appropriate preview access controls; `noindex` is not authentication or confidentiality protection.

## Public link versus production sales

A hosted preview is not a live commercial launch. Publishing this build does not activate payment processing, AI chat, course delivery or customer subscriptions. The banner and checkout disclosures stay in place until the real integrations and commercial content are approved.

## Optional Stripe test starter

Only for a protected developer test deployment, set `STRIPE_TEST_SECRET_KEY` and a matching HTTPS `SITE_URL` in server environment settings. Never commit secrets, send them in chat or place them in `public/`, `dist/` or browser JavaScript.

`POST /api/checkout` accepts `{ "items": [...] }`, an exact matching `Origin`, and a unique `X-Idempotency-Key` of 16–80 letters/numbers/underscores/hyphens. Each item uses the catalogue ID, integer quantity, `once` or `subscription`, and the appropriate cadence. The server computes prices from its own catalogue. The main demo UI does not call this endpoint automatically.

The optional starter deliberately refuses more than one recurring cadence per session, differing first-order/renewal delivery fees, unknown products and live secret keys. It returns a Stripe test checkout URL when successfully configured. Developers must handle split test sessions explicitly rather than hide separate charges. The `/payment-test/` return page does not assert a successful payment or fulfil anything.

See `DEVELOPER-HANDOVER.md` before connecting live commerce. The local static server does not execute Vercel server functions; the demo journeys continue to work without them.

## References

- Vercel static configuration: https://vercel.com/docs/project-configuration/vercel-json
- Vercel build configuration: https://vercel.com/docs/builds/configure-a-build
- Stripe Checkout Session creation: https://docs.stripe.com/api/checkout/sessions/create
- Stripe fulfilment guidance: https://docs.stripe.com/checkout/fulfillment

Documentation checked 10 September 2026. Follow the current provider instructions when deploying.
