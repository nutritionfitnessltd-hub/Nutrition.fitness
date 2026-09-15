# Developer handover

## Preserve the approved design

Do not redesign this into a generic wellness/AI website. The approved homepage's typography, composition, food and phone images, palette and light humour are the reference. Extend the actual reusable components, not another generated mood board. Do not reintroduce navy-and-gold branding, neon accents, cartoon mascots, invented review scores or wall-to-wall handwritten decoration.

Core tokens are in `public/site.css`: ink `#092a3e`, petrol `#06475e`, plum `#863954`, paper `#fffdf9`, cream `#faf6ef`, aqua `#e3edf0`, blush `#f9e7e3`, sage `#dfe5d0`, peach `#f2dfd2`. Additional tints belong to the same restrained family. Keep buttons, contrast and input states visible. Main journeys live on full pages. Native disclosure sections are used for secondary information.

Typography is a hosted DM Sans request with sensible system fallbacks. Kalam is an optional hosted handwriting accent. Font binaries are not included. Existing handwritten-image assets also work offline.

## Scope and architecture

This package is the public website and an interactive review of the intended shopping/member journeys. It is not the NUFI app backend, full lesson library or live shop database. Landing-page curricula, dates/durations and offer details are proposed content, not imported finished live products.

The generator writes actual HTML routes to `dist/`. Core ecommerce calculations are a shared pure module rather than duplicated browser totals. Browser functions currently use local storage for review only. The single-file review wrapper embeds these outputs for offline review; do not port the wrapper or iframe into production.

Use the site's static pages/components in your existing platform, retaining working account, CMS and payment infrastructure where available. Do not create a second identity system merely to reproduce this preview. For WordPress delivery, implement the matching templates and checkout/account integrations in the owned theme/plugin; this ZIP itself is not uploadable as a WP plugin.

## Commerce invariants to retain

- Powder SKUs are unflavoured. Flavour shots are separate pipette-bottle SKUs with their own stock, labels, price and quantity.
- A product-page flavour add-on is one-off, explicitly disclosed. A box-builder flavour selection recurs on the chosen physical delivery interval.
- One-off purchases must not silently become subscriptions. No preselected paid digital membership add-on.
- Quantities are positive bounded integers. Prices are server-authoritative integer GBP pence, not amounts supplied by the browser.
- A given customer must not accidentally buy both monthly and annual NUFI access in one basket.
- Distinguish 4 weeks/28 days, 8 weeks/56 days, a calendar month and a year. Never relabel or silently convert them.
- Show the amount due today, delivery, each future charge and each interval before commitment.
- Future free-shipping eligibility excludes today's one-off extras and digital-only membership.
- Keep mixed recurring cadence groups explicit. The included test starter refuses unsupported combinations rather than charging a different schedule.

## Connect live systems in this order

**Catalogue and content:** approve the actual SKUs, pack sizes, ingredients, allergens, serving directions, product imagery, VAT treatment, shipping rules, refund/cancellation terms, recurring discounts and membership entitlements. Put trusted data in the actual CMS/catalogue. Validate every product claim. Replace the example prices and proposed course/programme outlines.

**Identity:** connect existing member login and secure sessions, server-side account ownership checks and persisted preferences. The browser's preview name/coach is not authentication. Health onboarding belongs to the secured NUFI service. Admins need access to verified onboarding records and a safe rerun/test flow.

**Orders/payments:** integrate the site's real commerce provider. Use server-owned price mappings, validation, stock handling, tax/shipping configuration, explicit renewal consent and secure hosted checkout. Do not make access decisions from return URLs or local storage. Create immutable order snapshots and handle idempotency, duplicate/out-of-order events and failures.

**Subscriptions:** use real provider-backed subscription records and a customer portal or authenticated API. Changes, pauses, skips, cancellations, retries and renewals need server state, effective dates, change summaries and receipts. Local preview buttons must be replaced, not relabelled as live. Handle NUFI entitlement separately from physical-box fulfilment unless the approved offer explicitly links them.

**Fulfilment:** verify signed webhook events and handle them idempotently before issuing ebooks, activating access, dispatching parcels or sending paid receipts. Maintain audit records, delivery state and refund handling. Test declined payments, authentication steps, duplicate webhooks, cancellations and a failed fulfilment retry. The supplied Stripe adapter has no webhook, order database or fulfilment worker.

**Courses and NUFI:** connect verified lesson media, progress and access checks. NUFI, not the public website, owns real training/meal plans and nutrition targets. Planned versus logged intake must reconcile there. User edits remain authoritative and target changes need traceable reasons. Jeff/Steff are disclosed AI identities; health/safety moments need clear, non-comedic language and suitable escalation.

**Support and messaging:** connect real support destinations and email services. The contact form currently prepares a local draft and says it has not sent anything. Do not show a success message without an actual accepted send. Add analytics/marketing only with the correct notices and consent handling.

## Production launch gate

Do not simply hide the preview banner and take payments. First complete content sign-off, live integration testing, security/access checks, accessible forms, policy review and native-browser/device testing. Confirm production prices, taxes and subscription terms against provider data. Replace concept imagery where required. Then remove noindex deliberately, add the real domain/canonical URLs and sitemap, and deploy using a documented rollback plan.

## What was not changed

No code, products, accounts, domains, subscriptions or data were modified on the original developer site. This is a separate rebuild package. No public Vercel deployment was created in the conversation.
