# Workspace notifications

Settings has separate **Brand guide** (`studio=standards`, preserving old links) and **Connections** (`studio=connections`) pages. Brand files are bundled server assets, served only after workspace administrator authentication. The PDF is an optimised copy of the supplied 12-page website guide; all page text is preserved. The original remains in the user's Brand Assets folder.

## Microsoft 365

The sender is `notifications@nutrition.fitness`. Production requires server-only Vercel variables `EXCHANGE_TENANT_ID`, `EXCHANGE_CLIENT_ID`, and `EXCHANGE_CLIENT_SECRET`. Store the secret as a sensitive variable. `NUFI_NOTIFICATION_BASE_URL` optionally overrides the production workspace origin used in deep links. Preview deployments should have no sending credentials.

Register a single-tenant Entra app. Authorise only **Application Mail.Send** for the sender mailbox through [Exchange application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac). Do not also grant unscoped Graph Mail.Send in Entra, because permissions are additive. No mailbox read permission is needed. Obtain the enterprise application's service-principal object ID, not the app-registration object ID.

An Exchange administrator can apply and verify the mailbox scope after creating the application (replace the two IDs with the registered app's actual IDs):

```powershell
Connect-ExchangeOnline -UserPrincipalName james@nutrition.fitness
Get-EXOMailbox -Identity notifications@nutrition.fitness
New-ServicePrincipal -AppId <application-client-id> -ObjectId <enterprise-application-object-id> -DisplayName 'NUFI Content Notifications'
New-ManagementScope -Name 'NUFI Notifications mailbox' -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'notifications@nutrition.fitness'"
New-ManagementRoleAssignment -Name 'NUFI Notifications send' -App <enterprise-application-object-id> -Role 'Application Mail.Send' -CustomResourceScope 'NUFI Notifications mailbox'
Test-ServicePrincipalAuthorization -Identity <enterprise-application-object-id> -Resource notifications@nutrition.fitness
Test-ServicePrincipalAuthorization -Identity <enterprise-application-object-id> -Resource james@nutrition.fitness
```

The sender should be in scope and the unrelated mailbox out of scope. Check for existing named scopes/assignments before provisioning again. Microsoft permission propagation can take time. Redeploy after saving the Vercel variables, send a test from Connections, verify receipt and sender, then enable workflow notifications. The UI distinguishes configured credentials from a send accepted by Microsoft. A 202 is acceptance, not proof of delivery.

## Events and failure handling

Team & permissions sends welcome emails directly through this Microsoft 365 connection. Each administrator form has a stable request ID, and the recipient is loaded from the enabled team account on the server. The browser retains edited text after failures. Only a confirmed rejection can be retried; an accepted or uncertain send is not repeated.

Welcome message bodies can contain newly issued passwords. They are AES-256-GCM encrypted before being placed in the outbox, using a separate key derived from the server catalogue key and authenticated account/event metadata. The normal activity view contains only the subject, recipient and delivery status. The current row's encrypted body is removed after acceptance, cancellation or an uncertain result; historical revisions may retain ciphertext. A password reset or account disable invalidates pending welcome emails, including retries from Connections. No plaintext password is written to the outbox or notification revisions.

A Graph 403 after a successful token request means mailbox sending is not authorised. The page includes an allowlisted Graph diagnostic code where available, never arbitrary upstream text. Verify the scoped Exchange role assignment; having the three Vercel credentials alone does not establish sending permission. A failed test is titled “Content Manager email test” and is never described as proof of a connected sender.

New or reassigned projects notify their assigned creator. Explicit review requests notify the configured reviewer (default Kasia). Review decisions notify creators of linked projects. Draft saves, preview saves, comments, brand settings and notification settings do not send mail.

Settings and notification records reuse the existing service-only `nufi_studio_items` storage and optimistic-locking RPC. Notification rows are excluded from general workspace loads. Each workflow version and recipient has a stable hashed event ID. An atomic revision claim moves the notification to `sending` before calling Graph. Concurrent and repeated requests cannot resend the same event. A known rejection may be retried explicitly. Timeouts, server errors, or a process ending after the claim remain uncertain and are never automatically resent; check Sent Items first.

Content changes commit before notifications. Email failures show a saved-work notice instead of inviting a duplicate content save. Content and outbox creation are not one database transaction: a database failure while creating the notification shows the notice but cannot guarantee an outbox entry. There is no background dispatcher; this release sends as part of explicit workflow actions. Existing legacy assignment screens and saved AI worker briefs do not start notification jobs.

Validation: notification concurrency/retry/access-control/integration tests, existing Studio tests, production build, browser checks for navigation, saved guidance and private guide assets. Local full-suite tests have two unchanged homepage failures caused by CRLF-sensitive regexes on Windows; CI uses the source line endings.
