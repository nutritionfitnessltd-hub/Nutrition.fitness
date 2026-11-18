# Worker drafts and website review

The Content Manager Sites connector now writes authored drafts into the website's `nufi_studio_items` store through the authenticated `content-worker-bridge` Supabase Edge Function. It does not publish or approve. Its `save_content_draft` and `get_content(area: "drafts")` tools use the same revisions as website edits. Read before editing; a stale save returns a conflict. Archived training/source tools remain separate reference data.

The connection accepts articles, recipes, newsletters/email, lessons, courses, programmes, challenges, meal plans, books, marketing, creative assets and video references. Structured fields accompany the body. Use the returned `reviewUrl` to open the saved record. Image-page URLs are reference links, not uploaded files; `upload_content_image` stores JPEG, PNG or WebP bytes privately with alt text and a credit. Videos use asset URLs and structured metadata; this is not a video hosting service.

Only the configured Sites owner email uses the website connection. Other Site visitors retain their isolated legacy records. A failed website save never silently falls back to the old database. The private connection key is scoped to the `worker:content-manager:` namespace; only its SHA-256 hash is in the database. No service-role key goes to Sites or the browser. Revoke the connection by setting `nufi_worker_connections.enabled=false`.

Sites environment keys: `NUFI_WORKER_ENDPOINT`, `NUFI_WORKER_TOKEN` (secret), `NUFI_WORKER_OWNER_EMAIL`. Supabase supplies the Edge Function's server credentials. Deploy `supabase/functions/content-worker-bridge/index.ts` with its adjacent `worker-drafts.mjs`, with gateway JWT verification off because the handler performs the draft-scoped key authentication. Keep RLS/grants on connection, draft, version, release and storage tables intact.

## Review and release

1. A worker saves **Draft**. The five recovered Nina articles retain their exact original bodies; their proposed Unsplash photographs were stored privately with credits.
2. **Submit for Approval** moves the edited record into **In review**. The administrator then uses **Approve content**.
3. **Publish to test website** stores an immutable approved snapshot, served only on `nutrition-fitness-website-2.vercel.app`. Articles join the Knowledge Centre feed. Drafts and internal comments are never returned in the public feed.
4. Final live release requires the identical revision to have a test release, current administrator approval and an explicit final-approval checkbox. The transaction locks the item to prevent concurrent edits racing the checks.
5. `NUFI_STUDIO_LIVE_READY` stays off until the actual `nutrition.fitness` origin is connected to this release handler. On 18 November 2026 the Vercel project had content/team subdomains, but not the apex website. Do not change production DNS as part of recovering drafts. Once the final destination is connected and verified, set this flag to `true`. Never use it to skip test review.

Edits invalidate draft approval without changing previous test/live snapshots. Photos are private; the public image endpoint serves only the image referenced by the released snapshot for the requested environment. Existing Vercel Blob images and new Supabase Storage images both work.

## Validation and deployment

Apply the two schema migrations before releasing the website UI. The Edge Function and Sites connector can be released independently; the old website already reads the restored draft records. The Vercel UI must be deployed to display the new stored photographs and release controls.

Tests: `node --test tests/worker-drafts.test.mjs tests/studio*.test.mjs`, full `npm test`, and `npm run build`. The release SQL was also tested with a synthetic record inside a rolled-back transaction, including rejection of live release before testing. No real article was approved or released during verification.
