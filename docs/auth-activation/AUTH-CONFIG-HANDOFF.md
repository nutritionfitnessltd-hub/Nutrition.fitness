# Nutrition.Fitness hosted Auth activation handoff

Prepared for the provisioned Nutrition.Fitness project; status verified on 22 September 2026. This directory contains no credentials. The configuration examples and owner-assignment script have not been applied to a hosted project or used to send email. They do not bypass any browser access approval.

## Confirmed target and activation status

The owner approved the Nutrition dot fitness organisation, the quoted $0 project in eu-west-2, pausing Castle Grove to release a free-project slot, and james@nutrition.fitness as the first website administrator.

| Item | Confirmed value |
| --- | --- |
| Project | Nutrition.Fitness |
| Project reference | `fyzapcqcsfpknblsixku` |
| Supabase URL | `https://fyzapcqcsfpknblsixku.supabase.co` |
| Organisation | `fvsmsnvlfcmsnxljfbjm` |
| Region | London, `eu-west-2` |
| Quoted project cost | $0/month |
| Castle Grove | Confirmed INACTIVE after the approved pause |
| Database migrations | All six applied successfully |
| Original public recipes | 100 seeded |
| Private recipe import | All 499 verified: 481 published, 18 held, 39 with unknown nutrition |
| Auth users | Last confirmed count is 0; James has not completed signup |

The [hosted verification report](database-verification.json) confirms all 14 final checks passed, including the complete private recipe manifest and browser-access restrictions. All 20 import batches compared full stored JSONB payloads and canonical hashes before committing. The [provisioning record](provisioning-status.json) maps source migration files to the installed history. Database installation does not establish SMTP delivery, Vercel configuration, successful signup or administrator access.

The existing website guide and production check use https://www.nutrition.fitness as the canonical, verified hostname. The settings JSON uses that origin. If a private preview is used for activation, substitute its exact approved HTTPS origin in that deployment and its email links. The application checks exact request origins: configure additional approved origins explicitly in NUFI_ALLOWED_ORIGINS.

Domain-wide Vercel browser approval remains pending at this handoff. Complete that approval or use an already-authorized supported configuration surface. These files do not authorize an alternate access route or protection bypass.

## Files and application mapping

- [supabase-auth-settings.public.json](supabase-auth-settings.public.json): nonsecret portion of the hosted Auth PATCH body, including matching email subjects and templates.
- [vercel-account-settings.public.json](vercel-account-settings.public.json): known nonsecret deployment values, with readiness deliberately false until the relevant activation stage.
- [email-confirmation.html](email-confirmation.html): signup email consumed by `/register/` and `POST /api/auth` action `verify-code`.
- [email-recovery.html](email-recovery.html): reset email consumed by `/forgot-password/`, then the short-lived `/reset-password/` flow.
- [email-magic-link.html](email-magic-link.html): optional passwordless sign-in email, used only if NUFI_EMAIL_OTP_READY is intentionally enabled.
- [first-admin-after-verification.sql](first-admin-after-verification.sql): guarded one-time role assignment for the actual verified owner account. It neither creates an auth account nor sets a password nor marks an email confirmed.

The base Auth JSON is incomplete by design. Before applying it, merge the actual private service values listed below in a protected environment; do not save a filled-in version in this directory or Git. In particular, do not save an enabled CAPTCHA config without its real secret. Read current hosted settings first and apply only the approved, necessary change set rather than replacing unrelated settings. Hosted configuration uses `PATCH /v1/projects/{ref}/config/auth`; a local config file by itself does not change hosted settings.

## Inputs required from configured services

| Input | Destination | Requirement |
| --- | --- | --- |
| Verified Nutrition.Fitness project reference and URL | Setup and Vercel SUPABASE_URL | Use `fyzapcqcsfpknblsixku`; never another business's project |
| JWT-based anon key | Vercel SUPABASE_ANON_KEY | Current REST adapter expects legacy JWT key format |
| JWT-based service_role key | Vercel SUPABASE_SERVICE_ROLE_KEY | Server-only; no browser, JSON response, screenshot, source file or chat disclosure |
| Real Turnstile public site key | Vercel TURNSTILE_SITE_KEY | Widget authorized for the exact approved hostnames |
| Real Turnstile secret | Hosted Auth security_captcha_secret and Vercel TURNSTILE_SECRET_KEY | Same real secret in both; no test credentials in production |
| SMTP host | Hosted Auth smtp_host | Actual authorized sending provider |
| SMTP port | Hosted Auth smtp_port | String in the Management API schema, for example provider-specified `587` |
| SMTP username/password | Hosted Auth smtp_user and smtp_pass | Real provider credentials |
| Authorized sender address | Hosted Auth smtp_admin_email | Verified sender for the configured service; the owner login address is not automatically an authorized From address |
| Random 32-byte base64 key | Vercel NUFI_RECOVERY_ENCRYPTION_KEY | Generate privately and save directly to protected environment settings |

### Custom SMTP is required before the first code-flow test

Supabase project creation and the $0 quote do not configure a production mail sender. Since 3 June 2026, new Free projects using the default SMTP sender cannot customize confirmation, reset-password or magic-link templates. Their default link templates do not match this application's six-digit code-entry flow. Therefore a configured custom SMTP sender is required before even the initial owner code-flow test; an organisation-team email address does not resolve that template restriction. See the [3 June 2026 Free-tier email-template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

Separately, default SMTP is restricted to exact organisation-team addresses, currently two messages per hour, and is intended for testing. Configure the selected sender's domain verification, SPF/DKIM/DMARC and delivery requirements. No paid email service is selected by this handoff. [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)

## Auth settings and compatibility decisions

The JSON enables the email provider and signups while requiring email confirmation. Anonymous sign-in and unverified email sign-in are disabled. Provider minimum password length is 12, matching the website. OTP length is exactly six, matching both API and form validation. Email OTP expiry is 600 seconds; the email wording matches that value. The separate application recovery grant lasts ten minutes after successful code verification.

The current application verifies the existing password with a fresh provider sign-in before changing it. It does not send current_password in the subsequent PUT /auth/v1/user request. Therefore security_update_password_require_current_password is false in this compatible configuration. Turning it on requires a reviewed adapter change and a real recovery test; changing the setting alone does not add support to the current adapter. Other session/reauthentication settings are left untouched by this patch.

Configure Cloudflare Turnstile provider protection in Supabase as well as the website widget. Hostname entries contain no scheme, port, path or wildcard. Use the verified Nutrition.Fitness hostname and any specifically approved Vercel preview hostname; never authorize the entire vercel.app domain. The account widget uses action nufi-account. Signup/login/reset-request tokens are validated once by Supabase; code-verification tokens are validated by the application. Every operation needs a fresh challenge token.

The email templates contain {{ .Token }} and no {{ .ConfirmationURL }}, token hash or browser session. Codes are entered on the existing website page. Ordinary links in a template, if added later, must not consume a provider token. The redirect allowlist contains exact website paths; the code-entry flow itself does not need a callback route.

Do not use Supabase dashboard invitations as a shortcut. Invite is a distinct intended verification flow and there is no invitation-specific initial-password page in this release. Password signup lets James choose his password before confirming email and is the supported initial-owner journey. When passwordless sign-in is disabled, the website verifies signup codes with type signup; recovery uses type recovery and a separate reset-only grant.

## Minimal owner actions after the database migrations

1. Complete the pending Vercel browser-domain approval so protected project settings can be configured through the authorized surface.
2. Connect custom SMTP and real Turnstile services privately if they are not already available. James should not paste passwords or service secrets into chat.
3. When the private deployment is configured for the controlled activation test, open `/register/`, use james@nutrition.fitness, choose a personal password of at least 12 characters, and enter the real email verification code. Registration itself requests the confirmation email.
4. The operator reads the actual verified auth account and applies `first-admin-after-verification.sql` only to Nutrition.Fitness project `fyzapcqcsfpknblsixku`. It fails if the owner is missing, soft-deleted, unverified, anonymous, ambiguous or suspended. Before checking account permissions it takes the same nufi:administrator-membership advisory transaction lock used by administrator-role changes, so those changes cannot race the bootstrap status check.
5. Refresh `/admin/` and confirm that the protected role grants access. The role is read fresh, so a JWT refresh is not required to pick up the change.

No invitation, temporary password or fabricated verification is required. NUFI_ADMIN_USER_IDS is not needed for this explicit protected-row assignment. The SQL preserves existing profile and status fields, records the initial assignment and leaves an existing active administrator unchanged on repeat execution.

## Readiness and evidence

Keep public readiness off while service inputs or approval remain missing. Once schema and permission checks pass, NUFI_ACCOUNT_MANAGEMENT_READY can be true on the controlled activation deployment. After real widget/provider verification is configured, enable the applicable flags there for the owner-led smoke test; testing cannot occur while the endpoints remain disabled. Promote the tested configuration to the public deployment only after actual email/signup/password/recovery evidence is recorded. Fixture-based tests do not establish production email delivery.

Required account configuration: SITE_URL, the selected Supabase URL and keys, both Turnstile keys, NUFI_RECOVERY_ENCRYPTION_KEY, NUFI_ACCOUNT_MANAGEMENT_READY=true, NUFI_AUTH_CAPTCHA_READY=true, NUFI_PASSWORD_AUTH_READY=true. Keep NUFI_EMAIL_OTP_READY=false unless optional passwordless login is intended and separately tested. NUFI_APP_ACCESS_READY remains false until the real app entitlement integration is verified.

After the private recipe import reports all 499 records against the selected project, use NUFI_RECIPE_ACCESS_MODE=registered and then enable NUFI_RECIPE_CONTENT_READY. The original 100 recipes must remain public. Existing import tooling defaults to a dry run and requires an exact project-reference guard. For this project, `NUFI_RECIPE_IMPORT_PROJECT_REF=fyzapcqcsfpknblsixku` and `NUFI_RECIPE_IMPORT_TARGET=nutrition-fitness-private-recipes`; these are operator import guards, not public browser configuration. Follow the tool's current usage rather than guessing arguments. The import and final manifest check are complete for this project; do not rerun an import to overwrite later administrative edits.

Record: exact project reference, installed migration names, successful private-record count, actual email arrival and code verification, password login, wrong-password rejection, reset and replay rejection, logout, non-admin denial, administrator access and suspended-member denial. Never record session tokens, passwords or emailed OTPs in the evidence report. Supabase project success alone is not proof that Vercel environment values or authentication are active.

## Review record and official sources

The 24 Auth setting names, types and enum values were validated against the official Management API JSON schema on 21 September 2026. Both JSON files were parsed, code-entry templates checked against the application, all readiness flags checked false, and the guarded SQL compared with the current administrator transaction-lock identifier. The first-administrator SQL has not been executed against the hosted project, and a live owner login has not yet been established.

- [Hosted Auth settings API](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
- [Management API JSON schema](https://api.supabase.com/api/v1-json)
- [Free-tier email-template restriction, effective 3 June 2026](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Custom SMTP and default sender restrictions](https://supabase.com/docs/guides/auth/auth-smtp)
- [Password authentication and current-password verification](https://supabase.com/docs/guides/auth/passwords)
- [Email OTP expiration](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha)
- [Turnstile hostname rules](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
