# Archive-to-worker requests

The workspace opens on Dashboard, including after sign-in. My work contains open assignments and project tasks for the signed-in person; review work follows existing role permissions. Administrators also see Nina, Imogen, Marcus and Rory with their actual saved output assignments. Counts and plans come from saved records, not example activity or inferred worker runs. Legacy assignments remain accessible explicitly with `assignments=1`.

Studio starts with “What do you want to build today?” and guides administrators through four steps: output type, archive material, brief, then worker review. Links from Originals retain their selected source while offering the build choice first. Only the requested output is selected initially; supporting content is optional. Back controls and source search/pagination retain the brief, source text and worker overrides in POST bodies rather than URLs. Changing the primary build resets output choices while retaining the brief and original.

Workers are suggested by output type and each suggestion can be changed. Saving a plan places its outputs under the assigned workers on Dashboard. Saved requests are separate from content drafts and retain source IDs, links, available text, extra supplied text, audience and brand guidance. Manual creation and existing project planning remain available below the Studio flow.

Verified role mapping on 18 November 2026:
- Nina: newsletters, emails, articles and landing copy. Confirmed Nutrition.Fitness Content & Marketing Specialist in James HQ.
- Imogen: course structure, challenge preparation and lesson scripts. Confirmed Canva & Course Production Specialist in James HQ.
- Marcus: Training & Programme Designer. Workouts, exercise choices, weekly structure, sets/reps, recovery and progression. Added to Studio at James’s request. HQ identity verification is pending; the Studio profile must not imply automatic dispatch.
- Rory: social posts and short video scripts. Role verified in the Content Manager record `nf-worker-rory-social-video-producer`; no matching active HQ directory entry was present.

## What is connected

Saving uses the existing versioned `nufi_studio_save` RPC and administrator session. Request records have kind `worker-request` and are excluded from content library results. Retries with the same request ID return the saved request. Source collection membership and course order use existing archive metadata.

No OpenAI model request is made by this feature. Existing unrelated meal-plan and manual drafting features are preserved.

## Dispatch is not connected

The named workers are currently ChatGPT tasks and HQ role profiles, not verified published API channels. HQ's shared scheduled processor is paused. The ordinary chat or automation ID is not a Workspace Agent trigger ID. Studio therefore says “Saved · not sent”; it neither creates placeholder content drafts nor claims work has begun.

Before enabling automatic dispatch, choose and verify a supported worker trigger, durable authentication, an idempotent request identifier, and a scoped return path into this Vercel/Supabase library. The older Content Manager plugin writes to a different store, so saving there is not proof a draft reached this Studio. Replies must create reviewable drafts and retain provenance; they must never approve or publish automatically.

The official Workspace Agent trigger endpoint is an alternative only for published API-enabled agents with an access token. It returns a conversation URL; it does not return generated content. A separate authenticated writeback integration would still be required: https://developers.openai.com/workspace-agents/trigger-runs

Do not restart the retired Canva production queue or resume existing account schedules as part of this request-preparation feature.

## Course production destination

The user approved connecting the SharePoint plugin on 18 November 2026. Installation was verified in the plugin directory. Browser access to the Nutrition.fitness team document library was verified and `Documents / Content Library / Courses` was created with inherited permissions. Its exact folder URL is saved in `courseProduction`. Plugin upload tools were not yet available in this active chat; an actual export/upload remains unverified.

The Brand & export course option suggests Imogen and records the agreed font, colour and registered-logo-only scope, Canva copies, ordered lessons, an initial sample review and file-link writeback. This is a saved production brief, not a running branding job.
