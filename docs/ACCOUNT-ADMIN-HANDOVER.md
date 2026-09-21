# Nutrition.Fitness accounts and website management

## Release status

This release adds the login, account and website management experience to the current Nutrition.Fitness website. It extends the existing Vercel functions and Supabase integration. It does not replace the public website or move the project to another hosting provider.

**Live activation is pending.** The owner confirmed the Nutrition dot fitness organisation, `james@nutrition.fitness` for the first administrator, the quoted $0/month project, and project-specific Vercel setup. Supabase rejected project creation because this account already has its maximum two active free projects: Castle Grove and Tan Time. No new Nutrition.Fitness project was created. A paid-plan decision or explicit permission to pause a selected existing project is required.

The private Vercel settings also remain unconfigured. Browser auto-review requires broader domain access than the project-specific permission, and the currently connected Vercel tools do not expose environment-variable writes. Readiness flags stay off until the actual services, email delivery and permissions are verified. The interface reports unavailable services instead of creating a demonstration login.

James should choose his own password through the website signup flow and verify his email. Only then should the corresponding verified user UUID be assigned the protected administrator role. No administrator login or password has been invented or embedded in this release.

## Pages and capabilities

| Route | Purpose |
| --- | --- |
| `/login/` | Email/password sign-in and optional email-code sign-in when enabled |
| `/register/` | Create an account and verify its email address |
| `/forgot-password/` | Request and verify a password-reset code |
| `/reset-password/` | Choose a new password using a short-lived recovery grant |
| `/account/` | Account details, profile, password and links to recipes/planning tools |
| `/admin/` | Management overview with actual counts and recent activity |
| `/admin/members/` | Search members, view onboarding, change access, request onboarding again |
| `/admin/recipes/` | Review recipe content, nutrition and publication status |
| `/admin/pages/` | Edit headings, introductory copy, browser titles and descriptions |
| `/admin/products/` | Edit product names, descriptions and explanatory price notes |
| `/admin/settings/` | Site title, announcement and support email |
| `/admin/audit/` | Read administrator change history |

The portal adapts layout patterns from the supplied Tabler development archive. Its styles are isolated in `account.css`. Nutrition.Fitness typography, the white background, green primary action and original cookbook photography are preserved. The public site's existing quiz/form presentation is unchanged; account and management workflows use full pages.

## Access rules

Email ownership must be verified. Session tokens live in host-only, Secure, HttpOnly cookies and never appear in JSON responses or browser storage. Every private request validates the provider identity. Management requests additionally check the member's current protected role and status; client flags and editable authentication metadata cannot grant administrator permissions.

The original 100 recipes stay free. The 499 imported recipes retain public previews, while their ingredients and methods are returned only after the server confirms access. A held recipe cannot be cooked until an administrator explicitly publishes a reviewed version. Source files and provenance remain intact; edited catalogue content is stored as a separate version. Existing personal recipe overrides and previously logged nutrition snapshots are not rewritten.

Administrators cannot suspend themselves or remove their own administrator role. The database rechecks the actor and serializes permission changes; a stale screen cannot override a newer save. The final active administrator is protected. Suspended members fail the next authenticated request.

Recovery grants last ten minutes and can be consumed once. Their browser cookie contains only an opaque random value; the server stores its hash and an encrypted short-lived provider token. A recovery grant is separate from an ordinary account session. A completed password change clears local cookies and requests provider-wide session revocation. Already-issued provider access tokens follow the provider's revocation/expiry behaviour; this release does not claim that a provider JWT disappears instantly from every device.

## Database installation

Use a dedicated Nutrition.Fitness project. Do not apply these changes to Castle Grove, Love Stories Events or Tan Time. A new project must use the organisation and running cost agreed with the owner.

Apply all files in `supabase/migrations/` in filename order. The two new migrations were created with Supabase CLI 2.117.0:

- `20260921201951_nufi_account_management.sql`
- `20260921202107_nufi_website_management.sql`

The corresponding files in `supabase/schema/` are the reviewable schema sources. **Apply the migration files once, not both copies.** The existing migration/seed rules continue to apply. Never run `supabase/tests/bootstrap.sql` against a real project: it is a disposable test scaffold.

The new tables store members, password-recovery grants, versioned website content and management activity. They use row-level security and have no direct anonymous/member grants. The server role alone can access them. Management read functions use narrowly granted auth-user columns; writes validate the current administrator again inside the database transaction.

Import the original 100 recipes using the existing seed and the additional private content using `scripts/import-private-recipes.mjs`. That import defaults to dry-run, verifies the exact project reference and checks stored content. It must report all 499 private records before recipe-content readiness is enabled. Existing public source history is unchanged by this release; website access controls do not retract previously published copies of a recipe.

## Authentication configuration

Keep actual values in private deployment settings, never source control. `.env.example` lists the names.

| Setting | Requirement |
| --- | --- |
| `SITE_URL` | Canonical `https://www.nutrition.fitness` origin |
| `NUFI_ALLOWED_ORIGINS` | Only the exact additional HTTPS origins that will submit forms |
| `SUPABASE_URL` | Selected Nutrition.Fitness project URL |
| `SUPABASE_ANON_KEY` | Project's JWT-based `anon` key, used by the server adapter |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT-based `service_role` key; server only, never sent to the browser |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Widget and server verification keys for the approved domains |
| `NUFI_ACCOUNT_MANAGEMENT_READY` | `true` only after schema and permission checks pass |
| `NUFI_PASSWORD_AUTH_READY` | `true` only after password signup, confirmation and recovery are tested |
| `NUFI_AUTH_CAPTCHA_READY` | `true` only after provider CAPTCHA and widget verification work |
| `NUFI_RECOVERY_ENCRYPTION_KEY` | A separately generated random 32-byte key, base64 encoded |
| `NUFI_EMAIL_OTP_READY` | Enable only if passwordless email-code login is intended and tested |
| `NUFI_RECIPE_ACCESS_MODE` | `registered` for the requested verified-account recipe access |
| `NUFI_RECIPE_CONTENT_READY` | `true` only after the private import is verified |

Enable email confirmation in Supabase. The signup confirmation and password-recovery email templates must contain the six-digit `{{ .Token }}` value because the website uses code entry rather than exposing session tokens in a callback URL. Set the provider OTP length to six, configure the production email sender and test delivery. The provider CAPTCHA must validate the supplied Turnstile token. The website verifies code-entry challenges using the `nufi-account` action and an approved hostname.

An existing verified user is backfilled as a member. Assign the first administrator explicitly to the owner's verified user ID in the protected `nufi_members` table. `NUFI_ADMIN_USER_IDS` is a bootstrap/legacy mechanism; it cannot override a later protected member-row demotion. Do not embed an administrator password or grant roles from email domain matching.

The existing GoHighLevel outbox remains available. This release does not invent a CRM delivery, subscription, payment or app entitlement. Any unconfigured integration keeps its current explicit status.

## Content publishing behaviour

Page/product/settings editors support draft and publish. Saving a draft retains the previous published version. Published edits are loaded through `/api/content` and applied by `managed-content.mjs`; that public endpoint returns only published text, public recipe availability and site settings. It never returns drafts, private recipe bodies, members or audit records. Text is inserted as text, not arbitrary HTML.

These are focused content controls: they edit supported fields on existing pages. They do not rearrange site sections, create new pages, upload arbitrary code or replace the public design. Browser title/description changes are applied at runtime; generated source HTML and non-JavaScript crawler views retain the built version until a rebuild incorporates the same content. Do not promise immediate search-engine indexing from the editor.

Product price notes are explanatory text. They do not change charging amounts, subscriptions, stock, checkout or fulfilment. Those systems retain their existing release status.

## Verification and rollback

Run `npm run check` for source/API tests, the full build and internal link/banner validation. CI runs the database migrations and `supabase/tests/account-management.sql` and `supabase/tests/website-management.sql` against a disposable database alongside the existing account/recipe tests. Browser acceptance uses isolated fixture responses; it must not create real members, send real email or change production data. Run `python tests/account-admin-browser.py` against the locally served build for the account/admin journeys. The fixture-only screenshots show test users and test counts; they are not production account data.

The release passes **330 Node tests**, **57 isolated account/admin browser checks** and all five SQL integrity suites. The generated site passes its internal link/asset and shared-banner checks. The browser checks include login retry, signup verification, password recovery/change, profile persistence, member/admin separation, versioned draft/publish saves, promotion confirmation and layouts at 320, 390, 768 and 1440 pixels.

Local verification used Node 24, Chromium 153 and disposable PostgreSQL 18.3 through PGlite 0.5.8. The deployed project targets Node 22 and CI uses PostgreSQL 17. The migration tests executed the actual SQL under anonymous, authenticated and server roles. The local database harness uses one connection, so it does not prove simultaneous multi-connection race behaviour. Hosted Supabase Auth, CAPTCHA, email delivery and production configuration must still be verified during activation.

The existing Google Fonts request failed in the isolated local browser environment (`net::ERR_EMPTY_RESPONSE`), so local portal layout checks also exercised fallback fonts. The full [GitHub Actions run](https://github.com/nutritionfitnessltd-hub/Nutrition.fitness/actions/runs/35653570447) subsequently passed on the integrated implementation, including every browser suite, actual font-loading checks and PostgreSQL 17 migration tests. No font assertion was weakened. Responsive spacing also fits fallback fonts at the tested phone and tablet breakpoints.

Before enabling live flags, verify signup email, correct/incorrect login, logout, reset/replay, profile save, a normal member's admin denial, an administrator's content edit, stale-save conflict and suspended-member denial against the selected project. Confirm private recipe access is denied to guests and that all original 100 remain free.

Keep the previous deployment available for rollback. These schema additions are separate from the existing planner tables. To stop the new portal, turn readiness flags off or restore the prior deployment; preserve the new content/member tables so changes remain recoverable. Do not delete production user data during rollback.

## Relevant source documentation

- [Supabase authentication and user management](https://supabase.com/docs/guides/auth)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vercel Git deployments](https://vercel.com/docs/deployments/git)
- [Tabler licence](../public/third-party/tabler-LICENSE.txt) is included with the public assets.
