# Nutrition.Fitness launch build — implementation and connection status

## Agreed release

The whole offering is scheduled for **1 December 2026, 09:00 Europe/London** (09:00 UTC). Completing the programme finder makes someone eligible for one free calendar month of NUFI+, without a purchase, card or automatic charge. The month begins at actual activation, not at prelaunch signup. Separate paid programmes and physical products are excluded.

## Implemented in source

- Original homepage composition, phone, logo and illustrated coaches retained; design-preview bar removed. White backgrounds, broader contrasting accent palette and a days/hours/minutes countdown.
- Programme finder with explainable recommendations, base override and compatible multiple dot-appended focus areas. Seven consistent bases: core, build, lean, fit, run, swim, bike.
- Seven programme detail pages, seven supporting orientation courses and 21 actual reading lessons with locally/account-saved completion. These are reading courses, not videos or complete workout prescriptions.
- Six structured recipes sourced from the user's High Protein Kitchen: ingredient groups, servings, estimated source nutrition, favourites, personal ratings, collections, cooking checklists, timer, optional wake lock and print view. No public/fabricated ratings.
- One-, two- and four-week named meal plans; recipe search, add/swap/move/copy meals, drag/drop plus keyboard-accessible edit alternative, meal notes, portion editing and copying plans without copying eaten logs.
- Shopping list from selected plan days, optional/already-eaten choices, exact ingredient/unit aggregation, personal extra items, checkboxes, clipboard/text download and print. Units are not silently converted; a changed quantity invalidates the old checked state.
- Actual eaten portions are immutable nutrition snapshots. Later recipe edits do not rewrite old logs. Planned/eaten/remaining/projected totals distinguish unknown values from zero. Protein is first. Targets are never fabricated: the onboarding screen requires an explicit source and confirmation.
- Recipe overrides, custom recipes and custom food logs. Changing ingredients/yield invalidates inherited nutrition unless the user explicitly confirms replacement values. Historical snapshots remain unchanged.
- Guest persistence with clearly labelled browser-only storage; private account-sync adapter with version checks, account/tab conflict detection, explicit guest import and validated backup export/import. Storage failures do not pretend to save.
- Nine photorealistic proposed supplement/flavour-shot packshots integrated into shop, product details, subscription selector and basket. Labelled packaging previews; no claim of manufactured stock. Programme/course photography is varied, locally served, and credited.
- Server-only OTP account adapter, secure HttpOnly cookies, verified-user checks, row-level account reads and server-validated writes. Admin allowlist enables onboarding view/reset and CRM retry; reset preserves food history.
- Durable signup/reservation/CRM outbox, same-email ordering, idempotent request IDs, leased retries, verified-account signup trigger, and trial activation/expiry ledger. CRM writes do not replace suppression settings or existing tags. The server recomputes quiz recommendations.

## External services are NOT enabled merely by deploying these files

No production credentials or dedicated NUFI database have been configured in this conversation. No actual CRM contact, marketing message, paid order or member entitlement has been created by the tests.

1. Provision/select a **dedicated NUFI Supabase project**, apply `supabase/migrations/202609160001_nufi_launch.sql`, and set private server variables from `.env.example`. Never use another business's project.
2. Configure Supabase email OTP to display `{{ .Token }}`, a working sender, acceptable expiry/rate limits, redirects/origins and CAPTCHA. Configure the same Turnstile site/secret in Supabase and the site. Set `NUFI_EMAIL_OTP_READY` and `NUFI_AUTH_CAPTCHA_READY` only after a real verified-code test. Send-code verification is delegated once to Supabase CAPTCHA; verify-code uses a fresh widget token checked by the server.
3. Configure the actual Nutrition.Fitness GoHighLevel location, scoped private token and text/long-text custom fields: programme, latest signup request, trial state. The account/quiz tables retain audit history; CRM custom fields reflect the latest processed event. Review existing email deduplication rules. Never use an eligibility tag as proof of email marketing consent.
4. Both quiz reservations and verified account creation attempt CRM delivery. Configure an authenticated recurring worker for `/api/crm-sync` using `CRON_SECRET` to retry queued jobs and publish expiry updates. No paid scheduler or hosting plan is assumed. There is no automatic schedule in `vercel.json`; the owner must enable one before live signups. The admin screen can retry a job for testing. One call processes one pending job; size recurrence/worker capacity for the actual queue, and monitor backlog/errors. This is not a millions-of-users capacity claim.
5. Wire the real NUFI application to the entitlement ledger and verify that access ends at `expires_at`. Only then set `NUFI_APP_ACCESS_READY=true`. The date alone does not enable access. The current adapter writes an entitlement; it does not magically provision another application. Calendar month expiry clamps month ends. Eligibility is enforced per verified account/email; this does not prove one physical person across multiple email addresses.
6. Set actual verified admin UUIDs in `NUFI_ADMIN_USER_IDS`, test another user's denial, and review privacy, consent, retention/deletion, trial terms and health-information handling before enabling registration.

## Explicit limits

This implements the requested core recipe/planning experience; it is **not all paid WP Recipe Maker functionality**, a WordPress plugin, or a claim of compatibility with its proprietary internal format. Public aggregate reviews, server-side collaborative collections, arbitrary recipe URL imports, provider-specific nutrition lookup, and direct supermarket ordering are not implemented. Personal recipe copies and JSON workspace backups are supported.

Only six source-backed recipes have been transcribed in this release. Photographs are identified as illustrative, not asserted to depict the exact cooked recipe. Cookbook estimates, alternatives and ingredient ambiguities remain visible; they are not independently laboratory-validated. New recipes can be entered through the editor. Importing the entire cookbook is separate content work.

The existing shop price examples, basket, subscription demonstrations and checkout are still **not production commerce**. Fulfilment, final pack sizes/formulas/labels, taxes, stock and real payments need approval and their own integration. The older Stripe adapter remains test-only. No real course videos or complete professional exercise library have been supplied. No live AI coach implementation was requested/delivered in this website change.

The outbox is durable **at-least-once**, not a false exactly-once promise. A network interruption after the CRM writes may cause a safe repeated upsert/tag add. Any external automations should deduplicate by request/event identifiers and respect DND/unsubscribe status. Default dashboard listing is bounded (100 workspaces); this is an initial admin view, not a full enterprise management console.

## Testing and review

`npm run check` runs domain/API/commerce tests, rebuilds pages and checks internal targets. `python tests/food-browser.py --offline` is the explicitly offline in-memory browser harness for restricted build environments. It substitutes only navigation/storage/network plumbing; it is not a live-service integration test. `python tests/food-browser.py` exercises unmodified source over HTTP in GitHub Actions.

The workflow also starts an isolated PostgreSQL 17 database, installs a minimal auth test scaffold, applies the real migration and exercises RLS, CAS, reservation idempotence, leases, launch guards, onboarding reset and expiry. The scaffold is **CI-only**, not to be run in Supabase production. Read the actual workflow result before claiming those tests passed. Screenshots and JSON test evidence are packaged by CI.

Live Supabase/GoHighLevel, email deliverability, real app entitlement enforcement, payment/fulfilment and multiple-device session behaviour still require acceptance against the actual configured services. Mock API tests do not establish live success.

## Rollback

Work is confined to `launch/december-2026` / draft PR #1. Main's approved baseline is `c30e914b7660a1f5013a590640cf6c3abc677eff`. The previous launch milestone is `1f5b795efe3afa68611cdddf5a2cfa917ba9986d`. Use a preview deployment; do not force-push or overwrite other work. Database migration is additive and has not been applied to any user's project; back up real data before any future migration/rollback.

## Primary implementation references

- https://marketplace.gohighlevel.com/docs/ghl/contacts/upsert-contact/index.html
- https://marketplace.gohighlevel.com/docs/ghl/contacts/add-tags/index.html
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
