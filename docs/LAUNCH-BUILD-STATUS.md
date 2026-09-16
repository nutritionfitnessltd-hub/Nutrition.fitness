# December launch — first implementation milestone

## Confirmed offer

All offerings are scheduled for 1 December 2026 at 09:00 Europe/London (09:00 UTC on that date). Everyone completing the programme finder can reserve one free month of NUFI+. No programme/supplement purchase or payment card is required. The month starts at activation, not prelaunch registration. No automatic charge. Separately paid programmes and physical products are excluded from the app-month offer.

## Built in this milestone

- Existing homepage composition retained; design-preview bar removed from generated page chrome.
- White page background and contrasting green, petrol, terracotta and ochre accents; original homepage plum retained.
- Fixed launch countdown, without flashing seconds or automatic opening of unfinished sales/app access.
- Seven-question, accessible, full-screen programme finder with explicit recommendations for core, build, lean, fit, run, swim and bike; compatible multiple dot-appended focus areas; editable answers and authoritative base override.
- First-name/email reservation form, separate optional marketing permission, and server-side recomputation of quiz results.
- Server-side GoHighLevel adapter: contact upsert, current recommendation/custom-field snapshot, auditable submission note, additive eligibility tags. Existing DND, tags and subscription state are not overwritten. Eligibility is not activation.
- Turnstile verification with hostname/action validation. Missing configuration, blocked origins and upstream failures never display a successful reservation.
- Calendar-month expiry helper with month-end clamping; it does not itself grant app access.

## Not complete / not production-approved

This is an incremental launch/quiz commit, NOT the full rebuild. The WPRM-equivalent recipe and account-synchronised meal planner, updated programme/course catalogue pages and photography, product-image integration, authenticated app access and one-per-person entitlement ledger, activation/expiry synchronisation, paid commerce, and marketing/transactional workflows still need implementation and end-to-end acceptance. The prior catalogue is still preview content. No real CRM contact, email, payment or entitlement was created by these tests. Do not merge this draft into a customer-facing production deployment as a complete product.

The current API records a reservation in the CRM; it does not create a NUFI account. An interrupted multi-call CRM write can leave the contact saved before its note/tags. Retrying uses the same email and cannot start an app month, but can append duplicate audit notes. Before launch, use a durable idempotent outbox/entitlement store and test retries against the real CRM. Configure location deduplication around email, and retain unsubscribe/DND controls when configuring campaigns. Old conversion tags must not be interpreted as permission to email.

## Private deployment configuration

Set the following in protected server environment settings, never Git or browser JavaScript:

- `GHL_PRIVATE_TOKEN`: scoped contact read/write and note/tag permissions for the Nutrition.Fitness sub-account.
- `GHL_LOCATION_ID`: the exact Nutrition.Fitness location, not a different business.
- `GHL_PROGRAMME_FIELD_ID`: a text contact field for the current chosen programme.
- `GHL_QUIZ_FIELD_ID`: a long-text contact field for the current quiz/request snapshot. Historical requests remain in notes.
- `GHL_API_VERSION`: defaults to `v3`, matching the official documentation reviewed 16 September 2026.
- `SITE_URL`: canonical HTTPS origin.
- `NUFI_ALLOWED_ORIGINS`: optional comma-separated exact preview origins; no wildcards.
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: a widget configured for the actual site/preview hostnames.

No credentials have been supplied or configured in this build. Review and approve privacy/offer wording before enabling real signups. Only explicitly opted-in contacts should enter marketing flows; preserve existing suppression settings. Reserve confirmation, activation and renewal messages need their own operational configuration and review.

## Build and verification

`npm run check` runs the existing suite plus launch/quiz/API unit tests, the complete static build and internal link checks. `python tests/launch-browser.py` checks the rendered build offline in Chromium, embedding local CSS/images/modules in memory; it does not establish deployed network behaviour. The source and generated site remain ordinary HTML/CSS/JavaScript and Vercel functions. Local browser navigation is restricted in the build environment, so the UI tests are in-memory rather than an HTTP/deployed browser test. External Google Fonts are not fetched for those screenshots.

The build has explicit passes: original page bodies; shared launch chrome and finder; Knowledge Centre using the finished shared shell. The launch pass validates the source header/CTA contract and fails rather than silently hiding unexpected markup. No MU-plugin or production-side patch is used.

## Primary integration references

- https://marketplace.gohighlevel.com/docs/ghl/contacts/upsert-contact/index.html
- https://marketplace.gohighlevel.com/docs/ghl/contacts/add-tags/index.html
- https://marketplace.gohighlevel.com/docs/ghl/contacts/create-note/index.html

## Rollback

Work only on `launch/december-2026`; main remains unchanged. The prelaunch baseline commit is `c30e914b7660a1f5013a590640cf6c3abc677eff`. Revert the launch implementation commits or build the baseline. Do not force-push over other contributors.
