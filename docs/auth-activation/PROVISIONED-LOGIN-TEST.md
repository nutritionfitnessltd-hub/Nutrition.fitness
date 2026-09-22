# Administrator-provisioned account test

This rollout uses the existing Nutrition.Fitness Supabase project and the account created by the owner. It does not need SMTP. Public website registration, email-code sign-in, email recovery and password changes remain disabled.

The deployment declares `NUFI_AUTH_MODE=provisioned` in `vercel.json`. Only nonsecret rollout switches are committed. The four private connection entries saved by the owner remain in Vercel Project Settings; no credential is read back, exported or committed.

## Authentication and permissions

Password credentials go from the same-origin website form to Supabase Auth through the server. A real provider password check and a confirmed, non-anonymous identity are required. The identity must already have an active row in the protected `nufi_members` table. This mode never creates a missing member row, even when editable metadata or an old bootstrap flag requests administrator access. The current protected role is re-read for every private request.

Sessions use the existing Secure, HttpOnly, host-only cookies. Cross-origin mutations are rejected. Existing provider CAPTCHA settings are not disabled; when the deployment contains Turnstile keys, a correctly configured real challenge is required. No dummy token, password, magic login URL or authentication bypass exists.

A new server-only database function applies atomic limits before password verification: ten attempts per normalized-account HMAC and 100 attempts globally per 15-minute window. Both successful and unsuccessful attempts count. A database failure denies sign-in rather than bypassing the limiter. The global budget is deliberately conservative for this controlled test, not sized for an unrestricted public launch. Expired per-account counters are removed after one day; no email address, IP, password or token is stored in these counters.

## Recipe and management access

The original 100 recipes remain free. The imported 499 private records are available only after server-side account verification; the 18 held recipes remain unavailable to cook until reviewed and explicitly published. Administrator access uses the protected member role. Existing page, product, recipe, onboarding, audit and profile rules are unchanged.

The source migration `20260922090943_nufi_provisioned_login.sql` corresponds to the already-installed hosted migration `nufi_provisioned_login`. Do not run it twice. The owner's password and Auth confirmation were not modified by this release. Rate-limit assertions and the concurrent race test ran against a disposable PostgreSQL 17 database. A proposed production counter-mutation test was blocked and was not executed; it is not counted as verification.

## Verification

The reviewed application candidate passed 366 Node tests, the full build and internal-link/banner checks, all seven migrations and six SQL suites on disposable PostgreSQL 17, a 20-connection budget race permitting exactly ten attempts, 57 existing account/admin browser assertions and 17 provisioned-login browser assertions. Run 35711103241 records these passing steps; its later packaging step failed on GitHub tree-creation permissions, not an application test. The tested source blobs are committed using the authorised GitHub connector; the normal branch checks must run again on that commit.

Fixture screenshots and simulated identities are not evidence of a real owner login. After the authorised production deployment, `scripts/check-account-production.mjs` checks the actual client hash, connected login readiness, account routes, guest denials, disabled email actions, cross-origin rejection and one non-existent-account password rejection. It uses no owner credentials and sends no email. It explicitly records that the owner's password login has not been exercised by automation.

## Rollback and later public registration

Restore the previous deployment to stop this rollout while preserving member data and recipes. The new limiter table can remain safely in place. Do not delete accounts, reset the owner's password, relax RLS or switch to another Supabase project during rollback.

Before public registration, deliberately leave provisioned mode only after the email templates, sender, recovery encryption key and real CAPTCHA configuration have been tested. The older full-flow readiness requirements continue to apply outside provisioned mode. Do not turn all readiness switches on merely to make a screen appear enabled.
