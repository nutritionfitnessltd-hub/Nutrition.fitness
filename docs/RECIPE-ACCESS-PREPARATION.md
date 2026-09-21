# Recipe access: guest protection and account integration

## Status and scope

This release enforces the public website boundary: **the original 100 recipes remain complete and free, and the additional 499 are metadata-only account previews**. The catalogue has visible All recipes and 100 free recipes controls. The server API is prepared for verified account delivery, but the commercial access rule, dedicated database, email sign-in and actual entitlements are not yet connected. Account recipes therefore remain unavailable until those services and an explicit policy are enabled.

The original free book is read from `data/cookbooks/high-protein-kitchen.json`. The new API never imports `data/cookbooks/recipe-library.json` or `public/recipes-data.mjs`. The migration contains no actual recipe text and does not alter the existing public catalogue, original book seed, accounts or personal workspaces.

At preparation time, the live Nutrition.Fitness account API reported `configured:false`, and member-data/entitlement endpoints reported that account storage was not connected. A dedicated Nutrition.Fitness Supabase project was not positively identified. No other business's project should be used.

## API contract

| Request | Successful result | Required access |
|---|---|---|
| `GET /api/recipes` | `{recipes: [...100 originals], access: "free"}` | None, even if account services are unconfigured |
| `GET /api/recipes?scope=free` | Same free catalogue | None |
| `GET /api/recipes?id=<original-id>` | `{recipe: {...}, access: "free"}` | None |
| `GET /api/recipes?id=<private-id>` | `{recipe: {...}, access: "verified-account" | "active-launch-trial"}` | Verified identity plus configured rule |
| `GET /api/recipes?scope=accessible` | Original 100 plus published private recipes; held IDs/names in `unavailable` | Same authorization; incomplete private imports fail closed |

The endpoint is read-only. Unknown or duplicate query parameters are rejected. It accepts neither client access flags nor an actor ID. GET bodies do not grant access. Guests receive 401 after services are configured; unconfigured access returns 503. Authenticated accounts without a supported entitlement receive 403. A missing private recipe returns 404 only after authorization. A recipe held for source review returns 409 with no ingredients or method, even for an authorized member.

Both success and error responses use `Cache-Control: no-store, private` and `Vary: Cookie` through the existing server reply primitive. No access token, refresh token, service credential or email is included in response JSON. The existing session code handles verified-user checks and secure HttpOnly session refresh.

## Explicit policy selection

`NUFI_RECIPE_ACCESS_MODE` has no default and must exactly match one value:

| Value | Currently implemented evidence | Unimplemented evidence |
|---|---|---|
| `registered` | Current email-confirmed, non-anonymous account returned by the Auth server | None needed for this rule |
| `membership` | An actually active launch trial from the existing `nufi_trial_status` RPC | Paid NUFI+ membership |
| `membership-or-book` | The same active launch trial | Paid NUFI+ membership and purchases of individual books |

For membership modes, trial `status` must be `active`, `activated_at` must be at or after the agreed launch and no later than server time, and `expires_at` must be strictly later than server time. Invalid timestamps, eligibility without activation and expired trials deny access. `NUFI_APP_ACCESS_READY` must be `true`, and the actual server time must have reached **1 November 2026, 09:00 UTC**.

The RPC is called with the **verified Auth user ID**, never an ID from the request. User-editable metadata, app metadata labels, signup, quiz eligibility, browser storage and alleged purchase flags are not treated as entitlements.

Paid membership/book adapters do not exist yet. These modes intentionally deny accounts relying on unsupported paid or purchase evidence. Before offering either mode as a complete live feature, connect an authoritative membership/purchase record that is updated on fulfillment, expiry and revocation, then add its verification to the shared server policy. Do not repurpose the trial ledger into a permanent paid membership.

## Configuration required before private reads

The existing account configuration must be present and tested:

- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `NUFI_EMAIL_OTP_READY=true`
- `NUFI_AUTH_CAPTCHA_READY=true`

The recipe feature also requires:

- `NUFI_RECIPE_ACCESS_MODE` selected by the owner.
- `NUFI_RECIPE_CONTENT_READY=true` **only after** the private import, access checks and public-content removal described below are complete.
- `NUFI_APP_ACCESS_READY=true` for the trial-backed membership modes, with the existing app/launch acceptance conditions met.

Until then leave the recipe flags absent or disabled. The original 100 remain available through this API.

Store server credentials in the deployment environment, never in source, browser files, chat, screenshots or logs. The import-target variables below belong to the operator environment; the public API does not need them.

## Private storage migration

`supabase/migrations/20260921184558_nufi_private_recipe_content.sql` was created using Supabase CLI 2.117.0 and then populated with the reviewed schema. Apply it only to the positively verified, dedicated Nutrition.Fitness project after the existing migrations have been checked.

The table `public.nufi_private_recipe_content` contains:

- Stable recipe ID, optionally assigned to one of the seven approved new book IDs.
- Explicit `publication_status`: `published` or `held`, matching `payload.publicationStatus`.
- The complete unmodified recipe JSON payload.
- Original source-file SHA-256 and a canonical content SHA-256.
- Import timestamp.

JSON `null` nutrition is allowed and retained. The table enables and forces RLS, revokes inherited grants for browser and server roles, and grants only SELECT/INSERT/UPDATE to the server role. There is no public view, browser policy or RPC exposing these payloads. Because the service role bypasses RLS, **the API must authorize before making a service-role read**.

The existing `nufi_recipe_catalogue` table is public and requires object-valued nutrition. Do not insert the private 499 into that public table or modify the free book seed to include them.

## Private import workflow

Keep the complete imported source JSON, editorial correction overlay and book PDFs in private storage outside the public repository. The import helper accepts a **reviewed local JSON file**. It does not create a public seed, a generated browser catalogue or a copy of the recipe text.

The later source QA produced `editorial-corrections.json` with 68 affected records, including 22 nutrition-null overrides and 18 records held because central source issues remain unresolved. Do not import the older `data/cookbooks/recipe-library.json` unchanged. Privately prepare the input by merging each recipe's overlay `updates`, preserving its source evidence and the overlay notes as `editorialNotes`, and assigning an explicit `publicationStatus` to all 499 stable IDs. The 18 `needs-source-check` records must be `held`; reviewed publishable records use `published`. Never replace a missing or conflicted nutrient value with a guessed number. The future recipe UI must show the relevant editorial notes.

With the current reviewed overlay there are **481 published recipes and 18 held records**. All 499 remain in private storage, so existing references are retained. The protected bulk API returns 581 complete recipes including the original 100, plus the 18 held IDs/names in `unavailable`; it does not expose their uncertain ingredients or methods. Held entries can be released only after their source issues are resolved and reviewed. The existing-row retention in the importer means such later revisions need their own explicit reviewed update, rather than silent overwrite.

First validate the private local file without any network request:

```bash
node scripts/import-private-recipes.mjs /private/reviewed-recipe-library.json
```

The optional assignment file is a JSON object mapping recipe IDs to one of:

`breakfast-sorted`, `proper-everyday-food`, `big-night-in`, `air-fryer-favourites`, `snack-happy`, `blend-and-go`, `more-plants-please`.

```bash
node scripts/import-private-recipes.mjs /private/reviewed-recipe-library.json \
  --assignments /private/recipe-books.json
```

The helper requires exactly 499 distinct recipes, rejects all original-free IDs and missing publication status, validates essential content and preserves source notes and null nutrition. Its report contains only counts and a dataset hash. Setting every old source record to `published` is not a substitute for applying the reviewed overlay and its holds.

Before applying, configure these variables securely in the operator environment:

- `SUPABASE_URL`: the positively verified Nutrition.Fitness project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: its private server credential.
- `NUFI_RECIPE_IMPORT_PROJECT_REF`: the same verified project reference. The URL hostname must match it exactly.
- `NUFI_RECIPE_IMPORT_TARGET=nutrition-fitness-private-recipes`: an explicit operational destination guard.

Then add `--apply` to the same reviewed command. The helper inserts in batches of at most 25 and reads each batch back for exact content verification. Canonical hashing accounts for Postgres JSON object-key reordering while preserving array order and all actual values. Existing rows are **not overwritten**. A conflicting stored payload or book assignment stops verification and requires review.

A network failure may occur after a batch was written. The helper does not automatically retry. Check the reported progress and stored rows before rerunning; identical existing rows verify successfully. It never changes the recipe-access readiness flag.

The project-reference guard prevents a mismatched URL; it cannot determine which business owns a project from its opaque reference. Positive project identification is required before supplying that reference.

## Implemented public and browser boundary

- `scripts/build-recipe-catalogue.mjs` builds the original 100 unchanged complete records and 499 field-allowlisted previews. All 599 IDs remain available to existing plans, favourites and collections.
- Imported preview routes contain no ingredients, methods, ingredient search data, private source notes or Recipe JSON-LD. All 499 direct routes and the complete public output have been checked for source-method leaks.
- `data/cookbooks/recipe-publication-status.json` contains only IDs: 18 held records and 39 records whose nutrition needs review. Nutrition is suppressed for the union of those sets (42 previews), without publishing the correction manuscript.
- `public/recipe-access.mjs` loads complete account recipes only after a successful authorized same-origin API response. Data is held in memory and cleared on denial, malformed data, sign-out or account change. There is no fallback to a complete public imported catalogue.
- Locked recipe pages clearly state that account access is coming soon and link to the 100 free recipes. They can be saved for later, but their unavailable content cannot be newly planned, copied, edited or logged.
- Existing planned entries and historical food-log snapshots are retained. Users can move, remove or swap older locked plan entries; previously saved personal recipe copies remain usable.
- Shopping lists explicitly list unavailable recipes and label partial results incomplete, including in copied and downloaded lists. They do not silently treat unavailable ingredients as an empty complete recipe.
- Full authorized recipe views display source warnings and editorial notes. The free original recipes retain their existing cooking, planning, editing and printing behaviour.
- New PDF books are kept outside the public repository and deployment. The shop has seven new cover/product pages with confirmed recipe/page counts, coming-soon availability and no checkout or public PDF URL. The original flagship remains the eighth book.
- CI release packaging contains only the successfully checked public build and test evidence; it no longer archives the source checkout.

Future book downloads still need an authorized private-storage endpoint, and paid membership/book purchase policies still need their authoritative entitlement adapters.

The current public Git repository and its earlier commits still contain the raw imported source dataset. This website gate does not make that repository content or previously downloaded copies private. No repository visibility or history change was made; that existing exposure requires a separate owner decision. New manuscripts and PDF editions have not been published there.

## Validation and connection acceptance

Run the focused server/import suites:

```bash
node --test tests/recipe-access.test.mjs tests/private-recipe-import.test.mjs tests/platform.test.mjs
```

Run the database test in a disposable PostgreSQL/Supabase test environment after the existing CI bootstrap and real migrations:

```bash
psql -v ON_ERROR_STOP=1 -f supabase/tests/private_recipe_content.sql
```

Do not run the CI bootstrap or its synthetic auth schema in a real Supabase project. The private recipe test itself creates only a fixture inside a rolled-back transaction.

The tests cover free access, absent configuration, forged cookies, verified and anonymous accounts, client flag rejection, actual active trial boundaries, private-response caching, malformed storage results, complete bulk catalogue checks, bounded import, source integrity, project mismatch and retention of conflicting existing rows.

Preparation verification completed on 21 September 2026:

- All **242 repository Node tests passed**, including 45 new recipe-access/import tests. The separate focused run included 22 existing account-platform tests, giving 67 focused passes.
- The original import round-trip preserved its 19 null-nutrition records; the later reviewed source applies the 22 additional null overrides, with overlap, and preserves a total of 39 null-nutrition records across all 499 stored recipes, including 24 published recipes with unconfirmed nutrition.
- An independent disposable **PGlite 0.5.8 / PostgreSQL 18.3** check applied all four migrations and passed the private-table grant/RLS test with its fixture rolled back.
- The real import helper, connected to that local database through a SQL-backed fetch test adapter, verified all 499 recipes on both its first and repeated import. The table remained at 499 rows. No hosted service was called.
- JavaScript syntax checks and `git diff --check` passed. No production deployment or hosted Supabase acceptance is implied by these local results.

Before activation, additionally verify against the actual connected services:

- Real email-code sign-in and sign-out.
- Guest direct API denial and authenticated access under the selected rule.
- No anonymous or authenticated direct-table read through the Data API.
- Active, expired and revoked membership/purchase examples if supported.
- Exactly 100 complete public recipes and 499 public metadata records, with no private method/ingredient text in public assets.
- An existing saved plan containing an imported recipe still opens; original recipe workflows and historical logs remain intact.
- Signed-in access works after deployment, and a different signed-out browser cannot reuse a private cached response.

## Current primary references

- [Supabase Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser): server-confirmed user record for authorization.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): grants, RLS and server-key boundaries.
- [Supabase private storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals): protected downloads and limited-duration signed URLs.
- [June 2026 email-template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier): new Free projects using default SMTP cannot customize OTP templates; confirm the chosen sender supports the existing six-digit-code UI.
